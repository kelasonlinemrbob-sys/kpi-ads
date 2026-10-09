"use server";

import { after } from "next/server";
import { z } from "zod";
import { buildSeoAnalysisInput, runSeoAnalysis } from "@/lib/ai-seo-analysis";
import { createSeoAnalysis, DAILY_ANALYSIS_LIMIT, finishSeoAnalysis, getLatestSeoAnalysis, getSeoAnalysis, seoFilterKey, seoSiteOf, seoUsage, type SeoAnalysisView } from "@/lib/ai-analysis-data";
import { requireUser } from "@/lib/auth";
import { getKieApiKey, KIE_KEY_MISSING } from "@/lib/kie-connection";
import { canViewSeo } from "@/lib/roles";
import { loadSearchConsoleReport, searchConsoleErrorMessage, viewerCanSeeSite } from "@/lib/search-console";
import { searchConsoleRange } from "@/lib/search-console-input";
import { KeywordPlannerError, keywordIdeas, keywordVolumes } from "@/lib/keyword-planner";
import { defaultSeeds } from "@/lib/keyword-planner-data";

type Result = { ok: true; analysis: SeoAnalysisView | null } | { ok: false; error: string };
const ref = z.object({ site: z.string().min(1).max(2048), start: z.string().max(10), end: z.string().max(10) });

/** Gemini reads the property's Search Console figures (computed here, never sent by the browser) and writes the evaluation. */
export async function startSeoAnalysisAction(input: z.input<typeof ref>): Promise<Result> {
  const user = await requireUser();
  if (!canViewSeo(user)) return { ok: false, error: "Kamu tidak punya akses ke Performa SEO." };
  const parsed = ref.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Website atau periode tidak valid." };
  let range;
  try { range = searchConsoleRange(parsed.data); } catch (error) { return { ok: false, error: (error as Error).message }; }

  const apiKey = await getKieApiKey();
  if (!apiKey) return { ok: false, error: KIE_KEY_MISSING };
  const filterKey = seoFilterKey(parsed.data.site, range);
  const latest = await getLatestSeoAnalysis(filterKey);
  if (latest?.status === "running" && (await viewerCanSeeSite(user, parsed.data.site))) return { ok: true, analysis: latest };
  const usage = await seoUsage(user.id);
  if (usage.running) return { ok: false, error: "Analisa SEO lain masih berjalan. Tunggu sampai selesai, lalu coba lagi." };
  if (usage.recent >= DAILY_ANALYSIS_LIMIT) return { ok: false, error: `Batas ${DAILY_ANALYSIS_LIMIT} analisa per 24 jam sudah tercapai.` };

  let data;
  try { data = await loadSearchConsoleReport(user, parsed.data.site, range); } catch (error) { return { ok: false, error: searchConsoleErrorMessage(error) }; }
  if (!data?.report || data.siteUrl !== parsed.data.site) return { ok: false, error: "Website tidak tersedia untuk akun ini." };
  if (!data.report.total) return { ok: false, error: "Belum ada data pencarian pada periode ini untuk dianalisa." };

  // Keyword Planner volumes and ideas when the Google Ads API access allows it; otherwise a note for the AI.
  const report = data.report;
  const planner = await Promise.all([
    keywordVolumes({ keywords: report.queries.slice(0, 50).map((q) => q.keys?.[0] ?? ""), language: "id", location: "id" }),
    keywordIdeas({ seeds: defaultSeeds(report.queries, 5), url: null, language: "id", location: "id" }, 150),
  ]).then(([v, i]) => ({ volumes: v.keywords, ideas: i.keywords }), (error) => ({ error: error instanceof KeywordPlannerError ? error.message : "Keyword Planner gagal dimuat." }));
  const analysisInput = buildSeoAnalysisInput(data.siteUrl, range, report, planner);
  const analysis = await createSeoAnalysis(user.id, filterKey, analysisInput);
  // Gemini can outlast the proxy timeouts in front of the app, so it runs after the response and the page polls.
  after(async () => {
    try {
      await finishSeoAnalysis(analysis.id, await runSeoAnalysis(apiKey, analysisInput));
    } catch (error) {
      await finishSeoAnalysis(analysis.id, { ok: false, error: error instanceof Error ? error.message : "Analisa gagal." }).catch(() => {});
    }
  });
  return { ok: true, analysis };
}

const lookup = z.union([z.object({ analysisId: z.coerce.number().int().positive() }), ref]);

/** By id while polling a run, else the latest analysis of the property and period. */
export async function getSeoAnalysisAction(input: z.input<typeof lookup>): Promise<Result> {
  const user = await requireUser();
  if (!canViewSeo(user)) return { ok: false, error: "Kamu tidak punya akses ke Performa SEO." };
  const parsed = lookup.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Analisa tidak ditemukan." };
  if ("analysisId" in parsed.data) {
    const found = await getSeoAnalysis(parsed.data.analysisId);
    return { ok: true, analysis: found && (await viewerCanSeeSite(user, seoSiteOf(found.filterKey))) ? found.view : null };
  }
  let range;
  try { range = searchConsoleRange(parsed.data); } catch { return { ok: false, error: "Periode tidak valid." }; }
  if (!(await viewerCanSeeSite(user, parsed.data.site))) return { ok: true, analysis: null };
  return { ok: true, analysis: await getLatestSeoAnalysis(seoFilterKey(parsed.data.site, range)) };
}
