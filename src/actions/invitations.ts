"use server";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { destroySession, requireUser } from "@/lib/auth";
import { invitationPasswordInput } from "@/lib/invitation-input";
import { acceptMemberInvitation, deliverMemberInvitation, invitationErrorMessage, issueMemberInvitation, revokeMemberInvitation, usableInvitation } from "@/lib/member-invitations";
import { takeResetQuota } from "@/lib/password-reset";
import { resetMailConfig } from "@/lib/reset-mail";
import type { FormState } from "./auth";
export async function resendInvitationAction(id: number): Promise<FormState> {
  const me = await requireUser();
  if (me.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengirim undangan." };
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Anggota tidak valid." };
  try { resetMailConfig(); } catch { return { error: "Layanan email belum tersedia. Periksa konfigurasi SMTP server." }; }
  if (!await takeResetQuota(db, `invitation:sender:${me.id}`, 20)) return { error: "Batas pengiriman undangan tercapai. Coba lagi dalam 15 menit." };
  try {
    const issued = await db.transaction((tx) => issueMemberInvitation(tx, id, me.id));
    const sent = await deliverMemberInvitation(issued, me.name);
    revalidatePath("/team");
    return sent ? { ok: true, message: "Undangan baru dikirim. Tautan sebelumnya tidak berlaku lagi." } : { error: "Undangan tersimpan, tetapi email gagal dikirim. Periksa SMTP dan kirim ulang setelah satu menit." };
  } catch (error) { return { error: invitationErrorMessage(error) }; }
}
export async function revokeInvitationAction(id: number): Promise<FormState> {
  const me = await requireUser();
  if (me.role !== "supervisor") return { error: "Hanya supervisor yang dapat membatalkan undangan." };
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Anggota tidak valid." };
  try { await db.transaction((tx) => revokeMemberInvitation(tx, id));revalidatePath("/team");return { ok: true, message: "Undangan dibatalkan. Akun tetap belum aktif." }; }
  catch (error) { return { error: invitationErrorMessage(error) }; }
}
export async function acceptInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = invitationPasswordInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const invalid = { error: "Tautan undangan tidak valid, sudah digunakan, dibatalkan, atau kedaluwarsa. Minta supervisor mengirim ulang undangan." };
  const ip = (await headers()).get("x-real-ip") ?? "unknown";
  if (!await takeResetQuota(db, `invitation:accept:${ip}`, 50)) return { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." };
  if (!await usableInvitation(db, parsed.data.token)) return invalid;
  const hash = await bcrypt.hash(parsed.data.password, 10);
  if (!await db.transaction((tx) => acceptMemberInvitation(tx, parsed.data.token, hash))) return invalid;
  await destroySession();
  redirect("/login?invitation=accepted");
}
