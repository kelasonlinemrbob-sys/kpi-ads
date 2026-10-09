/**
 * Pure rules of the LKBI registration integration: which product a registration belongs to, and how an
 * API row becomes the local copy. Shared by the sync, the KPI computation, the settings page and tests.
 */

export type PackageRuleProduct = { id: number; ownerId: number; registrationPackages: string | null };

/** The registration apps Closing and Revenue come from. */
export const REGISTRATION_SOURCES = ["lkbi", "kelas"] as const;
export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number];
export const REGISTRATION_SOURCE_LABEL: Record<RegistrationSource, string> = { lkbi: "Pendaftaran LKBI", kelas: "Kelas Online" };

/** "HOLIDAY, ielts" → ["HOLIDAY", "IELTS"]; "*" stays as the catch-all. */
export function parsePackageKeywords(value: string | null | undefined) {
  return [...new Set((value ?? "").split(/[,\n]/).map((k) => k.trim().replace(/\s+/g, " ").toUpperCase()).filter(Boolean))];
}

/**
 * The product a package belongs to: the longest keyword contained in the package name wins (so "PRE IELTS"
 * beats "IELTS"); a product with "*" takes every package no keyword matched. Null when nothing applies.
 */
export function matchPackage<T extends PackageRuleProduct>(packageName: string, products: T[]): T | null {
  return matchPackageDetail(packageName, products)?.product ?? null;
}

/** As matchPackage, also telling whether only a "*" catch-all claimed the package. */
export function matchPackageDetail<T extends PackageRuleProduct>(packageName: string, products: T[]): { product: T; viaFallback: boolean } | null {
  const name = packageName.toUpperCase().replace(/\s+/g, " ");
  let best: { product: T; length: number } | null = null;
  let fallback: T | null = null;
  for (const product of products) {
    for (const keyword of parsePackageKeywords(product.registrationPackages)) {
      if (keyword === "*") fallback ??= product;
      else if (name.includes(keyword) && (!best || keyword.length > best.length)) best = { product, length: keyword.length };
    }
  }
  if (best) return { product: best.product, viaFallback: false };
  return fallback ? { product: fallback, viaFallback: true } : null;
}

/* --------------------------- API rows (integrasi v1) --------------------------- */

export type ApiPayment = { id: number; status: string; approvedAt: string | null; createdAt: string; updatedAt: string | null };
export type ApiRegistration = {
  id: number;
  registrationId: string;
  namaLengkap: string | null;
  paketProgram: string | null;
  periodeProgram: string | null;
  status: string;
  totalPrice: number | null;
  sumberInfo: string | null;
  kotaKabupaten: string | null;
  createdAt: string;
  changedAt: string;
  payments?: ApiPayment[];
};

/**
 * When a registration counts as paid: its earliest payment the admin still accepts (verified). Payments
 * accepted before 7 Oct 2026 carry no approvedAt; their last update stands in, as the API documents.
 * A payment accepted and later rejected no longer counts.
 */
export function paidAtOf(r: Pick<ApiRegistration, "payments">): Date | null {
  const times = (r.payments ?? [])
    .filter((p) => p.status === "verified")
    .map((p) => new Date(p.approvedAt ?? p.updatedAt ?? p.createdAt))
    .filter((d) => !Number.isNaN(d.getTime()));
  return times.length ? new Date(Math.min(...times.map((d) => d.getTime()))) : null;
}

const clip = (v: string | null | undefined, max: number) => (v ? v.trim().slice(0, max) : null);

/** The local copy of one registration: only the fields the KPIs and their review need. */
export function toLocalRegistration(r: ApiRegistration) {
  return {
    source: "lkbi",
    id: r.id,
    registrationId: clip(r.registrationId, 40) ?? String(r.id),
    name: clip(r.namaLengkap, 160) ?? "-",
    packageName: clip(r.paketProgram, 200) ?? "-",
    period: clip(r.periodeProgram, 80),
    status: clip(r.status, 20) ?? "pending",
    totalPrice: Number.isFinite(Number(r.totalPrice)) ? Number(r.totalPrice) : 0,
    infoSource: clip(r.sumberInfo, 160),
    city: clip(r.kotaKabupaten, 120),
    paidAt: paidAtOf(r),
    registeredAt: new Date(r.createdAt),
    changedAt: new Date(r.changedAt),
  };
}

/* ------------------------- Kelas Online (integrasi v1) ------------------------- */

export type KelasPayment = { paymentId: string; kind: "registration" | "renewal" | string; status: string; amount: number | null; approvedAt: string | null };
export type KelasRegistration = {
  id: number;
  registrationCode: string | null;
  name: string | null;
  city: string | null;
  programType: string | null;
  selectedClass: string | null;
  packageName: string | null;
  packagePrice: number | null;
  startDate: string | null;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  changedAt: string;
  payments?: KelasPayment[];
};

/** "ADULT · SPEAK UP 1 · VIP" / "KIDS · SMART KIDS · VIP": products claim Adult or Kids by keyword. */
export function kelasPackage(r: Pick<KelasRegistration, "programType" | "selectedClass" | "packageName">) {
  const type = r.programType?.toLowerCase() === "kids" ? "KIDS" : "ADULT";
  return [type, r.selectedClass?.trim() || "-", r.packageName?.trim() || "-"].join(" · ");
}

/**
 * The local copy of one Kelas Online registration. It counts as paid when the member sends the transfer
 * proof (`confirmed`; the app has no admin acceptance step for it), for the total transferred. Renewals are
 * left out: they are existing members, not closings from ads.
 */
export function kelasToLocalRegistration(r: KelasRegistration) {
  const first = (r.payments ?? []).find((p) => p.kind === "registration");
  const confirmed = r.status === "confirmed";
  const paidAt = confirmed ? new Date(first?.approvedAt ?? r.confirmedAt ?? r.changedAt) : null;
  const amount = Number(first?.amount ?? r.packagePrice);
  return {
    source: "kelas",
    id: r.id,
    registrationId: clip(r.registrationCode, 40) ?? String(r.id),
    name: clip(r.name, 160) ?? "-",
    packageName: clip(kelasPackage(r), 200)!,
    period: clip(r.startDate, 80),
    status: clip(r.status, 20) ?? "pending_payment",
    totalPrice: Number.isFinite(amount) ? amount : 0,
    infoSource: null,
    city: clip(r.city, 120),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    registeredAt: new Date(r.createdAt),
    changedAt: new Date(r.changedAt),
  };
}
