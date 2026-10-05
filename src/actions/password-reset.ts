"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { destroySession } from "@/lib/auth";
import { applyPasswordReset, issuePasswordReset, prunePasswordResets, resetTokenIsUsable, takeResetQuota } from "@/lib/password-reset";
import { resetMailConfig, sendPasswordReset } from "@/lib/reset-mail";
import type { FormState } from "./auth";

const emailSchema = z.string().trim().toLowerCase().max(180).pipe(z.email());
const sent = { ok: true, message: "Jika email terdaftar dan akun aktif, tautan reset akan dikirim. Periksa inbox dan folder spam. Tunggu beberapa menit sebelum meminta tautan baru." };

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Masukkan alamat email yang valid." };
  try { resetMailConfig(); } catch { return { error: "Layanan email belum tersedia. Hubungi supervisor." }; }
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-real-ip") ?? "unknown";
  // Quotas run for unknown/inactive accounts too, with the same public response.
  if (!await takeResetQuota(db, "global", 100) || !await takeResetQuota(db, `ip:${ip}`, 10) || !await takeResetQuota(db, `email:${email.data}`, 3)) return sent;
  const issued = await db.transaction((tx) => issuePasswordReset(tx, email.data));
  // SMTP latency must not disclose whether an address has an account.
  after(async () => {
    try {
      if (issued) await sendPasswordReset(issued.email, issued.token);
      await prunePasswordResets();
    } catch {
      // SMTP exceptions may contain credentials, recipients or reset URLs. Never log them.
      console.error("Password reset email delivery or cleanup failed.");
    }
  });
  return sent;
}

const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(8, "Password minimal 8 karakter.").max(72, "Password maksimal 72 byte.")
    .refine((s) => Buffer.byteLength(s, "utf8") <= 72, "Password maksimal 72 byte."),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Konfirmasi password tidak sama." });

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { token, password } = parsed.data;
  const invalid = { error: "Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru." };
  // Reject bad tokens before expensive hashing, then recheck atomically inside the transaction.
  if (!await resetTokenIsUsable(db, token)) return invalid;
  const passwordHash = await bcrypt.hash(password, 10);
  if (!await db.transaction((tx) => applyPasswordReset(tx, token, passwordHash))) return invalid;
  await destroySession();
  redirect("/login?reset=success");
}
