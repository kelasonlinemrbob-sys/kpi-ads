import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetLimits, passwordResetTokens, users } from "@/db/schema";

type ResetDb = Pick<typeof db, "select" | "insert" | "update" | "delete">;
export const RESET_MINUTES = 15;
export const validResetToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Atomic fixed-window counter; shared by every app process and retained across restarts. */
export async function takeResetQuota(tx: ResetDb, scope: string, limit: number, now = new Date()) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  const key = createHmac("sha256", secret).update(scope).digest("hex");
  const since = new Date(now.getTime() - 15 * 60_000);
  const [row] = await tx.insert(passwordResetLimits).values({ key, windowStart: now, attempts: 1 }).onConflictDoUpdate({
    target: passwordResetLimits.key,
    set: {
      windowStart: sql`case when ${passwordResetLimits.windowStart} <= ${since} then ${now} else ${passwordResetLimits.windowStart} end`,
      attempts: sql`case when ${passwordResetLimits.windowStart} <= ${since} then 1 else least(${passwordResetLimits.attempts} + 1, 10000) end`,
    },
  }).returning({ attempts: passwordResetLimits.attempts });
  return row!.attempts <= limit;
}

/** Call inside a transaction so issuance and resetting serialize on the same user row. */
export async function issuePasswordReset(tx: ResetDb, email: string, now = new Date()) {
  const [user] = await tx.select().from(users).where(and(eq(users.email, email), eq(users.isActive, true))).limit(1).for("update");
  if (!user) return null;
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  const token = randomBytes(32).toString("hex");
  await tx.insert(passwordResetTokens).values({
    tokenHash: resetTokenHash(token), userId: user.id, sessionVersion: user.sessionVersion,
    expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000),
  });
  return { token, email: user.email };
}

export async function resetTokenIsUsable(tx: ResetDb, token: string, now = new Date()) {
  if (!validResetToken(token)) return false;
  const [row] = await tx.select({ id: users.id }).from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(eq(passwordResetTokens.tokenHash, resetTokenHash(token)), isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now), eq(users.isActive, true), eq(users.sessionVersion, passwordResetTokens.sessionVersion))).limit(1);
  return !!row;
}

/** A conditional version bump gives one winner even if two requests consume the token together. */
export async function applyPasswordReset(tx: ResetDb, token: string, passwordHash: string, now = new Date()) {
  if (!validResetToken(token)) return false;
  const hash = resetTokenHash(token);
  const [lookup] = await tx.select({ userId: passwordResetTokens.userId }).from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hash)).limit(1);
  if (!lookup) return false;
  // Same lock order as issuance: user first, token second.
  const [user] = await tx.select().from(users).where(eq(users.id, lookup.userId)).limit(1).for("update");
  if (!user?.isActive) return false;
  const [tokenRow] = await tx.select().from(passwordResetTokens).where(and(
    eq(passwordResetTokens.tokenHash, hash), isNull(passwordResetTokens.usedAt),
    gt(passwordResetTokens.expiresAt, now), eq(passwordResetTokens.sessionVersion, user.sessionVersion),
  )).limit(1);
  if (!tokenRow) return false;
  await tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id));
  await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.userId, user.id));
  return true;
}

export async function prunePasswordResets() {
  const yesterday = new Date(Date.now() - 86_400_000);
  await db.delete(passwordResetLimits).where(lt(passwordResetLimits.windowStart, yesterday));
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, yesterday));
}
