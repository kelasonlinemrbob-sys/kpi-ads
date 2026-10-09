"use server";

import { after } from "next/server";
import { z } from "zod";
import { buildCampaignAnalysisInput, runCampaignAnalysis } from "@/lib/ai-campaign-analysis";
import {
  campaignFilterKey,
  campaignUsage,
  createCampaignAnalysis,
  DAILY_ANALYSIS_LIMIT,
  finishCampaignAnalysis,
  getCampaignAnalysis,
  getLatestCampaignAnalysis,
  type CampaignAnalysisView,
} from "@/lib/ai-analysis-data";
import { requireUser } from "@/lib/auth";
import { fetchCampaignBreakdown, fetchCampaignBreakdowns } from "@/lib/campaign-breakdown";
import { loadVisibleAdCampaign, loadVisibleAdCampaigns } from "@/lib/campaign-access";
import { CAMPAIGN_PERIODS, campaignPeriod, emptyCampaignMetrics } from "@/lib/campaign-metrics";
import { fetchCampaignPerformance, type CampaignPerformanceResult } from "@/lib/campaign-performance";
import { MAX_LEVEL_CAMPAIGNS, type CampaignBreakdown } from "@/lib/campaign-tree";
import { getKieApiKey, KIE_KEY_MISSING } from "@/lib/kie-connection";
import { todayISO } from "@/lib/kpi";
import { getRegistrationKpi } from "@/lib/registrations";
import { can } from "@/lib/roles";

const ref = z.object({ id: z.coerce.number().int().positive(), period: z.string().max(20).optional() });


const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;

export type AdLevelsResult =
  | { ok: true; breakdowns: { id: number; breakdown: CampaignBreakdown }[]; errors: string[] }
  | { ok: false; error: string };

/**
 * Ad sets and ads of the chosen campaigns (Campaigns → tabs Ad set / Iklan), read live from Meta / Google:
 * a few requests per ad account, whatever the number of campaigns. Hidden campaigns are skipped.
 */
export async function getAdLevelsAction(input: { ids: number[]; period?: string }): Promise<AdLevelsResult> {
  const user = await requireUser();
  if (!can.viewCampaigns(user.role)) return { ok: false, error: "Kamu tidak punya akses ke Campaigns." };
  const parsed = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(MAX_LEVEL_CAMPAIGNS), period: z.string().max(20).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: `Pilih 1–${MAX_LEVEL_CAMPAIGNS} campaign.` };
  const visible = await loadVisibleAdCampaigns(user, parsed.data.ids);
  if (!visible.length) return { ok: false, error: "Campaign tidak ditemukan." };
  const period = campaignPeriod(parsed.data.period, todayISO());
  const byAccount = new Map<number, typeof visible>();
  for (const v of visible) byAccount.set(v.account.id, [...(byAccount.get(v.account.id) ?? []), v]);
  const results = await Promise.all([...byAccount.values()].map(async (list) => {
    const res = await fetchCampaignBreakdowns(list[0]!.account, list.map((v) => v.campaign.externalId), period.start, period.end);
    return { list, res };
  }));
  const breakdowns: { id: number; breakdown: CampaignBreakdown }[] = [];
  const errors: string[] = [];
  for (const { list, res } of results) {
    if (!res.ok) errors.push(`${list[0]!.account.name}: ${res.error}`);
    else for (const v of list) breakdowns.push({ id: v.campaign.id, breakdown: res.breakdowns.get(v.campaign.externalId)! });
  }
  if (!breakdowns.length && errors.length) return { ok: false, error: errors.join(" · ") };
  return { ok: true, breakdowns, errors };
}

/* ------------------------------- Analisa AI ------------------------------- */

type AnalysisResult = { ok: true; analysis: CampaignAnalysisView | null } | { ok: false; error: string };

/** Gemini reads the campaign, its ad sets and ads (and the product's closings) and writes the evaluation. */
export async function startCampaignAnalysisAction(input: z.input<typeof ref>): Promise<AnalysisResult> {
  const user = await requireUser();
  if (!can.viewCampaigns(user.role) || !can.runAiAnalysis(user.role)) return { ok: false, error: "Kamu tidak punya akses untuk menjalankan Analisa AI." };
  const parsed = ref.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Campaign tidak valid." };
  const found = await loadVisibleAdCampaign(user, parsed.data.id);
  if (!found) return { ok: false, error: "Campaign tidak ditemukan." };

  const apiKey = await getKieApiKey();
  if (!apiKey) return { ok: false, error: KIE_KEY_MISSING };
  const period = campaignPeriod(parsed.data.period, todayISO());
  const filterKey = campaignFilterKey(found.campaign.id, period);
  const latest = await getLatestCampaignAnalysis(filterKey);
  if (latest?.status === "running") return { ok: true, analysis: latest };
  const usage = await campaignUsage(user.id);
  if (usage.running) return { ok: false, error: "Analisa campaign lain masih berjalan. Tunggu sampai selesai, lalu coba lagi." };
  if (usage.recent >= DAILY_ANALYSIS_LIMIT) return { ok: false, error: `Batas ${DAILY_ANALYSIS_LIMIT} analisa per 24 jam sudah tercapai.` };

  // Everything is read on the server from the campaign id, never taken from the client.
  const days = daysBetween(period.start, period.end);
  const previous = { start: shift(period.start, -days), end: shift(period.start, -1) };
  const [breakdown, current, before, registrations] = await Promise.all([
    fetchCampaignBreakdown(found.account, found.campaign.externalId, period.start, period.end),
    fetchCampaignPerformance(found.account, period.start, period.end),
    fetchCampaignPerformance(found.account, previous.start, previous.end),
    found.product?.registrationPackages?.trim() ? getRegistrationKpi(period.start, period.end) : Promise.resolve(null),
  ]);
  if (!breakdown.ok) return { ok: false, error: breakdown.error };
  if (!current.ok) return { ok: false, error: current.error };
  const pick = (res: CampaignPerformanceResult) => (res.ok ? res.campaigns.find((c) => c.id === found.campaign.externalId)?.metrics ?? null : null);
  const metrics = pick(current) ?? emptyCampaignMetrics(found.account.platform, current.currency, current.lpvAvailable);
  if (!(metrics.spent ?? 0) && !(metrics.impressions ?? 0)) return { ok: false, error: "Campaign ini tidak tayang pada periode terpilih, jadi belum ada yang bisa dianalisa." };
  const productRegs = registrations?.filter((r) => r.campaignId === found.product?.id) ?? null;

  const analysisInput = buildCampaignAnalysisInput({
    campaign: {
      name: found.campaign.name, platform: found.account.platform, account: found.account.name, objective: found.campaign.objective,
      status: found.campaign.platformStatus, dailyBudget: found.campaign.dailyBudget, currency: current.currency,
      startDate: found.campaign.startDate, endDate: found.campaign.endDate,
    },
    product: found.product ? { name: found.product.name, owner: found.product.ownerName } : null,
    period: { start: period.start, end: period.end, days, label: CAMPAIGN_PERIODS.find((p) => p.value === period.key)?.label ?? period.key },
    current: metrics,
    previous: pick(before) ? { ...previous, metrics: pick(before)! } : null,
    breakdown: breakdown.breakdown,
    registrations: productRegs ? { closing: productRegs.reduce((s, r) => s + r.closing, 0), revenue: productRegs.reduce((s, r) => s + r.revenue, 0) } : null,
  });

  const analysis = await createCampaignAnalysis(user.id, filterKey, analysisInput);
  // Gemini can outlast the proxy timeouts in front of the app, so it runs after the response and the page polls.
  after(async () => {
    try {
      await finishCampaignAnalysis(analysis.id, await runCampaignAnalysis(apiKey, analysisInput));
    } catch (error) {
      await finishCampaignAnalysis(analysis.id, { ok: false, error: error instanceof Error ? error.message : "Analisa gagal." }).catch(() => {});
    }
  });
  return { ok: true, analysis };
}

const lookup = z.union([z.object({ analysisId: z.coerce.number().int().positive() }), ref]);

/** By analysis id while polling a run, else the latest analysis of the campaign and period. */
export async function getCampaignAnalysisAction(input: z.input<typeof lookup>): Promise<AnalysisResult> {
  const user = await requireUser();
  if (!can.viewCampaigns(user.role)) return { ok: false, error: "Kamu tidak punya akses ke Campaigns." };
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Analisa tidak ditemukan." };
  if ("analysisId" in parsed.data) {
    const found = await getCampaignAnalysis(parsed.data.analysisId);
    if (!found) return { ok: true, analysis: null };
    // Analyses are shared with whoever can see the campaign.
    const campaignId = Number(found.filterKey.split(":")[0]);
    return (await loadVisibleAdCampaign(user, campaignId)) ? { ok: true, analysis: found.view } : { ok: true, analysis: null };
  }
  const found = await loadVisibleAdCampaign(user, parsed.data.id);
  if (!found) return { ok: false, error: "Campaign tidak ditemukan." };
  return { ok: true, analysis: await getLatestCampaignAnalysis(campaignFilterKey(found.campaign.id, campaignPeriod(parsed.data.period, todayISO()))) };
}
