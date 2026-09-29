import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AwardIcon } from "lucide-react";
import { db } from "@/db";
import { performanceAppraisals, users } from "@/db/schema";
import { formatScore, kpiTier, skillCategory } from "@/lib/appraisal";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/kpi";
import { can, isSeniorAdvertiser } from "@/lib/roles";
import { formatDateId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";
import { CreateAppraisalDialog } from "./create-dialog";

export const metadata: Metadata = { title: "Penilaian Kinerja" };

export default async function AppraisalsPage() {
  const user = await requireUser();
  const manage = can.manageAppraisals(user.role);
  if (!manage && !isSeniorAdvertiser(user)) redirect("/dashboard");

  const reviewer = alias(users, "reviewer");
  const rows = await db
    .select({ appraisal: performanceAppraisals, name: users.name, reviewerName: reviewer.name })
    .from(performanceAppraisals)
    .innerJoin(users, eq(users.id, performanceAppraisals.userId))
    .leftJoin(reviewer, eq(reviewer.id, performanceAppraisals.reviewerId))
    // Advertisers only see their own appraisals, and only once they are final.
    .where(manage ? undefined : and(eq(performanceAppraisals.userId, user.id), eq(performanceAppraisals.status, "final")))
    .orderBy(desc(performanceAppraisals.periodEnd), asc(users.name));

  const seniors = manage
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "advertiser"), eq(users.advertiserLevel, "senior"), eq(users.isActive, true)))
        .orderBy(asc(users.name))
    : [];
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Penilaian Kinerja"
        description={
          manage
            ? "Borang penilaian tunjangan skill & responsibility dan KPI performance untuk advertiser senior."
            : "Hasil penilaian kinerja kamu yang sudah difinalisasi supervisor."
        }
        actions={manage && <CreateAppraisalDialog employees={seniors} defaultStart={`${today.slice(0, 7)}-01`} defaultEnd={today} />}
      />
      {manage && seniors.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          Belum ada advertiser senior. Ubah level advertiser menjadi <span className="text-foreground">Senior</span> di{" "}
          <Link href="/team" className="font-medium text-foreground underline underline-offset-2">
            Team → Members
          </Link>
          .
        </p>
      )}
      <Panel title={`${rows.length} penilaian`} icon={AwardIcon} iconPosition="left">
        {rows.length === 0 ? (
          <EmptyState
            icon={AwardIcon}
            title="Belum ada penilaian"
            description={manage ? "Klik Buat penilaian untuk mulai menilai advertiser senior." : "Penilaian akan muncul di sini setelah difinalisasi."}
          />
        ) : (
          <div className="p-1.5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Skill & Responsibility</TableHead>
                  <TableHead className="text-right">KPI Performance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Penilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ appraisal: a, name, reviewerName }) => (
                  <TableRow key={a.id} className="relative">
                    <TableCell>
                      <Link href={`/appraisals/${a.id}`} className="flex items-center gap-3 font-medium after:absolute after:inset-0">
                        <UserAvatar name={name} className="size-8" />
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateId(a.periodStart)} – {formatDateId(a.periodEnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.skillScore === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {formatScore(a.skillScore)} <span className="text-muted-foreground">/ 5 · {skillCategory(a.skillScore).label}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.kpiScore === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {formatScore(a.kpiScore, 1)}% <span className="text-muted-foreground">· {kpiTier(a.kpiScore).label}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell>{a.status === "final" ? <Badge variant="success">Final</Badge> : <Badge variant="secondary">Draft</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{reviewerName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
