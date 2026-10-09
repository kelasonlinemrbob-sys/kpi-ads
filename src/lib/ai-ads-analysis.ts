import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AdPrevious, AnalysisEnrichment, CreativeImage } from "./ai-analysis-meta";
import { DEFAULT_MATRIX_BENCHMARKS, matrixBrief, matrixContext, type MatrixBenchmarks } from "./ad-matrices";
import { CREATIVE_FORMAT_LABEL, CREATIVE_LABEL, CREATIVE_STATUS_LABEL, creativeRates, sumCreatives } from "./creatives";
import type { CreativeRow } from "./creatives-data";
import { SUMMARY_PROVIDER } from "./ai-provider";
import { createKieClient, KIE_MODEL, kieErrorMessage } from "./kie-client";
import { generateGeminiJson, type GeminiPart } from "./kie-gemini";

/**
 * "Analisa AI" on the Creative page. The numbers (CTR, CPM, cost per result, …) are computed here,
 * like the rest of the page; Claude only reads them and writes the diagnosis and the actions.
 * That keeps it from miscounting or inventing figures.
 */

/** Ads beyond this (by spend) are summed into one "others" line to keep the prompt small. */
export const MAX_ANALYSED_ADS = 40;
/** Below this, a verdict on the ad isn't trustworthy yet. */
const MIN_IMPRESSIONS = 1000;
const MIN_CLICKS = 20;

/** General benchmarks for Indonesian Meta ads — not official Meta figures. Sent with the data so every verdict uses the same yardstick. */
export const AD_BENCHMARKS = {
  ctrPct: 0.5,
  hookRatePct: 20,
  holdRatePct: 10,
  dailyFrequency: 1.6,
} as const;

export type AnalysedAd = {
  ref: number;
  name: string;
  campaign: string | null;
  account: string;
  product: string | null;
  format: string;
  status: string;
  teamLabel: string | null;
  daysRunning: number | null;
  spend: number;
  spendSharePct: number | null;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  cpm: number | null;
  results: number;
  costPerResult: number | null;
  hookRatePct: number | null;
  holdRatePct: number | null;
  avgWatchSeconds: number | null;
  sufficientData: boolean;
  /** Same ad in the previous period (null = didn't run then); absent when it wasn't pulled. */
  previous?: AdPrevious | null;
  /** Average per day of the period (absent when Meta data wasn't pulled). */
  dailyFrequency?: number | null;
  dailyReach?: number | null;
  /** Landing page views in the period. */
  landingPageViews?: number | null;
  /** Where the ad lives, to pull more Meta data for it. Not sent to the model. */
  source?: { adAccountId: number; adId: string };
};

export type CreativeAnalysisInput = {
  period: { start: string; end: string; days: number; label: string };
  scope: string[];
  currency: "IDR";
  targetCostPerResult: number | null;
  businessContext: string | null;
  benchmarks: typeof AD_BENCHMARKS;
  totals: {
    ads: number;
    spend: number;
    impressions: number;
    clicks: number;
    results: number;
    ctrPct: number | null;
    cpm: number | null;
    cpc: number | null;
    costPerResult: number | null;
    hookRatePct: number | null;
    holdRatePct: number | null;
  };
  ads: AnalysedAd[];
  others: { ads: number; spend: number; results: number } | null;
  /** Previous period, daily trend, breakdowns and images (absent on analyses made without them). */
  enrichment?: AnalysisEnrichment;
  /** Deterministic matrix diagnosis per ad, computed with these benchmarks before the model runs. */
  matrix?: { benchmarks: MatrixBenchmarks; ads: ReturnType<typeof matrixBrief> };
};

const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function buildCreativeAnalysisInput(
  rows: CreativeRow[],
  opts: { period: CreativeAnalysisInput["period"]; scope?: string[]; targetCostPerResult?: number | null; businessContext?: string | null; today?: string },
): CreativeAnalysisInput {
  const sorted = [...rows].sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
  const picked = sorted.slice(0, MAX_ANALYSED_ADS);
  const rest = sorted.slice(MAX_ANALYSED_ADS);
  const total = sumCreatives(rows);
  const rates = creativeRates(total);
  const today = Date.parse(`${opts.today ?? opts.period.end}T12:00:00Z`);

  const ads = picked.map((r, i): AnalysedAd => {
    const video = r.format === "video";
    const own = creativeRates({
      impressions: r.impressions,
      spend: r.spend,
      clicks: r.clicks,
      leads: r.leads,
      videoImpressions: video ? r.impressions : 0,
      videoViews: video ? r.videoViews : 0,
      thruplays: video ? r.thruplays : 0,
    });
    return {
      ref: i + 1,
      name: r.adName,
      campaign: r.campaignName,
      account: r.accountName,
      product: r.product,
      format: CREATIVE_FORMAT_LABEL[r.format],
      status: CREATIVE_STATUS_LABEL[r.status],
      teamLabel: r.label ? CREATIVE_LABEL[r.label] : null,
      daysRunning: r.adCreatedAt ? Math.max(0, Math.floor((today - Date.parse(r.adCreatedAt)) / 86_400_000)) : null,
      spend: Math.round(r.spend),
      spendSharePct: round(total.spend > 0 ? (r.spend / total.spend) * 100 : null, 1),
      impressions: r.impressions,
      reach: r.reach,
      frequency: round(div(r.impressions, r.reach)),
      clicks: r.clicks,
      ctrPct: round(own.ctr),
      cpc: round(div(r.spend, r.clicks), 0),
      cpm: round(own.cpm, 0),
      results: r.leads,
      costPerResult: round(own.cpl, 0),
      hookRatePct: round(own.hook, 1),
      holdRatePct: round(own.hold, 1),
      avgWatchSeconds: video ? round(r.avgPlayTime, 1) : null,
      sufficientData: r.impressions >= MIN_IMPRESSIONS && r.clicks >= MIN_CLICKS,
      source: { adAccountId: r.adAccountId, adId: r.externalAdId },
    };
  });

  return {
    period: opts.period,
    scope: opts.scope ?? [],
    currency: "IDR",
    targetCostPerResult: opts.targetCostPerResult ?? null,
    businessContext: opts.businessContext?.trim() || null,
    benchmarks: AD_BENCHMARKS,
    totals: {
      ads: rows.length,
      spend: Math.round(total.spend),
      impressions: total.impressions,
      clicks: total.clicks,
      results: total.leads,
      ctrPct: round(rates.ctr),
      cpm: round(rates.cpm, 0),
      cpc: round(div(total.spend, total.clicks), 0),
      costPerResult: round(rates.cpl, 0),
      hookRatePct: round(rates.hook, 1),
      holdRatePct: round(rates.hold, 1),
    },
    ads,
    others: rest.length
      ? { ads: rest.length, spend: Math.round(rest.reduce((s, r) => s + r.spend, 0)), results: rest.reduce((s, r) => s + r.leads, 0) }
      : null,
  };
}

/* ------------------------------ Prompt & output ------------------------------ */

export const AD_VERDICTS = ["naikkan_budget", "pertahankan", "pantau", "siapkan_pengganti", "ganti", "belum_cukup_data"] as const;
export type AdVerdict = (typeof AD_VERDICTS)[number];

const SYSTEM_PROMPT = `Kamu adalah analis performa Meta Ads senior yang membantu tim advertiser di Indonesia. Kamu menerima data performa iklan (JSON) untuk satu periode dan memberi diagnosa yang jujur serta langkah yang bisa langsung dikerjakan.

Aturan:
- Pakai hanya angka yang ada di data. Jangan mengarang angka, tren, atau data yang tidak diberikan (misalnya kecepatan landing page, atau periode sebelumnya/breakdown bila tidak ada di data). Kalau sebuah kesimpulan butuh data yang tidak ada, sebutkan di dataNotes.
- Perubahan persen (change, costVsAveragePct) sudah dihitung: positif berarti naik. Jangan menghitung ulang.
- "results" adalah hasil iklan yang dicatat Meta (lead/klik WA/konversi sesuai objective). "costPerResult" adalah biaya per hasil.
- Bandingkan biaya per hasil dengan targetCostPerResult bila ada. Bila tidak ada, bandingkan dengan totals.costPerResult (rata-rata periode).
- Iklan dengan sufficientData=false diberi keputusan "belum_cukup_data" dan tidak dijadikan patokan terbaik atau terburuk.
- Cari masalah utama tiap iklan mengikuti urutan perjalanan audiens: penayangan (CPM, frekuensi) → creative (hook rate dan hold rate untuk video, CTR) → klik (CPC) → hasil (biaya per hasil). Masalah utama adalah tahap pertama yang lemah.
- benchmarks adalah patokan umum, bukan angka resmi Meta. Frekuensi di data adalah frekuensi seluruh periode; bagi dengan jumlah hari berjalan sebelum membandingkan dengan dailyFrequency. Jangan menilai iklan gagal hanya karena sedikit di bawah acuan.
- Pertimbangkan businessContext bila diisi (produk, margin, closing rate, musim).
- enrichment (bila ada) hanya mencakup iklan yang dianalisa; coverage.spendSharePct menunjukkan porsi spend-nya.
  - comparison dan ads[].previous membandingkan iklan yang sama dengan periode sebelumnya. Iklan yang previous=null belum berjalan saat itu. Isi trend dengan perbandingan ini dan pola harian.
  - daily: cari tanda kejenuhan (frekuensi harian naik, CTR turun, biaya per hasil naik) atau lonjakan. Bila partialLastDay=true, hari terakhir masih berjalan; jangan simpulkan dari angkanya.
  - breakdowns: sebut segmen paling efisien, paling boros, dan yang menghabiskan biaya tanpa hasil, di audience. Segmen dengan sufficientData=false tidak dijadikan patokan terbaik atau terburuk. Placement Audience Network sering menghasilkan klik tidak sengaja.
  - gaps: data yang gagal ditarik; jangan menarik kesimpulan dari data itu.
- matrix.ads berisi diagnosa matriks yang dihitung dari angka: posisi tiap iklan di matriks (Reach × Frekuensi, Frekuensi × CTR, CPM × CTR, Hook × Hold, CTR × LPV, dll.) dan masalah utamanya (kotak merah pertama menurut urutan penayangan → creative → klik → halaman → hasil). Jadikan dasar problem tiap iklan; boleh dipertajam dengan data lain, tapi jangan bertentangan. Bila mainProblem "Tidak ada kotak merah", jangan mengarang masalah besar.
- Frekuensi harian (dailyFrequency) dibandingkan dengan benchmarks.dailyFrequency; landingPageViews dipakai untuk LPV rate dan conversion rate.
- Gambar creative hanya dikirim untuk ref di enrichment.imageRefs, masing-masing diberi label nomor ref. Untuk iklan itu, isi visual: nilai daya tarik detik pertama, kejelasan penawaran, keterbacaan teks di layar HP, dan kaitkan dengan angkanya (CTR, hook rate). Jangan menilai visual iklan yang gambarnya tidak dikirim.
- Aksi diurutkan dari yang paling mendesak dan paling berdampak ke biaya, maksimal 5, masing-masing satu langkah konkret. Sebutkan nomor ref iklan yang terkait.
- Setiap iklan di data muncul tepat satu kali di daftar ads, memakai nomor ref-nya.
- Tulis dalam Bahasa Indonesia yang lugas untuk pemilik bisnis. Tulis rupiah seperti Rp12.345 dan persen seperti 0,98%.
`;

const text = (description: string) => ({ type: "string", description });

/** The answer's shape, written into the system prompt (Kie returns 503 for any request with `tools`). */
export const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "headline", "summary", "findings", "actions", "ads"],
  properties: {
    status: { type: "string", enum: ["sehat", "waspada", "kritis"], description: "Kondisi keseluruhan periode ini." },
    headline: text("Satu kalimat utama: hasil periode ini dan apakah sesuai target, dengan angka."),
    summary: text("2–4 kalimat ringkasan untuk pemilik bisnis."),
    findings: {
      type: "array",
      description: "Temuan penting, maksimal 5.",
      items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: text("Judul singkat."), detail: text("Penjelasan dengan angka.") } },
    },
    actions: {
      type: "array",
      description: "Langkah yang perlu dilakukan, urut dari paling mendesak, maksimal 5.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "refs"],
        properties: { title: text("Perintah singkat."), detail: text("Cara melakukannya dan alasannya."), refs: { type: "array", items: { type: "integer" }, description: "Nomor ref iklan terkait." } },
      },
    },
    ads: {
      type: "array",
      description: "Diagnosa per iklan, satu untuk setiap ref di data.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "verdict", "problem", "reason", "suggestion"],
        properties: {
          ref: { type: "integer" },
          verdict: { type: "string", enum: [...AD_VERDICTS] },
          problem: text("Masalah utama dalam beberapa kata, atau 'Tidak ada masalah besar'."),
          reason: text("Alasan dengan angka pendukung."),
          suggestion: text("Satu saran konkret."),
          visual: text("Penilaian visual creative; hanya untuk ref yang gambarnya dikirim."),
        },
      },
    },
    dataNotes: text("Keterbatasan data yang memengaruhi kesimpulan. Kosongkan bila tidak ada."),
    trend: text("Perbandingan dengan periode sebelumnya dan pola harian, 2–3 kalimat dengan angka. Kosongkan bila datanya tidak ada."),
    audience: {
      type: "array",
      description: "Temuan dari breakdown placement, umur dan gender, maksimal 6. Kosongkan bila breakdown tidak ada.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "segment", "assessment", "detail"],
        properties: {
          dimension: { type: "string", enum: ["placement", "umur", "gender"] },
          segment: text("Nama segmen persis seperti di data."),
          assessment: { type: "string", enum: ["efisien", "boros", "tanpa_hasil", "netral"] },
          detail: text("Penjelasan singkat dengan angka dan saran."),
        },
      },
    },
  },
};

const SYSTEM = `${SYSTEM_PROMPT}
Balas hanya dengan satu objek JSON valid yang sesuai skema berikut. Jangan menulis teks lain, jangan memakai code fence.
${JSON.stringify(REPORT_SCHEMA)}`;

const resultSchema = z.object({
  status: z.enum(["sehat", "waspada", "kritis"]),
  headline: z.string().min(1),
  summary: z.string(),
  findings: z.array(z.object({ title: z.string(), detail: z.string() })),
  actions: z.array(z.object({ title: z.string(), detail: z.string(), refs: z.array(z.number().int()).default([]) })),
  ads: z.array(z.object({ ref: z.number().int(), verdict: z.enum(AD_VERDICTS), problem: z.string(), reason: z.string(), suggestion: z.string(), visual: z.string().optional() })),
  dataNotes: z.string().optional(),
  trend: z.string().optional(),
  audience: z
    .array(z.object({ dimension: z.enum(["placement", "umur", "gender"]), segment: z.string(), assessment: z.enum(["efisien", "boros", "tanpa_hasil", "netral"]), detail: z.string() }))
    .default([]),
});

export type CreativeAnalysisResult = z.infer<typeof resultSchema>;

/** Validates the model's tool input against the schema and the refs that were actually sent. */
export function parseAnalysisResult(raw: unknown, input: Pick<CreativeAnalysisInput, "ads" | "enrichment">): CreativeAnalysisResult | null {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const refs = new Set(input.ads.map((a) => a.ref));
  const imageRefs = new Set(input.enrichment?.imageRefs ?? []);
  const seen = new Set<number>();
  return {
    ...parsed.data,
    findings: parsed.data.findings.slice(0, 5),
    actions: parsed.data.actions.slice(0, 5).map((a) => ({ ...a, refs: a.refs.filter((r) => refs.has(r)) })),
    ads: parsed.data.ads
      .filter((a) => refs.has(a.ref) && !seen.has(a.ref) && seen.add(a.ref))
      // A visual verdict on an ad whose image wasn't sent would be made up.
      .map(({ visual, ...a }) => (imageRefs.has(a.ref) && visual?.trim() ? { ...a, visual: visual.trim() } : a))
      .sort((a, b) => a.ref - b.ref),
    dataNotes: parsed.data.dataNotes?.trim() || undefined,
    trend: parsed.data.trend?.trim() || undefined,
    audience: input.enrichment ? parsed.data.audience.slice(0, 6) : [],
  };
}

/** The JSON object in the answer, also when the model wrapped it in a sentence or code fence. */
function jsonFromText(body: string): unknown {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type AnalysisRun =
  | { ok: true; result: CreativeAnalysisResult; model: string; inputTokens: number; outputTokens: number; credits?: number | null }
  | { ok: false; error: string; model?: string; inputTokens?: number; outputTokens?: number; credits?: number | null };

const CUT_OFF = "Jawaban AI terpotong karena terlalu panjang. Persempit filter (misalnya per produk) lalu coba lagi.";
const BAD_FORMAT = "AI tidak mengembalikan hasil dalam format yang diharapkan. Coba jalankan ulang.";

/** Reads the model's answer: refusal first, then the JSON, then why it couldn't be read. */
export function readAnalysisMessage(message: Anthropic.Message, input: Pick<CreativeAnalysisInput, "ads" | "enrichment">): AnalysisRun {
  const usage = { model: message.model, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
  if (message.stop_reason === "refusal") return { ok: false, error: "Model menolak menganalisa data ini. Coba ubah filter atau konteks bisnis.", ...usage };
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const result = parseAnalysisResult(jsonFromText(text), input);
  if (result) return { ok: true, result, ...usage };
  return { ok: false, error: message.stop_reason === "max_tokens" ? CUT_OFF : BAD_FORMAT, ...usage };
}

/** The JSON the model reads: everything except internal ids. */
export function promptPayload(input: CreativeAnalysisInput) {
  return JSON.stringify({ ...input, ads: input.ads.map(({ source: _source, ...ad }) => ad) });
}

function userContent(input: CreativeAnalysisInput, images: CreativeImage[]): string | Anthropic.ContentBlockParam[] {
  const data = `Analisa data iklan berikut.\n\n${promptPayload(input)}`;
  if (!images.length) return data;
  const blocks: Anthropic.ContentBlockParam[] = [{ type: "text", text: data }];
  for (const image of images) {
    blocks.push({ type: "text", text: `Gambar creative iklan ref ${image.ref}:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  }
  return blocks;
}

export type AnalysisOutcome = AnalysisRun & {
  /** The input as finally analysed: when Kie refused the images, they are dropped and noted. */
  input: CreativeAnalysisInput;
};

export async function runCreativeAnalysis(
  apiKey: string,
  input: CreativeAnalysisInput,
  images: CreativeImage[] = [],
  provider: "gemini" | "claude" = SUMMARY_PROVIDER,
): Promise<AnalysisOutcome> {
  return provider === "gemini" ? runWithGemini(apiKey, input, images) : runWithClaude(apiKey, input, images);
}

/** Gemini on Kie sees the images; each one is labelled with its ad's ref. One retry when the JSON doesn't validate. */
async function runWithGemini(apiKey: string, input: CreativeAnalysisInput, images: CreativeImage[]): Promise<AnalysisOutcome> {
  const parts: GeminiPart[] = [
    ...images.flatMap((image): GeminiPart[] => [{ text: `Gambar creative iklan ref ${image.ref}:` }, { inline_data: { mime_type: image.mediaType, data: image.data } }]),
    { text: `Analisa data iklan berikut.\n\n${promptPayload(input)}` },
  ];
  let credits = 0;
  let last: AnalysisRun = { ok: false, error: BAD_FORMAT };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateGeminiJson({ apiKey, system: SYSTEM, parts, maxOutputTokens: 32000 });
    credits += res.credits ?? 0;
    if (!res.ok) return { ok: false, error: res.error, credits: credits || null, input };
    const usage = { model: res.model, inputTokens: res.promptTokens, outputTokens: res.outputTokens, credits: credits || null };
    const result = parseAnalysisResult(jsonFromText(res.text), input);
    if (result) return { ok: true, result, ...usage, input };
    last = { ok: false, error: res.finishReason === "MAX_TOKENS" ? CUT_OFF : BAD_FORMAT, ...usage };
  }
  return { ...last, credits: credits || null, input };
}

async function runWithClaude(apiKey: string, input: CreativeAnalysisInput, images: CreativeImage[]): Promise<AnalysisOutcome> {
  const call = (content: string | Anthropic.ContentBlockParam[]) =>
    // Streaming: Kie streams by default (its non-streaming answers come back without content), and a
    // long answer can't hit an HTTP timeout midway. No `tools` / `output_config`: Kie answers tool requests
    // with 503 and drops output_config, so the JSON shape is asked for in the system prompt.
    createKieClient(apiKey)
      .messages.stream({ model: KIE_MODEL, max_tokens: 16000, system: SYSTEM, messages: [{ role: "user", content }] })
      .finalMessage();
  try {
    return { ...readAnalysisMessage(await call(userContent(input, images)), input), input };
  } catch (error) {
    // Kie doesn't document image input. A rejected request isn't billed, so retry once without the images.
    const rejected = error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError;
    if (!images.length || !rejected) return { ok: false, error: kieErrorMessage(error), input };
    const withoutImages: CreativeAnalysisInput = input.enrichment
      ? { ...input, enrichment: { ...input.enrichment, imageRefs: [], gaps: [...input.enrichment.gaps, "Kie.ai menolak gambar creative, jadi analisa dijalankan tanpa gambar."] } }
      : input;
    try {
      return { ...readAnalysisMessage(await call(userContent(withoutImages, [])), withoutImages), input: withoutImages };
    } catch (retryError) {
      return { ok: false, error: kieErrorMessage(retryError), input: withoutImages };
    }
  }
}

/** Adds the deterministic matrix diagnosis to the input (after the Meta data, which brings daily frequency and LPV). */
export function withMatrixBrief(input: CreativeAnalysisInput, benchmarks: MatrixBenchmarks = DEFAULT_MATRIX_BENCHMARKS): CreativeAnalysisInput {
  const ctx = matrixContext(input.ads, benchmarks, { targetCostPerResult: input.targetCostPerResult, averageCostPerResult: input.totals.costPerResult });
  return { ...input, matrix: { benchmarks, ads: matrixBrief(input.ads, ctx) } };
}
