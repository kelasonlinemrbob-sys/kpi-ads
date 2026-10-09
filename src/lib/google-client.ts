import "server-only";
import { createHash } from "node:crypto";
import type { GoogleCredentials } from "./google-credentials";

export const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v25";
export function googleCredentialFingerprint(credentials: GoogleCredentials) {
  return createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
}
export class GoogleConnectionError extends Error {
  /** Structured Google error codes (e.g. DEVELOPER_TOKEN_NOT_APPROVED), for callers that need their own message. */
  codes: string[] = [];
}
const messages: Record<string, string> = {
  invalid_grant: "Refresh Token kedaluwarsa, dicabut, atau bukan milik Client ID ini. Buat ulang token melalui OAuth Playground; periksa status OAuth Testing (token 7 hari).",
  invalid_client: "Client ID atau Client Secret salah. Salin ulang dari OAuth client yang sama di Google Cloud.",
  unauthorized_client: "OAuth client tidak diizinkan. Gunakan client Web application dan periksa konfigurasi Google Auth Platform.",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: "Token belum memiliki scope adwords. Otorisasi ulang dengan https://www.googleapis.com/auth/adwords.",
  USER_PERMISSION_DENIED: "Pengguna Google tidak memiliki akses ke akun iklan ini. Periksa Customer ID, izin akun, serta MCC ID jika lewat manager.",
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION: "Google Cloud project belum memiliki akses produksi. Ajukan Explorer access di halaman Google Ads API Overview.",
  DEVELOPER_TOKEN_NOT_APPROVED: "Project belum memiliki akses produksi. Periksa akses Google Ads API di Google Cloud dan ajukan Explorer access.",
  ACTION_NOT_PERMITTED: "Akses API tidak diizinkan. Periksa Explorer/Basic/Standard access pada Google Cloud project dan izin pengguna Google Ads.",
  SERVICE_DISABLED: "Google Ads API belum aktif pada project pemilik Client ID. Aktifkan API di Google Cloud Console.",
  CUSTOMER_NOT_ENABLED: "Akun Google Ads belum aktif. Selesaikan penyiapan akun Google Ads terlebih dahulu.",
  INVALID_CUSTOMER_ID: "Customer ID tidak valid. Isi 10 digit ID akun iklan yang menjalankan campaign.",
  UNRECOGNIZED_FIELD: "UNRECOGNIZED_FIELD: Kolom laporan tidak tersedia pada versi Google Ads API ini.",
  RESOURCE_EXHAUSTED: "Kuota Google Ads API habis sementara. Coba lagi nanti atau tingkatkan akses API project.",
};
function apiError(error: unknown, status: number): GoogleConnectionError {
  // Inspect structured error codes only. Raw Google error messages may echo submitted credentials.
  const e = error as { error?: unknown; status?: string; details?: { reason?: string; errors?: { errorCode?: Record<string, string> }[] }[] } | undefined;
  const codes = [typeof error === "string" ? error : "", e?.status ?? "", ...(e?.details ?? []).flatMap((d) => [d.reason ?? "", ...(d.errors ?? []).flatMap((x) => Object.values(x.errorCode ?? {}))])];
  const known = codes.find((code) => messages[code]);
  const failure = new GoogleConnectionError(known ? messages[known] : `Google Ads menolak permintaan (HTTP ${status}). Periksa konfigurasi OAuth, akses API project, dan izin akun iklan.`);
  failure.codes = codes.filter(Boolean);
  return failure;
}
let tokenCache: { fingerprint: string; value: string; expiresAt: number } | null = null;
export function clearGoogleTokenCache() { tokenCache = null; }
async function accessToken(credentials: GoogleCredentials, force: boolean) {
  const fingerprint = googleCredentialFingerprint(credentials);
  if (!force && tokenCache?.fingerprint === fingerprint && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken }),
    cache: "no-store", signal: AbortSignal.timeout(20000) });
  const body = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw apiError(body.error, res.status);
  tokenCache = { fingerprint, value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}
export async function googleSearchWithCredentials<T>(credentials: GoogleCredentials, customerId: string, query: string, forceRefresh = false): Promise<T[]> {
  try {
    const token = await accessToken(credentials, forceRefresh);
    const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId.replace(/\D/g, "")}/googleAds:searchStream`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        ...(credentials.loginCustomerId ? { "login-customer-id": credentials.loginCustomerId } : {}) },
      body: JSON.stringify({ query }), cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    const body = await res.json() as { results?: T[]; error?: unknown }[] | { error?: unknown };
    const failure = Array.isArray(body) ? body.find((chunk) => chunk.error)?.error : body.error;
    if (!res.ok || !Array.isArray(body) || failure) throw apiError(failure, res.status);
    return body.flatMap((chunk) => chunk.results ?? []);
  } catch (error) {
    if (error instanceof GoogleConnectionError) throw error;
    throw new GoogleConnectionError("Tidak dapat menghubungi Google Ads. Periksa koneksi server dan coba lagi.");
  }
}
/** A Google Ads service method on a customer, e.g. "generateKeywordIdeas" (POST customers/{id}:{method}). */
export async function googleAdsPost<T>(credentials: GoogleCredentials, customerId: string, method: string, body: unknown): Promise<T> {
  try {
    const token = await accessToken(credentials, false);
    const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId.replace(/\D/g, "")}:${method}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        ...(credentials.loginCustomerId ? { "login-customer-id": credentials.loginCustomerId } : {}) },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    const result = await res.json() as T & { error?: unknown };
    if (!res.ok || result.error) throw apiError(result.error, res.status);
    return result;
  } catch (error) {
    if (error instanceof GoogleConnectionError) throw error;
    throw new GoogleConnectionError("Tidak dapat menghubungi Google Ads. Periksa koneksi server dan coba lagi.");
  }
}

export type GoogleVerifiedAccount = { accountId: string; name: string; currency: string };
export async function verifyGoogleCredentials(credentials: GoogleCredentials, customerId: string): Promise<GoogleVerifiedAccount> {
  const rows = await googleSearchWithCredentials<{ customer: { id: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } }>(credentials, customerId,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1", true);
  const account = rows[0]?.customer;
  if (!account || account.id !== customerId) throw new GoogleConnectionError("Akun iklan tidak ditemukan. Periksa Customer ID.");
  if (account.manager) throw new GoogleConnectionError("Customer ID ini adalah akun manager (MCC). Isi ID akun iklan anak pada Customer ID, dan ID manager pada MCC ID.");
  return { accountId: account.id, name: account.descriptiveName || `Google Ads ${account.id}`, currency: account.currencyCode ?? "" };
}

export type GoogleAdAccount = { accountId: string; name: string; currency: string | null };

/**
 * Ad accounts (not managers) the credentials can read: the client accounts under the MCC when a login
 * customer ID is set, else every customer the Google user can access directly.
 */
export async function listGoogleAdAccounts(credentials: GoogleCredentials): Promise<GoogleAdAccount[]> {
  type Client = { customerClient: { id: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; status?: string } };
  if (credentials.loginCustomerId) {
    const rows = await googleSearchWithCredentials<Client>(credentials, credentials.loginCustomerId,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'");
    return rows.map((r) => r.customerClient).filter((c) => !c.manager)
      .map((c) => ({ accountId: String(c.id), name: c.descriptiveName || `Google Ads ${c.id}`, currency: c.currencyCode ?? null }));
  }
  let ids: string[];
  try {
    const token = await accessToken(credentials, false);
    const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const body = await res.json() as { resourceNames?: string[]; error?: unknown };
    if (!res.ok || body.error) throw apiError(body.error, res.status);
    ids = (body.resourceNames ?? []).map((n) => n.split("/")[1]!).filter((id) => /^\d+$/.test(id)).slice(0, 50);
  } catch (error) {
    if (error instanceof GoogleConnectionError) throw error;
    throw new GoogleConnectionError("Tidak dapat menghubungi Google Ads. Periksa koneksi server dan coba lagi.");
  }
  type Row = { customer: { id: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } };
  const accounts = await Promise.all(ids.map(async (id) => {
    try {
      const [row] = await googleSearchWithCredentials<Row>(credentials, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1");
      return row && !row.customer.manager ? { accountId: String(row.customer.id), name: row.customer.descriptiveName || `Google Ads ${id}`, currency: row.customer.currencyCode ?? null } : null;
    } catch {
      return null; // e.g. a cancelled account the user can still see
    }
  }));
  return accounts.filter((a): a is GoogleAdAccount => a !== null);
}
