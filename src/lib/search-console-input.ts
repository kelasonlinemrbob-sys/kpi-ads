import { z } from "zod";
import { googleConnectionInput, mergeGoogleCredentials, type GoogleCredentials } from "./google-credentials";

export const searchConsoleInput = googleConnectionInput.omit({ customerId: true, loginCustomerId: true }).extend({
  siteUrl: z.string().trim().max(2048).default(""),
});
export type SearchConsoleCredentials = Pick<GoogleCredentials, "clientId" | "clientSecret" | "refreshToken">;
export function mergeSearchConsoleCredentials(input: z.infer<typeof searchConsoleInput>, current: SearchConsoleCredentials | null) {
  const { clientId, clientSecret, refreshToken } = mergeGoogleCredentials(
    { ...input, loginCustomerId: "", customerId: "0000000000" },
    current ? { ...current, loginCustomerId: "" } : null,
  );
  return { clientId, clientSecret, refreshToken };
}

export function searchConsoleToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function shiftSearchDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");
export function searchConsoleRange(input: { start?: string; end?: string }, today = searchConsoleToday()) {
  const end = shiftSearchDate(today, -3);
  const range = z.object({ start: date, end: date }).safeParse({ start: input.start ?? shiftSearchDate(end, -27), end: input.end ?? end });
  if (!range.success) throw new Error("Gunakan tanggal yang valid (YYYY-MM-DD).");
  if (range.data.start > range.data.end) throw new Error("Tanggal mulai harus sebelum atau sama dengan tanggal akhir.");
  if (range.data.end > today) throw new Error("Tanggal akhir tidak boleh di masa depan.");
  if (range.data.start < shiftSearchDate(today, -480)) throw new Error("Pilih rentang dalam 480 hari terakhir.");
  return range.data;
}

/**
 * Properties whose figures don't overlap: a domain property ("sc-domain:x.com") already counts every URL
 * property under it (https://x.com/, https://www.x.com/, https://blog.x.com/), so those are left out of a sum.
 */
export function withoutOverlaps(siteUrls: string[]) {
  const domains = siteUrls.filter((u) => u.startsWith("sc-domain:")).map((u) => u.slice("sc-domain:".length).toLowerCase());
  return siteUrls.filter((u) => {
    if (u.startsWith("sc-domain:")) {
      const d = u.slice("sc-domain:".length).toLowerCase();
      return !domains.some((other) => other !== d && d.endsWith(`.${other}`));
    }
    try {
      const host = new URL(u).hostname.toLowerCase();
      return !domains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return true;
    }
  });
}

/** The same number of days just before `range`, for comparisons. */
export function previousRange(range: { start: string; end: string }) {
  const days = Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1;
  return { start: shiftSearchDate(range.start, -days), end: shiftSearchDate(range.start, -1) };
}
