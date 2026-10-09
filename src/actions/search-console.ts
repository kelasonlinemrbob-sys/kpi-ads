"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { disconnectSearchConsole, listSearchConsoleWebsiteChoices, saveSearchConsole, saveSearchConsoleWebsites, searchConsoleErrorMessage, seoReportFigures, toggleSearchConsoleWebsite, type SeoReportFigures } from "@/lib/search-console";
import type { FormState } from "./auth";
import { searchConsoleToday, shiftSearchDate } from "@/lib/search-console-input";

export async function saveSearchConsoleAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Koneksi Search Console hanya bisa diubah supervisor." };
  const result = await saveSearchConsole(Object.fromEntries(formData), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings"); revalidatePath("/seo");
  return { ok: true, message: `Search Console terhubung: ${result.siteUrl}.` };
}
export async function disconnectSearchConsoleAction() {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Koneksi Search Console hanya bisa diputus supervisor." };
  try {
    await disconnectSearchConsole(user.id);
    revalidatePath("/settings"); revalidatePath("/seo");
    return { ok: true };
  } catch (error) { return { error: searchConsoleErrorMessage(error) }; }
}

export async function listSearchConsoleWebsitesAction() {
  const user = await requireUser();
  try { return { ok: true as const, choices: await listSearchConsoleWebsiteChoices(user) }; }
  catch (error) { return { ok: false as const, error: searchConsoleErrorMessage(error) }; }
}
export async function saveSearchConsoleWebsitesAction(websites: string[]) {
  const user = await requireUser();
  try {
    const selected = await saveSearchConsoleWebsites(user, websites);
    revalidatePath("/settings"); revalidatePath("/seo");
    return { ok: true as const, count: selected.length };
  } catch (error) { return { ok: false as const, error: searchConsoleErrorMessage(error) }; }
}

/** Pick or release one website, saved right away. */
export async function toggleSearchConsoleWebsiteAction(siteUrl: string, pick: boolean) {
  const user = await requireUser();
  try {
    const selected = await toggleSearchConsoleWebsite(user, siteUrl, pick === true);
    revalidatePath("/settings"); revalidatePath("/seo");
    return { ok: true as const, count: selected.length };
  } catch (error) { return { ok: false as const, error: searchConsoleErrorMessage(error) }; }
}

/** "Ambil dari Search Console" on the daily SEO report. */
export async function seoReportFiguresAction(date: string): Promise<{ ok: true; figures: SeoReportFigures } | { ok: false; error: string; suggestDate?: string }> {
  const user = await requireUser();
  try { return { ok: true, figures: await seoReportFigures(user, String(date)) }; }
  catch (error) {
    // Before Google's day (Pacific time) reaches the report date, offer the latest date that has data.
    const latest = shiftSearchDate(searchConsoleToday(), -1);
    return { ok: false, error: searchConsoleErrorMessage(error), ...(String(date) > searchConsoleToday() ? { suggestDate: latest } : {}) };
  }
}
