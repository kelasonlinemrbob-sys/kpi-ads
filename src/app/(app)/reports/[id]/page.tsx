import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";
import { ArrowLeftIcon, CalculatorIcon, CircleCheckIcon, ClipboardListIcon, MessageCircleIcon, PencilIcon, ShieldCheckIcon } from "lucide-react";
import { db } from "@/db";
import { advertiserReportItems, dailyReports, kpiEntries, users, waOutbox, waSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getItemCampaigns, getMetrics } from "@/lib/data";
import { aggregate, todayISO, type Entry } from "@/lib/kpi";
import { memberRoles, needsReview } from "@/lib/member-roles";
import { ROLE_LABEL } from "@/lib/roles";
import { addDays, cn, formatDate, formatValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { ReportStatus } from "@/components/report-status";
import { UserAvatar } from "@/components/user-avatar";
import { AdvertiserReportDetail } from "./advertiser-report-detail";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Report" };

const reviewer = alias(users, "reviewer");

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [row] = await db
    .select({ report: dailyReports, member: { id: users.id, name: users.name, role: users.role, secondaryRole: users.secondaryRole, title: users.title }, reviewerName: reviewer.name })
    .from(dailyReports)
    .innerJoin(users, eq(users.id, dailyReports.userId))
    .leftJoin(reviewer, eq(reviewer.id, dailyReports.reviewerId))
    .where(eq(dailyReports.id, id))
    .limit(1);
  if (!row || (user.role !== "supervisor" && row.report.userId !== user.id)) notFound();
  const { report, member } = row;

  const [metrics, entries, advertiserItems, [waMessage]] = await Promise.all([
    getMetrics(),
    db.select().from(kpiEntries).where(eq(kpiEntries.reportId, id)),
    db.select().from(advertiserReportItems).where(eq(advertiserReportItems.reportId, id)),
    db
      .select({ status: waOutbox.status, error: waOutbox.error, groupName: waSessions.groupName })
      .from(waOutbox)
      .leftJoin(waSessions, eq(waSessions.userId, waOutbox.userId))
      .where(eq(waOutbox.reportId, id))
      .orderBy(desc(waOutbox.createdAt))
      .limit(1),
  ]);
  const itemCampaigns = await getItemCampaigns(advertiserItems.map((item) => item.id));
  const roles = memberRoles(member);
  // Roles reported as plain KPI numbers (an advertiser's part is the product table instead).
  const numberRoles = roles.filter((r) => r !== "advertiser" || advertiserItems.length === 0);
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const asEntries: Entry[] = entries.map((e) => ({ userId: e.userId, metricId: e.metricId, date: e.date, value: e.value }));
  const requiresReview = needsReview(member);
  const canEdit = user.id === report.userId && (!requiresReview || report.status !== "approved") && report.date >= addDays(todayISO(), -7);

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Back to reports
      </Link>
      <PageHeader
        title={formatDate(report.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ReportStatus status={report.status} noReview={!requiresReview} />
            <span>· Submitted {report.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </span>
        }
        actions={
          canEdit && (
            <Button asChild variant="outline" className="h-8">
              <Link href={`/reports/new?date=${report.date}`}>
                <PencilIcon /> Edit report
              </Link>
            </Button>
          )
        }
      />

      {waMessage && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageCircleIcon
            className={cn(
              "size-4",
              waMessage.status === "sent" ? "text-success" : waMessage.status === "failed" ? "text-destructive" : "text-warning",
            )}
          />
          WhatsApp{waMessage.groupName ? ` ke ${waMessage.groupName}` : ""}:{" "}
          {waMessage.status === "sent" ? "terkirim" : waMessage.status === "failed" ? `gagal — ${waMessage.error}` : "menunggu dikirim"}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-3">
          {roles.includes("advertiser") && advertiserItems.length > 0 && (
            <AdvertiserReportDetail
              reportDate={report.date}
              items={advertiserItems.map((item) => ({ ...item, campaigns: itemCampaigns.get(item.id) ?? [] }))}
            />
          )}
          {numberRoles.map((role) => (
            <Panel
              key={role}
              title={roles.length > 1 ? `Angka KPI ${ROLE_LABEL[role]}` : "Reported Numbers"}
              icon={CalculatorIcon}
              iconPosition="left"
            >
              <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 [&>div]:border-border">
                {metrics
                  .filter((m) => m.role === role)
                  .map((m) => {
                    const v = aggregate(m, asEntries, byKey);
                    return (
                      <div key={m.id} className="p-4">
                        <dt className="text-sm text-muted-foreground">{m.name}</dt>
                        <dd className="mt-1.5 text-2xl font-medium tabular-nums">{v === null ? "–" : formatValue(v, m.unit)}</dd>
                      </div>
                    );
                  })}
              </dl>
            </Panel>
          ))}
          <Panel
            title={advertiserItems.length > 0 ? "Catatan" : "Activity Summary"}
            icon={ClipboardListIcon}
            iconPosition="left"
            bodyClassName="grid gap-4 p-4 text-sm"
          >
            <Section label={advertiserItems.length > 0 ? "Catatan laporan" : "What was done"}>{report.summary}</Section>
            {(advertiserItems.length === 0 || report.blockers || report.planTomorrow) && (
              <>
                <Section label="Blockers">{report.blockers}</Section>
                <Section label="Plan for tomorrow">{report.planTomorrow}</Section>
              </>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-3">
          <Panel title="Member">
            <div className="flex items-center gap-3 p-4">
              <UserAvatar name={member.name} className="size-11" />
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.title ?? ROLE_LABEL[member.role]}</p>
              </div>
            </div>
            {user.role === "supervisor" && (
              <div className="flex gap-2 border-t p-3">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/scorecard?user=${member.id}`}>Scorecard</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/reports?user=${member.id}`}>All reports</Link>
                </Button>
              </div>
            )}
          </Panel>
          {requiresReview ? (
            <Panel title="Review" icon={ShieldCheckIcon} bodyClassName="p-4">
              {report.reviewedAt && (
                <div className="mb-3 text-sm">
                  <ReportStatus status={report.status} />
                  <p className="mt-1 text-muted-foreground">
                    by {row.reviewerName ?? "—"} ·{" "}
                    {report.reviewedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {report.reviewNote && <p className="mt-3 rounded-lg bg-muted/60 p-3">“{report.reviewNote}”</p>}
                </div>
              )}
              {user.role === "supervisor" ? (
                <ReviewForm reportId={report.id} status={report.status} />
              ) : (
                !report.reviewedAt && <p className="text-sm text-muted-foreground">Waiting for your supervisor to review this report.</p>
              )}
            </Panel>
          ) : (
            <Panel title="Status laporan" icon={CircleCheckIcon} bodyClassName="p-4">
              <div className="flex gap-3 text-sm">
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="text-muted-foreground">
                  Laporan advertiser langsung tercatat setelah dikirim dan tidak memerlukan approval admin.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line">{children || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
