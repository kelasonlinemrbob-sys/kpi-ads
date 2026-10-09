import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Kie.ai resells Claude behind an Anthropic-compatible Messages endpoint
 * (POST https://api.kie.ai/claude/v1/messages), so the official SDK works with a base URL override.
 * Kie bills in credits from its own balance; the key is a Kie API key, not an Anthropic one.
 */

export const KIE_BASE_URL = process.env.KIE_BASE_URL || "https://api.kie.ai/claude";
export const KIE_MODEL = process.env.KIE_MODEL || "claude-opus-5-5";
/** Common API (credit balance) lives outside the /claude prefix. */
const KIE_API = process.env.KIE_API_URL || "https://api.kie.ai";

/** Kie's published Opus 5.5 rate: credits per 1M tokens (≈ $1.60 in / $8.00 out). */
const CREDITS_PER_MTOK = { input: 320, output: 1600 };

export function estimateKieCredits(usage: { inputTokens: number; outputTokens: number }) {
  return (usage.inputTokens * CREDITS_PER_MTOK.input + usage.outputTokens * CREDITS_PER_MTOK.output) / 1_000_000;
}

export function createKieClient(apiKey: string) {
  // authToken → "Authorization: Bearer <key>", the header Kie documents. apiKey: null keeps a stray
  // ANTHROPIC_API_KEY in the server environment from being sent to Kie.
  return new Anthropic({ baseURL: KIE_BASE_URL, apiKey: null, authToken: apiKey, timeout: 5 * 60_000, maxRetries: 1 });
}

/** Turns an SDK error into a message that tells the user what to fix. */
export function kieErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "Kie.ai tidak menjawab dalam 5 menit. Coba lagi beberapa saat lagi.";
  if (error instanceof Anthropic.APIConnectionError) return "Gagal menghubungi Kie.ai. Periksa koneksi server dan coba lagi.";
  if (error instanceof Anthropic.AuthenticationError) return "API key Kie.ai tidak valid. Perbarui di Pengaturan → Integrasi → Kie AI.";
  if (error instanceof Anthropic.PermissionDeniedError) return "API key Kie.ai tidak punya akses ke model ini.";
  if (error instanceof Anthropic.RateLimitError) return "Terlalu banyak permintaan ke Kie.ai. Tunggu sebentar lalu coba lagi.";
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) return "Saldo kredit Kie.ai habis. Isi ulang kredit di kie.ai lalu coba lagi.";
    return `Kie.ai error ${error.status ?? ""}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungi Kie.ai.";
}

export type KieCredits = { ok: true; credits: number } | { ok: false; error: string };

/** Remaining credit balance; also the free way to check that a key works. */
export async function getKieCredits(apiKey: string): Promise<KieCredits> {
  try {
    const res = await fetch(`${KIE_API}/api/v1/chat/credit`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string; data?: unknown } | null;
    const code = body?.code ?? res.status;
    if (code === 401 || res.status === 401) return { ok: false, error: "API key Kie.ai tidak valid." };
    if (!res.ok || code !== 200 || typeof body?.data !== "number") {
      return { ok: false, error: `Kie.ai menolak permintaan (${body?.msg ?? `HTTP ${res.status}`}).` };
    }
    return { ok: true, credits: body.data };
  } catch {
    return { ok: false, error: "Gagal menghubungi Kie.ai. Periksa koneksi server dan coba lagi." };
  }
}
