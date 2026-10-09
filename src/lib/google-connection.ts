import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secret-box";
import { clearGoogleTokenCache, googleCredentialFingerprint, listGoogleAdAccounts, verifyGoogleCredentials, type GoogleVerifiedAccount } from "./google-client";
import { googleConnectionInput, mergeGoogleCredentials, type GoogleCredentials } from "./google-credentials";

/** The team's Google Ads connection, managed by a supervisor; advertisers only pick their ad accounts. */
const ADS_KEY = "shared.google_ads.connection";
/** Legacy shared key, kept only as the Google Sheets fallback authorization. */
const SHEETS_LEGACY_KEY = "google.connection";
type Check = { ok: boolean; at: string; error?: string; account?: GoogleVerifiedAccount };
type StoredConnection = { credentials: GoogleCredentials; check?: Check } | { disabled: true };
export type GoogleConnectionStatus = {
  state: "none" | "configured" | "ok" | "error" | "disabled"; source: "app" | "env" | null;
  clientId: string; loginCustomerId: string; hasClientSecret: boolean; hasRefreshToken: boolean;
  summary: string; checkedAt: string | null; account: GoogleVerifiedAccount | null;
};

/** One encrypted object prevents mixed credentials and partial updates. App configuration takes precedence over env. */
export async function readGoogleConnection(scope: "ads" | "shared-sheets" = "ads") {
  const key = scope === "ads" ? ADS_KEY : SHEETS_LEGACY_KEY;
  const row = (await db.select().from(appSettings).where(eq(appSettings.key, key))).find((r) => r.key === key);
  if (row) {
    const value = decryptSecret(row.value);
    if (!value) return { source: "app" as const, credentials: null, check: null, disabled: false, error: "Konfigurasi Google tidak dapat dibaca. Isi ulang kredensial." };
    try {
      const stored = JSON.parse(value) as StoredConnection;
      if ("disabled" in stored && stored.disabled) return { source: "app" as const, credentials: null, check: null, disabled: true, error: null };
      if (!("credentials" in stored) || !stored.credentials.clientId || !stored.credentials.clientSecret || !stored.credentials.refreshToken) throw new Error("Invalid stored config");
      return { source: "app" as const, credentials: stored.credentials, check: stored.check ?? null, disabled: false, error: null };
    } catch { return { source: "app" as const, credentials: null, check: null, disabled: false, error: "Konfigurasi Google tidak valid. Isi ulang kredensial." }; }
  }
  if (scope !== "shared-sheets") return { source: null, credentials: null, check: null, disabled: false, error: null };
  const credentials = { clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() ?? "", clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? "", refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ?? "", loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/[\s-]/g, "") ?? "" };
  const complete = Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
  return { source: complete ? "env" as const : null, credentials: complete ? credentials : null, check: null, disabled: false, error: null };
}
export async function getGoogleCredentials() { return (await readGoogleConnection()).credentials; }
/** The existing Sheets integration keeps its own shared authorization. */
export async function getSharedSheetsCredentials() { return (await readGoogleConnection("shared-sheets")).credentials; }
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const data = await readGoogleConnection();
  const state = data.disabled ? "disabled" : data.error ? "error" : !data.credentials ? "none" : data.check?.ok ? "ok" : data.check ? "error" : "configured";
  return { state, source: data.source, clientId: data.credentials?.clientId ?? "", loginCustomerId: data.credentials?.loginCustomerId ?? "",
    hasClientSecret: Boolean(data.credentials?.clientSecret), hasRefreshToken: Boolean(data.credentials?.refreshToken), checkedAt: data.check?.at ?? null,
    account: data.check?.ok ? data.check.account ?? null : null,
    summary: data.error ?? (state === "disabled" ? "Koneksi Google Ads dinonaktifkan." : state === "none" ? "Koneksi Google Ads tim belum diisi supervisor." : state === "configured" ? "Kredensial tersedia dari server. Tes akses ke Customer ID akun iklan." : data.check?.ok ? `Tes terakhir berhasil: ${data.check.account?.name ?? "akun Google Ads"}.` : data.check?.error ?? "Tes koneksi gagal.") };
}
async function storeGoogleConnection(value: StoredConnection, actorId: number) {
  const encrypted = encryptSecret(JSON.stringify(value));
  await db.insert(appSettings).values({ key: ADS_KEY, value: encrypted, updatedById: actorId }).onConflictDoUpdate({ target: appSettings.key, set: { value: encrypted, updatedById: actorId, updatedAt: new Date() } });
  clearGoogleTokenCache();
}
export async function saveGoogleConnection(input: unknown, actorId: number) {
  const parsed = googleConnectionInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Form tidak valid." };
  try {
    const current = await getGoogleCredentials();
    const credentials = mergeGoogleCredentials(parsed.data, current);
    const account = await verifyGoogleCredentials(credentials, parsed.data.customerId);
    await storeGoogleConnection({ credentials, check: { ok: true, at: new Date().toISOString(), account } }, actorId);
    return { ok: true as const, account };
  } catch (error) {
    // Merge errors are local and API errors are sanitized in google-client; storage errors must not echo encrypted/secret values.
    const { GoogleConnectionError } = await import("./google-client");
    if (error instanceof GoogleConnectionError || (error instanceof Error && /^(Jika Client ID|Client Secret dan Refresh Token)/.test(error.message))) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "Koneksi belum tersimpan. Periksa konfigurasi server dan coba lagi." };
  }
}
export async function testGoogleConnection(customerId: string, actorId: number) {
  const data = await readGoogleConnection();
  if (!data.credentials) return { ok: false as const, error: data.error ?? "Isi dan simpan kredensial Google Ads terlebih dahulu." };
  let check: Check;
  try { check = { ok: true, at: new Date().toISOString(), account: await verifyGoogleCredentials(data.credentials, customerId) }; }
  catch (error) { check = { ok: false, at: new Date().toISOString(), error: (error as Error).message }; }
  // Only record the result if the stored row is still the one that was tested: a concurrent save or disconnect wins.
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, ADS_KEY));
  const plain = row ? decryptSecret(row.value) : null;
  const stored = plain ? (JSON.parse(plain) as StoredConnection) : null;
  if (row && stored && "credentials" in stored && googleCredentialFingerprint(stored.credentials) === googleCredentialFingerprint(data.credentials)) {
    await db.update(appSettings).set({ value: encryptSecret(JSON.stringify({ credentials: data.credentials, check })), updatedById: actorId, updatedAt: new Date() })
      .where(and(eq(appSettings.key, ADS_KEY), eq(appSettings.value, row.value)));
  }
  return check.ok ? { ok: true as const, account: check.account! } : { ok: false as const, error: check.error! };
}
export async function disableGoogleConnection(actorId: number) { await storeGoogleConnection({ disabled: true }, actorId); }

/** Ad accounts the team's Google connection can read, for advertisers to pick theirs. */
export async function listSharedGoogleAdAccounts() {
  const credentials = await getGoogleCredentials();
  if (!credentials) return { ok: false as const, error: "Koneksi Google Ads tim belum diisi. Supervisor dapat mengisinya di Pengaturan → Integrasi → Google Ads." };
  try {
    return { ok: true as const, data: await listGoogleAdAccounts(credentials) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Daftar akun Google Ads gagal dimuat." };
  }
}
