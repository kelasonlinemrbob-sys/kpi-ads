import "server-only";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { aiAnalyses, users, type AiAnalysis } from "@/db/schema";
import type { AnalysisRun, CreativeAnalysisInput, CreativeAnalysisResult } from "./ai-ads-analysis";
import type { ContentAnalysisInput, ContentAnalysisOutcome, ContentAnalysisResult } from "./ai-content-analysis";
import type { CampaignAnalysisInput, CampaignAnalysisOutcome, CampaignAnalysisResult } from "./ai-campaign-analysis";
import type { SeoAnalysisInput, SeoAnalysisOutcome, SeoAnalysisResult } from "./ai-seo-analysis";
import type { CreativeFilters } from "./creatives-data";
import { estimateKieCredits } from "./kie-client";

const KIND = "creatives";
const CONTENT_KIND = "creative_content";
const CAMPAIGN_KIND = "campaign";
/** A run still "running" after this was cut off (e.g. the server restarted) and never will finish. */
const STALE_AFTER_MS = 10 * 60_000;
/** Analyses one user may start per 24 hours — each one spends Kie credits. */
export const DAILY_ANALYSIS_LIMIT = Number(process.env.AI_ANALYSIS_DAILY_LIMIT ?? 30);

/** The filters that change which ads are analysed (not the sort), in a stable order. */
export function creativeFilterKey(f: CreativeFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of [
    ["period", f.period],
    ["advertiser", f.advertiser],
    ["product", f.product],
    ["status", f.status],
    ["format", f.format],
    ["label", f.label],
    ["creator", f.creator],
    ["q", f.q?.trim().toLowerCase()],
  ] as const) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

type View<TInput, TResult> = {
  id: number;
  status: "running" | "done" | "failed";
  error: string | null;
  result: TResult | null;
  input: TInput;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  credits: number | null;
  createdAt: string;
  /** Formatted on the server (WIB) so it hydrates identically. */
  createdLabel: string;
};

export type AnalysisView = View<CreativeAnalysisInput, CreativeAnalysisResult>;
export type ContentAnalysisView = View<ContentAnalysisInput, ContentAnalysisResult> & { byName: string | null };
export type CampaignAnalysisView = View<CampaignAnalysisInput, CampaignAnalysisResult> & { byName: string | null };

function toView<TInput = CreativeAnalysisInput, TResult = CreativeAnalysisResult>(row: AiAnalysis): View<TInput, TResult> {
  const stale = row.status === "running" && Date.now() - row.createdAt.getTime() > STALE_AFTER_MS;
  return {
    id: row.id,
    status: stale ? "failed" : (row.status as AnalysisView["status"]),
    error: stale ? "Analisa terhenti sebelum selesai (server mungkin dimulai ulang). Jalankan ulang." : row.error,
    result: row.result as TResult | null,
    input: row.input as TInput,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    credits: row.credits ?? (row.inputTokens !== null && row.outputTokens !== null ? estimateKieCredits({ inputTokens: row.inputTokens, outputTokens: row.outputTokens }) : null),
    createdAt: row.createdAt.toISOString(),
    createdLabel: row.createdAt.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }),
  };
}

/** The user's most recent analysis of exactly this filtered view. */
export async function getLatestCreativeAnalysis(userId: number, filterKey: string) {
  const [row] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.userId, userId), eq(aiAnalyses.kind, KIND), eq(aiAnalyses.filterKey, filterKey)))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  return row ? toView(row) : null;
}

export async function getAnalysisForUser(id: number, userId: number) {
  const [row] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.id, id), eq(aiAnalyses.userId, userId), eq(aiAnalyses.kind, KIND))).limit(1);
  return row ? toView(row) : null;
}

/** Analyses of any kind started in the last 24 hours, and this kind's run still in progress, if any. */
export async function analysisUsage(userId: number, kind: string = KIND) {
  const since = new Date(Date.now() - 86_400_000);
  const [[recent], [latest]] = await Promise.all([
    db.select({ n: count() }).from(aiAnalyses).where(and(eq(aiAnalyses.userId, userId), gte(aiAnalyses.createdAt, since))),
    db.select().from(aiAnalyses).where(and(eq(aiAnalyses.userId, userId), eq(aiAnalyses.kind, kind))).orderBy(desc(aiAnalyses.createdAt)).limit(1),
  ]);
  const running = latest ? toView(latest) : null;
  return { recent: recent?.n ?? 0, running: running?.status === "running" ? { view: running, filterKey: latest!.filterKey } : null };
}

export async function createCreativeAnalysis(userId: number, filterKey: string, input: CreativeAnalysisInput) {
  const [row] = await db
    .insert(aiAnalyses)
    .values({ userId, kind: KIND, filterKey, periodStart: input.period.start, periodEnd: input.period.end, status: "running", input })
    .returning();
  return toView(row!);
}

/** Stores the input once the extra Meta data has been added, so a failed run still shows what was pulled. */
export async function updateAnalysisInput(id: number, input: CreativeAnalysisInput) {
  await db.update(aiAnalyses).set({ input }).where(eq(aiAnalyses.id, id));
}

export async function finishAnalysis(id: number, run: AnalysisRun & { input?: CreativeAnalysisInput }) {
  await db
    .update(aiAnalyses)
    .set({
      ...(run.input ? { input: run.input } : {}),
      status: run.ok ? "done" : "failed",
      result: run.ok ? run.result : null,
      error: run.ok ? null : run.error,
      model: run.model ?? null,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      credits: run.credits ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAnalyses.id, id));
}

/* ------------------------- One content (Gemini) ------------------------- */

async function contentView(row: AiAnalysis): Promise<ContentAnalysisView> {
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
  return { ...toView<ContentAnalysisInput, ContentAnalysisResult>(row), byName: person?.name ?? null };
}

/** The latest analysis of a content, by anyone: the team shares content analyses. */
export async function getLatestContentAnalysis(postKey: string) {
  const [row] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.kind, CONTENT_KIND), eq(aiAnalyses.filterKey, postKey)))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  return row ? contentView(row) : null;
}

export async function getContentAnalysis(id: number) {
  const [row] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.id, id), eq(aiAnalyses.kind, CONTENT_KIND))).limit(1);
  return row ? contentView(row) : null;
}

/** Which of these contents have a finished analysis, for the badge on gallery cards. */
export async function analysedContentKeys(postKeys: string[]) {
  if (!postKeys.length) return new Set<string>();
  const rows = await db
    .selectDistinct({ key: aiAnalyses.filterKey })
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.kind, CONTENT_KIND), eq(aiAnalyses.status, "done"), inArray(aiAnalyses.filterKey, postKeys)));
  return new Set(rows.map((r) => r.key));
}

export async function contentAnalysisRunning(postKey: string) {
  const latest = await getLatestContentAnalysis(postKey);
  return latest?.status === "running" ? latest : null;
}

export const contentUsage = (userId: number) => analysisUsage(userId, CONTENT_KIND);

export async function createContentAnalysis(userId: number, input: ContentAnalysisInput) {
  const [row] = await db
    .insert(aiAnalyses)
    .values({ userId, kind: CONTENT_KIND, filterKey: input.postKey, periodStart: input.period.start, periodEnd: input.period.end, status: "running", input })
    .returning();
  return contentView(row!);
}

export async function finishContentAnalysis(id: number, run: ContentAnalysisOutcome) {
  await db
    .update(aiAnalyses)
    .set({
      input: run.input,
      status: run.ok ? "done" : "failed",
      result: run.ok ? run.result : null,
      error: run.ok ? null : run.error,
      model: run.model ?? null,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      credits: run.credits ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAnalyses.id, id));
}

/* ------------------------- One ad campaign (Gemini) ------------------------- */

/** "<ad campaign id>:<start>:<end>": one analysis per campaign and exact period. */
export const campaignFilterKey = (adCampaignId: number, period: { start: string; end: string }) => `${adCampaignId}:${period.start}:${period.end}`;

async function campaignView(row: AiAnalysis): Promise<CampaignAnalysisView> {
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
  return { ...toView<CampaignAnalysisInput, CampaignAnalysisResult>(row), byName: person?.name ?? null };
}

/** The latest analysis of this campaign and period, by anyone who can see the campaign. */
export async function getLatestCampaignAnalysis(filterKey: string) {
  const [row] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.kind, CAMPAIGN_KIND), eq(aiAnalyses.filterKey, filterKey)))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  return row ? campaignView(row) : null;
}

export async function getCampaignAnalysis(id: number) {
  const [row] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.id, id), eq(aiAnalyses.kind, CAMPAIGN_KIND))).limit(1);
  return row ? { view: await campaignView(row), filterKey: row.filterKey } : null;
}

export const campaignUsage = (userId: number) => analysisUsage(userId, CAMPAIGN_KIND);

export async function createCampaignAnalysis(userId: number, filterKey: string, input: CampaignAnalysisInput) {
  const [row] = await db
    .insert(aiAnalyses)
    .values({ userId, kind: CAMPAIGN_KIND, filterKey, periodStart: input.period.start, periodEnd: input.period.end, status: "running", input })
    .returning();
  return campaignView(row!);
}

export async function finishCampaignAnalysis(id: number, run: CampaignAnalysisOutcome & { input?: CampaignAnalysisInput }) {
  await db
    .update(aiAnalyses)
    .set({
      ...(run.input ? { input: run.input } : {}),
      status: run.ok ? "done" : "failed",
      result: run.ok ? run.result : null,
      error: run.ok ? null : run.error,
      model: run.model ?? null,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      credits: run.credits ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAnalyses.id, id));
}

/* ------------------------- SEO: one property and period (Gemini) ------------------------- */

const SEO_KIND = "seo";
export type SeoAnalysisView = View<SeoAnalysisInput, SeoAnalysisResult> & { byName: string | null };

/** "<start>:<end>:<site URL>": one analysis per property and exact period, shared by whoever can see the property. */
export const seoFilterKey = (siteUrl: string, range: { start: string; end: string }) => `${range.start}:${range.end}:${siteUrl}`;
export const seoSiteOf = (filterKey: string) => filterKey.split(":").slice(2).join(":");

async function seoView(row: AiAnalysis): Promise<SeoAnalysisView> {
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
  return { ...toView<SeoAnalysisInput, SeoAnalysisResult>(row), byName: person?.name ?? null };
}

export async function getLatestSeoAnalysis(filterKey: string) {
  const [row] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.kind, SEO_KIND), eq(aiAnalyses.filterKey, filterKey))).orderBy(desc(aiAnalyses.createdAt)).limit(1);
  return row ? seoView(row) : null;
}

export async function getSeoAnalysis(id: number) {
  const [row] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.id, id), eq(aiAnalyses.kind, SEO_KIND))).limit(1);
  return row ? { view: await seoView(row), filterKey: row.filterKey } : null;
}

export const seoUsage = (userId: number) => analysisUsage(userId, SEO_KIND);

export async function createSeoAnalysis(userId: number, filterKey: string, input: SeoAnalysisInput) {
  const [row] = await db
    .insert(aiAnalyses)
    .values({ userId, kind: SEO_KIND, filterKey, periodStart: input.period.start, periodEnd: input.period.end, status: "running", input })
    .returning();
  return seoView(row!);
}

export async function finishSeoAnalysis(id: number, run: SeoAnalysisOutcome) {
  await db
    .update(aiAnalyses)
    .set({
      status: run.ok ? "done" : "failed",
      result: run.ok ? run.result : null,
      error: run.ok ? null : run.error,
      model: run.model ?? null,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      credits: run.credits ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAnalyses.id, id));
}
