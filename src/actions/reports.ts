"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { dailyReports, kpiEntries, kpiMetrics, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { todayISO } from "@/lib/kpi";
import { addDays, formatDate } from "@/lib/utils";
import { saveAdvertiserReport } from "./advertiser-report";
import type { FormState } from "./auth";

/** How far back a member may submit or edit a missed report. */
const BACKFILL_DAYS = 7;

const reportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  summary: z.string().trim().min(10, "Describe what you worked on (min. 10 characters)").max(4000),
  blockers: z.string().trim().max(2000).optional(),
  planTomorrow: z.string().trim().max(2000).optional(),
});

export async function saveReport(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role === "supervisor") return { error: "Supervisors don't submit daily reports." };
  if (user.role === "advertiser") return saveAdvertiserReport(user, formData);

  const parsed = reportSchema.safeParse({
    date: formData.get("date"),
    summary: formData.get("summary"),
    blockers: formData.get("blockers") || undefined,
    planTomorrow: formData.get("planTomorrow") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { date, summary, blockers, planTomorrow } = parsed.data;

  const today = todayISO();
  if (date > today) return { error: "You can't report for a future date." };
  if (date < addDays(today, -BACKFILL_DAYS)) return { error: `Reports can only be backfilled up to ${BACKFILL_DAYS} days.` };

  const metrics = (await db.select().from(kpiMetrics).where(eq(kpiMetrics.role, user.role))).filter(
    (m) => m.aggregation !== "ratio",
  );
  const values: { metricId: number; value: number }[] = [];
  for (const m of metrics) {
    const raw = String(formData.get(`metric_${m.key}`) ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
    if (raw === "") return { error: `${m.name} is required (enter 0 if none).` };
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return { error: `${m.name} must be a positive number.` };
    if (m.unit === "percent" && value > 100) return { error: `${m.name} can't exceed 100%.` };
    values.push({ metricId: m.id, value });
  }

  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)))
    .limit(1);
  if (existing?.status === "approved") return { error: "This report is already approved and can't be edited." };

  const reportId = await db.transaction(async (tx) => {
    let id: number;
    if (existing) {
      await tx
        .update(dailyReports)
        .set({
          summary,
          blockers,
          planTomorrow,
          status: "submitted",
          reviewerId: null,
          reviewNote: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(dailyReports.id, existing.id));
      id = existing.id;
    } else {
      const [row] = await tx
        .insert(dailyReports)
        .values({ userId: user.id, date, summary, blockers, planTomorrow })
        .returning({ id: dailyReports.id });
      id = row!.id;
    }
    await tx.delete(kpiEntries).where(eq(kpiEntries.reportId, id));
    if (values.length) {
      await tx.insert(kpiEntries).values(values.map((v) => ({ ...v, reportId: id, userId: user.id, date })));
    }
    return id;
  });

  await logActivity({
    actorId: user.id,
    subjectUserId: user.id,
    type: "report_submitted",
    title: existing ? "Daily Report Updated" : "Daily Report Submitted",
    description: `${user.name} ${existing ? "updated" : "submitted"} the report for ${formatDate(date, { day: "2-digit", month: "short" })}`,
    href: `/reports/${reportId}`,
  });

  revalidatePath("/", "layout");
  redirect(`/reports/${reportId}?saved=1`);
}

const reviewSchema = z.object({
  reportId: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "revision"]),
  note: z.string().trim().max(2000).optional(),
});

export async function reviewReport(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Only supervisors can review reports." };
  const parsed = reviewSchema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { reportId, decision, note } = parsed.data;
  if (decision === "revision" && !note) return { error: "Tell the member what needs to be revised." };

  const [target] = await db
    .select({ role: users.role })
    .from(dailyReports)
    .innerJoin(users, eq(users.id, dailyReports.userId))
    .where(eq(dailyReports.id, reportId))
    .limit(1);
  if (!target) return { error: "Report not found." };
  if (target.role === "advertiser") {
    return { error: "Laporan advertiser langsung tercatat dan tidak memerlukan approval." };
  }

  const [report] = await db
    .update(dailyReports)
    .set({ status: decision, reviewNote: note ?? null, reviewerId: user.id, reviewedAt: new Date() })
    .where(eq(dailyReports.id, reportId))
    .returning();
  if (!report) return { error: "Report not found." };

  await logActivity({
    actorId: user.id,
    subjectUserId: report.userId,
    type: decision === "approved" ? "report_approved" : "report_revision",
    title: decision === "approved" ? "Report Approved" : "Revision Requested",
    description: `Report for ${formatDate(report.date, { day: "2-digit", month: "short" })}${note ? `: “${note}”` : ""}`,
    href: `/reports/${report.id}`,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: decision === "approved" ? "Report approved" : "Revision requested" };
}

export async function approveReports(ids: number[]) {
  const user = await requireUser();
  if (user.role !== "supervisor" || ids.length === 0) return;
  for (const id of ids) {
    const [target] = await db
      .select({ role: users.role })
      .from(dailyReports)
      .innerJoin(users, eq(users.id, dailyReports.userId))
      .where(eq(dailyReports.id, id))
      .limit(1);
    if (!target || target.role === "advertiser") continue;

    const [report] = await db
      .update(dailyReports)
      .set({ status: "approved", reviewerId: user.id, reviewedAt: new Date() })
      .where(and(eq(dailyReports.id, id), eq(dailyReports.status, "submitted")))
      .returning();
    if (report) {
      await logActivity({
        actorId: user.id,
        subjectUserId: report.userId,
        type: "report_approved",
        title: "Report Approved",
        description: `Report for ${formatDate(report.date, { day: "2-digit", month: "short" })}`,
        href: `/reports/${report.id}`,
      });
    }
  }
  revalidatePath("/", "layout");
}
