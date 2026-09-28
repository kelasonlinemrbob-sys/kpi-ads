import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { dailyReports, kpiEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMetrics } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { addDays } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Submit Report" };

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  if (user.role === "supervisor") redirect("/reports");
  const today = todayISO();
  const minDate = addDays(today, -7);
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today && requested >= minDate ? requested : today;

  const metrics = (await getMetrics()).filter((m) => m.role === user.role);
  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)))
    .limit(1);
  const values = existing ? await db.select().from(kpiEntries).where(eq(kpiEntries.reportId, existing.id)) : [];

  return (
    <>
      <PageHeader
        title={existing ? "Edit Daily Report" : "Submit Daily Report"}
        description="Enter today's numbers and a short summary. Your KPI score updates as soon as you submit."
      />
      <ReportForm
        key={date}
        date={date}
        minDate={minDate}
        maxDate={today}
        metrics={metrics.map((m) => ({
          key: m.key,
          name: m.name,
          description: m.description,
          unit: m.unit,
          aggregation: m.aggregation,
          numeratorKey: m.numeratorKey,
          denominatorKey: m.denominatorKey,
          higherIsBetter: m.higherIsBetter,
          value: values.find((v) => v.metricId === m.id)?.value ?? null,
        }))}
        existing={
          existing
            ? {
                status: existing.status,
                summary: existing.summary,
                blockers: existing.blockers,
                planTomorrow: existing.planTomorrow,
                reviewNote: existing.reviewNote,
              }
            : null
        }
      />
    </>
  );
}
