"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { buildCreativeAnalysisInput, runCreativeAnalysis, withMatrixBrief, type CreativeAnalysisInput } from "@/lib/ai-ads-analysis";
import { applyEnrichment, fetchCreativeImages, fetchMetaEnrichment, type CreativeImage, type EnrichTarget } from "@/lib/ai-analysis-meta";
import { buildContentAnalysisInput, postKeyOf, runContentAnalysis } from "@/lib/ai-content-analysis";
import {
  analysisUsage,
  contentAnalysisRunning,
  contentUsage,
  createContentAnalysis,
  createCreativeAnalysis,
  finishContentAnalysis,
  getContentAnalysis,
  getLatestContentAnalysis,
  type ContentAnalysisView,
  creativeFilterKey,
  DAILY_ANALYSIS_LIMIT,
  finishAnalysis,
  getAnalysisForUser,
  updateAnalysisInput,
  type AnalysisView,
} from "@/lib/ai-analysis-data";
import { ANALYSIS_IMAGES_ENABLED } from "@/lib/ai-provider";
import { requireUser } from "@/lib/auth";
import { creativePeriod } from "@/lib/creative-period";
import { fetchCreativeMedia } from "@/lib/creative-media";
import { todayISO } from "@/lib/kpi";
import { CREATIVE_FORMAT_LABEL, CREATIVE_LABEL, CREATIVE_STATUS_LABEL } from "@/lib/creatives";
import { contentVisibleTo, getCreativeRows, getCreativeTeam, parseCreativeFilters, type CreativeFilters, type CreativeRow } from "@/lib/creatives-data";
import { getKieApiKey, KIE_KEY_MISSING } from "@/lib/kie-connection";
import { adsScopeFor } from "@/lib/ads-scope";
import { can } from "@/lib/roles";

type Result = { ok: true; analysis: AnalysisView } | { ok: false; error: string };

const schema = z.object({
  /** The Creative page's search params; the rows are re-read on the server from them. */
  query: z.string().max(2000),
  targetCostPerResult: z.coerce.number().positive("Target biaya per hasil harus lebih dari 0.").max(1_000_000_000).nullish(),
  businessContext: z.string().trim().max(1000, "Konteks bisnis maksimal 1.000 karakter.").nullish(),
  /** Pull the previous period, daily trend and breakdowns from Meta. */
  withMeta: z.boolean().default(true),
  /** Send the creative images of the biggest ads to the model. */
  withImages: z.boolean().default(true),
});

/** Adds the extra Meta data. Failures become notes in the input instead of failing the analysis. */
async function enrich(input: CreativeAnalysisInput, opts: { withMeta: boolean; withImages: boolean }) {
  const targets: EnrichTarget[] = input.ads.flatMap((a) => (a.source ? [{ ref: a.ref, ...a.source }] : []));
  const [raw, pictures] = await Promise.all([
    opts.withMeta ? fetchMetaEnrichment(targets, input.period) : null,
    opts.withImages ? fetchCreativeImages(targets) : { images: [] as CreativeImage[], gaps: [] },
  ]);
  const enriched = applyEnrichment(input, raw, { refs: pictures.images.map((i) => i.ref), gaps: pictures.gaps }, todayISO());
  return { input: enriched, images: pictures.images };
}

/** Human-readable filters, so the model knows which slice of the account it is looking at. */
async function describeScope(f: CreativeFilters, rows: CreativeRow[]) {
  const scope: string[] = [];
  if (f.advertiser) scope.push(`Advertiser: ${rows.find((r) => r.advertiser?.id === f.advertiser)?.advertiser?.name ?? "tertentu"}`);
  if (f.product) scope.push(`Produk: ${f.product}`);
  if (f.format) scope.push(`Format: ${CREATIVE_FORMAT_LABEL[f.format]}`);
  if (f.status) scope.push(`Status: ${CREATIVE_STATUS_LABEL[f.status]}`);
  if (f.label) scope.push(`Keterangan tim: ${f.label === "none" ? "Belum dinilai" : CREATIVE_LABEL[f.label]}`);
  if (f.creator) scope.push(`Creator/editor: ${(await getCreativeTeam()).find((p) => p.id === f.creator)?.name ?? "tertentu"}`);
  if (f.q) scope.push(`Pencarian: "${f.q}"`);
  return scope;
}

export async function startCreativeAnalysisAction(input: z.input<typeof schema>): Promise<Result> {
  const user = await requireUser(true);
  if (!can.runAiAnalysis(user.role)) return { ok: false, error: "Kamu tidak punya akses ke Analisa AI." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const apiKey = await getKieApiKey();
  if (!apiKey) return { ok: false, error: KIE_KEY_MISSING };

  const filters = parseCreativeFilters(Object.fromEntries(new URLSearchParams(parsed.data.query)), user);
  const filterKey = creativeFilterKey(filters);
  const usage = await analysisUsage(user.id);
  if (usage.running) {
    if (usage.running.filterKey === filterKey) return { ok: true, analysis: usage.running.view };
    return { ok: false, error: "Analisa lain masih berjalan. Tunggu sampai selesai, lalu coba lagi." };
  }
  if (usage.recent >= DAILY_ANALYSIS_LIMIT) return { ok: false, error: `Batas ${DAILY_ANALYSIS_LIMIT} analisa per 24 jam sudah tercapai.` };

  const rows = await getCreativeRows({ ...filters, scope: await adsScopeFor(user) });
  if (rows.length === 0) return { ok: false, error: "Tidak ada iklan pada periode dan filter ini untuk dianalisa." };
  const period = creativePeriod(filters.period);
  const analysisInput = buildCreativeAnalysisInput(rows, {
    period: { start: period.start, end: period.end, days: period.days, label: period.label },
    scope: await describeScope(filters, rows),
    targetCostPerResult: parsed.data.targetCostPerResult ?? null,
    businessContext: parsed.data.businessContext ?? null,
  });

  const analysis = await createCreativeAnalysis(user.id, filterKey, analysisInput);
  // Pulling Meta data and running Opus can take longer than the proxy timeouts in front of the app
  // (nginx 60s, Cloudflare 100s), so both run after the response and the page polls for the result.
  const options = { withMeta: parsed.data.withMeta, withImages: parsed.data.withImages && ANALYSIS_IMAGES_ENABLED };
  after(async () => {
    try {
      const pulled = options.withMeta || options.withImages ? await enrich(analysisInput, options) : { input: analysisInput, images: [] };
      const enriched = { ...pulled, input: withMatrixBrief(pulled.input) };
      await updateAnalysisInput(analysis.id, enriched.input);
      await finishAnalysis(analysis.id, await runCreativeAnalysis(apiKey, enriched.input, enriched.images));
    } catch (error) {
      await finishAnalysis(analysis.id, { ok: false, error: error instanceof Error ? error.message : "Analisa gagal." }).catch(() => {});
    }
  });
  // The client keeps visited pages for 30 s; drop its copy so coming back shows this run, not the old result.
  revalidatePath("/creatives");
  return { ok: true, analysis };
}

export async function getCreativeAnalysisAction(id: number): Promise<Result> {
  const user = await requireUser(true);
  if (!can.runAiAnalysis(user.role) || !Number.isSafeInteger(id)) return { ok: false, error: "Analisa tidak ditemukan." };
  const analysis = await getAnalysisForUser(id, user.id);
  return analysis ? { ok: true, analysis } : { ok: false, error: "Analisa tidak ditemukan." };
}

/* ------------------------- One content (Gemini) ------------------------- */

type ContentResult = { ok: true; analysis: ContentAnalysisView | null } | { ok: false; error: string };

const contentSchema = z.object({
  postKey: z.string().min(1).max(120),
  period: z.string().max(10).optional(),
});

/** Watches the content's video (or looks at its image), reads its copy and relates both to its numbers. */
export async function startContentAnalysisAction(input: z.input<typeof contentSchema>): Promise<ContentResult> {
  const user = await requireUser(true);
  if (!can.runAiAnalysis(user.role)) return { ok: false, error: "Kamu tidak punya akses untuk menjalankan Analisa AI." };
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Konten tidak valid." };

  const apiKey = await getKieApiKey();
  if (!apiKey) return { ok: false, error: KIE_KEY_MISSING };
  const running = await contentAnalysisRunning(parsed.data.postKey);
  if (running) return { ok: true, analysis: running };
  const usage = await contentUsage(user.id);
  if (usage.running) return { ok: false, error: "Analisa konten lain masih berjalan. Tunggu sampai selesai, lalu coba lagi." };
  if (usage.recent >= DAILY_ANALYSIS_LIMIT) return { ok: false, error: `Batas ${DAILY_ANALYSIS_LIMIT} analisa per 24 jam sudah tercapai.` };

  // The content and its numbers come from the database, never from the client.
  const period = creativePeriod(parsed.data.period);
  // An advertiser's content is measured against their own contents, never the rest of the team's.
  const allRows = await getCreativeRows({ period: period.key, scope: await adsScopeFor(user) });
  const postRows = allRows.filter((r) => postKeyOf(r) === parsed.data.postKey);
  if (!postRows.length) return { ok: false, error: "Konten tidak ditemukan pada periode ini. Sinkron ulang lalu coba lagi." };
  const base = buildContentAnalysisInput(postRows, allRows, { period: { start: period.start, end: period.end, days: period.days, label: period.label }, today: todayISO() });

  const analysis = await createContentAnalysis(user.id, base);
  // Pulling the creative from Meta and letting Gemini watch it can outlast the proxy timeouts.
  after(async () => {
    try {
      const media = base.source ? await fetchCreativeMedia(base.source) : null;
      const run = media
        ? await runContentAnalysis(apiKey, base, media)
        : { ok: false as const, error: "Iklan konten ini tidak punya ID Meta.", input: base };
      await finishContentAnalysis(analysis.id, run);
    } catch (error) {
      await finishContentAnalysis(analysis.id, { ok: false, error: error instanceof Error ? error.message : "Analisa gagal.", input: base }).catch(() => {});
    }
  });
  // The client keeps visited pages for 30 s; drop its copy so coming back shows this run, not the old result.
  revalidatePath("/creatives");
  return { ok: true, analysis };
}

/** The latest analysis of a content (by id while polling a run, else by content). Visible to the whole Creative team. */
export async function getContentAnalysisAction(ref: { id: number } | { postKey: string }): Promise<ContentResult> {
  const user = await requireUser(true);
  if (!can.viewCreatives(user.role)) return { ok: false, error: "Kamu tidak punya akses ke halaman Creative." };
  let analysis: ContentAnalysisView | null;
  if ("id" in ref) {
    if (!Number.isSafeInteger(ref.id)) return { ok: false, error: "Analisa tidak ditemukan." };
    analysis = await getContentAnalysis(ref.id);
  } else {
    if (typeof ref.postKey !== "string" || ref.postKey.length > 120) return { ok: false, error: "Konten tidak valid." };
    analysis = await getLatestContentAnalysis(ref.postKey);
  }
  // Content analyses are shared by the team, but an advertiser only sees those of their own contents.
  if (analysis && !(await contentVisibleTo(await adsScopeFor(user), analysis.input.postKey))) return { ok: true, analysis: null };
  return { ok: true, analysis };
}
