import type { Metadata } from "next";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
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
  const owner = sp.owner === "me" ? user.id : sp.owner ? Number(sp.owner) : null;
  const canEdit = can.editCampaigns(user.role);
  const period = campaignPeriod(sp.period, todayISO());

  const where: SQL[] = [];
  if (status) where.push(eq(campaigns.status, status));
  if (owner) where.push(eq(campaigns.ownerId, owner));

  const [productRows, advertisers, allProducts, accountRows, adCampaignRows, metaStatus] = await Promise.all([
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
    db.select().from(adAccounts).where(user.role === "advertiser" ? eq(adAccounts.createdById, user.id) : undefined).orderBy(asc(adAccounts.platform), asc(adAccounts.name)),
    db.select().from(adCampaigns).orderBy(asc(adCampaigns.status), asc(adCampaigns.name)),
    getMetaConnectionStatus(user.id),
  ]);

  const accountOptions = accountRows.map(({ id, platform, name, accountId, lpvConversionAction }) => ({ id, platform, name, accountId, lpvConversionAction }));
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const productCount: Record<number, number> = {};
  for (const { campaign: c } of allProducts) if (c.adAccountId) productCount[c.adAccountId] = (productCount[c.adAccountId] ?? 0) + 1;
  const accountPerformance = new Map(tab === "ads" ? await Promise.all(accountRows.filter((a) => a.platform === "meta" || a.platform === "google").map(async (a) =>
    [a.id, await fetchCampaignPerformance({ ...a, platform: a.platform as "meta" | "google" }, period.start, period.end)] as const)) : []);
  const performance = new Map([...accountPerformance].flatMap(([accountId, result]) => result.ok
    ? result.campaigns.map((c) => [`${accountId}:${c.id}`, c.metrics] as const) : []));
  const performanceWarnings = accountRows.flatMap((a) => {
    const result = accountPerformance.get(a.id);
    return !result ? [] : result.ok ? result.warnings.map((warning) => `${a.name}: ${warning}`) : [`${a.name}: ${result.error}`];
  });

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
    if (owner && product?.ownerId !== owner) return [];
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
  const totals = derivedCampaignMetrics(totalCampaignMetrics(adRows.map((r) => r.performance)));
  const budgetCurrencies = new Set(activeAds.map((r) => r.currency));
  const budgetCurrency = budgetCurrencies.size === 1 ? activeAds[0]?.currency ?? null : null;
  const unmapped = adRows.filter((r) => !r.product && r.status !== "ended").length;
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
            ) : (
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
                deletableIds={accountRows
                  .filter((a) => user.role === "supervisor" || a.createdById === user.id)
                  .map((a) => a.id)}
                syncErrors={Object.fromEntries(syncErrors.map((a) => [a.id, a.lastSyncError!]))}
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
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat title="Campaign aktif" icon={CirclePlayIcon} value={String(activeAds.length)} />
            <MiniStat
              title="Budget harian aktif"
              icon={WalletIcon}
              value={campaignMoney(activeAds.every((r) => r.dailyBudget !== null) ? activeAds.reduce((sum, r) => sum + r.dailyBudget!, 0) : null, budgetCurrency)}
            />
            <MiniStat title="Spend periode ini" icon={CoinsIcon} value={campaignMoney(totals.spent, totals.currency)} />
            <MiniStat title="CPLV periode ini" icon={TargetIcon} value={campaignMoney(totals.cplv, totals.currency)} />
          </div>
          {(unmapped > 0 || syncErrors.length > 0 || performanceWarnings.length > 0) && (
            <div className="mb-3 grid gap-1 text-sm text-muted-foreground">
              {performanceWarnings.map((warning) => <p key={warning} className="flex gap-2 text-destructive" role="status"><TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /><span>{warning}</span></p>)}
              {syncErrors.map((a) => (
                <p key={a.id} className="flex gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium text-foreground">{a.name}</span> gagal disinkron — {a.lastSyncError}
                  </span>
                </p>
              ))}
              {unmapped > 0 && (
                <p className="flex gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    {unmapped} campaign belum terpetakan ke product. Tambahkan kode product di nama campaign, atau isi kode
                    product di tab Product.
                  </span>
                </p>
              )}
            </div>
          )}
          <AdCampaignsTable
            rows={adRows}
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

function MiniStat({ title, icon, value }: { title: string; icon: LucideIcon; value: string }) {
  return (
    <Panel title={title} icon={icon}>
      <p className="px-4 py-3 text-2xl font-medium tabular-nums">{value}</p>
    </Panel>
  );
}
