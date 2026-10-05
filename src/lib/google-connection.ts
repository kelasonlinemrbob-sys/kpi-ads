import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secret-box";
import { clearGoogleTokenCache, googleCredentialFingerprint, verifyGoogleCredentials, type GoogleVerifiedAccount } from "./google-client";
import { googleConnectionInput, mergeGoogleCredentials, type GoogleCredentials } from "./google-credentials";

const KEY = "google.connection";
type Check = { ok: boolean; at: string; error?: string; account?: GoogleVerifiedAccount };
type StoredConnection = { credentials: GoogleCredentials; check?: Check } | { disabled: true };
export type GoogleConnectionStatus = {
  state: "none" | "configured" | "ok" | "error" | "disabled"; source: "app" | "env" | null;
  clientId: string; loginCustomerId: string; hasClientSecret: boolean; hasRefreshToken: boolean;
  summary: string; checkedAt: string | null; account: GoogleVerifiedAccount | null;
};

/** One encrypted object prevents mixed credentials and partial updates. App configuration takes precedence over env. */
export async function readGoogleConnection() {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  if (row) {
    const value = decryptSecret(row.value);
    if (!value) return { source: "app" as const, credentials: null, check: null, disabled: false, error: "Konfigurasi Google tidak dapat dibaca. Supervisor perlu mengisi ulang kredensial." };
    try {
      const stored = JSON.parse(value) as StoredConnection;
      if ("disabled" in stored && stored.disabled) return { source: "app" as const, credentials: null, check: null, disabled: true, error: null };
      if (!("credentials" in stored) || !stored.credentials.clientId || !stored.credentials.clientSecret || !stored.credentials.refreshToken) throw new Error("Invalid stored config");
      return { source: "app" as const, credentials: stored.credentials, check: stored.check ?? null, disabled: false, error: null };
    } catch { return { source: "app" as const, credentials: null, check: null, disabled: false, error: "Konfigurasi Google tidak valid. Isi ulang kredensial." }; }
  }
  const credentials = { clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() ?? "", clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? "", refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ?? "", loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/[\s-]/g, "") ?? "" };
  const complete = Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
  return { source: complete ? "env" as const : null, credentials: complete ? credentials : null, check: null, disabled: false, error: null };
}
export async function getGoogleCredentials() { return (await readGoogleConnection()).credentials; }
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const data = await readGoogleConnection();
  const state = data.disabled ? "disabled" : data.error ? "error" : !data.credentials ? "none" : data.check?.ok ? "ok" : data.check ? "error" : "configured";
  return { state, source: data.source, clientId: data.credentials?.clientId ?? "", loginCustomerId: data.credentials?.loginCustomerId ?? "",
    hasClientSecret: Boolean(data.credentials?.clientSecret), hasRefreshToken: Boolean(data.credentials?.refreshToken), checkedAt: data.check?.at ?? null,
    account: data.check?.ok ? data.check.account ?? null : null,
    summary: data.error ?? (state === "disabled" ? "Koneksi Google Ads dinonaktifkan." : state === "none" ? "Google Ads belum terhubung. Ikuti tutorial, lalu isi kredensial di bawah." : state === "configured" ? "Kredensial tersedia dari server. Tes akses ke Customer ID akun iklan." : data.check?.ok ? `Tes terakhir berhasil: ${data.check.account?.name ?? "akun Google Ads"}.` : data.check?.error ?? "Tes koneksi gagal.") };
}
async function storeGoogleConnection(value: StoredConnection, userId: number) {
  const encrypted = encryptSecret(JSON.stringify(value));
  await db.insert(appSettings).values({ key: KEY, value: encrypted, updatedById: userId }).onConflictDoUpdate({ target: appSettings.key, set: { value: encrypted, updatedById: userId, updatedAt: new Date() } });
  clearGoogleTokenCache();
}
export async function saveGoogleConnection(input: unknown, userId: number) {
  const parsed = googleConnectionInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Form tidak valid." };
  try {
    const current = await getGoogleCredentials();
    const credentials = mergeGoogleCredentials(parsed.data, current);
    const account = await verifyGoogleCredentials(credentials, parsed.data.customerId);
    await storeGoogleConnection({ credentials, check: { ok: true, at: new Date().toISOString(), account } }, userId);
    return { ok: true as const, account };
  } catch (error) {
    // Merge errors are local and API errors are sanitized in google-client; storage errors must not echo encrypted/secret values.
    const { GoogleConnectionError } = await import("./google-client");
    if (error instanceof GoogleConnectionError || (error instanceof Error && /^(Jika Client ID|Client Secret dan Refresh Token)/.test(error.message))) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "Koneksi belum tersimpan. Periksa konfigurasi server dan coba lagi." };
  }
}
export async function testGoogleConnection(customerId: string, userId: number) {
  const data = await readGoogleConnection();
  if (!data.credentials) return { ok: false as const, error: data.error ?? "Isi dan simpan kredensial Google Ads terlebih dahulu." };
  let check: Check;
  try { check = { ok: true, at: new Date().toISOString(), account: await verifyGoogleCredentials(data.credentials, customerId) }; }
  catch (error) { check = { ok: false, at: new Date().toISOString(), error: (error as Error).message }; }
  // Re-check after network I/O so testing an old token cannot overwrite a newer connection or re-enable a disabled one.
  const latest = await readGoogleConnection();
  if (data.source === "app" && latest.credentials && googleCredentialFingerprint(latest.credentials) === googleCredentialFingerprint(data.credentials)) {
    // Only update if the encrypted row has not changed while this operation was in flight.
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    if (row) {
      const { and } = await import("drizzle-orm");
      const plain = decryptSecret(row.value);
      const stored = plain ? JSON.parse(plain) as StoredConnection : null;
      if (stored && "credentials" in stored && googleCredentialFingerprint(stored.credentials) === googleCredentialFingerprint(data.credentials))
        await db.update(appSettings).set({ value: encryptSecret(JSON.stringify({ credentials: data.credentials, check })), updatedById: userId, updatedAt: new Date() }).where(and(eq(appSettings.key, KEY), eq(appSettings.value, row.value)));
    }
  }
  return check.ok ? { ok: true as const, account: check.account! } : { ok: false as const, error: check.error! };
}
export async function disableGoogleConnection(userId: number) { await storeGoogleConnection({ disabled: true }, userId); }
