"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { KeywordPlannerError, keywordIdeas, keywordVolumes, PLANNER_LANGUAGES, PLANNER_LOCATIONS, type PlannerResult } from "@/lib/keyword-planner";
import { canViewSeo } from "@/lib/roles";
import { viewerCanSeeSite } from "@/lib/search-console";

type Result = { ok: true; data: PlannerResult } | { ok: false; error: string };

const options = {
  site: z.string().min(1).max(2048),
  language: z.enum(Object.keys(PLANNER_LANGUAGES) as [keyof typeof PLANNER_LANGUAGES]).default("id"),
  location: z.enum(Object.keys(PLANNER_LOCATIONS) as [keyof typeof PLANNER_LOCATIONS]).default("id"),
};
const keyword = z.string().max(80);

/** A page of the property itself: "https://x.com/" covers its paths, "sc-domain:x.com" any host under x.com. */
function belongsToSite(url: string, site: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (site.startsWith("sc-domain:")) {
      const domain = site.slice("sc-domain:".length).toLowerCase();
      return u.hostname === domain || u.hostname.endsWith(`.${domain}`);
    }
    return url.startsWith(site);
  } catch {
    return false;
  }
}

async function authorize(site: string) {
  const user = await requireUser();
  if (!canViewSeo(user)) return "Kamu tidak punya akses ke Performa SEO.";
  if (!(await viewerCanSeeSite(user, site))) return "Website ini belum Anda pilih.";
  return null;
}
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof KeywordPlannerError ? error.message : "Keyword Planner belum dapat diproses. Coba lagi nanti." });

/** Keyword ideas (Google Keyword Planner) from seed keywords and/or a page of the property. */
export async function keywordIdeasAction(input: { site: string; seeds: string[]; url?: string | null; language?: string; location?: string }): Promise<Result> {
  const parsed = z.object({ ...options, seeds: z.array(keyword).max(20), url: z.string().max(2048).nullish() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Isian riset kata kunci tidak valid (maks. 20 kata kunci awal)." };
  const denied = await authorize(parsed.data.site);
  if (denied) return { ok: false, error: denied };
  if (parsed.data.url && !belongsToSite(parsed.data.url, parsed.data.site)) return { ok: false, error: "Halaman sumber harus bagian dari website ini." };
  try {
    return { ok: true, data: await keywordIdeas({ seeds: parsed.data.seeds, url: parsed.data.url, language: parsed.data.language, location: parsed.data.location }) };
  } catch (error) {
    return fail(error);
  }
}

/** Monthly search volume of keywords the property already shows for (Search Console queries). */
export async function keywordVolumesAction(input: { site: string; keywords: string[]; language?: string; location?: string }): Promise<Result> {
  const parsed = z.object({ ...options, keywords: z.array(keyword).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Daftar kata kunci tidak valid." };
  const denied = await authorize(parsed.data.site);
  if (denied) return { ok: false, error: denied };
  try {
    return { ok: true, data: await keywordVolumes({ keywords: parsed.data.keywords, language: parsed.data.language, location: parsed.data.location }) };
  } catch (error) {
    return fail(error);
  }
}
