"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { saveReportRules } from "@/lib/report-rules";
import { avatarChoiceSchema } from "@/lib/profile-avatar";
import type { FormState } from "./auth";

const profileSchema = z.object({
  avatarId: avatarChoiceSchema,
  name: z.string().trim().min(2, "Name is too short").max(120),
  title: z.string().trim().max(120).optional(),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(true);
  const parsed = profileSchema.safeParse({ name: formData.get("name"), title: formData.get("title") || undefined, avatarId: formData.has("avatarId") ? formData.get("avatarId") : undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db.update(users).set({ name: parsed.data.name, title: parsed.data.title ?? null, ...(parsed.data.avatarId !== undefined ? { avatarId: parsed.data.avatarId } : {}) }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated" };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "Password baru minimal 8 karakter.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "Konfirmasi password tidak sama." });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(true);
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await bcrypt.compare(parsed.data.current, row.hash))) return { error: "Current password is incorrect" };
  if (parsed.data.next === parsed.data.current) return { error: "Password baru harus berbeda dari password lama." };
  // A new password signs out every other device; this one gets a fresh session.
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.next, 10), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id))
    .returning({ sessionVersion: users.sessionVersion });
  await createSession(user.id, updated!.sessionVersion);
  return { ok: true, message: "Password diganti. Perangkat lain sudah dikeluarkan." };
}

/** Signs the member out on every other device (browser sessions carry the version). */
export async function signOutOtherSessions() {
  const user = await requireUser(true);
  const [updated] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id))
    .returning({ sessionVersion: users.sessionVersion });
  await createSession(user.id, updated!.sessionVersion);
  return { ok: true };
}

const rulesSchema = z.object({
  cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam batas tidak valid (format HH:MM)."),
  backfillDays: z.coerce.number().int().min(1, "Minimal 1 hari.").max(31, "Maksimal 31 hari."),
});

/** Settings → Aturan Laporan (supervisor): advertiser report deadline and how far back reports can be filled in. */
export async function saveReportRulesAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(true);
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengubah aturan laporan." };
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await saveReportRules(parsed.data, user.id);
  await logActivity({
    actorId: user.id,
    type: "target_updated",
    title: "Aturan Laporan Diubah",
    description: `Batas laporan advertiser ${parsed.data.cutoff.replace(":", ".")} WIB · isi mundur ${parsed.data.backfillDays} hari`,
    href: "/settings?tab=aturan",
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Aturan laporan disimpan" };
}
