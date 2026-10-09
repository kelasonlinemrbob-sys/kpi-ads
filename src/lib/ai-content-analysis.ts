import "server-only";
import { z } from "zod";
import { AD_BENCHMARKS } from "./ai-ads-analysis";
import { CREATIVE_FORMAT_LABEL, CREATIVE_STATUS_LABEL, creativeRates, sumCreatives } from "./creatives";
import type { CreativeRow } from "./creatives-data";
import type { CreativeCopy, CreativeMedia } from "./creative-media";
import { generateGeminiJson, type GeminiPart } from "./kie-gemini";

/**
 * "Analisa creative" for one content (post) in the Creative gallery, with Gemini via Kie.ai: the model
 * watches the video (or looks at the image / carousel), reads the ad copy and relates both to the
 * content's numbers. Numbers and averages are computed here; the model only interprets them.
 */

const MIN_IMPRESSIONS = 1000;
const MIN_CLICKS = 20;

const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export type ContentNumbers = {
  impressions: number;
  reach: number;
  frequency: number | null;
  spend: number;
  cpm: number | null;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  results: number;
  costPerResult: number | null;
  views3s: number | null;
  hookRatePct: number | null;
  thruplays: number | null;
  holdRatePct: number | null;
  avgWatchSeconds: number | null;
};

export type ContentAnalysisInput = {
  postKey: string;
  period: { start: string; end: string; days: number; label: string };
  content: {
    adType: string;
    format: string;
    product: string | null;
    advertiser: string | null;
    daysRunning: number | null;
    ads: { name: string; campaign: string | null; status: string }[];
  };
  numbers: ContentNumbers;
  /** All contents synced for the same period, as one yardstick. */
  periodAverage: { contents: number; ctrPct: number | null; cpm: number | null; costPerResult: number | null; hookRatePct: number | null; holdRatePct: number | null };
  benchmarks: typeof AD_BENCHMARKS;
  sufficientData: boolean;
  copy: CreativeCopy | null;
  media: { kind: CreativeMedia["kind"]; videoSeconds: number | null; videoSent: boolean; imagesSent: number; coverOnly: boolean };
  gaps: string[];
  /** The ad with the biggest spend, whose creative is pulled. Not sent to the model. */
  source?: { adAccountId: number; adId: string };
};

export const postKeyOf = (r: Pick<CreativeRow, "postId" | "id">) => r.postId ?? `ad-${r.id}`;

export function buildContentAnalysisInput(
  postRows: CreativeRow[],
  allRows: CreativeRow[],
  opts: { period: ContentAnalysisInput["period"]; today: string },
): ContentAnalysisInput {
  const t = sumCreatives(postRows);
  const r = creativeRates(t);
  const video = postRows.some((row) => row.format === "video");
  const all = creativeRates(sumCreatives(allRows));
  const top = [...postRows].sort((a, b) => b.spend - a.spend || b.impressions - a.impressions)[0]!;
  const createdAt = postRows.map((row) => row.adCreatedAt).filter((d): d is string => !!d).sort()[0];
  const today = Date.parse(`${opts.today}T12:00:00Z`);
  return {
    postKey: postKeyOf(top),
    period: opts.period,
    content: {
      adType: top.adType,
      format: CREATIVE_FORMAT_LABEL[top.format],
      product: top.product,
      advertiser: top.advertiser?.name ?? null,
      daysRunning: createdAt ? Math.max(0, Math.floor((today - Date.parse(createdAt)) / 86_400_000)) : null,
      ads: postRows.slice(0, 10).map((row) => ({ name: row.adName, campaign: row.campaignName, status: CREATIVE_STATUS_LABEL[row.status] })),
    },
    numbers: {
      impressions: t.impressions,
      reach: t.reach,
      frequency: round(div(t.impressions, t.reach)),
      spend: Math.round(t.spend),
      cpm: round(r.cpm, 0),
      clicks: t.clicks,
      ctrPct: round(r.ctr),
      cpc: round(div(t.spend, t.clicks), 0),
      results: t.leads,
      costPerResult: round(r.cpl, 0),
      views3s: video ? t.videoViews : null,
      hookRatePct: video ? round(r.hook, 1) : null,
      thruplays: video ? t.thruplays : null,
      holdRatePct: video ? round(r.hold, 1) : null,
      avgWatchSeconds: video ? round(t.avgPlayTime, 1) : null,
    },
    periodAverage: {
      contents: new Set(allRows.map(postKeyOf)).size,
      ctrPct: round(all.ctr),
      cpm: round(all.cpm, 0),
      costPerResult: round(all.cpl, 0),
      hookRatePct: round(all.hook, 1),
      holdRatePct: round(all.hold, 1),
    },
    benchmarks: AD_BENCHMARKS,
    sufficientData: t.impressions >= MIN_IMPRESSIONS && t.clicks >= MIN_CLICKS,
    copy: null,
    media: { kind: "none", videoSeconds: null, videoSent: false, imagesSent: 0, coverOnly: false },
    gaps: [],
    source: { adAccountId: top.adAccountId, adId: top.externalAdId },
  };
}

/* ------------------------------ Prompt & output ------------------------------ */

export const CONTENT_VERDICTS = ["pertahankan", "perbaiki", "ganti", "belum_cukup_data"] as const;
export const CONTENT_LABELS = ["winning", "good", "average", "poor"] as const;

const SYSTEM = `Kamu adalah creative strategist Meta Ads senior untuk pasar Indonesia. Kamu menilai satu konten iklan: menonton videonya (atau melihat gambar/kartu carousel-nya), membaca copy-nya, lalu mengaitkannya dengan angka performa.

Aturan:
- Nilai hanya yang benar-benar kamu lihat dan dengar. Untuk video, sebut apa yang terjadi di 3 detik pertama apa adanya. Bila media.coverOnly=true, kamu hanya melihat cover, bukan isi video: katakan itu dan jangan menebak isi video. Bila tidak ada media sama sekali, nilai dari copy dan angka saja, dan isi visual dengan "Media tidak tersedia".
- Pakai hanya angka di data; jangan menghitung ulang atau mengarang angka. Angka adalah total periode di data.period.
- Ukur sesuai tujuan iklan (content.adType): awareness/reach → CPM, hook rate, hold rate, frekuensi; traffic → CTR dan CPC; leads/pesan/penjualan → biaya per hasil, didukung CTR. Bandingkan dengan periodAverage (rata-rata semua konten periode yang sama) dan benchmarks (patokan umum, bukan angka resmi Meta).
- Bila sufficientData=false, verdict "belum_cukup_data", tetapi tetap beri masukan creative.
- suggestedLabel mengikuti label tim: winning = jelas lebih baik dari rata-rata pada KPI tujuannya dengan data cukup; good = di atas rata-rata; average = sekitar rata-rata; poor = di bawah rata-rata.
- moments hanya untuk video yang benar-benar kamu tonton: detik (bilangan bulat, tidak melebihi durasi) dan catatan singkat, maksimal 8.
- Saran perbaikan konkret dan bisa langsung dikerjakan editor. Ide baru memakai konteks lokal Indonesia, dengan contoh kalimat hook.
- gaps berisi data yang tidak tersedia; jangan menyimpulkan dari data itu.
- Tulis dalam Bahasa Indonesia yang lugas. Rupiah seperti Rp12.345, persen seperti 0,98%.

Balas hanya dengan satu objek JSON valid, tanpa teks lain, dengan bentuk:
{"score": 1-10, "verdict": "pertahankan"|"perbaiki"|"ganti"|"belum_cukup_data", "suggestedLabel": "winning"|"good"|"average"|"poor", "summary": "2-3 kalimat", "hook": {"firstSeconds": "apa yang terlihat/terdengar di 3 detik pertama", "assessment": "penilaian dan alasannya", "score": 1-10}, "message": "kejelasan pesan dan penawaran", "visual": "komposisi, teks di layar, keterbacaan di HP, branding", "copy": "penilaian primary text, headline dan CTA", "metricsLink": "kaitan creative dengan angkanya", "moments": [{"second": 0, "note": "..."}], "improvements": [{"title": "...", "detail": "..."}], "ideas": [{"hook": "contoh kalimat hook", "concept": "konsep singkat"}]}
improvements maksimal 5, ideas maksimal 3.`;

const score = z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n))));
const lower = (values: readonly string[]) => z.string().transform((v) => v.trim().toLowerCase().replace(/\s+/g, "_")).pipe(z.enum(values as [string, ...string[]]));

const resultSchema = z.object({
  score,
  verdict: lower(CONTENT_VERDICTS),
  suggestedLabel: lower(CONTENT_LABELS).nullable().catch(null),
  summary: z.string().min(1),
  hook: z.object({ firstSeconds: z.string().default(""), assessment: z.string(), score: score.nullable().catch(null) }),
  message: z.string().default(""),
  visual: z.string().default(""),
  copy: z.string().default(""),
  metricsLink: z.string().default(""),
  moments: z.array(z.object({ second: z.coerce.number().int().nonnegative(), note: z.string() })).catch([]),
  improvements: z.array(z.object({ title: z.string(), detail: z.string() })).catch([]),
  ideas: z.array(z.object({ hook: z.string(), concept: z.string() })).catch([]),
});

export type ContentAnalysisResult = Omit<z.infer<typeof resultSchema>, "verdict" | "suggestedLabel"> & {
  verdict: (typeof CONTENT_VERDICTS)[number];
  suggestedLabel: (typeof CONTENT_LABELS)[number] | null;
};

/** Validates the model's JSON; timeline moments only for a video it watched, within its length. */
export function parseContentResult(text: string, input: Pick<ContentAnalysisInput, "media">): ContentAnalysisResult | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { videoSent, videoSeconds } = input.media;
  const r = parsed.data as ContentAnalysisResult;
  return {
    ...r,
    moments: videoSent ? r.moments.filter((m) => videoSeconds === null || m.second <= videoSeconds).sort((a, b) => a.second - b.second).slice(0, 8) : [],
    improvements: r.improvements.slice(0, 5),
    ideas: r.ideas.slice(0, 3),
  };
}

/** Adds the pulled creative to the input and returns the parts sent to the model. */
export function withMedia(input: ContentAnalysisInput, media: CreativeMedia, useCover = false) {
  const video = !useCover && media.videoUrl ? media.videoUrl : null;
  const images = video ? [] : useCover && media.cover ? [media.cover] : media.images;
  const next: ContentAnalysisInput = {
    ...input,
    copy: media.copy,
    media: { kind: media.kind, videoSeconds: media.videoSeconds, videoSent: !!video, imagesSent: images.length, coverOnly: media.kind === "video" && !video && images.length > 0 },
    gaps: [...input.gaps, ...media.gaps],
  };
  const parts: GeminiPart[] = [
    ...(video ? [{ file_data: { mime_type: "video/mp4", file_uri: video } }] : []),
    ...images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })),
  ];
  return { input: next, parts };
}

export function contentPrompt(input: ContentAnalysisInput) {
  const { source: _source, ...data } = input;
  return `Analisa konten iklan berikut.\n\n${JSON.stringify(data)}`;
}

export type ContentAnalysisOutcome =
  | { ok: true; result: ContentAnalysisResult; model: string; inputTokens: number; outputTokens: number; credits: number | null; input: ContentAnalysisInput }
  | { ok: false; error: string; model?: string; inputTokens?: number; outputTokens?: number; credits?: number | null; input: ContentAnalysisInput };

export async function runContentAnalysis(apiKey: string, base: ContentAnalysisInput, media: CreativeMedia): Promise<ContentAnalysisOutcome> {
  let credits = 0;
  const attempt = async (useCover: boolean) => {
    const { input, parts } = withMedia(base, media, useCover);
    const res = await generateGeminiJson({ apiKey, system: SYSTEM, parts: [...parts, { text: contentPrompt(input) }] });
    credits += res.credits ?? 0;
    return { input, res };
  };

  let { input, res } = await attempt(false);
  // The video file is fetched by Kie/Google from Meta's CDN; if that fails, judge the cover instead.
  if (!res.ok && input.media.videoSent && res.status !== 401 && res.status !== 402) {
    ({ input, res } = await attempt(true));
    input = { ...input, gaps: [...input.gaps, "Video gagal diproses Gemini, jadi yang dinilai cover video."] };
  }
  if (!res.ok) return { ok: false, error: res.error, credits: credits || null, input };

  let result = parseContentResult(res.text, input);
  let usage = res;
  if (!result) {
    // One retry: the JSON shape isn't enforced by Kie.
    const again = await attempt(input.media.coverOnly && !!media.videoUrl);
    if (again.res.ok) {
      result = parseContentResult(again.res.text, again.input);
      usage = again.res;
    }
  }
  const tokens = { model: usage.model, inputTokens: usage.promptTokens, outputTokens: usage.outputTokens, credits: credits || null };
  if (!result) {
    const cut = usage.finishReason === "MAX_TOKENS";
    return { ok: false, error: cut ? "Jawaban AI terpotong. Coba jalankan ulang." : "AI tidak mengembalikan hasil dalam format yang diharapkan. Coba jalankan ulang.", ...tokens, input };
  }
  return { ok: true, result, ...tokens, input };
}
