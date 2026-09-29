import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeftIcon } from "lucide-react";
import { db } from "@/db";
import { performanceAppraisals, users } from "@/db/schema";
import { getReportActuals } from "@/lib/appraisal-data";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDateId } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { AppraisalForm } from "./appraisal-form";

export const metadata: Metadata = { title: "Borang Penilaian Kinerja" };

export default async function AppraisalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const reviewer = alias(users, "reviewer");
  const [row] = await db
    .select({ appraisal: performanceAppraisals, name: users.name, reviewerName: reviewer.name })
    .from(performanceAppraisals)
    .innerJoin(users, eq(users.id, performanceAppraisals.userId))
    .leftJoin(reviewer, eq(reviewer.id, performanceAppraisals.reviewerId))
    .where(eq(performanceAppraisals.id, id))
    .limit(1);
  if (!row) notFound();
  const { appraisal: a } = row;

  const manage = can.manageAppraisals(user.role);
  // The employee sees their own appraisal once it is final; drafts stay with the supervisor.
  if (!manage && !(a.userId === user.id && a.status === "final")) redirect("/appraisals");

  const actuals = await getReportActuals(a.userId, a.periodStart, a.periodEnd);
  const period = `${formatDateId(a.periodStart)} - ${formatDateId(a.periodEnd)}`;

  return (
    <>
      <div className="print:hidden">
        <Link href="/appraisals" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Penilaian Kinerja
        </Link>
        <PageHeader title={`Penilaian Kinerja — ${row.name}`} description={`Advertiser Senior · ${period}`} />
      </div>
      <AppraisalForm
        id={a.id}
        editable={manage && a.status === "draft"}
        canManage={manage}
        status={a.status}
        employee={{ name: row.name }}
        period={period}
        reviewerName={row.reviewerName}
        finalizedLabel={a.finalizedAt ? a.finalizedAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : null}
        initial={{ skillScores: a.skillScores, skillNote: a.skillNote ?? "", kpi: a.kpi, kpiNote: a.kpiNote ?? "" }}
        actuals={actuals}
      />
    </>
  );
}
