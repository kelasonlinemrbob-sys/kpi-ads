import "server-only";

/**
 * Gemini on Kie.ai (native generateContent format). Checked live on 2026-10-07: images and videos are
 * really seen (inline base64 and file URLs), the system instruction is honoured and responseMimeType
 * "application/json" works, but responseSchema enums are not enforced, so callers validate the JSON.
 * Kie reports failures as HTTP 200 with `{ code, msg }` in the body.
 */

export const KIE_GEMINI_MODEL = process.env.KIE_GEMINI_MODEL || "gemini-3-8-flash";
const KIE_GEMINI_URL = process.env.KIE_GEMINI_URL || "https://api.kie.ai/gemini/v1/models";

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { file_data: { mime_type: string; file_uri: string } };

export type GeminiResult =
  | { ok: true; text: string; finishReason: string | null; promptTokens: number; outputTokens: number; credits: number | null; model: string }
  | { ok: false; error: string; status?: number; credits?: number | null };

type GeminiBody = {
  code?: number;
  msg?: string;
  error?: { code?: number; message?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; thinkingTokenCount?: number };
  credits_consumed?: number;
};

function failure(code: number | undefined, message: string | undefined): string {
  if (code === 401 || code === 403) return "API key Kie.ai tidak valid atau tidak punya akses ke Gemini. Perbarui di Pengaturan → Integrasi → Kie AI.";
  if (code === 402) return "Saldo kredit Kie.ai habis. Isi ulang kredit di kie.ai lalu coba lagi.";
  if (code === 429) return "Terlalu banyak permintaan ke Kie.ai. Tunggu sebentar lalu coba lagi.";
  if (code === 455 || code === 503) return "Kie.ai sedang maintenance. Coba lagi beberapa saat lagi.";
  if (code === 500 || code === 502) return "Kie.ai sedang bermasalah (server exception). Coba lagi beberapa saat lagi.";
  return `Kie.ai menolak permintaan${code ? ` (${code})` : ""}${message ? `: ${message}` : ""}.`;
}

/** One non-streaming generateContent call that asks for a JSON answer. */
export async function generateGeminiJson(opts: {
  apiKey: string;
  system: string;
  parts: GeminiPart[];
  thinking?: "low" | "high";
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const model = KIE_GEMINI_MODEL;
  let res: Response;
  try {
    res = await fetch(`${KIE_GEMINI_URL}/${model}:streamGenerateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        stream: false,
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: opts.parts }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: opts.maxOutputTokens ?? 16000,
          thinkingConfig: { includeThoughts: false, thinkingLevel: opts.thinking ?? "high" },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, error: timeout ? "Kie.ai tidak menjawab dalam 5 menit. Coba lagi beberapa saat lagi." : "Gagal menghubungi Kie.ai. Periksa koneksi server dan coba lagi." };
  }
  const body = (await res.json().catch(() => null)) as GeminiBody | null;
  if (!body) return { ok: false, status: res.status, error: failure(res.status, `respons tidak valid (HTTP ${res.status})`) };
  const code = !res.ok ? res.status : body.code && body.code !== 200 ? body.code : body.error ? (body.error.code ?? 500) : undefined;
  if (code) return { ok: false, status: code, error: failure(code, body.msg ?? body.error?.message), credits: body.credits_consumed ?? null };

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  const usage = body.usageMetadata ?? {};
  const base = {
    promptTokens: usage.promptTokenCount ?? 0,
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? usage.thinkingTokenCount ?? 0),
    credits: body.credits_consumed ?? null,
  };
  if (body.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    return { ok: false, error: "Gemini menolak menganalisa konten ini (filter keamanan).", credits: base.credits };
  }
  if (!text) return { ok: false, error: "Gemini tidak mengembalikan jawaban. Coba jalankan ulang.", credits: base.credits };
  return { ok: true, text, finishReason: candidate?.finishReason ?? null, model, ...base };
}
