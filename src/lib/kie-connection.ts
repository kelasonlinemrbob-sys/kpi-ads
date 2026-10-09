import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { modelLabel } from "./ai-models";
import { CONTENT_MODEL, SUMMARY_MODEL } from "./ai-provider";
import { DAILY_ANALYSIS_LIMIT } from "./ai-analysis-data";
import { getKieCredits } from "./kie-client";
import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * The team's Kie.ai API key for AI analysis: entered once by a supervisor in Settings, stored encrypted in
 * `app_settings`, and used by everyone who runs an analysis (supervisors, advertisers, creatives).
 */

const KEYS = { apiKey: "shared.kie.api_key", info: "shared.kie.key_info" } as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

export type KieKeyInfo = {
  /** Last 4 characters of the key this info belongs to. */
  keyHint: string;
  valid: boolean;
  error: string | null;
  credits: number | null;
  checkedAt: string;
};

export type KieConnectionStatus = {
  state: "none" | "ok" | "invalid";
  keyHint: string | null;
  info: KieKeyInfo | null;
  /** Set when the stored key can't be decrypted (AUTH_SECRET changed). */
  problem: string | null;
  model: string;
  /** Analyses one person may start per 24 hours, since everyone spends the team's credits. */
  dailyLimit: number;
  summary: string;
  checkedLabel: string | null;
};

export const KIE_KEY_MISSING = "Analisa AI belum aktif: API key Kie.ai tim belum diisi supervisor (Pengaturan → Integrasi → Kie AI).";

const hint = (key: string) => key.slice(-4);

async function writeSettings(values: Partial<Record<Key, string | null>>, actorId: number) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(values)) {
      await tx.insert(appSettings).values({ key, value: value ?? "", updatedById: actorId })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: value ?? "", updatedById: actorId, updatedAt: new Date() } });
    }
  });
}

async function readStored() {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, Object.values(KEYS)));
  const settings: Partial<Record<Key, string>> = Object.fromEntries(rows.filter((r) => r.value).map((r) => [r.key, r.value]));
  const stored = settings[KEYS.apiKey];
  const apiKey = stored ? decryptSecret(stored) : null;
  const problem = stored && !apiKey ? "API key tersimpan tidak bisa dibaca (AUTH_SECRET berubah). Tempel ulang API key Kie.ai." : null;
  let info: KieKeyInfo | null = null;
  try {
    const raw = settings[KEYS.info];
    info = raw ? (JSON.parse(raw) as KieKeyInfo) : null;
  } catch {
    info = null;
  }
  if (info && (!apiKey || info.keyHint !== hint(apiKey))) info = null;
  return { apiKey, info, problem };
}

/** The team key used for every Kie.ai call, or null when no supervisor has set one. */
export async function getKieApiKey() {
  return (await readStored()).apiKey;
}

const credits = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

export async function getKieConnectionStatus(): Promise<KieConnectionStatus> {
  const { apiKey, info, problem } = await readStored();
  const state: KieConnectionStatus["state"] = !apiKey ? (problem ? "invalid" : "none") : info && !info.valid ? "invalid" : "ok";
  const summary = problem
    ?? (!apiKey
      ? "API key Kie.ai tim belum diisi supervisor, jadi Analisa AI belum bisa dipakai."
      : !info
        ? `API key …${hint(apiKey)} tersimpan, belum dites.`
        : !info.valid
          ? info.error ?? "API key tidak valid."
          : `Terhubung · sisa ${info.credits === null ? "?" : credits(info.credits)} kredit`);
  return {
    state,
    keyHint: apiKey ? hint(apiKey) : null,
    info,
    problem,
    model: SUMMARY_MODEL === CONTENT_MODEL ? modelLabel(SUMMARY_MODEL) : `${modelLabel(SUMMARY_MODEL)} (Ringkasan) dan ${modelLabel(CONTENT_MODEL)} (per konten)`,
    dailyLimit: DAILY_ANALYSIS_LIMIT,
    summary,
    checkedLabel: info ? new Date(info.checkedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
  };
}

async function inspect(apiKey: string): Promise<KieKeyInfo> {
  const res = await getKieCredits(apiKey);
  return { keyHint: hint(apiKey), valid: res.ok, error: res.ok ? null : res.error, credits: res.ok ? res.credits : null, checkedAt: new Date().toISOString() };
}

export async function saveKieConnection(input: { apiKey?: string }, actorId: number): Promise<{ ok: true; info: KieKeyInfo } | { ok: false; error: string }> {
  const apiKey = input.apiKey?.trim() || (await readStored()).apiKey;
  if (!apiKey) return { ok: false, error: "Tempel API key Kie.ai terlebih dahulu." };
  const info = await inspect(apiKey);
  if (!info.valid) return { ok: false, error: info.error ?? "API key tidak valid." };
  await writeSettings({ [KEYS.apiKey]: encryptSecret(apiKey), [KEYS.info]: JSON.stringify(info) }, actorId);
  return { ok: true, info };
}

export async function testKieConnection(actorId: number): Promise<{ ok: true; info: KieKeyInfo } | { ok: false; error: string }> {
  const { apiKey, problem } = await readStored();
  if (!apiKey) return { ok: false, error: problem ?? KIE_KEY_MISSING };
  const info = await inspect(apiKey);
  await writeSettings({ [KEYS.info]: JSON.stringify(info) }, actorId);
  return info.valid ? { ok: true, info } : { ok: false, error: info.error ?? "API key tidak valid." };
}

export async function removeKieConnection(actorId: number) {
  await writeSettings({ [KEYS.apiKey]: null, [KEYS.info]: null }, actorId);
}
