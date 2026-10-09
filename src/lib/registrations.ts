import "server-only";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, campaigns, externalRegistrations, users } from "@/db/schema";
import {
  kelasToLocalRegistration,
  matchPackage,
  matchPackageDetail,
  REGISTRATION_SOURCE_LABEL,
  REGISTRATION_SOURCES,
  toLocalRegistration,
  type ApiRegistration,
  type KelasRegistration,
  type RegistrationSource,
} from "./registration-mapping";
import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * The registration apps ("API integrasi v1", read only, same shape): LKBI Mr.BOB and Kelas Online Mr.BOB.
 * Paid registrations become the advertisers' Closing and Revenue KPIs, per product, from an effective date.
 * Each app has its own team key, entered by a supervisor and stored encrypted; the apps lock it to this
 * server's IP.
 */

export { REGISTRATION_SOURCES, REGISTRATION_SOURCE_LABEL, type RegistrationSource };

type Local = ReturnType<typeof toLocalRegistration> | ReturnType<typeof kelasToLocalRegistration>;
const SOURCES: Record<RegistrationSource, {
  api: string;
  keyPattern: RegExp;
  keyPrefix: string;
  keys: { apiKey: string; effectiveFrom: string; cursor: string; deletedCursor: string; status: string };
  toLocal: (row: never) => Local | null;
}> = {
  lkbi: {
    api: process.env.MRBOB_API_URL || "https://lkbimrbob.com/api/integrasi/v1",
    keyPattern: /^mrbob_[A-Za-z0-9_-]{20,80}$/,
    keyPrefix: "mrbob_",
    // The first source: its setting names predate the second one.
    keys: { apiKey: "shared.registrations.api_key", effectiveFrom: "shared.registrations.effective_from", cursor: "registrations.cursor", deletedCursor: "registrations.deleted_cursor", status: "registrations.status" },
    toLocal: (r: ApiRegistration) => (Number.isSafeInteger(r.id) && r.createdAt && r.changedAt ? toLocalRegistration(r) : null),
  },
  kelas: {
    api: process.env.KELAS_ONLINE_API_URL || "https://app.kelasonlinemrbob.com/api/integrasi/v1",
    keyPattern: /^kelas_[A-Za-z0-9_-]{20,80}$/,
    keyPrefix: "kelas_",
    keys: { apiKey: "shared.kelas_online.api_key", effectiveFrom: "shared.kelas_online.effective_from", cursor: "kelas_online.cursor", deletedCursor: "kelas_online.deleted_cursor", status: "kelas_online.status" },
    toLocal: (r: KelasRegistration) => (Number.isSafeInteger(r.id) && r.createdAt && r.changedAt ? kelasToLocalRegistration(r) : null),
  },
};
const ALL_KEYS = REGISTRATION_SOURCES.flatMap((s) => Object.values(SOURCES[s].keys));
export const isRegistrationSource = (v: unknown): v is RegistrationSource => REGISTRATION_SOURCES.includes(v as RegistrationSource);
/**
 * KPIs count closings from this date (WIB) unless a supervisor sets another. The registration app's data
 * starts in 2025, so by default every month it holds shows its Closing, Revenue and ROAS.
 */
export const DEFAULT_EFFECTIVE_FROM = "2025-01-01";
/** Written into SQL as a literal (GROUP BY needs the same expression), so only a plain zone name is accepted. */
const TZ = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(process.env.APP_TIMEZONE ?? "") ? process.env.APP_TIMEZONE! : "Asia/Jakarta";
const TZ_SQL = sql.raw(`'${TZ}'`);

async function readSettings() {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, ALL_KEYS));
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<string, string>>;
}
async function writeSetting(key: string, value: string | null, actorId: number | null = null) {
  await db.insert(appSettings).values({ key, value: value ?? "", updatedById: actorId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: value ?? "", updatedById: actorId, updatedAt: new Date() } });
}

export async function getRegistrationApiKey(source: RegistrationSource = "lkbi") {
  const stored = (await readSettings())[SOURCES[source].keys.apiKey];
  return stored ? decryptSecret(stored) : null;
}
const effectiveOf = (settings: Partial<Record<string, string>>, source: RegistrationSource) => {
  const v = settings[SOURCES[source].keys.effectiveFrom];
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_EFFECTIVE_FROM;
};
export async function getEffectiveFrom(source: RegistrationSource = "lkbi") {
  return effectiveOf(await readSettings(), source);
}

/* ---------------------------------- API ---------------------------------- */

export class RegistrationApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

const ERRORS: Record<string, string> = {
  unauthorized: "Kunci API ditolak (salah atau sudah dicabut). Minta kunci baru ke pengelola aplikasi pendaftaran.",
  forbidden_ip: "Kunci ini dikunci ke IP lain. Minta pengelola aplikasi pendaftaran menambahkan IP server KPI Ads.",
  rate_limited: "Terlalu banyak permintaan ke aplikasi pendaftaran. Coba lagi sebentar lagi.",
};

/** One GET. 429 waits for Retry-After (at most twice); error bodies are mapped to messages, never echoing the key. */
export async function registrationGet<T>(apiKey: string, path: string, fetchImpl: typeof fetch = fetch, source: RegistrationSource = "lkbi"): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${SOURCES[source].api}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new RegistrationApiError("Gagal menghubungi aplikasi pendaftaran. Periksa koneksi server.");
    }
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, Math.min(60, Number(res.headers.get("retry-after")) || 10) * 1000));
      continue;
    }
    const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
    if (!res.ok || !body || body.error) {
      const code = body?.error?.code ?? "";
      throw new RegistrationApiError(ERRORS[code] ?? `Aplikasi pendaftaran menolak permintaan (${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}).`, res.status);
    }
    return body;
  }
}

type Page<T> = { data: T[]; nextCursor: string | null; hasMore: boolean };

/* ---------------------------------- Sync ---------------------------------- */

export type SyncResult = { upserted: number; deleted: number; pages: number };
export type SyncStatus = { at: string; ok: boolean; error: string | null; upserted: number; deleted: number };

/**
 * Copies new and changed registrations since the stored cursor (all of them on the first run), then
 * applies deletions. Cursors are saved after every page, so an interrupted run resumes where it stopped.
 */
export async function syncRegistrations(opts: { fetchImpl?: typeof fetch; maxPages?: number; source?: RegistrationSource } = {}): Promise<SyncResult> {
  const source = opts.source ?? "lkbi";
  const { keys, toLocal } = SOURCES[source];
  const KEYS = keys;
  const get = <T,>(path: string) => registrationGet<T>(apiKey!, path, opts.fetchImpl, source);
  const apiKey = await getRegistrationApiKey(source);
  if (!apiKey) throw new RegistrationApiError(`Kunci API ${REGISTRATION_SOURCE_LABEL[source]} belum diisi.`);
  const settings = await readSettings();
  const result: SyncResult = { upserted: 0, deleted: 0, pages: 0 };
  const maxPages = opts.maxPages ?? 200;
  try {
    let cursor = settings[KEYS.cursor] || null;
    for (; result.pages < maxPages; ) {
      const page = await get<Page<never>>(`/registrations?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      result.pages++;
      const rows = page.data.map((r) => toLocal(r)).filter((r): r is Local => r !== null);
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await db.insert(externalRegistrations).values(chunk).onConflictDoUpdate({ target: [externalRegistrations.source, externalRegistrations.id], set: UPSERT_SET });
      }
      result.upserted += rows.length;
      if (page.nextCursor) {
        cursor = page.nextCursor;
        await writeSetting(KEYS.cursor, cursor);
      }
      if (!page.hasMore) break;
    }
    let deletedCursor = settings[KEYS.deletedCursor] || null;
    for (let i = 0; i < 50; i++) {
      const page = await get<Page<{ id: number }>>(`/deleted-registrations?limit=500${deletedCursor ? `&cursor=${encodeURIComponent(deletedCursor)}` : ""}`);
      const ids = page.data.map((r) => r.id).filter(Number.isSafeInteger);
      if (ids.length) result.deleted += (await db.delete(externalRegistrations).where(and(eq(externalRegistrations.source, source), inArray(externalRegistrations.id, ids))).returning({ id: externalRegistrations.id })).length;
      if (page.nextCursor) {
        deletedCursor = page.nextCursor;
        await writeSetting(KEYS.deletedCursor, deletedCursor);
      }
      if (!page.hasMore) break;
    }
    await writeSetting(KEYS.status, JSON.stringify({ at: new Date().toISOString(), ok: true, error: null, upserted: result.upserted, deleted: result.deleted } satisfies SyncStatus));
    return result;
  } catch (error) {
    const message = error instanceof RegistrationApiError ? error.message : "Sinkron pendaftaran gagal.";
    await writeSetting(KEYS.status, JSON.stringify({ at: new Date().toISOString(), ok: false, error: message, upserted: result.upserted, deleted: result.deleted } satisfies SyncStatus));
    throw error instanceof RegistrationApiError ? error : new RegistrationApiError(message);
  }
}
/** A row seen again (edited, new proof, payment accepted or rejected) replaces the copy. */
const UPSERT_SET = {
  registrationId: sql`excluded.registration_id`,
  name: sql`excluded.name`,
  packageName: sql`excluded.package_name`,
  period: sql`excluded.period`,
  status: sql`excluded.status`,
  totalPrice: sql`excluded.total_price`,
  infoSource: sql`excluded.info_source`,
  city: sql`excluded.city`,
  paidAt: sql`excluded.paid_at`,
  registeredAt: sql`excluded.registered_at`,
  changedAt: sql`excluded.changed_at`,
  syncedAt: sql`now()`,
};

/* ------------------------------ Connection ------------------------------ */

export async function saveRegistrationKey(apiKey: string, actorId: number, source: RegistrationSource = "lkbi") {
  const key = apiKey.trim();
  const { keyPattern, keyPrefix, keys } = SOURCES[source];
  if (!keyPattern.test(key)) return { ok: false as const, error: `Format kunci tidak dikenali (kunci ${REGISTRATION_SOURCE_LABEL[source]} diawali ${keyPrefix}).` };
  try {
    const ping = await registrationGet<{ ok: boolean; client?: string }>(key, "/ping", fetch, source);
    await writeSetting(keys.apiKey, encryptSecret(key), actorId);
    return { ok: true as const, client: ping.client ?? null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Kunci tidak bisa dites." };
  }
}
export async function removeRegistrationKey(actorId: number, source: RegistrationSource = "lkbi") {
  await writeSetting(SOURCES[source].keys.apiKey, null, actorId);
}
export async function setEffectiveFrom(date: string, actorId: number, source: RegistrationSource = "lkbi") {
  await writeSetting(SOURCES[source].keys.effectiveFrom, date, actorId);
}

/* --------------------------------- KPIs --------------------------------- */

async function mappedProducts() {
  return db.select({ id: campaigns.id, ownerId: campaigns.ownerId, registrationPackages: campaigns.registrationPackages, registrationSource: campaigns.registrationSource, name: campaigns.name, product: campaigns.product, ownerName: users.name })
    .from(campaigns).innerJoin(users, eq(users.id, campaigns.ownerId))
    .where(and(isNotNull(campaigns.registrationPackages), sql`trim(${campaigns.registrationPackages}) <> ''`));
}

/**
 * Closing (paid registrations) and Revenue per product owner and day (WIB), from each app's effective date.
 * A package only matches products of its own app. Empty when no product claims any package, so the KPIs
 * keep their old source.
 */
export async function getRegistrationKpi(start: string, end: string, userIds?: number[], only?: RegistrationSource) {
  if (userIds && !userIds.length) return [];
  const products = await mappedProducts();
  if (!products.length) return [];
  const settings = await readSettings();
  const day = sql<string>`to_char(${externalRegistrations.paidAt} at time zone ${TZ_SQL}, 'YYYY-MM-DD')`;
  const out = new Map<string, { userId: number; campaignId: number; date: string; closing: number; revenue: number; source: RegistrationSource }>();
  for (const source of REGISTRATION_SOURCES) {
    if (only && source !== only) continue;
    const sourceProducts = products.filter((p) => p.registrationSource === source);
    if (!sourceProducts.length) continue;
    const from = effectiveOf(settings, source);
    const lower = start > from ? start : from;
    if (lower > end) continue;
    const rows = await db
      .select({ packageName: externalRegistrations.packageName, date: day, closing: sql<number>`count(*)`.mapWith(Number), revenue: sql<number>`coalesce(sum(${externalRegistrations.totalPrice}), 0)`.mapWith(Number) })
      .from(externalRegistrations)
      .where(and(eq(externalRegistrations.source, source), isNotNull(externalRegistrations.paidAt), gte(day, lower), sql`${day} <= ${end}`))
      .groupBy(externalRegistrations.packageName, day);
    for (const r of rows) {
      const product = matchPackage(r.packageName, sourceProducts);
      if (!product || (userIds && !userIds.includes(product.ownerId))) continue;
      const key = `${product.id}:${r.date}`;
      const cur = out.get(key) ?? { userId: product.ownerId, campaignId: product.id, date: r.date, closing: 0, revenue: 0, source };
      cur.closing += r.closing;
      cur.revenue += r.revenue;
      out.set(key, cur);
    }
  }
  return [...out.values()];
}

/* --------------------------------- Status --------------------------------- */

export async function getRegistrationStatus(month: { start: string; end: string }, source: RegistrationSource = "lkbi") {
  const settings = await readSettings();
  const KEYS = SOURCES[source].keys;
  const stored = settings[KEYS.apiKey];
  const apiKey = stored ? decryptSecret(stored) : null;
  let last: SyncStatus | null = null;
  try { last = settings[KEYS.status] ? JSON.parse(settings[KEYS.status]!) : null; } catch { last = null; }
  const effectiveFrom = effectiveOf(settings, source);
  const [allProducts, [totals], packages] = await Promise.all([
    mappedProducts(),
    db.select({ n: sql<number>`count(*)`.mapWith(Number), paid: sql<number>`count(${externalRegistrations.paidAt})`.mapWith(Number) }).from(externalRegistrations).where(eq(externalRegistrations.source, source)),
    db.select({ packageName: externalRegistrations.packageName, n: sql<number>`count(*)`.mapWith(Number) })
      .from(externalRegistrations).where(and(eq(externalRegistrations.source, source), sql`(${externalRegistrations.paidAt} at time zone ${TZ_SQL})::date >= ${effectiveFrom}::date`))
      .groupBy(externalRegistrations.packageName),
  ]);
  const products = allProducts.filter((p) => p.registrationSource === source);
  const kpi = await getRegistrationKpi(month.start, month.end, undefined, source);
  const byProduct = products.map((p) => ({
    id: p.id, name: p.product?.trim() || p.name, ownerName: p.ownerName, keywords: p.registrationPackages ?? "",
    closing: kpi.filter((k) => k.campaignId === p.id).reduce((s, k) => s + k.closing, 0),
    revenue: kpi.filter((k) => k.campaignId === p.id).reduce((s, k) => s + k.revenue, 0),
  }));
  const unmapped = packages.filter((p) => !matchPackage(p.packageName, products)).sort((a, b) => b.n - a.n);
  // Packages only a "*" product takes: shown so a new program doesn't silently count for the catch-all.
  const viaFallback = packages
    .flatMap((p) => {
      const m = matchPackageDetail(p.packageName, products);
      return m?.viaFallback ? [{ ...p, productId: m.product.id }] : [];
    })
    .sort((a, b) => b.n - a.n);
  return {
    connected: Boolean(apiKey),
    problem: stored && !apiKey ? "Kunci tersimpan tidak bisa dibaca (AUTH_SECRET berubah). Isi ulang kunci." : null,
    keyHint: apiKey ? apiKey.slice(-4) : null,
    source,
    label: REGISTRATION_SOURCE_LABEL[source],
    keyPrefix: SOURCES[source].keyPrefix,
    effectiveFrom,
    last,
    total: totals?.n ?? 0,
    paid: totals?.paid ?? 0,
    byProduct,
    unmapped,
    viaFallback,
  };
}
export type RegistrationStatus = Awaited<ReturnType<typeof getRegistrationStatus>>;
