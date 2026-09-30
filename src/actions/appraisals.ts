"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { performanceAppraisals, users } from "@/db/schema";
import { computeAppraisal, KPI_INDICATORS, SKILL_INDICATOR_IDS, type KpiValues } from "@/lib/appraisal";
import { getReportActuals } from "@/lib/appraisal-data";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { can, isSeniorAdvertiser } from "@/lib/roles";
import { formatDateId } from "@/lib/utils";
import type { FormState } from "./auth";

async function requireAppraiser() {
  const user = await requireUser();
  if (!can.manageAppraisals(user.role)) throw new Error("Hanya supervisor yang dapat mengisi penilaian kinerja.");
  return user;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

const createSchema = z
  .object({ userId: z.coerce.number().int().positive("Pilih karyawan."), periodStart: isoDate, periodEnd: isoDate })
  .refine((v) => v.periodEnd >= v.periodStart, { message: "Akhir periode harus setelah awal periode." });

export async function createAppraisal(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAppraiser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { userId, periodStart, periodEnd } = parsed.data;

  const [employee] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!employee || !employee.isActive || !isSeniorAdvertiser(employee)) {
    return { error: "Penilaian kinerja hanya untuk advertiser senior yang aktif." };
  }
  const [duplicate] = await db
    .select({ id: performanceAppraisals.id })
    .from(performanceAppraisals)
    .where(
      and(
        eq(performanceAppraisals.userId, userId),
        eq(performanceAppraisals.periodStart, periodStart),
        eq(performanceAppraisals.periodEnd, periodEnd),
      ),
    )
    .limit(1);
  if (duplicate) redirect(`/appraisals/${duplicate.id}`);

  // Start "Real" of Jumlah Lead and CPL from the daily reports; targets are set by the supervisor.
  const actuals = await getReportActuals(userId, periodStart, periodEnd);
  const kpi: KpiValues = {
    leads: { target: null, real: actuals.days ? actuals.leads : null, score: null },
    cpl: { target: null, real: actuals.cpl, score: null },
  };
  const [created] = await db
    .insert(performanceAppraisals)
    .values({ userId, reviewerId: me.id, periodStart, periodEnd, kpi })
    .returning({ id: performanceAppraisals.id });
  revalidatePath("/appraisals");
  redirect(`/appraisals/${created!.id}`);
}

const nullableNumber = z.number().finite().min(0).max(1e12).nullable();
const saveSchema = z.object({
  skillScores: z.record(z.string(), z.number().int().min(1).max(5)),
  skillNote: z.string().trim().max(5000),
  kpi: z.record(z.string(), z.object({ target: nullableNumber, real: nullableNumber, score: nullableNumber })),
  kpiNote: z.string().trim().max(5000),
});
export type AppraisalInput = z.infer<typeof saveSchema>;

async function loadDraft(id: number) {
  const [appraisal] = await db.select().from(performanceAppraisals).where(eq(performanceAppraisals.id, id)).limit(1);
  if (!appraisal) return { error: "Penilaian tidak ditemukan." } as const;
  if (appraisal.status !== "draft") return { error: "Penilaian sudah final. Buka kembali untuk mengubahnya." } as const;
  return { appraisal } as const;
}

function clean(input: AppraisalInput) {
  // Keep only indicators / KPIs that exist in the form.
  const skillScores = Object.fromEntries(Object.entries(input.skillScores).filter(([id]) => SKILL_INDICATOR_IDS.includes(id)));
  const kpiKeys: string[] = KPI_INDICATORS.map((k) => k.key);
  const kpi = Object.fromEntries(Object.entries(input.kpi).filter(([key]) => kpiKeys.includes(key)));
  const result = computeAppraisal(skillScores, kpi);
  return {
    skillScores,
    kpi,
    skillNote: input.skillNote || null,
    kpiNote: input.kpiNote || null,
    skillScore: result.skillTotal,
    kpiScore: result.kpiTotal,
  };
}

export async function saveAppraisal(id: number, input: AppraisalInput) {
  await requireAppraiser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data penilaian tidak valid." };
  const draft = await loadDraft(id);
  if ("error" in draft) return { error: draft.error };
  await db
    .update(performanceAppraisals)
    .set({ ...clean(parsed.data), updatedAt: new Date() })
    .where(eq(performanceAppraisals.id, id));
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${id}`);
  return { ok: true };
}

/** Saves and locks the appraisal; from then on the advertiser can see it. */
export async function finalizeAppraisal(id: number, input: AppraisalInput) {
  const me = await requireAppraiser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data penilaian tidak valid." };
  const draft = await loadDraft(id);
  if ("error" in draft) return { error: draft.error };
  const values = clean(parsed.data);
  if (values.skillScore === null) return { error: "Beri skor 1–5 untuk semua indikator di Borang 1 terlebih dahulu." };
  if (values.kpiScore === null) return { error: "Lengkapi target, real dan skor semua KPI di Borang 2 terlebih dahulu." };

  const now = new Date();
  await db
    .update(performanceAppraisals)
    .set({ ...values, status: "final", reviewerId: me.id, finalizedAt: now, updatedAt: now })
    .where(eq(performanceAppraisals.id, id));
  const { appraisal } = draft;
  await logActivity({
    actorId: me.id,
    subjectUserId: appraisal.userId,
    type: "appraisal_final",
    title: "Penilaian Kinerja Final",
    description: `Periode ${formatDateId(appraisal.periodStart)} – ${formatDateId(appraisal.periodEnd)}`,
    href: `/appraisals/${id}`,
  });
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${id}`);
  return { ok: true };
}

export async function reopenAppraisal(id: number) {
  await requireAppraiser();
  await db
    .update(performanceAppraisals)
    .set({ status: "draft", finalizedAt: null, updatedAt: new Date() })
    .where(eq(performanceAppraisals.id, id));
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${id}`);
  return { ok: true };
}

export async function deleteAppraisal(id: number) {
  await requireAppraiser();
  const draft = await loadDraft(id);
  if ("error" in draft) return { error: "Hanya penilaian draft yang bisa dihapus." };
  await db.delete(performanceAppraisals).where(eq(performanceAppraisals.id, id));
  revalidatePath("/appraisals");
  return { ok: true };
}
