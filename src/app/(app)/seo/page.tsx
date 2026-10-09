import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, canViewSeo, homePath } from "@/lib/roles";
import { loadSearchConsoleReport, searchConsoleErrorMessage } from "@/lib/search-console";
import { searchConsoleRange, searchConsoleToday, shiftSearchDate as shift } from "@/lib/search-console-input";
import { modelLabel } from "@/lib/ai-models";
import { getKieApiKey } from "@/lib/kie-connection";
import { KIE_GEMINI_MODEL } from "@/lib/kie-gemini";
import { cn } from "@/lib/utils";
import { SeoDashboard } from "./seo-dashboard";
import { isSeoTab } from "./seo-tabs";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Performa SEO" };
const PRESETS = [7, 28, 90, 180] as const;
const settings = "/settings?tab=integrasi&service=search-console";

export default async function SeoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!canViewSeo(user)) redirect(homePath(user.role));
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  let range = searchConsoleRange({});
  let error: string | null = null;
  try { range = searchConsoleRange({ start: value("start"), end: value("end") }); }
  catch (cause) { error = (cause as Error).message; }
  let data: Awaited<ReturnType<typeof loadSearchConsoleReport>> = null;
  const [loaded, kieKey] = await Promise.all([
    error ? Promise.resolve(null) : loadSearchConsoleReport(user, value("site"), range).catch((cause) => { error = searchConsoleErrorMessage(cause); return null; }),
    getKieApiKey(),
  ]);
  data = loaded;
  // Quick ranges end where the default does (3 days ago: Google's final data lags).
  const defaultEnd = searchConsoleRange({}).end;
  const preset = (days: number) => ({ start: shift(defaultEnd, -(days - 1)), end: defaultEnd });
  const rawTab = value("tab");
  const tab = isSeoTab(rawTab) ? rawTab : undefined;
  const presetHref = (days: number) => `/seo?${new URLSearchParams({ ...(data?.siteUrl ? { site: data.siteUrl } : {}), ...preset(days), ...(tab ? { tab } : {}) })}`;
  const activePreset = PRESETS.find((d) => range.end === defaultEnd && range.start === preset(d).start);
  return <>
    <PageHeader title="Performa SEO" description="Klik dan visibilitas organik website di Google Search." actions={<Link href={settings} className="text-sm font-medium underline underline-offset-4">{user.role === "supervisor" ? "Pengaturan Search Console" : "Pilih website saya"}</Link>} />
    <div className="grid gap-4">
      {error ? <Panel title="Data belum dapat dimuat" bodyClassName="grid gap-3 p-5"><p role="alert" className="text-sm text-destructive">{error}</p><Link href="/seo" className="text-sm underline">Coba lagi dengan properti dan periode default</Link><Link href={settings} className="text-sm underline">{user.role === "supervisor" ? "Periksa koneksi Search Console" : "Kelola pilihan website"}</Link></Panel> : !data ? <Panel><EmptyState icon={SearchIcon} title="Hubungkan Google Search Console" description={user.role === "supervisor" ? "Tambahkan koneksi Google untuk membaca performa website dan kata kunci tim." : "Minta supervisor menghubungkan properti website di Pengaturan → Integrasi → Google Search Console."} action={<Link href={settings} className="text-sm underline">Buka pengaturan integrasi</Link>} /></Panel> : !data.report ? <Panel><EmptyState icon={SearchIcon} title="Pilih website Anda" description="Koneksi Search Console tim sudah tersedia. Pilih website yang Anda kelola untuk melihat performa SEO." action={<Link href={settings} className="text-sm underline">Pilih website saya</Link>} /></Panel> : <>
        <form action="/seo" method="get" className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid min-w-0 gap-1.5"><Label htmlFor="seo-site">Properti website</Label><select id="seo-site" name="site" defaultValue={data.siteUrl ?? undefined} className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm">{data.sites.map((site) => <option key={site.siteUrl} value={site.siteUrl}>{site.siteUrl.replace(/^sc-domain:/, "Domain: ")}</option>)}</select></div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5"><Label htmlFor="seo-start">Mulai</Label><Input id="seo-start" type="date" name="start" defaultValue={range.start} max={searchConsoleToday()} required className="w-40" /></div>
            <div className="grid gap-1.5"><Label htmlFor="seo-end">Sampai</Label><Input id="seo-end" type="date" name="end" defaultValue={range.end} max={searchConsoleToday()} required className="w-40" /></div>
            <input type="hidden" name="tab" value={tab ?? "overview"} data-seo-tab />
            <Button type="submit">Tampilkan</Button>
          </div>
          <nav aria-label="Rentang cepat" className="flex flex-wrap gap-1.5 lg:col-span-2">
            {PRESETS.map((d) => <a key={d} data-seo-tab-link href={presetHref(d)} aria-current={activePreset === d ? "true" : undefined} className={cn("rounded-full border px-3 py-1 text-xs", activePreset === d ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{d} hari terakhir</a>)}
          </nav>
        </form>
        {data.report.total
          ? <SeoDashboard initialTab={tab} siteUrl={data.siteUrl!} range={range} report={data.report} ai={{ modelLabel: modelLabel(KIE_GEMINI_MODEL), canRun: kieKey !== null, needsKey: kieKey === null, canSetup: can.manageAdsConnection(user.role) }} />
          : <Panel><EmptyState icon={SearchIcon} title="Belum ada data pencarian" description="Properti terhubung, tetapi Google belum mengembalikan data final untuk rentang ini. Coba rentang tanggal lain." /></Panel>}
      </>}
    </div>
  </>;
}
