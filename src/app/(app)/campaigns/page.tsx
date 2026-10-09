import type { Metadata } from "next";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CirclePauseIcon,
  CirclePlayIcon,
  CoinsIcon,
  TargetIcon,
  TriangleAlertIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import {
  adAccounts,
  adCampaigns,
  campaigns,
  users,
} from "@/db/schema";
import { fetchCampaignPerformance } from "@/lib/campaign-performance";
import { CAMPAIGN_PERIODS, campaignPeriod, campaignMoney, emptyCampaignMetrics, totalCampaignMetrics, derivedCampaignMetrics } from "@/lib/campaign-metrics";
import { matchProduct } from "@/lib/ads-matching";
import { getMetaConnectionStatus } from "@/lib/meta-connection";
import { modelLabel } from "@/lib/ai-models";
import { getKieApiKey } from "@/lib/kie-connection";
import { KIE_GEMINI_MODEL } from "@/lib/kie-gemini";
import { adsScopeFor, visibleTo } from "@/lib/ads-scope";
import { requireUser } from "@/lib/auth";
import { getMembers } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/labels";
import { can } from "@/lib/roles";
import { formatRupiah } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { AdAccountsDialog } from "./ad-accounts-dialog";
import { AdCampaignsTable, TabLink, type AdCampaignRow } from "./ad-campaigns-table";
import { CampaignDialog } from "./campaign-dialog";
import { CampaignsTable } from "./campaigns-table";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can.viewCampaigns(user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const tab = sp.tab === "products" ? "products" : "ads";
  const status = sp.status && sp.status in CAMPAIGN_STATUS_LABEL ? (sp.status as keyof typeof CAMPAIGN_STATUS_LABEL) : null;
  // Advertisers see only their own products and campaigns; supervisors and web masters see the whole team.
  const scope = await adsScopeFor(user);
  const owner = scope ? user.id : sp.owner === "me" ? user.id : sp.owner ? Number(sp.owner) : null;
  const canEdit = can.editCampaigns(user.role);
  const period = campaignPeriod(sp.period, todayISO());
  const canRunAi = can.runAiAnalysis(user.role);

  const where: SQL[] = [];
  if (status) where.push(eq(campaigns.status, status));
  if (owner) where.push(eq(campaigns.ownerId, owner));

  const [productRows, advertisers, allProducts, accountRows, adCampaignRows, metaStatus, kieKey] = await Promise.all([
    db
      .select({ campaign: campaigns, ownerName: users.name, ownerAvatarId: users.avatarId })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(campaigns.status), desc(campaigns.updatedAt)),
    getMembers(false, true).then((m) => m.filter((x) => can.runAds(x.role))),
    db
      .select({ campaign: campaigns, ownerName: users.name, ownerAvatarId: users.avatarId })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId)),
    // An advertiser's campaigns come from the accounts they picked and those holding their products.
    db.select().from(adAccounts).where(scope ? inArray(adAccounts.id, [...scope.accountIds, 0]) : undefined).orderBy(asc(adAccounts.platform), asc(adAccounts.name)),
    db.select().from(adCampaigns).orderBy(asc(adCampaigns.status), asc(adCampaigns.name)),
    getMetaConnectionStatus(),
    tab === "ads" && canRunAi ? getKieApiKey() : null,
  ]);

  // Managing accounts (and linking products to them) stays limited to the advertiser's own accounts.
  const ownAccounts = scope ? accountRows.filter((a) => scope.ownAccountIds.has(a.id)) : accountRows;
  const accountOptions = ownAccounts.map(({ id, platform, name, accountId, lpvConversionAction }) => ({ id, platform, name, accountId, lpvConversionAction }));
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const productCount: Record<number, number> = {};
  for (const { campaign: c } of allProducts) if (c.adAccountId && (!scope || c.ownerId === user.id)) productCount[c.adAccountId] = (productCount[c.adAccountId] ?? 0) + 1;
  const accountPerformance = new Map(tab === "ads" ? await Promise.all(accountRows.filter((a) => a.platform === "meta" || a.platform === "google").map(async (a) =>
    [a.id, await fetchCampaignPerformance({ ...a, platform: a.platform as "meta" | "google" }, period.start, period.end)] as const)) : []);
  const performance = new Map([...accountPerformance].flatMap(([accountId, result]) => result.ok
    ? result.campaigns.map((c) => [`${accountId}:${c.id}`, c.metrics] as const) : []));
  // Accounts failing with the same message share one line, so an expired Google token is one warning, not one per account.
  const warningGroups = new Map<string, string[]>();
  for (const a of accountRows) {
    const result = accountPerformance.get(a.id);
    for (const message of !result ? [] : result.ok ? result.warnings : [result.error]) warningGroups.set(message, [...(warningGroups.get(message) ?? []), a.name]);
  }
  const performanceWarnings = [...warningGroups].map(([message, names]) => (names.length === 1 ? `${names[0]}: ${message}` : `${message} (${names.length} akun: ${names.join(", ")})`));

  // Same keyword matching as "Generate dari Ads", so this page and the daily reports always agree.
  const linkedProducts = allProducts
    .filter(({ campaign: c }) => c.adAccountId && c.matchKeyword?.trim())
    .map(({ campaign: c, ownerName }) => ({ ...c, keyword: c.matchKeyword!, ownerName }));
  const adRows: AdCampaignRow[] = adCampaignRows.flatMap((c) => {
    const account = accountById.get(c.adAccountId);
    if (!account) return [];
    const product = matchProduct(
      c.name,
      linkedProducts.filter((p) => p.adAccountId === c.adAccountId),
    );
    if (status && c.status !== status) return [];
    if (!visibleTo(scope, { adAccountId: c.adAccountId, ownerId: product?.ownerId ?? null })) return [];
    // An advertiser also keeps the unmapped campaigns of their own accounts, so they can map them.
    if (owner && product?.ownerId !== owner && !(scope && !product)) return [];
    const result = accountPerformance.get(c.adAccountId);
    const perf = result?.ok ? performance.get(`${c.adAccountId}:${c.externalId}`) ?? emptyCampaignMetrics(account.platform === "google" ? "google" : "meta", result.currency, result.lpvAvailable) : null;
    return [
      {
        id: c.id,
        name: c.name,
        platform: account.platform,
        accountName: account.name,
        status: c.status,
        platformStatus: c.platformStatus,
        objective: c.objective,
        currency: result?.ok ? result.currency : null,
        dailyBudget: c.dailyBudget,
        startDate: c.startDate,
        endDate: c.endDate,
        product: product ? { name: product.product?.trim() || product.name, keyword: product.keyword } : null,
        owner: product ? { name: product.ownerName } : null,
        performance: perf,
      },
    ];
  });

  const activeAds = adRows.filter((r) => r.status === "active");
  // Totals use the campaigns whose numbers loaded, so one failing account (e.g. an expired Google token)
  // doesn't blank the whole summary; the stat says how many were left out.
  const loadedRows = adRows.filter((r) => r.performance);
  const failedActive = activeAds.filter((r) => !r.performance).length;
  const failedHint = failedActive ? `Tanpa ${failedActive} campaign aktif yang gagal dimuat` : undefined;
  const totals = derivedCampaignMetrics(totalCampaignMetrics(loadedRows.map((r) => r.performance)));
  const lpvTotals = derivedCampaignMetrics(totalCampaignMetrics(loadedRows.filter((r) => r.performance!.landingPageViews !== null).map((r) => r.performance)));
  const budgeted = activeAds.filter((r) => r.dailyBudget !== null && r.currency);
  const budgetCurrencies = new Set(budgeted.map((r) => r.currency));
  const budgetCurrency = budgetCurrencies.size === 1 ? budgeted[0]?.currency ?? null : null;
  const budgetHint = activeAds.length > budgeted.length ? `${activeAds.length - budgeted.length} campaign aktif memakai budget ad set atau gagal dimuat` : undefined;
  // Only campaigns that ran in the period: old paused ones don't need a product to keep the reports right.
  const unmapped = adRows.filter((r) => !r.product && ((r.performance?.spent ?? 0) > 0 || r.status === "active")).length;
  const syncErrors = accountRows.filter((a) => a.lastSyncError);
  const lastSynced = accountRows.map((a) => a.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const products = productRows.map(({ campaign: c }) => c);
  const activeProducts = products.filter((c) => c.status === "active");
  const advertiserOptions = user.role === "supervisor" ? [...advertisers].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id)).map((a) => ({ id: a.id, name: a.id === user.id ? `${a.name} (Saya)` : a.name })) : null;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description={
          tab === "ads"
            ? `Campaign dari akun Meta / Google Ads, tersambung ke laporan harian advertiser.${
                lastSynced ? ` Terakhir sinkron ${lastSynced.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.` : ""
              }`
            : "Product yang dilaporkan advertiser setiap hari, beserta akun iklan dan kode product-nya."
        }
        actions={
          <>
            <UrlSelect
              param="status"
              label="Status"
              value={status ?? "all"}
              options={[{ value: "all", label: "All statuses" }, ...Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
            />
            {user.role === "supervisor" ? (
              <UrlSelect
                param="owner"
                label="Owner"
                value={owner ? String(owner) : "all"}
                options={[{ value: "all", label: "Semua pemilik" }, ...advertisers.map((a) => ({ value: String(a.id), label: a.id === user.id ? `${a.name} (Saya)` : a.name }))]}
              />
            ) : scope ? null : (
              <UrlSelect
                param="owner"
                label="Owner"
                value={owner ? "me" : "all"}
                options={[
                  { value: "all", label: "Semua" },
                  { value: "me", label: "Milik saya" },
                ]}
              />
            )}
            {canEdit && (
              <AdAccountsDialog
                accounts={accountOptions}
                productCount={productCount}
                deletableIds={ownAccounts
                  .filter((a) => user.role === "supervisor" || a.createdById === user.id)
                  .map((a) => a.id)}
                syncErrors={Object.fromEntries(syncErrors.filter((a) => ownAccounts.includes(a)).map((a) => [a.id, a.lastSyncError!]))}
                metaStatus={metaStatus}
              />
            )}
            {canEdit && tab === "ads" && <SyncButton disabled={accountRows.length === 0} />}
            {canEdit && <CampaignDialog advertisers={advertiserOptions} adAccounts={accountOptions} />}
          </>
        }
      />

      <div className="mb-3 inline-flex rounded-lg bg-muted p-1">
        <TabLink href={`/campaigns?period=${period.key}${owner ? `&owner=${owner}` : ""}${status ? `&status=${status}` : ""}`} active={tab === "ads"}>
          Campaign Ads <span className="text-xs text-muted-foreground">{adRows.length}</span>
        </TabLink>
        <TabLink href={`/campaigns?tab=products&period=${period.key}${owner ? `&owner=${owner}` : ""}${status ? `&status=${status}` : ""}`} active={tab === "products"}>
          Product <span className="text-xs text-muted-foreground">{products.length}</span>
        </TabLink>
      </div>

      {tab === "ads" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <UrlSelect param="period" label="Periode metrik" value={period.key} options={CAMPAIGN_PERIODS} />
            <span className="text-xs text-muted-foreground">{period.start} – {period.end} · Zona waktu akun iklan · Data langsung dari Ads</span>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniStat title="Campaign aktif" icon={CirclePlayIcon} value={String(activeAds.length)} />
            <MiniStat
              title="Budget harian aktif"
              icon={WalletIcon}
              value={campaignMoney(budgeted.length ? budgeted.reduce((sum, r) => sum + r.dailyBudget!, 0) : null, budgetCurrency)}
              hint={budgetHint}
            />
            <MiniStat title="Spend periode ini" icon={CoinsIcon} value={campaignMoney(totals.spent, totals.currency)} hint={failedHint} />
            <MiniStat title="CPLV periode ini" icon={TargetIcon} value={campaignMoney(lpvTotals.cplv, lpvTotals.currency)} hint={failedHint} />
          </div>
          {(unmapped > 0 || syncErrors.length > 0 || performanceWarnings.length > 0) && (
            <AdsWarnings
              errors={[
                ...performanceWarnings,
                // Sync errors with the same cause as a metrics error above add nothing new.
                ...syncErrors.filter((a) => !performanceWarnings.some((w) => w.includes(a.name))).map((a) => `${a.name} gagal disinkron — ${a.lastSyncError}`),
              ]}
              notice={unmapped > 0 ? `${unmapped} campaign aktif / tayang belum terpetakan ke product. Tambahkan kode product di nama campaign, atau isi kode product di tab Product.` : null}
              settingsHref={can.manageAdsConnection(user.role) ? "/settings?tab=integrasi" : null}
            />
          )}
          <AdCampaignsTable
            rows={adRows}
            period={period.key}
            ai={{ modelLabel: modelLabel(KIE_GEMINI_MODEL), canRun: canRunAi && kieKey !== null, needsKey: canRunAi && kieKey === null, canSetup: can.manageAdsConnection(user.role) }}
            emptyAction={
              canEdit && accountRows.length > 0 ? <SyncButton /> : null
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Metrik diambil langsung untuk periode terpilih, termasuk campaign yang belum terpetakan ke product. Data hari ini masih berjalan dan mengikuti atribusi platform.
            Angka 0 berarti tidak ada aktivitas/event yang dilaporkan; — berarti tidak tersedia atau pembagi nol.
            Reach dan frequency tidak ditotal antar-campaign. Rasio total dihitung dari jumlah metrik, bukan rata-rata rasio.
            Total tidak ditampilkan jika ada data yang gagal dimuat atau mata uang berbeda; metrik khusus Meta tidak tersedia untuk Google.
            Purchase/ROAS memerlukan pelacakan event dan nilai pembelian yang benar.
          </p>
        </>
      ) : (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <MiniStat title="Product aktif" icon={CirclePlayIcon} value={String(activeProducts.length)} />
            <MiniStat title="Budget harian aktif" icon={WalletIcon} value={formatRupiah(activeProducts.reduce((s, c) => s + c.dailyBudget, 0))} />
            <MiniStat
              title="Paused / draft"
              icon={CirclePauseIcon}
              value={String(products.filter((c) => c.status === "paused" || c.status === "draft").length)}
            />
          </div>
          <CampaignsTable
            rows={productRows.map(({ campaign: { createdAt: _c, updatedAt: _u, ...c }, ownerName, ownerAvatarId }) => ({ ...c, ownerName, ownerAvatarId }))}
            currentUser={{ id: user.id, role: user.role }}
            advertisers={advertiserOptions}
            adAccounts={accountOptions}
          />
        </>
      )}
    </>
  );
}

/** Problems with the ad accounts, folded to one line each and collapsed beyond the first two. */
function AdsWarnings({ errors, notice, settingsHref }: { errors: string[]; notice: string | null; settingsHref: string | null }) {
  const line = (text: string, tone: "destructive" | "warning") => (
    <p key={text} className="flex gap-2"><TriangleAlertIcon className={`mt-0.5 size-4 shrink-0 ${tone === "destructive" ? "text-destructive" : "text-warning"}`} /><span>{text}</span></p>
  );
  return (
    <div className="mb-3 grid gap-1.5 rounded-xl border bg-card p-3 text-sm text-muted-foreground" role="status">
      {errors.slice(0, 2).map((e) => line(e, "destructive"))}
      {errors.length > 2 && (
        <details className="group">
          <summary className="cursor-pointer pl-6 text-xs font-medium text-foreground">Lihat {errors.length - 2} peringatan lainnya</summary>
          <div className="mt-1.5 grid gap-1.5">{errors.slice(2).map((e) => line(e, "destructive"))}</div>
        </details>
      )}
      {notice && line(notice, "warning")}
      {errors.length > 0 && settingsHref && (
        <Link href={settingsHref} className="pl-6 text-xs font-medium text-foreground underline underline-offset-4">Periksa koneksi di Pengaturan → Integrasi</Link>
      )}
    </div>
  );
}

function MiniStat({ title, icon, value, hint }: { title: string; icon: LucideIcon; value: string; hint?: string }) {
  return (
    <Panel title={title} icon={icon}>
      <p className="truncate px-4 pt-3 text-lg font-medium tabular-nums sm:text-2xl" title={value}>{value}</p>
      <p className="truncate px-4 pb-3 text-[11px] text-muted-foreground" title={hint}>{hint ?? "\u00a0"}</p>
    </Panel>
  );
}
