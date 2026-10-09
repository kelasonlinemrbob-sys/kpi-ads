/**
 * Diagnostic matrices for the ads in an analysis: each matrix crosses two metrics, splits them at a
 * benchmark line, and puts every ad in one of four quadrants (healthy / watch / weak / problem).
 * Pure and deterministic, shared by the server (to brief the AI) and the page (to redraw when the
 * benchmarks are edited). No AI involved.
 */

export type MatrixBenchmarks = {
  /** Daily frequency line (impressions ÷ reach per day). */
  dailyFrequency: number;
  /** Looser frequency line for retargeting campaigns, which repeat to a small warm audience on purpose. */
  retargetFrequency: number;
  ctrPct: number;
  cpm: number;
  hookRatePct: number;
  holdRatePct: number;
  /** Landing page views ÷ link clicks. */
  lpvRatePct: number;
  /** Results ÷ landing page views. */
  conversionRatePct: number;
  /** Cost per result above this multiple of the target counts as expensive. */
  costMultiplier: number;
};

export const DEFAULT_MATRIX_BENCHMARKS: MatrixBenchmarks = {
  dailyFrequency: 1.6,
  retargetFrequency: 2.5,
  ctrPct: 0.5,
  cpm: 30000,
  hookRatePct: 20,
  holdRatePct: 10,
  lpvRatePct: 60,
  conversionRatePct: 5,
  costMultiplier: 1.2,
};

/** What an ad needs for the matrices; a subset of AnalysedAd. */
export type MatrixAd = {
  ref: number;
  name: string;
  campaign: string | null;
  format: string;
  impressions: number;
  clicks: number;
  results: number;
  spend: number;
  ctrPct: number | null;
  cpm: number | null;
  costPerResult: number | null;
  hookRatePct: number | null;
  holdRatePct: number | null;
  sufficientData: boolean;
  dailyFrequency?: number | null;
  dailyReach?: number | null;
  landingPageViews?: number | null;
};

export type Tone = "healthy" | "watch" | "weak" | "problem";
export type Stage = "delivery" | "creative" | "click" | "page" | "result";
export const STAGE_LABEL: Record<Stage, string> = { delivery: "Penayangan", creative: "Creative", click: "Klik", page: "Halaman", result: "Hasil" };
/** Order of the audience journey: the main problem is the first red quadrant along it. */
const STAGE_ORDER: Stage[] = ["delivery", "creative", "click", "page", "result"];

type Quadrant = { tone: Tone; title: string; detail: string };
/** Quadrants named by position: [top-left, top-right, bottom-left, bottom-right]. */
type Quadrants = { tl: Quadrant; tr: Quadrant; bl: Quadrant; br: Quadrant };
export type QuadrantKey = keyof Quadrants;

export type MatrixDef = {
  id: string;
  title: string;
  question: string;
  stage: Stage;
  x: { label: string; unit: "pct" | "rp" | "x" | "num" };
  y: { label: string; unit: "pct" | "rp" | "x" | "num" };
  quadrants: Quadrants;
  /** Value of each axis for an ad, or null when the ad can't be placed. */
  value: (ad: MatrixAd, ctx: MatrixContext) => { x: number; y: number } | null;
  line: (ctx: MatrixContext) => { x: number; y: number; xNote: string; yNote: string };
  note?: string;
  /** Video-only matrices skip other formats. */
  videoOnly?: boolean;
};

export type MatrixContext = {
  b: MatrixBenchmarks;
  /** Cost per result the matrices compare with: the target, else the period average. */
  targetCost: number | null;
  targetIsAverage: boolean;
  /** Median daily reach of the placed ads: "large" and "small" are relative to the account. */
  medianDailyReach: number | null;
};

const isRetarget = (ad: MatrixAd) => /retarget|remarket|\brt\b|warm|engager/i.test(`${ad.campaign ?? ""} ${ad.name}`);
const freqOf = (ad: MatrixAd, b: MatrixBenchmarks) => (ad.dailyFrequency == null ? null : isRetarget(ad) ? (ad.dailyFrequency * b.dailyFrequency) / b.retargetFrequency : ad.dailyFrequency);
/** Cost per result relative to the target; an ad that spent without any result counts as the most expensive. */
const costRatio = (ad: MatrixAd, ctx: MatrixContext) =>
  ctx.targetCost ? (ad.results > 0 && ad.costPerResult !== null ? ad.costPerResult / ctx.targetCost : ad.spend > 0 ? ctx.b.costMultiplier * 2 : null) : null;
const lpvRate = (ad: MatrixAd) => (ad.landingPageViews != null && ad.clicks > 0 ? Math.min(100, (ad.landingPageViews / ad.clicks) * 100) : null);
const convRate = (ad: MatrixAd) => (ad.landingPageViews ? (ad.results / ad.landingPageViews) * 100 : null);
const both = (x: number | null | undefined, y: number | null | undefined) => (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y });
const rp = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
const pct = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}%`;
const xs = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}×`;
const RECHECK: Quadrant = { tone: "weak", title: "Evaluasi ulang creative & audience", detail: "Dua-duanya lemah. Uji sudut pandang creative baru atau audience yang lebih relevan." };

export const MATRICES: MatrixDef[] = [
  {
    id: "reach-frequency",
    title: "Reach × Frekuensi",
    question: "Audience masih luas atau mulai jenuh?",
    stage: "delivery",
    x: { label: "Frekuensi harian", unit: "x" },
    y: { label: "Reach harian", unit: "num" },
    quadrants: {
      tl: { tone: "healthy", title: "Sehat: jangkauan luas, belum jenuh", detail: "Iklan masih menjangkau orang baru. Pertahankan." },
      tr: { tone: "watch", title: "Delivery besar, waspada jenuh", detail: "Iklan menjangkau banyak orang dan sering diulang. Pantau CTR: kalau mulai turun, siapkan creative baru." },
      bl: { tone: "weak", title: "Delivery lambat", detail: "Iklan belum banyak tersampaikan. Cek budget, strategi bid, atau apakah iklan masih dalam review." },
      br: { tone: "problem", title: "Audience kecilan, cepat jenuh", detail: "Audience terlalu sempit sehingga orang yang sama melihat iklan berulang kali. Perluas audience." },
    },
    value: (ad, ctx) => both(freqOf(ad, ctx.b), ad.dailyReach),
    line: (ctx) => ({ x: ctx.b.dailyFrequency, y: ctx.medianDailyReach ?? 0, xNote: `garis ${xs(ctx.b.dailyFrequency)}, standar`, yNote: ctx.medianDailyReach ? `${new Intl.NumberFormat("id-ID").format(Math.round(ctx.medianDailyReach))}, nilai tengah akun` : "nilai tengah akun" }),
    note: "Rata-rata harian. Campaign retargeting memakai batas frekuensi yang lebih longgar, jadi posisinya sudah disesuaikan.",
  },
  {
    id: "frequency-ctr",
    title: "Frekuensi × CTR",
    question: "Sudah waktunya ganti creative?",
    stage: "delivery",
    x: { label: "Frekuensi harian", unit: "x" },
    y: { label: "CTR", unit: "pct" },
    quadrants: {
      tl: { tone: "healthy", title: "Sehat: masih segar dan menarik", detail: "Belum sering dilihat dan masih diklik. Pertahankan." },
      tr: { tone: "watch", title: "Masih menarik walau sering dilihat", detail: "Frekuensi tinggi tapi CTR tetap bagus. Aman untuk sekarang, pantau tren CTR setiap minggu." },
      bl: { tone: "weak", title: "Kurang menarik sejak awal", detail: "Belum sering dilihat tapi sudah jarang diklik. Masalahnya di creative, bukan kejenuhan." },
      br: { tone: "problem", title: "Jenuh: sering dilihat, mulai diabaikan", detail: "Orang sudah terlalu sering melihat iklan ini. Ganti creative atau perluas audience." },
    },
    value: (ad, ctx) => both(freqOf(ad, ctx.b), ad.ctrPct),
    line: (ctx) => ({ x: ctx.b.dailyFrequency, y: ctx.b.ctrPct, xNote: `garis ${xs(ctx.b.dailyFrequency)}, standar`, yNote: `${pct(ctx.b.ctrPct)}, standar` }),
    note: "Campaign retargeting memakai batas frekuensi yang lebih longgar, jadi posisinya sudah disesuaikan.",
  },
  {
    id: "cpm-cost",
    title: "CPM × Cost per Result",
    question: "Tayangan murah, tapi apakah hasilnya ikut murah?",
    stage: "result",
    x: { label: "CPM", unit: "rp" },
    y: { label: "Cost per result ÷ target", unit: "x" },
    quadrants: {
      tl: { tone: "problem", title: "CPM wajar, tapi hasil mahal", detail: "Biaya tayang tidak masalah, jadi penyebab mahalnya ada di CTR atau klik ke hasil. Komponen yang paling lemah ditunjukkan di diagnosa per iklan." },
      tr: { tone: "weak", title: "CPM mahal dan hasil juga mahal", detail: "Lelang mahal dan hasil juga mahal. Evaluasi audience dan relevansi iklan." },
      bl: { tone: "healthy", title: "Sehat: CPM wajar dan hasil efisien", detail: "Kandidat untuk dinaikkan budgetnya secara bertahap." },
      br: { tone: "watch", title: "CPM mahal, tapi hasil efisien", detail: "Audience-nya diperebutkan, tapi berkualitas. Pertahankan." },
    },
    value: (ad, ctx) => both(ad.cpm, costRatio(ad, ctx)),
    line: (ctx) => ({ x: ctx.b.cpm, y: ctx.b.costMultiplier, xNote: `garis ${rp(ctx.b.cpm)}, standar`, yNote: `${xs(ctx.b.costMultiplier)} ${ctx.targetIsAverage ? "rata-rata" : "target"}` }),
    note: "Sumbu Y membandingkan biaya per hasil dengan target (atau rata-rata periode bila target kosong). 1× berarti tepat di target.",
  },
  {
    id: "cpm-ctr",
    title: "CPM × CTR",
    question: "Mahal karena lelang, atau karena iklan kurang relevan?",
    stage: "creative",
    x: { label: "CTR", unit: "pct" },
    y: { label: "CPM", unit: "rp" },
    quadrants: {
      tl: { tone: "problem", title: "Kurang relevan, jadi mahal", detail: "CTR rendah membuat Meta menilai iklan kurang relevan, sehingga biaya tayang naik. Perbaiki hook dan pesan." },
      tr: { tone: "watch", title: "Lelang ramai, creative kuat", detail: "Iklan direspons baik, tapi biaya tayang sedang mahal (musim ramai atau audience diperebutkan). Jangan buru-buru ganti creative." },
      bl: { tone: "weak", title: "CPM wajar, tapi tidak menarik", detail: "Biaya tayang murah tapi jarang diklik. Uji creative baru." },
      br: { tone: "healthy", title: "Sehat: CPM wajar dan menarik", detail: "Biaya tayang efisien dan iklan diklik. Kandidat untuk dinaikkan budgetnya." },
    },
    value: (ad) => both(ad.ctrPct, ad.cpm),
    line: (ctx) => ({ x: ctx.b.ctrPct, y: ctx.b.cpm, xNote: `garis ${pct(ctx.b.ctrPct)}, standar`, yNote: `${rp(ctx.b.cpm)}, standar` }),
  },
  {
    id: "hook-hold",
    title: "Hook Rate × Hold Rate",
    question: "Video kuat di pembuka, di isi, atau keduanya?",
    stage: "creative",
    videoOnly: true,
    x: { label: "Hold rate", unit: "pct" },
    y: { label: "Hook rate", unit: "pct" },
    quadrants: {
      tl: { tone: "problem", title: "Intro menarik, isi bikin orang skip", detail: "Pembuka berhasil menghentikan scroll, tapi isinya tidak menahan penonton. Padatkan isi dan percepat ke inti pesan." },
      tr: { tone: "healthy", title: "Sehat: video kuat dari awal sampai akhir", detail: "Pembuka menghentikan scroll dan isinya ditonton. Jadikan acuan untuk video berikutnya." },
      bl: { tone: "weak", title: "Kurang menarik dari detik pertama", detail: "Ganti 3 detik pertama: tampilkan masalah atau hasil di awal." },
      br: { tone: "watch", title: "Niche: sedikit yang nonton, tapi loyal", detail: "Yang berhenti menonton sampai habis. Perbaiki pembuka agar lebih banyak yang berhenti." },
    },
    value: (ad) => both(ad.holdRatePct, ad.hookRatePct),
    line: (ctx) => ({ x: ctx.b.holdRatePct, y: ctx.b.hookRatePct, xNote: `garis ${pct(ctx.b.holdRatePct)}, standar`, yNote: `${pct(ctx.b.hookRatePct)}, standar` }),
  },
  {
    id: "hook-ctr",
    title: "Hook Rate × CTR",
    question: "Videonya ditonton, tapi apakah ajakannya berhasil?",
    stage: "creative",
    videoOnly: true,
    x: { label: "CTR", unit: "pct" },
    y: { label: "Hook rate", unit: "pct" },
    quadrants: {
      tl: { tone: "problem", title: "Ditonton, tapi tidak diklik", detail: "Penonton tertarik tapi tidak diarahkan untuk klik. Perjelas penawaran dan ajakan di video serta copy." },
      tr: { tone: "healthy", title: "Sehat: ditonton dan diklik", detail: "Pembuka kuat dan ajakannya berhasil." },
      bl: RECHECK,
      br: { tone: "watch", title: "Sedikit yang berhenti, tapi yang berhenti serius", detail: "Ajakan bekerja. Perbaiki pembuka agar lebih banyak orang berhenti menonton." },
    },
    value: (ad) => both(ad.ctrPct, ad.hookRatePct),
    line: (ctx) => ({ x: ctx.b.ctrPct, y: ctx.b.hookRatePct, xNote: `garis ${pct(ctx.b.ctrPct)}, standar`, yNote: `${pct(ctx.b.hookRatePct)}, standar` }),
  },
  {
    id: "ctr-lpv",
    title: "CTR × LPV Rate",
    question: "Klik benar-benar sampai ke halaman?",
    stage: "click",
    x: { label: "CTR", unit: "pct" },
    y: { label: "LPV rate", unit: "pct" },
    quadrants: {
      tl: { tone: "watch", title: "Klik sedikit, tapi kualitas klik bagus", detail: "Yang klik benar-benar sampai halaman. Tingkatkan daya tarik creative agar klik bertambah." },
      tr: { tone: "healthy", title: "Sehat: creative & landing page selaras", detail: "Iklan diklik dan halamannya termuat dengan baik." },
      bl: RECHECK,
      br: { tone: "problem", title: "Banyak klik, sedikit yang sampai halaman", detail: "Cek kecepatan halaman di HP, pemasangan pixel, dan placement Audience Network (sering klik tidak sengaja)." },
    },
    value: (ad) => both(ad.ctrPct, lpvRate(ad)),
    line: (ctx) => ({ x: ctx.b.ctrPct, y: ctx.b.lpvRatePct, xNote: `garis ${pct(ctx.b.ctrPct)}, standar`, yNote: `${pct(ctx.b.lpvRatePct)}, standar` }),
    note: "LPV rate = landing page view ÷ klik link. Iklan tanpa data landing page view (misalnya lead form instan) tidak dimasukkan.",
  },
  {
    id: "ctr-conversion",
    title: "CTR × Conversion Rate",
    question: "Setelah sampai di halaman, orang lanjut bertindak?",
    stage: "page",
    x: { label: "CTR", unit: "pct" },
    y: { label: "Conversion rate", unit: "pct" },
    quadrants: {
      tl: { tone: "watch", title: "Audience niche, yang klik hampir semua serius", detail: "Halaman meyakinkan. Perluas jangkauan creative agar lebih banyak yang klik." },
      tr: { tone: "healthy", title: "Sehat: funnel ke WA/form lancar", detail: "Iklan menarik dan halaman meyakinkan orang untuk bertindak." },
      bl: RECHECK,
      br: { tone: "problem", title: "Klik banyak, ragu lanjut", detail: "Orang tertarik tapi halaman tidak meyakinkan. Perjelas penawaran, bukti sosial, dan tombol aksi di halaman." },
    },
    value: (ad) => both(ad.ctrPct, convRate(ad)),
    line: (ctx) => ({ x: ctx.b.ctrPct, y: ctx.b.conversionRatePct, xNote: `garis ${pct(ctx.b.ctrPct)}, standar`, yNote: `${pct(ctx.b.conversionRatePct)}, standar` }),
    note: "Conversion rate = hasil ÷ landing page view.",
  },
  {
    id: "ctr-cost",
    title: "CTR × Cost per Result",
    question: "Masalahnya di iklan, atau di proses konversi?",
    stage: "result",
    x: { label: "CTR", unit: "pct" },
    y: { label: "Cost per result ÷ target", unit: "x" },
    quadrants: {
      tl: RECHECK,
      tr: { tone: "problem", title: "Banyak klik, konversi bocor", detail: "Iklan menarik, tapi proses setelah klik membuat orang batal. Cek friksi form/halaman, atau kecepatan respons admin WA." },
      bl: { tone: "watch", title: "Audience niche: sedikit tapi presisi", detail: "Jarang diklik, tapi yang klik menghasilkan dengan murah." },
      br: { tone: "healthy", title: "Sehat: banyak klik, hasil murah", detail: "Kandidat untuk dinaikkan budgetnya secara bertahap." },
    },
    value: (ad, ctx) => both(ad.ctrPct, costRatio(ad, ctx)),
    line: (ctx) => ({ x: ctx.b.ctrPct, y: ctx.b.costMultiplier, xNote: `garis ${pct(ctx.b.ctrPct)}, standar`, yNote: `${xs(ctx.b.costMultiplier)} ${ctx.targetIsAverage ? "rata-rata" : "target"}` }),
    note: "Sumbu Y membandingkan biaya per hasil dengan target (atau rata-rata periode bila target kosong). 1× berarti tepat di target.",
  },
];

const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function matrixContext(ads: MatrixAd[], b: MatrixBenchmarks, target: { targetCostPerResult: number | null; averageCostPerResult: number | null }): MatrixContext {
  const reaches = ads.filter((a) => a.sufficientData && a.dailyReach != null).map((a) => a.dailyReach!);
  return {
    b,
    targetCost: target.targetCostPerResult ?? target.averageCostPerResult,
    targetIsAverage: target.targetCostPerResult == null,
    medianDailyReach: median(reaches),
  };
}

export type Placement = { ref: number; x: number; y: number; quadrant: QuadrantKey };
export type MatrixResult = { def: MatrixDef; line: ReturnType<MatrixDef["line"]>; placements: Placement[]; skipped: number };

/** Where every ad with enough data falls. On the line counts as the better side (at or above the benchmark). */
export function placeAds(def: MatrixDef, ads: MatrixAd[], ctx: MatrixContext): MatrixResult {
  const line = def.line(ctx);
  const placements: Placement[] = [];
  let skipped = 0;
  for (const ad of ads) {
    if (!ad.sufficientData || (def.videoOnly && ad.format !== "Video")) continue;
    const v = def.value(ad, ctx);
    if (!v || (def.id === "reach-frequency" && !ctx.medianDailyReach)) {
      skipped++;
      continue;
    }
    const top = v.y >= line.y;
    const right = v.x >= line.x;
    placements.push({ ref: ad.ref, ...v, quadrant: `${top ? "t" : "b"}${right ? "r" : "l"}` as QuadrantKey });
  }
  return { def, line, placements, skipped };
}

export function buildMatrices(ads: MatrixAd[], ctx: MatrixContext) {
  return MATRICES.map((def) => placeAds(def, ads, ctx)).filter((m) => m.placements.length > 0 || m.skipped > 0);
}

export type AdDiagnosis =
  | { kind: "insufficient" }
  | { kind: "ok" }
  | { kind: "problem"; main: { matrix: string; stage: Stage; title: string; detail: string }; also: string[] };

/** The main problem is the first red quadrant along the audience journey; the rest are listed to check too. */
export function diagnoseAd(ad: MatrixAd, results: MatrixResult[]): AdDiagnosis {
  if (!ad.sufficientData) return { kind: "insufficient" };
  const red = results
    .flatMap((r) => {
      const p = r.placements.find((pl) => pl.ref === ad.ref);
      const q = p ? r.def.quadrants[p.quadrant] : null;
      return q?.tone === "problem" ? [{ matrix: r.def.title, stage: r.def.stage, title: q.title, detail: q.detail }] : [];
    })
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  if (!red.length) return { kind: "ok" };
  return { kind: "problem", main: red[0]!, also: [...new Set(red.slice(1).map((r) => r.title))] };
}

/** Compact summary for the model: the deterministic diagnosis of each ad. */
export function matrixBrief(ads: MatrixAd[], ctx: MatrixContext) {
  const results = buildMatrices(ads, ctx);
  return ads.map((ad) => {
    const d = diagnoseAd(ad, results);
    const quadrants = results.flatMap((r) => {
      const p = r.placements.find((pl) => pl.ref === ad.ref);
      return p ? [`${r.def.title}: ${r.def.quadrants[p.quadrant].title}`] : [];
    });
    return {
      ref: ad.ref,
      mainProblem: d.kind === "problem" ? `${d.main.title} (${STAGE_LABEL[d.main.stage]})` : d.kind === "ok" ? "Tidak ada kotak merah" : "Data belum cukup",
      alsoCheck: d.kind === "problem" ? d.also : [],
      quadrants,
    };
  });
}
