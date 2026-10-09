import "server-only";
import { z } from "zod";
import type { SearchConsoleReport } from "./search-console-client";
import { expectedCtr, findOpportunities, pctChange, positionDistribution, topMovers, withChanges, type SeoRow } from "./seo-insights";
import { generateGeminiJson } from "./kie-gemini";
import { normalizeKeyword, type PlannerKeyword } from "./keyword-planner-data";

/**
 * "Analisa AI" on the SEO page: one Search Console property and period. Every figure is computed here;
 * Gemini only reads them and writes the diagnosis and the actions, as in the ads analyses.
 */

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const row = (r: SeoRow) => ({ clicks: r.clicks, impressions: r.impressions, ctrPct: round(r.ctr * 100), position: round(r.position, 1) });

/** Keyword Planner data for the analysis: volumes of the site's keywords and new ideas, or why it is missing. */
export type SeoPlannerData = { volumes: PlannerKeyword[]; ideas: PlannerKeyword[] } | { error: string };

export function buildSeoAnalysisInput(siteUrl: string, range: { start: string; end: string }, report: SearchConsoleReport, planner: SeoPlannerData | null = null) {
  const prev = report.previous;
  const queries = withChanges(report.queries, prev?.queries ?? null);
  const pages = withChanges(report.pages, prev?.pages ?? null);
  const movers = prev ? topMovers(queries, 8) : null;
  const total = report.total;
  const gaps: string[] = [];
  if (planner && "error" in planner) gaps.push(`Volume pencarian Keyword Planner tidak tersedia: ${planner.error}`);
  if (!prev) gaps.push("Periode sebelumnya tidak tersedia (di luar 16 bulan data Search Console).");
  gaps.push("Google menyembunyikan sebagian kata kunci demi privasi, jadi jumlah klik per kata kunci tidak sama dengan total.");
  return {
    siteUrl,
    period: range,
    previousPeriod: prev?.range ?? null,
    totals: total ? { ...row(total), expectedCtrPctAtPosition: round(expectedCtr(total.position) * 100) } : null,
    previousTotals: prev?.total ? row(prev.total) : null,
    change: total && prev?.total ? {
      clicksPct: pctChange(total.clicks, prev.total.clicks), impressionsPct: pctChange(total.impressions, prev.total.impressions),
      ctrPct: pctChange(total.ctr, prev.total.ctr), positionGain: round(prev.total.position - total.position, 1),
    } : null,
    daily: report.daily.map((d) => ({ date: d.keys?.[0] ?? "", clicks: d.clicks, impressions: d.impressions, position: round(d.position, 1) })),
    positionBands: positionDistribution(report.queries),
    topQueries: queries.slice(0, 30).map((q) => ({ query: q.key, ...row(q), clicksDelta: q.clicksDelta, positionGain: q.positionGain })),
    topPages: pages.slice(0, 20).map((p) => ({ page: p.key, ...row(p), clicksDelta: p.clicksDelta, positionGain: p.positionGain })),
    devices: report.devices.map((d) => ({ device: d.keys?.[0] ?? "", ...row(d) })),
    countries: report.countries.slice(0, 8).map((c) => ({ country: c.keys?.[0] ?? "", ...row(c) })),
    opportunities: findOpportunities(queries, { limit: 8 }).map((o) => ({ kind: o.kind, query: o.key, ...row(o), potentialClicks: o.potentialClicks })),
    movers: movers ? {
      clicksUp: movers.up.map((m) => ({ query: m.key, clicksDelta: m.clicksDelta })),
      clicksDown: movers.down.map((m) => ({ query: m.key, clicksDelta: m.clicksDelta, positionGain: m.positionGain })),
      rankUp: movers.rankUp.map((m) => ({ query: m.key, positionGain: m.positionGain, impressions: m.impressions })),
      rankDown: movers.rankDown.map((m) => ({ query: m.key, positionGain: m.positionGain, impressions: m.impressions })),
      newQueries: movers.fresh.map((m) => ({ query: m.key, impressions: m.impressions, position: round(m.position, 1) })),
    } : null,
    keywordPlanner: planner && "volumes" in planner ? {
      note: "Google Keyword Planner, rata-rata pencarian per bulan (dibulatkan Google), Indonesia, Bahasa Indonesia",
      siteKeywordVolumes: planner.volumes.slice(0, 30).map((k) => ({ query: k.keyword, monthlySearches: k.volume, trend3mPct: k.trendPct, competition: k.competition })),
      // Ideas the site doesn't show for yet: content gaps.
      gapIdeas: planner.ideas.filter((k) => !report.queries.some((q) => normalizeKeyword(q.keys?.[0] ?? "") === normalizeKeyword(k.keyword))).slice(0, 25)
        .map((k) => ({ query: k.keyword, monthlySearches: k.volume, trend3mPct: k.trendPct, competition: k.competition })),
    } : null,
    benchmarks: { note: "CTR wajar per posisi (rata-rata umum web, bukan angka resmi Google)", expectedCtrPct: { pos1: 28, pos3: 11, pos5: 6.5, pos10: 2.2, page2: 1 } },
    gaps,
  };
}
export type SeoAnalysisInput = ReturnType<typeof buildSeoAnalysisInput>;

const SYSTEM = `Kamu adalah konsultan SEO senior untuk bisnis pendidikan di Indonesia. Kamu menilai performa organik satu website di Google Search dari data Search Console, lalu memberi langkah yang bisa langsung dikerjakan tim SEO dan web master.

Aturan:
- Pakai hanya angka di data; jangan menghitung ulang atau mengarang angka. Angka adalah total periode di data.period, dibanding data.previousPeriod bila ada.
- Bedakan masalah permintaan (impresi turun), peringkat (posisi turun) dan daya tarik hasil pencarian (CTR di bawah wajar untuk posisinya; lihat benchmarks).
- opportunities sudah dihitung: "striking" = posisi 4–20 dengan permintaan nyata, "low_ctr" = posisi bagus tapi jarang diklik, "declining" = klik turun. Prioritaskan menurut potentialClicks.
- Untuk tiap langkah, sebut kata kunci atau halaman yang dimaksud (persis seperti di data) dan apa yang dikerjakan: perbaiki judul/meta description, perkuat konten, internal link, halaman baru, perbaikan teknis, dsb.
- keywordPlanner (bila ada): volume pencarian bulanan dari Google Keyword Planner. Pakai untuk memprioritaskan: kata kunci bervolume besar dengan posisi kita lemah lebih penting; gapIdeas adalah kata kunci yang dicari orang tetapi website belum muncul.
- contentIdeas: topik atau halaman baru yang masuk akal dari kata kunci yang ada dan gapIdeas (utamakan volume besar dan kompetisi rendah), dengan contoh judul dalam Bahasa Indonesia.
- Jangan menyimpulkan dari data di gaps.
- Tulis dalam Bahasa Indonesia yang lugas. Angka seperti 1.234, persen seperti 1,28%.

Balas hanya dengan satu objek JSON valid, tanpa teks lain, dengan bentuk:
{"status": "tumbuh"|"stabil"|"menurun", "score": 1-10, "headline": "satu kalimat", "summary": "2-3 kalimat", "findings": [{"title": "...", "detail": "..."}], "actions": [{"priority": "tinggi"|"sedang"|"rendah", "title": "...", "detail": "...", "targets": ["kata kunci atau URL halaman"]}], "keywords": [{"query": "...", "verdict": "pertahankan"|"optimasi"|"perbaiki_ctr"|"pulihkan", "reason": "...", "suggestion": "..."}], "contentIdeas": [{"title": "contoh judul", "angle": "...", "targetQuery": "..."}], "technical": "catatan perangkat/teknis bila relevan"}
findings maksimal 5, actions maksimal 6, keywords maksimal 10, contentIdeas maksimal 4.`;

export const SEO_STATUS = ["tumbuh", "stabil", "menurun"] as const;
export const SEO_PRIORITY = ["tinggi", "sedang", "rendah"] as const;
export const SEO_VERDICTS = ["pertahankan", "optimasi", "perbaiki_ctr", "pulihkan"] as const;
const lower = <T extends readonly [string, ...string[]]>(values: T) => z.string().transform((v) => v.trim().toLowerCase().replace(/\s+/g, "_")).pipe(z.enum(values));
const text = z.coerce.string().default("");

const resultSchema = z.object({
  status: lower(SEO_STATUS).catch("stabil"),
  score: z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n)))),
  headline: z.string().min(1),
  summary: text,
  findings: z.array(z.object({ title: z.string(), detail: text })).catch([]),
  actions: z.array(z.object({ priority: lower(SEO_PRIORITY).catch("sedang"), title: z.string(), detail: text, targets: z.array(z.coerce.string()).catch([]) })).catch([]),
  keywords: z.array(z.object({ query: z.string(), verdict: lower(SEO_VERDICTS).catch("optimasi"), reason: text, suggestion: text })).catch([]),
  contentIdeas: z.array(z.object({ title: z.string(), angle: text, targetQuery: text })).catch([]),
  technical: text,
});
export type SeoAnalysisResult = z.infer<typeof resultSchema>;

export function parseSeoResult(raw: string): SeoAnalysisResult | null {
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
  return { ...r, findings: r.findings.slice(0, 5), actions: r.actions.slice(0, 6).map((a) => ({ ...a, targets: a.targets.slice(0, 5) })), keywords: r.keywords.slice(0, 10), contentIdeas: r.contentIdeas.slice(0, 4) };
}

export type SeoAnalysisOutcome =
  | { ok: true; result: SeoAnalysisResult; model: string; inputTokens: number; outputTokens: number; credits: number | null }
  | { ok: false; error: string; model?: string; inputTokens?: number; outputTokens?: number; credits?: number | null };

export async function runSeoAnalysis(apiKey: string, input: SeoAnalysisInput): Promise<SeoAnalysisOutcome> {
  let credits = 0;
  const ask = async () => {
    const res = await generateGeminiJson({ apiKey, system: SYSTEM, parts: [{ text: `Analisa performa SEO berikut.\n\n${JSON.stringify(input)}` }] });
    credits += res.credits ?? 0;
    return res;
  };
  let res = await ask();
  if (!res.ok) return { ok: false, error: res.error, credits: credits || null };
  let result = parseSeoResult(res.text);
  if (!result) {
    // One retry: the JSON shape isn't enforced by Kie.
    const again = await ask();
    if (again.ok) {
      res = again;
      result = parseSeoResult(again.text);
    }
  }
  const usage = { model: res.model, inputTokens: res.promptTokens, outputTokens: res.outputTokens, credits: credits || null };
  if (!result) return { ok: false, error: res.finishReason === "MAX_TOKENS" ? "Jawaban AI terpotong. Coba jalankan ulang." : "AI tidak mengembalikan hasil dalam format yang diharapkan. Coba jalankan ulang.", ...usage };
  return { ok: true, result, ...usage };
}
