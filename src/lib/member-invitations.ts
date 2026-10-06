import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberInvitations, passwordResetTokens, users } from "@/db/schema";
import { INVITATION_HOURS, invitationTokenValid } from "./invitation-input";
import { sendInvitationMail } from "./invitation-mail";
export type InvitationDb = Pick<typeof db, "select" | "insert" | "update" | "delete">;
export class InvitationError extends Error {}
export const invitationErrorMessage = (error: unknown) => error instanceof InvitationError ? error.message : "Undangan belum dapat diproses. Coba lagi nanti.";
export const invitationTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Call inside a transaction. Same lock order as acceptance/revocation: member, then invitation. */
export async function issueMemberInvitation(tx: InvitationDb, userId: number, invitedById: number, now = new Date(), emailChanged = false) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user?.invitationPending || user.isActive) throw new InvitationError("Anggota ini sudah bergabung atau tidak membutuhkan undangan.");
  const [previous] = await tx.select().from(memberInvitations).where(eq(memberInvitations.userId, userId));
  if (!emailChanged && previous && now.getTime() - previous.createdAt.getTime() < 60000) throw new InvitationError("Tunggu satu menit sebelum mengirim ulang undangan.");
  const token = randomBytes(32).toString("hex");
  const value = { tokenHash: invitationTokenHash(token), email: user.email, invitedById, expiresAt: new Date(now.getTime() + INVITATION_HOURS * 3600000), createdAt: now, acceptedAt: null, revokedAt: null, sentAt: null, deliveryStatus: "pending" };
  await tx.insert(memberInvitations).values({ userId, ...value }).onConflictDoUpdate({ target: memberInvitations.userId, set: value });
  return { userId, email: user.email, name: user.name, token, tokenHash: value.tokenHash };
}
export async function usableInvitation(tx: InvitationDb, token: string, now = new Date()) {
  if (!invitationTokenValid(token)) return null;
  const [row] = await tx.select({ userId: users.id, name: users.name, email: users.email, role: users.role }).from(memberInvitations).innerJoin(users, eq(users.id, memberInvitations.userId)).where(and(
    eq(memberInvitations.tokenHash, invitationTokenHash(token)), isNull(memberInvitations.acceptedAt), isNull(memberInvitations.revokedAt), gt(memberInvitations.expiresAt, now),
    eq(users.invitationPending, true), eq(users.isActive, false), eq(users.email, memberInvitations.email),
  )).limit(1);
  return row ?? null;
}
export async function acceptMemberInvitation(tx: InvitationDb, token: string, passwordHash: string, now = new Date()) {
  if (!invitationTokenValid(token)) return false;
  const [lookup] = await tx.select({ userId: memberInvitations.userId }).from(memberInvitations).where(eq(memberInvitations.tokenHash, invitationTokenHash(token)));
  if (!lookup) return false;
  await tx.select({ id: users.id }).from(users).where(eq(users.id, lookup.userId)).for("update");
  if (!await usableInvitation(tx, token, now)) return false;
  await tx.update(users).set({ passwordHash, invitationPending: false, isActive: true, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, lookup.userId));
  await tx.update(memberInvitations).set({ acceptedAt: now }).where(eq(memberInvitations.userId, lookup.userId));
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, lookup.userId));
  return true;
}
export async function revokeMemberInvitation(tx: InvitationDb, userId: number, now = new Date()) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user?.invitationPending) throw new InvitationError("Anggota sudah bergabung. Gunakan Nonaktifkan untuk mencabut akses.");
  await tx.update(memberInvitations).set({ revokedAt: now }).where(eq(memberInvitations.userId, userId));
}
/** Delivery status is updated only for this exact token; never overwrite a newer invitation's state. */
export async function deliverMemberInvitation(issued: Awaited<ReturnType<typeof issueMemberInvitation>>, inviterName: string) {
  let delivered = false;
  try { await sendInvitationMail(issued.email, issued.name, inviterName, issued.token);delivered = true; }
  catch { /* SMTP errors can contain recipient addresses and bearer links; do not log raw errors. */ }
  await db.update(memberInvitations).set({ deliveryStatus: delivered ? "sent" : "failed", sentAt: delivered ? new Date() : null }).where(and(eq(memberInvitations.userId, issued.userId), eq(memberInvitations.tokenHash, issued.tokenHash)));
  return delivered;
}
