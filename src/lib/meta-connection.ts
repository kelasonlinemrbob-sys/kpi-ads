import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

/**
 * The Meta Marketing API connection: an access token (plus optional app ID / secret to turn a
 * short-lived user token into a 60-day one), entered by a supervisor in Settings and stored
 * encrypted in `app_settings`. META_ACCESS_TOKEN in .env is still honoured as a fallback.
 */

const KEYS = {
  token: "meta.access_token",
  appId: "meta.app_id",
  appSecret: "meta.app_secret",
  info: "meta.token_info",
} as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

export const META_API_VERSION = process.env.META_API_VERSION ?? "v24.0";
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

/** Warn this many days before the token (or its data access) runs out. */
const EXPIRY_WARNING_DAYS = 14;

export type MetaTokenInfo = {
  /** Last 4 characters of the token this info belongs to. */
  tokenHint: string;
  valid: boolean;
  error: string | null;
  /** SYSTEM_USER, USER or PAGE, when Meta tells us. */
  type: string | null;
  /** Name of the user / system user the token belongs to. */
  subject: string | null;
  appName: string | null;
  /** ISO timestamp, null = never expires (or unknown, see expiryKnown). */
  expiresAt: string | null;
  /** False when Meta wouldn't tell us the token details (debug_token failed). */
  expiryKnown: boolean;
  /** User tokens lose data access after 90 days even if the token itself lives on. */
  dataAccessExpiresAt: string | null;
  scopes: string[];
  checkedAt: string;
};

export type MetaConnectionStatus = {
  state: "none" | "ok" | "expiring" | "expired" | "invalid";
  source: "app" | "env" | null;
  tokenHint: string | null;
  appId: string | null;
  hasAppSecret: boolean;
  info: MetaTokenInfo | null;
  /** Set when a stored secret can't be decrypted (AUTH_SECRET changed). */
  problem: string | null;
  /** One-line description, formatted on the server (APP_TIMEZONE) so it hydrates identically. */
  summary: string;
  checkedLabel: string | null;
};

const hint = (token: string) => token.slice(-4);

async function readSettings(): Promise<Partial<Record<Key, string>>> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function writeSettings(values: Partial<Record<Key, string | null>>, userId: number) {
  const entries = Object.entries(values) as [Key, string | null][];
  const remove = entries.filter(([, value]) => value === null).map(([key]) => key);
  const upsert = entries.filter((entry): entry is [Key, string] => entry[1] !== null);
  if (remove.length) await db.delete(appSettings).where(inArray(appSettings.key, remove));
  for (const [key, value] of upsert) {
    await db
      .insert(appSettings)
      .values({ key, value, updatedById: userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedById: userId, updatedAt: new Date() } });
  }
}

type Stored = {
  token: string | null;
  source: MetaConnectionStatus["source"];
  appId: string | null;
  appSecret: string | null;
  info: MetaTokenInfo | null;
  problem: string | null;
};

async function readStored(): Promise<Stored> {
  const settings = await readSettings();
  const storedToken = settings[KEYS.token];
  const storedSecret = settings[KEYS.appSecret];
  const storedInfo = settings[KEYS.info];
  let problem: string | null = null;
  let token: string | null = null;
  let source: Stored["source"] = null;
  if (storedToken) {
    token = decryptSecret(storedToken);
    if (token) source = "app";
    else problem = "Token tersimpan tidak bisa dibaca (AUTH_SECRET berubah). Tempel ulang token Meta.";
  }
  if (!token && process.env.META_ACCESS_TOKEN?.trim()) {
    token = process.env.META_ACCESS_TOKEN.trim();
    source = "env";
  }
  const appSecret = storedSecret ? decryptSecret(storedSecret) : null;
  let info: MetaTokenInfo | null = null;
  try {
    info = storedInfo ? (JSON.parse(storedInfo) as MetaTokenInfo) : null;
  } catch {
    info = null;
  }
  // Info belongs to a specific token; ignore it once the token was replaced.
  if (info && (!token || info.tokenHint !== hint(token))) info = null;
  return { token, source, appId: settings[KEYS.appId] ?? null, appSecret, info, problem };
}

/** The token used for every Meta Marketing API call, or null when nothing is configured. */
export async function getMetaToken() {
  return (await readStored()).token;
}

const TOKEN_TYPE: Record<string, string> = { SYSTEM_USER: "System User", USER: "token user", PAGE: "token page" };
const longDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** Owner, type and how long the token lasts. */
function describe(status: Omit<MetaConnectionStatus, "summary" | "checkedLabel">) {
  const info = status.info;
  if (status.state === "none") return "Token Meta Ads belum diisi, jadi data akun Meta belum bisa ditarik.";
  if (status.problem) return status.problem;
  if (!info) return `Token …${status.tokenHint} tersimpan, belum dites.`;
  if (!info.valid) return info.error ?? "Token tidak valid.";
  const parts = [`${info.subject ?? "Terhubung"}${info.type ? ` (${TOKEN_TYPE[info.type] ?? info.type})` : ""}`];
  if (info.expiryKnown === false) parts.push("masa berlaku token tidak diketahui");
  else if (!info.expiresAt) parts.push("token tidak kedaluwarsa");
  else if (daysLeft(info.expiresAt) <= 0) parts.push(`token kedaluwarsa ${longDate(info.expiresAt)}`);
  else parts.push(`token berlaku sampai ${longDate(info.expiresAt)} (${daysLeft(info.expiresAt)} hari lagi)`);
  if (info.dataAccessExpiresAt) parts.push(`akses data sampai ${longDate(info.dataAccessExpiresAt)}`);
  return parts.join(" · ");
}

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  const status = await connectionState();
  return {
    ...status,
    summary: describe(status),
    checkedLabel: status.info
      ? new Date(status.info.checkedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null,
  };
}

async function connectionState(): Promise<Omit<MetaConnectionStatus, "summary" | "checkedLabel">> {
  const stored = await readStored();
  const base = {
    source: stored.source,
    tokenHint: stored.token ? hint(stored.token) : null,
    appId: stored.appId,
    hasAppSecret: Boolean(stored.appSecret),
    info: stored.info,
    problem: stored.problem,
  };
  if (!stored.token) return { ...base, state: stored.problem ? "invalid" : "none" };
  const info = stored.info;
  if (!info) return { ...base, state: "ok" };
  if (!info.valid) return { ...base, state: "invalid" };
  const now = Date.now();
  const deadlines = [info.expiresAt, info.dataAccessExpiresAt].filter(Boolean).map((d) => new Date(d!).getTime());
  if (deadlines.some((d) => d <= now)) return { ...base, state: "expired" };
  if (deadlines.some((d) => d - now < EXPIRY_WARNING_DAYS * 86_400_000)) return { ...base, state: "expiring" };
  return { ...base, state: "ok" };
}

/* ------------------------------- Graph API ------------------------------- */

export type MetaApiError = { message?: string; code?: number; error_subcode?: number };

/** Turns a Graph API error into a message that tells the user what to fix. */
export function metaErrorMessage(error: MetaApiError | undefined, status?: number) {
  const raw = error?.message ?? `Meta API error ${status ?? ""}`.trim();
  if (error?.code === 190) {
    return `Token Meta tidak valid atau sudah kedaluwarsa — perbarui di Settings → Koneksi Meta Ads. (${raw})`;
  }
  if (error?.code === 10 || (error?.code && error.code >= 200 && error.code < 300)) {
    return `Token Meta tidak punya izin ke akun ini — pastikan izin ads_read dan akun iklan sudah di-assign ke System User. (${raw})`;
  }
  if (error?.code === 100 && error.error_subcode === 33) {
    return `Akun iklan tidak ditemukan atau tidak bisa diakses token ini — cek ID akun dan assign akun ke System User. (${raw})`;
  }
  return raw;
}

export const META_TOKEN_MISSING =
  "Token Meta Ads belum diisi. Supervisor bisa mengisinya di Settings → Koneksi Meta Ads.";

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: number };

async function graph<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<GraphResult<T>> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (T & { error?: MetaApiError }) | null;
    if (!body) return { ok: false, error: `Gagal menghubungi Meta API: respons tidak valid (HTTP ${res.status}).` };
    if (!res.ok || body.error) return { ok: false, error: metaErrorMessage(body.error, res.status), code: body.error?.code };
    return { ok: true, data: body };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Meta API: ${(error as Error).message}` };
  }
}

const unixToIso = (seconds?: number) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** Checks a token against Meta: who it belongs to, its type, permissions and expiry. */
export async function inspectMetaToken(token: string, app?: { id: string; secret: string } | null): Promise<MetaTokenInfo> {
  const checkedAt = new Date().toISOString();
  const empty = { tokenHint: hint(token), expiryKnown: false, type: null, subject: null, appName: null, expiresAt: null, dataAccessExpiresAt: null, scopes: [], checkedAt };
  const me = await graph<{ id: string; name?: string }>("me", token, { fields: "id,name" });
  if (!me.ok) return { ...empty, valid: false, error: me.error };

  // debug_token accepts either an app token (id|secret) or the token itself.
  type Debug = {
    data?: {
      type?: string;
      application?: string;
      expires_at?: number;
      data_access_expires_at?: number;
      is_valid?: boolean;
      scopes?: string[];
    };
  };
  let debug = await graph<Debug>("debug_token", app ? `${app.id}|${app.secret}` : token, { input_token: token });
  if (!debug.ok && app) debug = await graph<Debug>("debug_token", token, { input_token: token });
  const data = debug.ok ? debug.data.data : undefined;
  const scopes = data?.scopes ?? [];
  const missingScope = data && !scopes.some((scope) => scope === "ads_read" || scope === "ads_management");
  return {
    ...empty,
    valid: data?.is_valid !== false && !missingScope,
    error: missingScope
      ? "Token belum punya izin ads_read. Buat ulang token dan centang ads_read."
      : data?.is_valid === false
        ? "Token tidak valid."
        : null,
    expiryKnown: Boolean(data),
    type: data?.type ?? null,
    subject: me.data.name ?? me.data.id,
    appName: data?.application ?? null,
    expiresAt: unixToIso(data?.expires_at),
    dataAccessExpiresAt: unixToIso(data?.data_access_expires_at),
    scopes,
  };
}

/** Swaps a short-lived user token (1–2 hours) for a long-lived one (±60 days). */
async function exchangeForLongLived(token: string, app: { id: string; secret: string }): Promise<GraphResult<string>> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", app.id);
  url.searchParams.set("client_secret", app.secret);
  url.searchParams.set("fb_exchange_token", token);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: MetaApiError };
    if (!res.ok || !body.access_token) return { ok: false, error: metaErrorMessage(body.error, res.status) };
    return { ok: true, data: body.access_token };
  } catch (error) {
    return { ok: false, error: `Gagal menghubungi Meta API: ${(error as Error).message}` };
  }
}

export type MetaAdAccount = { accountId: string; name: string; status: number; currency: string | null };

/** Every ad account the token can read — for a System User, the accounts assigned to it. */
export async function listMetaAdAccounts(token: string): Promise<GraphResult<MetaAdAccount[]>> {
  const accounts: MetaAdAccount[] = [];
  type Page = { data?: { account_id: string; name?: string; account_status?: number; currency?: string }[]; paging?: { cursors?: { after?: string }; next?: string } };
  let after: string | undefined;
  do {
    const page: GraphResult<Page> = await graph<Page>("me/adaccounts", token, {
      fields: "account_id,name,account_status,currency",
      limit: "200",
      ...(after ? { after } : {}),
    });
    if (!page.ok) return page;
    for (const a of page.data.data ?? []) {
      accounts.push({ accountId: a.account_id, name: a.name ?? a.account_id, status: a.account_status ?? 0, currency: a.currency ?? null });
    }
    after = page.data.paging?.next ? page.data.paging.cursors?.after : undefined;
  } while (after);
  return { ok: true, data: accounts };
}

/** Confirms the configured token can read one ad account. */
export async function checkMetaAdAccount(accountId: string): Promise<{ ok: true; name: string } | { ok: false; error: string; missingToken?: boolean; network?: boolean }> {
  const token = await getMetaToken();
  if (!token) return { ok: false, error: META_TOKEN_MISSING, missingToken: true };
  const res = await graph<{ name?: string }>(`act_${accountId}`, token, { fields: "name,account_status" });
  if (!res.ok) return { ok: false, error: res.error, network: res.code === undefined && res.error.startsWith("Gagal menghubungi") };
  return { ok: true, name: res.data.name ?? accountId };
}

/* --------------------------- Save / test / remove --------------------------- */

export type SaveMetaInput = { token?: string; appId?: string; appSecret?: string };

/**
 * Validates and stores the Meta connection. A new user token is swapped for a long-lived one when
 * an app ID + secret are available. Blank fields keep what's already stored.
 */
export async function saveMetaConnection(input: SaveMetaInput, userId: number): Promise<{ ok: true; info: MetaTokenInfo } | { ok: false; error: string }> {
  const stored = await readStored();
  const appId = input.appId?.trim() || stored.appId;
  const appSecret = input.appSecret?.trim() || stored.appSecret;
  const app = appId && appSecret ? { id: appId, secret: appSecret } : null;
  let token = input.token?.trim() || (stored.source === "app" ? stored.token : null);
  if (!token) return { ok: false, error: "Tempel access token Meta terlebih dahulu." };

  let info = await inspectMetaToken(token, app);
  if (!info.valid) return { ok: false, error: info.error ?? "Token tidak valid." };

  // A user token from Graph API Explorer lives 1–2 hours; exchange it so it lasts ±60 days.
  if (info.type === "USER" && info.expiresAt && app && new Date(info.expiresAt).getTime() - Date.now() < 30 * 86_400_000) {
    const exchanged = await exchangeForLongLived(token, app);
    if (!exchanged.ok) return { ok: false, error: `Gagal memperpanjang token: ${exchanged.error}` };
    token = exchanged.data;
    info = await inspectMetaToken(token, app);
    if (!info.valid) return { ok: false, error: info.error ?? "Token tidak valid." };
  }

  await writeSettings(
    {
      [KEYS.token]: encryptSecret(token),
      [KEYS.appId]: appId ?? null,
      [KEYS.appSecret]: appSecret ? encryptSecret(appSecret) : null,
      [KEYS.info]: JSON.stringify(info),
    },
    userId,
  );
  return { ok: true, info };
}

/** Re-checks the current token (from the app or .env) and lists the ad accounts it can read. */
export async function testMetaConnection(userId: number) {
  const stored = await readStored();
  if (!stored.token) return { ok: false as const, error: stored.problem ?? META_TOKEN_MISSING };
  const app = stored.appId && stored.appSecret ? { id: stored.appId, secret: stored.appSecret } : null;
  const info = await inspectMetaToken(stored.token, app);
  await writeSettings({ [KEYS.info]: JSON.stringify(info) }, userId);
  if (!info.valid) return { ok: false as const, error: info.error ?? "Token tidak valid." };
  const accounts = await listMetaAdAccounts(stored.token);
  if (!accounts.ok) return { ok: false as const, error: accounts.error };
  return { ok: true as const, info, accounts: accounts.data };
}

export async function removeMetaConnection(userId: number) {
  await writeSettings({ [KEYS.token]: null, [KEYS.appId]: null, [KEYS.appSecret]: null, [KEYS.info]: null }, userId);
}
