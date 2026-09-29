/**
 * Performance appraisal for senior advertisers, as defined in HRGA document SG/ADV-SR/HRGA/2026
 * ("Rancangan Skema Sistem Penilaian Kinerja — Advertiser Senior"). Shared by the server and the form.
 *
 * Part 1 (skill & responsibility allowance): every indicator is scored 1–5. An aspect's score is the
 * average of its indicators; the total is the weighted average on the same 1–5 scale.
 * Part 2 (KPI performance): four KPIs of 25% each, scored in percent (max 100%) and summed.
 */

export const APPRAISAL_DOCUMENT = {
  company: "Mr. Bob Kampung Inggris",
  department: "Human Resources & General Affairs Department",
  title: "Rancangan Skema Sistem Penilaian Kinerja",
  number: "SG/ADV-SR/HRGA/2026",
  position: "Advertiser Senior",
  division: "Sales and Marketing / Advertising",
  effective: "Ditentukan oleh Manajemen",
  author: "HRGA and Operation Service Manager",
} as const;

export type SkillAspect = { id: string; title: string; weight: number; indicators: { id: string; text: string }[] };

const aspect = (id: string, title: string, weight: number, indicators: string[]): SkillAspect => ({
  id,
  title,
  weight,
  indicators: indicators.map((text, i) => ({ id: `${id}.${i + 1}`, text })),
});

export const SKILL_ASPECTS: SkillAspect[] = [
  aspect("platform", "Penguasaan Platform Iklan Tingkat Lanjut", 20, [
    "Mampu membuat dan mengelola campaign Meta Ads, Google Ads, dan/atau TikTok Ads secara mandiri.",
    "Mampu menentukan struktur campaign, objective, audiens, placement, dan alokasi anggaran secara tepat.",
    "Mampu menerapkan strategi targeting, retargeting, lookalike audience, serta segmentasi funnel.",
    "Mampu memilih dan mengoptimalkan bidding strategy sesuai target CPA, ROAS, atau volume konversi.",
    "Mampu menangani masalah teknis, seperti pixel, conversion tracking, domain, katalog, akun iklan, dan penolakan iklan.",
  ]),
  aspect("analysis", "Kemampuan Analisis Data & Optimasi", 20, [
    "Mampu membaca metrik utama seperti CPM, CTR, CPC, CPL, CPA, conversion rate, dan ROAS.",
    "Mampu menemukan penyebab penurunan atau peningkatan performa iklan berdasarkan data.",
    "Mampu membuat laporan performa campaign secara rutin, akurat, dan mudah dipahami.",
    "Mampu melakukan optimasi berdasarkan data, seperti mengatur budget, audiens, placement, bidding, dan materi iklan.",
    "Mampu menghasilkan peningkatan performa yang terukur, seperti menurunkan CPA atau meningkatkan ROAS dan jumlah konversi.",
  ]),
  aspect("multi_account", "Pengelolaan Multi-Akun / Multi-Brand", 15, [
    "Mampu mengelola beberapa akun iklan atau brand secara bersamaan sesuai prioritas.",
    "Mampu menjaga kualitas monitoring dan optimasi pada setiap akun yang menjadi tanggung jawabnya.",
    "Mampu membedakan strategi, target audiens, komunikasi, dan KPI untuk masing-masing brand.",
    "Mampu mengatur jadwal kerja, anggaran, laporan, dan dokumentasi setiap akun secara rapi.",
    "Mampu menjaga keamanan akses, aset digital, metode pembayaran, serta kerahasiaan data setiap brand.",
  ]),
  aspect("problem_solving", "Problem Solving & Pengambilan Keputusan", 15, [
    "Mampu mengidentifikasi akar masalah campaign berdasarkan data, bukan sekadar asumsi.",
    "Mampu menentukan prioritas masalah berdasarkan tingkat urgensi dan dampaknya terhadap bisnis.",
    "Mampu menyusun beberapa alternatif solusi beserta risiko dan potensi hasilnya.",
    "Mampu mengambil keputusan optimasi secara cepat tanpa mengabaikan data dan batas anggaran.",
    "Mampu mengevaluasi hasil keputusan serta membuat tindakan lanjutan jika solusi belum efektif.",
  ]),
  aspect("mentoring", "Tanggung Jawab Tambahan (Mentoring/Koordinasi)", 15, [
    "Mampu membimbing advertiser junior dalam setup, monitoring, analisis, dan optimasi campaign.",
    "Mampu memberikan feedback yang jelas, objektif, dan dapat langsung ditindaklanjuti.",
    "Mampu berkoordinasi dengan tim kreatif mengenai kebutuhan visual, copywriting, angle, dan format iklan.",
    "Mampu berkoordinasi dengan tim sales atau customer service mengenai kualitas lead dan hasil penjualan.",
    "Mampu menjaga komunikasi, pembagian tugas, penyelesaian pekerjaan, dan pencapaian target tim.",
  ]),
  aspect("initiative", "Inisiatif & Kontribusi Strategis", 15, [
    "Aktif mengusulkan strategi baru untuk meningkatkan performa campaign dan penjualan.",
    "Rutin menginisiasi A/B testing pada creative, copy, audiens, landing page, penawaran, atau placement.",
    "Mampu menemukan peluang scale-up campaign berdasarkan performa dan kapasitas bisnis.",
    "Mampu membuat atau memperbaiki SOP, dashboard, template laporan, dan proses kerja advertiser.",
    "Aktif membagikan insight, pembelajaran, tren platform, dan hasil eksperimen kepada tim.",
  ]),
];

export const SKILL_INDICATOR_IDS = SKILL_ASPECTS.flatMap((a) => a.indicators.map((i) => i.id));

export const SKILL_SCALE = [
  { score: 5, label: "Sangat Baik", description: "konsisten melebihi ekspektasi, menjadi rujukan tim" },
  { score: 4, label: "Baik", description: "memenuhi ekspektasi secara konsisten" },
  { score: 3, label: "Cukup", description: "memenuhi ekspektasi dasar, masih perlu penguatan" },
  { score: 2, label: "Kurang", description: "di bawah ekspektasi, memerlukan bimbingan intensif" },
  { score: 1, label: "Sangat Kurang", description: "tidak memenuhi standar minimum jabatan" },
] as const;

/** How a KPI turns target / real into a score: more is better, less is better, or rated by hand. */
export type KpiMode = "higher" | "lower" | "manual";

export type KpiIndicator = {
  key: "leads" | "cpl" | "quality" | "budget";
  title: string;
  description: string;
  guide: string;
  weight: number;
  mode: KpiMode;
  unit: "number" | "currency" | "percent" | null;
};

export const KPI_INDICATORS: KpiIndicator[] = [
  {
    key: "leads",
    title: "Jumlah Lead",
    description: "Total jumlah lead yang berhasil didapatkan dari campaign iklan dibandingkan dengan target yang ditetapkan pada periode berjalan.",
    guide:
      "Skor = (Realisasi Jumlah Lead / Target Jumlah Lead) × 100%. Skor maksimum dibatasi 100% meski realisasi melebihi target, kecuali ditentukan lain oleh atasan langsung.",
    weight: 25,
    mode: "higher",
    unit: "number",
  },
  {
    key: "cpl",
    title: "Efisiensi CPL (Cost Per Lead)",
    description: "Tingkat efisiensi biaya per lead (CPL) dibandingkan dengan target/benchmark CPL yang ditetapkan perusahaan.",
    guide:
      "Skor = (Target CPL / Realisasi CPL) × 100%. Semakin rendah CPL aktual dibanding target, semakin tinggi skor. Skor maksimum dibatasi 100%.",
    weight: 25,
    mode: "lower",
    unit: "currency",
  },
  {
    key: "quality",
    title: "Kualitas Lead & Conversation",
    description:
      "Kualitas lead yang dihasilkan, diukur dari tingkat respons, keseriusan prospek, dan kelanjutan percakapan (conversation) menuju konversi.",
    guide:
      "Dinilai dari rasio lead valid/qualified terhadap total lead, serta tingkat kelanjutan percakapan (response rate & follow-up) menuju tahap konversi, dinilai oleh atasan langsung/tim sales berdasarkan data CRM. Isi target & real sebagai rasio lead qualified (%).",
    weight: 25,
    mode: "higher",
    unit: "percent",
  },
  {
    key: "budget",
    title: "Improvement & Efisiensi Budget",
    description: "Upaya perbaikan berkelanjutan terhadap performa campaign serta efisiensi penggunaan budget iklan dari waktu ke waktu.",
    guide:
      "Dinilai dari tren perbaikan performa campaign dibanding periode sebelumnya serta ketepatan penggunaan budget sesuai alokasi, termasuk inisiatif efisiensi biaya tanpa menurunkan hasil. Skor (%) diisi langsung oleh penilai.",
    weight: 25,
    mode: "manual",
    unit: null,
  },
];

export const KPI_TIERS = [
  { min: 95, label: "Istimewa", range: "≥ 95%" },
  { min: 85, label: "Sangat Baik", range: "85% – 94%" },
  { min: 75, label: "Baik", range: "75% – 84%" },
  { min: 60, label: "Cukup", range: "60% – 74%" },
  { min: 0, label: "Kurang", range: "< 60%" },
] as const;

export type KpiEntry = { target: number | null; real: number | null; score: number | null };
export type KpiValues = Record<string, KpiEntry>;

const clampPct = (value: number) => Math.max(0, Math.min(100, value));

/** Score in percent (0–100) for one KPI, or null when it can't be computed yet. */
export function kpiScore(indicator: KpiIndicator, entry: KpiEntry | undefined): number | null {
  if (!entry) return null;
  if (indicator.mode === "manual") return entry.score === null ? null : clampPct(entry.score);
  const { target, real } = entry;
  if (target === null || real === null || target <= 0) return null;
  if (indicator.mode === "higher") return clampPct((real / target) * 100);
  // Lower is better (CPL): no leads at all means no efficiency to speak of.
  return real <= 0 ? null : clampPct((target / real) * 100);
}

export function skillCategory(score: number) {
  return SKILL_SCALE.find((s) => s.score === Math.min(5, Math.max(1, Math.round(score))))!;
}

export function kpiTier(score: number) {
  return KPI_TIERS.find((t) => score >= t.min)!;
}

export function computeAppraisal(skillScores: Record<string, number>, kpi: KpiValues) {
  const aspects = SKILL_ASPECTS.map((a) => {
    const scores = a.indicators.map((i) => skillScores[i.id]).filter((s): s is number => typeof s === "number");
    const average = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
    return {
      id: a.id,
      scored: scores.length,
      complete: scores.length === a.indicators.length,
      average,
      /** "Skor × Bobot": the aspect's share of the 1–5 total. */
      weighted: average === null ? null : (average * a.weight) / 100,
    };
  });
  const skillComplete = aspects.every((a) => a.complete);
  const skillTotal = skillComplete ? aspects.reduce((sum, a) => sum + a.weighted!, 0) : null;

  const kpis = KPI_INDICATORS.map((indicator) => {
    const score = kpiScore(indicator, kpi[indicator.key]);
    return { key: indicator.key, score, weighted: score === null ? null : (score * indicator.weight) / 100 };
  });
  const kpiComplete = kpis.every((k) => k.score !== null);
  const kpiTotal = kpiComplete ? kpis.reduce((sum, k) => sum + k.weighted!, 0) : null;

  return {
    aspects,
    skillComplete,
    skillTotal,
    skillCategory: skillTotal === null ? null : skillCategory(skillTotal),
    kpis,
    kpiComplete,
    kpiTotal,
    kpiTier: kpiTotal === null ? null : kpiTier(kpiTotal),
  };
}

const idNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
/** Indonesian number format for scores and amounts: 3,62 · 1.234 */
export const formatScore = (value: number, digits = 2) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value);
export const formatIdNumber = (value: number) => idNumber.format(value);

/** Parses "1.234", "54,5" or "12500" as typed in Indonesian format; empty → null. */
export function parseIdNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s|Rp|%/gi, "");
  if (!cleaned) return null;
  const normalised = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, "") : cleaned;
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
