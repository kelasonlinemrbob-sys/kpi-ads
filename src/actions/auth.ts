"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;

const loginSchema = z.object({
  email: z.email("Enter a valid email").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid) return { error: "Incorrect email or password" };
  if (!user.isActive) return { error: "Your account has been deactivated. Contact your supervisor." };

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
