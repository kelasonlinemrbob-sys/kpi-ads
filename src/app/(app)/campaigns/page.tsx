import type { Metadata } from "next";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CirclePauseIcon, CirclePlayIcon, WalletIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { campaigns, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMembers } from "@/lib/data";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/labels";
import { can } from "@/lib/roles";
import { formatRupiah } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { CampaignDialog } from "./campaign-dialog";
import { CampaignsTable } from "./campaigns-table";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can.viewCampaigns(user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const status = sp.status && sp.status in CAMPAIGN_STATUS_LABEL ? (sp.status as keyof typeof CAMPAIGN_STATUS_LABEL) : null;
  const owner = sp.owner === "me" ? user.id : sp.owner ? Number(sp.owner) : null;

  const where: SQL[] = [];
  if (status) where.push(eq(campaigns.status, status));
  if (owner) where.push(eq(campaigns.ownerId, owner));

  const [rows, advertisers, all] = await Promise.all([
    db
      .select({ campaign: campaigns, ownerName: users.name })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(campaigns.status), desc(campaigns.updatedAt)),
    getMembers().then((m) => m.filter((x) => x.role === "advertiser")),
    db.select({ status: campaigns.status, budget: campaigns.dailyBudget }).from(campaigns),
  ]);
  const active = all.filter((c) => c.status === "active");
  const canEdit = can.editCampaigns(user.role);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Every running ad campaign, who owns it and how much it spends per day."
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
                  { value: "all", label: "All campaigns" },
                  { value: "me", label: "My campaigns" },
                ]}
              />
            )}
            {canEdit && <CampaignDialog advertisers={user.role === "supervisor" ? advertisers.map((a) => ({ id: a.id, name: a.name })) : null} />}
          </>
        }
      />
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <MiniStat title="Active campaigns" icon={CirclePlayIcon} value={String(active.length)} />
        <MiniStat title="Active daily budget" icon={WalletIcon} value={formatRupiah(active.reduce((s, c) => s + c.budget, 0))} />
        <MiniStat title="Paused / draft" icon={CirclePauseIcon} value={String(all.filter((c) => c.status === "paused" || c.status === "draft").length)} />
      </div>
      <CampaignsTable
        rows={rows.map(({ campaign: { createdAt: _c, updatedAt: _u, ...c }, ownerName }) => ({ ...c, ownerName }))}
        currentUser={{ id: user.id, role: user.role }}
        advertisers={user.role === "supervisor" ? advertisers.map((a) => ({ id: a.id, name: a.name })) : null}
      />
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
