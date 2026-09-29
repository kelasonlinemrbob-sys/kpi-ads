import type { Metadata } from "next";
import { and, asc, desc, eq, gte, max, sql, type SQL } from "drizzle-orm";
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
  advertiserReportItemCampaigns,
  advertiserReportItems,
  campaigns,
  users,
} from "@/db/schema";
import { matchProduct } from "@/lib/ads-matching";
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
  const monthStart = `${todayISO().slice(0, 7)}-01`;

  const where: SQL[] = [];
  if (status) where.push(eq(campaigns.status, status));
  if (owner) where.push(eq(campaigns.ownerId, owner));

  const [productRows, advertisers, allProducts, accountRows, adCampaignRows, performanceRows] = await Promise.all([
    db
      .select({ campaign: campaigns, ownerName: users.name })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(campaigns.status), desc(campaigns.updatedAt)),
    getMembers().then((m) => m.filter((x) => x.role === "advertiser")),
    db
      .select({ campaign: campaigns, ownerName: users.name })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId)),
    db.select().from(adAccounts).orderBy(asc(adAccounts.platform), asc(adAccounts.name)),
    db.select().from(adCampaigns).orderBy(asc(adCampaigns.status), asc(adCampaigns.name)),
    // Month-to-date numbers per platform campaign, from the breakdowns saved with advertiser reports.
    db
      .select({
        platform: advertiserReportItems.platform,
        externalId: advertiserReportItemCampaigns.externalId,
        spent: sql<number>`sum(${advertiserReportItemCampaigns.spent})`.mapWith(Number),
        leads: sql<number>`sum(${advertiserReportItemCampaigns.leads})`.mapWith(Number),
        clicks: sql<number>`sum(${advertiserReportItemCampaigns.clicks})`.mapWith(Number),
        lastDate: max(advertiserReportItems.performanceDate),
      })
      .from(advertiserReportItemCampaigns)
      .innerJoin(advertiserReportItems, eq(advertiserReportItems.id, advertiserReportItemCampaigns.itemId))
      .where(and(eq(advertiserReportItems.window, "previous_day"), gte(advertiserReportItems.performanceDate, monthStart)))
      .groupBy(advertiserReportItems.platform, advertiserReportItemCampaigns.externalId),
  ]);

  const accountOptions = accountRows.map(({ id, platform, name, accountId }) => ({ id, platform, name, accountId }));
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const productCount: Record<number, number> = {};
  for (const { campaign: c } of allProducts) if (c.adAccountId) productCount[c.adAccountId] = (productCount[c.adAccountId] ?? 0) + 1;
  const performance = new Map(performanceRows.map((p) => [`${p.platform}:${p.externalId}`, p]));

  // Same keyword matching as "Generate dari Ads", so this page and the daily reports always agree.
  const linkedProducts = allProducts
    .filter(({ campaign: c }) => c.adAccountId && c.matchKeyword?.trim())
    .map(({ campaign: c, ownerName }) => ({ ...c, keyword: c.matchKeyword!, ownerName }));
  const adRows: AdCampaignRow[] = adCampaignRows.flatMap((c) => {
    const account = accountById.get(c.adAccountId)!;
    const product = matchProduct(
      c.name,
      linkedProducts.filter((p) => p.adAccountId === c.adAccountId),
    );
    if (status && c.status !== status) return [];
    if (owner && product?.ownerId !== owner) return [];
    const perf = performance.get(`${account.platform}:${c.externalId}`);
    return [
      {
        id: c.id,
        name: c.name,
        platform: account.platform,
        accountName: account.name,
        status: c.status,
        platformStatus: c.platformStatus,
        dailyBudget: c.dailyBudget,
        startDate: c.startDate,
        endDate: c.endDate,
        product: product ? { name: product.product?.trim() || product.name, keyword: product.keyword } : null,
        owner: product ? { name: product.ownerName } : null,
        performance: perf?.lastDate ? { spent: perf.spent, leads: perf.leads, clicks: perf.clicks, lastDate: perf.lastDate } : null,
      },
    ];
  });

  const activeAds = adRows.filter((r) => r.status === "active");
  const mtdSpent = adRows.reduce((sum, r) => sum + (r.performance?.spent ?? 0), 0);
  const mtdLeads = adRows.reduce((sum, r) => sum + (r.performance?.leads ?? 0), 0);
  const unmapped = adRows.filter((r) => !r.product && r.status !== "ended").length;
  const syncErrors = accountRows.filter((a) => a.lastSyncError);
  const lastSynced = accountRows.map((a) => a.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const products = allProducts.map(({ campaign: c }) => c);
  const activeProducts = products.filter((c) => c.status === "active");
  const advertiserOptions = user.role === "supervisor" ? advertisers.map((a) => ({ id: a.id, name: a.name })) : null;

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
                options={[{ value: "all", label: "All advertisers" }, ...advertisers.map((a) => ({ value: String(a.id), label: a.name }))]}
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
              />
            )}
            {canEdit && tab === "ads" && <SyncButton disabled={accountRows.length === 0} />}
            {canEdit && tab === "products" && <CampaignDialog advertisers={advertiserOptions} adAccounts={accountOptions} />}
          </>
        }
      />

      <div className="mb-3 inline-flex rounded-lg bg-muted p-1">
        <TabLink href="/campaigns" active={tab === "ads"}>
          Campaign Ads <span className="text-xs text-muted-foreground">{adCampaignRows.length}</span>
        </TabLink>
        <TabLink href="/campaigns?tab=products" active={tab === "products"}>
          Product <span className="text-xs text-muted-foreground">{products.length}</span>
        </TabLink>
      </div>

      {tab === "ads" ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat title="Campaign aktif" icon={CirclePlayIcon} value={String(activeAds.length)} />
            <MiniStat
              title="Budget harian aktif"
              icon={WalletIcon}
              value={formatRupiah(activeAds.reduce((sum, r) => sum + (r.dailyBudget ?? 0), 0))}
            />
            <MiniStat title="Spend bulan ini" icon={CoinsIcon} value={formatRupiah(mtdSpent)} />
            <MiniStat title="CPR bulan ini" icon={TargetIcon} value={mtdLeads ? formatRupiah(mtdSpent / mtdLeads) : "—"} />
          </div>
          {(unmapped > 0 || syncErrors.length > 0) && (
            <div className="mb-3 grid gap-1 text-sm text-muted-foreground">
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
            Spend, lead dan CPR bulan ini dihitung dari laporan harian (periode kemarin) yang di-generate dari Ads.
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
            rows={productRows.map(({ campaign: { createdAt: _c, updatedAt: _u, ...c }, ownerName }) => ({ ...c, ownerName }))}
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
