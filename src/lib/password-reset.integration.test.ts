import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { applyPasswordReset, issuePasswordReset, resetTokenHash, resetTokenIsUsable, takeResetQuota } from "./password-reset";

after(async () => { await db.$client.end(); });

test("single-use hashed tokens, expiry, replacement, session revocation, inactive and unknown accounts (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  try {
    await db.transaction(async (tx) => {
      const email = `reset-${crypto.randomUUID()}@example.invalid`;
      const [user] = await tx.insert(users).values({ name: "Password reset QA", email, passwordHash: "old-hash", role: "advertiser" }).returning();
      const now = new Date();
      const first = (await issuePasswordReset(tx, email, now))!;
      assert.match(first.token, /^[a-f0-9]{64}$/);
      const [stored] = await tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user!.id));
      assert.notEqual(stored!.tokenHash, first.token);
      assert.equal(stored!.tokenHash, resetTokenHash(first.token));
      assert.equal(await resetTokenIsUsable(tx, first.token, now), true);
      assert.equal(await resetTokenIsUsable(tx, first.token, new Date(now.getTime() + 15 * 60_000)), false);
      assert.equal(await applyPasswordReset(tx, first.token, "new", new Date(now.getTime() + 15 * 60_000)), false);
      assert.equal(await applyPasswordReset(tx, "invalid", "new", now), false);
      const second = (await issuePasswordReset(tx, email, now))!;
      assert.equal(await applyPasswordReset(tx, first.token, "new", now), false);
      assert.equal(await applyPasswordReset(tx, second.token, "new-hash", now), true);
      assert.equal(await applyPasswordReset(tx, second.token, "replayed", now), false);
      const [changed] = await tx.select().from(users).where(eq(users.id, user!.id));
      assert.equal(changed!.passwordHash, "new-hash");
      assert.equal(changed!.sessionVersion, user!.sessionVersion + 1);
      const third = (await issuePasswordReset(tx, email, now))!;
      await tx.update(users).set({ sessionVersion: changed!.sessionVersion + 1 }).where(eq(users.id, user!.id));
      assert.equal(await applyPasswordReset(tx, third.token, "stale", now), false);
      const fourth = (await issuePasswordReset(tx, email, now))!;
      await tx.update(users).set({ isActive: false }).where(eq(users.id, user!.id));
      assert.equal(await issuePasswordReset(tx, email, now), null);
      assert.equal(await applyPasswordReset(tx, fourth.token, "inactive", now), false);
      assert.equal(await issuePasswordReset(tx, `unknown-${email}`, now), null);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("reset quotas survive requests, isolate keys and reopen after the window (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  try {
    await db.transaction(async (tx) => {
      const key = `test:${crypto.randomUUID()}`;
      const now = new Date();
      assert.equal(await takeResetQuota(tx, key, 3, now), true);
      assert.equal(await takeResetQuota(tx, key, 3, now), true);
      assert.equal(await takeResetQuota(tx, key, 3, now), true);
      assert.equal(await takeResetQuota(tx, key, 3, now), false);
      assert.equal(await takeResetQuota(tx, key + 'other', 3, now), true);
      assert.equal(await takeResetQuota(tx, key, 3, new Date(now.getTime() + 15 * 60_000)), true);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
