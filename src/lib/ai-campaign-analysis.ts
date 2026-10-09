import "server-only";
import { z } from "zod";
import { AD_BENCHMARKS } from "./ai-ads-analysis";
import { derivedCampaignMetrics, ratio, type CampaignMetrics } from "./campaign-metrics";
import type { CampaignBreakdown } from "./campaign-tree";
import { generateGeminiJson } from "./kie-gemini";

/**
 * "Analisa AI" of one campaign on Campaigns: the campaign, its ad sets and its ads for a period. Like the
 * Creative analyses, every number is computed here; Gemini only reads them and writes the diagnosis.
 */

/** Ads beyond this (by spend) are summed into one "others" line to keep the prompt small. */
export const MAX_CAMPAIGN_ADS = 40;
const MIN_IMPRESSIONS = 1000;
const MIN_CLICKS = 20;

export type CampaignNumbers = Partial<Record<
  | "spend" | "impressions" | "reach" | "frequency" | "cpm" | "clicks" | "ctrPct" | "linkClicks" | "linkCtrPct" | "linkCpc"
  | "landingPageViews" | "cplv" | "lpvRatePct" | "leads" | "costPerLead" | "chats" | "costPerChat" | "conversions" | "costPerConversion"
  | "purchases" | "purchaseValue" | "roas" | "video3s" | "hookRatePct" | "thruplays" | "holdRatePct",
  number
>>;

const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? undefined : Math.round(v * 10 ** digits) / 10 ** digits);

/** The figures sent to the model; unknown values are left out instead of sent as 0. */
export function campaignNumbers(m: CampaignMetrics): CampaignNumbers {
  const d = derivedCampaignMetrics(m);
  const out: CampaignNumbers = {
    spend: round(d.spent, 0), impressions: round(d.impressions, 0), reach: round(d.reach, 0), frequency: round(d.frequency),
    cpm: round(d.cpm, 0), clicks: round(d.clicks, 0), ctrPct: round(d.ctr), linkClicks: round(d.linkClicks, 0), linkCtrPct: round(d.linkCtr),
    linkCpc: round(d.linkCpc, 0), landingPageViews: round(d.landingPageViews, 0), cplv: round(d.cplv, 0), lpvRatePct: round(d.lpvRate),
    leads: round(d.leads, 0), costPerLead: round(d.cpr, 0), chats: round(d.chats, 0), costPerChat: round(d.costPerChat, 0),
    conversions: round(d.conversions), costPerConversion: round(d.costPerConversion, 0), purchases: round(d.purchases, 0),
    purchaseValue: round(d.revenue, 0), roas: round(d.roas), video3s: round(d.video3s, 0),
    hookRatePct: round(ratio(d.video3s, d.impressions, 100)), thruplays: round(d.thruplays, 0), holdRatePct: round(ratio(d.thruplays, d.video3s, 100)),
  };
  for (const key of Object.keys(out) as (keyof CampaignNumbers)[]) if (out[key] === undefined) delete out[key];
  return out;
}

const enough = (m: CampaignMetrics) => (m.impressions ?? 0) >= MIN_IMPRESSIONS && (m.linkClicks ?? m.clicks ?? 0) >= MIN_CLICKS;

export type CampaignAnalysisInput = {
  campaign: { name: string; platform: "meta" | "google"; account: string; objective: string | null; status: string; dailyBudget: number | null; currency: string; startDate: string | null; endDate: string | null };
  product: { name: string; owner: string } | null;
  period: { start: string; end: string; days: number; label: string };
  totals: CampaignNumbers;
  previous: { start: string; end: string; numbers: CampaignNumbers } | null;
  adsets: { ref: string; name: string; status: string; dailyBudget?: number; lifetimeBudget?: number; optimizationGoal?: string; audience?: string; ads: number; spendSharePct?: number; sufficientData: boolean; numbers: CampaignNumbers }[];
  ads: { ref: string; adset: string; name: string; status: string; spendSharePct?: number; sufficientData: boolean; numbers: CampaignNumbers }[];
  otherAds: { count: number; numbers: CampaignNumbers } | null;
  /** Closing and revenue of the product from the LKBI registration app (all its campaigns together). */
  registrations: { closing: number; revenue: number; note: string } | null;
  benchmarks: typeof AD_BENCHMARKS;
  gaps: string[];
};

export function buildCampaignAnalysisInput(opts: {
  campaign: CampaignAnalysisInput["campaign"];
  product: CampaignAnalysisInput["product"];
  period: CampaignAnalysisInput["period"];
  current: CampaignMetrics;
  previous: { start: string; end: string; metrics: CampaignMetrics } | null;
  breakdown: CampaignBreakdown;
  registrations: { closing: number; revenue: number } | null;
}): CampaignAnalysisInput {
  const total = opts.current.spent ?? 0;
  const share = (m: CampaignMetrics) => (total > 0 ? round(((m.spent ?? 0) / total) * 100, 1) : undefined);
  const adsets = opts.breakdown.adsets.map((s, i) => ({ ref: `S${i + 1}`, set: s }));
  const allAds = adsets.flatMap(({ ref, set }) => set.ads.map((ad) => ({ adset: ref, ad }))).sort((a, b) => (b.ad.metrics.spent ?? 0) - (a.ad.metrics.spent ?? 0));
  const shown = allAds.slice(0, MAX_CAMPAIGN_ADS);
  const rest = allAds.slice(MAX_CAMPAIGN_ADS);
  const gaps: string[] = [];
  if (opts.campaign.platform === "google") gaps.push("Google Ads: tidak ada reach, frekuensi, lead Meta, chat, LPV per ad group, maupun data video; hasil memakai konversi Google.");
  if (!opts.previous) gaps.push("Periode sebelumnya tidak tersedia.");
  if (!adsets.length) gaps.push("Tidak ada ad set yang tayang pada periode ini.");
  return {
    campaign: opts.campaign,
    product: opts.product,
    period: opts.period,
    totals: campaignNumbers(opts.current),
    previous: opts.previous ? { start: opts.previous.start, end: opts.previous.end, numbers: campaignNumbers(opts.previous.metrics) } : null,
    adsets: adsets.map(({ ref, set }) => ({
      ref, name: set.name, status: set.status, ads: set.ads.length, sufficientData: enough(set.metrics), numbers: campaignNumbers(set.metrics),
      ...(set.dailyBudget !== null ? { dailyBudget: set.dailyBudget } : {}),
      ...(set.lifetimeBudget !== null ? { lifetimeBudget: set.lifetimeBudget } : {}),
      ...(set.optimizationGoal ? { optimizationGoal: set.optimizationGoal } : {}),
      ...(set.audience ? { audience: set.audience } : {}),
      ...(share(set.metrics) !== undefined ? { spendSharePct: share(set.metrics) } : {}),
    })),
    ads: shown.map(({ adset, ad }, i) => ({
      ref: `A${i + 1}`, adset, name: ad.name, status: ad.status, sufficientData: enough(ad.metrics), numbers: campaignNumbers(ad.metrics),
      ...(share(ad.metrics) !== undefined ? { spendSharePct: share(ad.metrics) } : {}),
    })),
    otherAds: rest.length
      ? { count: rest.length, numbers: campaignNumbers(rest.reduce((sum, { ad }) => addMetrics(sum, ad.metrics), zero(rest[0]!.ad.metrics))) }
      : null,
    registrations: opts.registrations
      ? { ...opts.registrations, note: "Closing (pendaftaran lunas) dan revenue produk ini dari aplikasi pendaftaran LKBI, untuk SEMUA campaign produk ini pada periode yang sama, bukan hanya campaign ini." }
      : null,
    benchmarks: AD_BENCHMARKS,
    gaps,
  };
}

const zero = (m: CampaignMetrics) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? 0 : v])) as CampaignMetrics;
function addMetrics(a: CampaignMetrics, b: CampaignMetrics): CampaignMetrics {
  const out = { ...a };
  for (const key of Object.keys(out) as (keyof CampaignMetrics)[]) {
    if (key === "currency") continue;
    out[key] = a[key] === null || b[key] === null ? null : (a[key] as number) + (b[key] as number);
  }
  out.reach = null; // never summed across ads
  return out;
}

/* ------------------------------ Prompt & output ------------------------------ */

export const CAMPAIGN_VERDICTS = ["scale", "pertahankan", "optimasi", "hentikan", "belum_cukup_data"] as const;
export const MATRIX_STATUS = ["baik", "waspada", "buruk", "netral"] as const;
export const PRIORITIES = ["tinggi", "sedang", "rendah"] as const;

const SYSTEM = `Kamu adalah media buyer Meta Ads dan Google Ads senior untuk pasar Indonesia. Kamu mengevaluasi satu campaign beserta ad set (Google: ad group) dan iklannya untuk satu periode, lalu memberi keputusan yang bisa langsung dikerjakan advertiser.

Aturan:
- Pakai hanya angka di data; jangan menghitung ulang atau mengarang angka. Semua angka adalah total periode di data.period. Mata uang di campaign.currency.
- Ukur sesuai tujuan campaign (campaign.objective): awareness/reach → CPM, frekuensi, hook rate; traffic → CTR link, CPC link, CPLV dan LPV rate; leads → biaya per lead; pesan → biaya per chat; sales/konversi → biaya per hasil dan ROAS. Untuk Google pakai konversi dan biaya per konversi.
- Bandingkan ad set dengan ad set lain dan iklan dengan iklan lain di campaign ini, dengan periode sebelumnya (previous) bila ada, dan dengan benchmarks (patokan umum Indonesia, bukan angka resmi Meta).
- Bila sufficientData=false, verdict untuk item itu "belum_cukup_data"; jangan sarankan mematikan item yang datanya belum cukup.
- registrations (bila ada) adalah closing dan revenue nyata dari aplikasi pendaftaran untuk seluruh campaign produk ini; pakai untuk menilai kualitas lead secara umum, jangan anggap semuanya berasal dari campaign ini.
- matrix: 5–8 metrik kunci sesuai tujuan campaign, masing-masing dengan nilai dari data, patokan (benchmark, rata-rata ad set, atau periode sebelumnya) dan status.
- funnel: di tahap mana orang paling banyak hilang (penayangan → klik → halaman → hasil) dan kenapa.
- adsets: nilai SEMUA ad set dengan ref-nya. ads: nilai iklan yang paling penting (pemenang, pemboros, dan yang perlu diganti), maksimal 12, pakai ref-nya.
- actions: maksimal 6 langkah konkret berurutan prioritas, misalnya naikkan budget ad set S2 20%, matikan iklan A5, duplikat A1 ke audiens baru, ganti hook. Sebut ref dan nama bila menyangkut ad set/iklan tertentu.
- gaps berisi data yang tidak tersedia; jangan menyimpulkan dari data itu.
- Tulis dalam Bahasa Indonesia yang lugas. Rupiah seperti Rp12.345, persen seperti 0,98%.

Balas hanya dengan satu objek JSON valid, tanpa teks lain, dengan bentuk:
{"score": 1-10, "verdict": "scale"|"pertahankan"|"optimasi"|"hentikan"|"belum_cukup_data", "summary": "2-3 kalimat", "matrix": [{"metric": "...", "value": "...", "benchmark": "...", "status": "baik"|"waspada"|"buruk"|"netral", "note": "..."}], "funnel": "...", "adsets": [{"ref": "S1", "verdict": "...", "reason": "..."}], "ads": [{"ref": "A1", "verdict": "...", "reason": "..."}], "budget": "saran budget dan pembagiannya", "audience": "penilaian audiens/targeting", "creative": "penilaian materi iklan dan apa yang perlu dibuat", "actions": [{"priority": "tinggi"|"sedang"|"rendah", "title": "...", "detail": "..."}]}`;

const score = z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n))));
const lower = <T extends readonly [string, ...string[]]>(values: T) =>
  z.string().transform((v) => v.trim().toLowerCase().replace(/\s+/g, "_")).pipe(z.enum(values));
const verdict = lower(CAMPAIGN_VERDICTS).catch("optimasi");
const text = z.coerce.string().default("");

const resultSchema = z.object({
  score,
  verdict,
  summary: z.string().min(1),
  matrix: z.array(z.object({ metric: z.string(), value: text, benchmark: text, status: lower(MATRIX_STATUS).catch("netral"), note: text })).catch([]),
  funnel: text,
  adsets: z.array(z.object({ ref: z.string(), verdict, reason: text })).catch([]),
  ads: z.array(z.object({ ref: z.string(), verdict, reason: text })).catch([]),
  budget: text,
  audience: text,
  creative: text,
  actions: z.array(z.object({ priority: lower(PRIORITIES).catch("sedang"), title: z.string(), detail: text })).catch([]),
});
export type CampaignAnalysisResult = z.infer<typeof resultSchema>;

/** Validates the model's JSON and keeps only refs that exist in the input. */
export function parseCampaignResult(raw: string, input: Pick<CampaignAnalysisInput, "adsets" | "ads">): CampaignAnalysisResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) return null;
  const r = parsed.data;
  const setRefs = new Set(input.adsets.map((s) => s.ref));
  const adRefs = new Set(input.ads.map((a) => a.ref));
  const norm = (ref: string) => ref.trim().toUpperCase();
  return {
    ...r,
    matrix: r.matrix.slice(0, 8),
    adsets: r.adsets.map((s) => ({ ...s, ref: norm(s.ref) })).filter((s) => setRefs.has(s.ref)),
    ads: r.ads.map((a) => ({ ...a, ref: norm(a.ref) })).filter((a) => adRefs.has(a.ref)).slice(0, 12),
    actions: r.actions.slice(0, 6),
  };
}

export function campaignPrompt(input: CampaignAnalysisInput) {
  return `Analisa campaign berikut.\n\n${JSON.stringify(input)}`;
}

export type CampaignAnalysisOutcome =
  | { ok: true; result: CampaignAnalysisResult; model: string; inputTokens: number; outputTokens: number; credits: number | null }
  | { ok: false; error: string; model?: string; inputTokens?: number; outputTokens?: number; credits?: number | null };

export async function runCampaignAnalysis(apiKey: string, input: CampaignAnalysisInput): Promise<CampaignAnalysisOutcome> {
  let credits = 0;
  const ask = async () => {
    const res = await generateGeminiJson({ apiKey, system: SYSTEM, parts: [{ text: campaignPrompt(input) }] });
    credits += res.credits ?? 0;
    return res;
  };
  let res = await ask();
  if (!res.ok) return { ok: false, error: res.error, credits: credits || null };
  let result = parseCampaignResult(res.text, input);
  if (!result) {
    // One retry: the JSON shape isn't enforced by Kie.
    const again = await ask();
    if (again.ok) {
      res = again;
      result = parseCampaignResult(again.text, input);
    }
  }
  const usage = { model: res.model, inputTokens: res.promptTokens, outputTokens: res.outputTokens, credits: credits || null };
  if (!result) {
    const cut = res.finishReason === "MAX_TOKENS";
    return { ok: false, error: cut ? "Jawaban AI terpotong. Coba jalankan ulang." : "AI tidak mengembalikan hasil dalam format yang diharapkan. Coba jalankan ulang.", ...usage };
  }
  return { ok: true, result, ...usage };
}
