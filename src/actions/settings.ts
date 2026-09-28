"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import type { FormState } from "./auth";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  title: z.string().trim().max(120).optional(),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({ name: formData.get("name"), title: formData.get("title") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db.update(users).set({ name: parsed.data.name, title: parsed.data.title ?? null }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated" };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "New password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "Passwords don't match" });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await bcrypt.compare(parsed.data.current, row.hash))) return { error: "Current password is incorrect" };
  await db.update(users).set({ passwordHash: await bcrypt.hash(parsed.data.next, 10) }).where(eq(users.id, user.id));
  return { ok: true, message: "Password changed" };
}
