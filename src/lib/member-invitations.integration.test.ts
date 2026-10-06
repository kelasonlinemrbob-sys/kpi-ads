import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberInvitations, users } from "@/db/schema";
import { acceptMemberInvitation, deliverMemberInvitation, issueMemberInvitation, revokeMemberInvitation, usableInvitation, invitationTokenHash } from "./member-invitations";
import { invitationPasswordInput } from "./invitation-input";
import { issuePasswordReset } from "./password-reset";
after(async () => { await db.$client.end(); });

test("password validation rejects mismatch, short passwords and bcrypt byte truncation", () => {
  const token = "a".repeat(64);
  const parse = (password: string, confirm = password) => invitationPasswordInput.safeParse({ token, password, confirm }).success;
  assert.equal(parse("my-own-password"), true);
  assert.equal(parse("short"), false);
  assert.equal(parse("my-own-password", "different"), false);
  assert.equal(parse("あ".repeat(25)), false);
});

test("invitation lifecycle, SMTP delivery, expiry, revocation, email binding and single-use activation (rolled back, SMTP mocked)", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  const oldEnv = { APP_URL: process.env.APP_URL, SMTP_USER: process.env.SMTP_USER, SMTP_PASSWORD: process.env.SMTP_PASSWORD };
  Object.assign(process.env, { APP_URL: "https://kpi.example.invalid", SMTP_USER: "sender@example.invalid", SMTP_PASSWORD: "mock-only" });
  try {
    await db.transaction(async (tx) => {
      const updateMock = mock.method(db, "update", tx.update.bind(tx));
      let message: { to: string; text: string } | undefined;
      let reject = false;
      let closed = 0;
      const mailMock = mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail: typeof message) => { if (reject) throw new Error("SMTP failed"); message = mail; return { accepted: [mail!.to], rejected: [] }; }, close: () => { closed++; } }));
      try {
        const [member] = await tx.insert(users).values({ name: "Invite QA", email: `invite-${crypto.randomUUID()}@example.invalid`, passwordHash: "inaccessible", role: "advertiser", advertiserLevel: "senior", invitationPending: true, isActive: false }).returning();
        const now = new Date();
        const first = await issueMemberInvitation(tx, member.id, member.id, now);
        const [stored] = await tx.select().from(memberInvitations).where(eq(memberInvitations.userId, member.id));
        assert.notEqual(stored.tokenHash, first.token);
        assert.equal(stored.tokenHash, invitationTokenHash(first.token));
        assert.equal(stored.expiresAt.getTime() - now.getTime(), 72 * 3600000);
        assert.equal(await issuePasswordReset(tx, member.email), null);
        assert.equal((await usableInvitation(tx, first.token))?.userId, member.id);
        assert.equal(await deliverMemberInvitation(first, "Supervisor"), true);
        assert.ok(message?.text.includes(`https://kpi.example.invalid/accept-invitation?token=${first.token}`));
        assert.ok(message?.text.includes("72 jam"));
        assert.equal(message?.to, member.email);
        assert.equal(closed, 1);
        assert.equal((await tx.select().from(memberInvitations).where(eq(memberInvitations.userId, member.id)))[0].deliveryStatus, "sent");
        await assert.rejects(() => issueMemberInvitation(tx, member.id, member.id, now), /satu menit/);
        assert.equal(await acceptMemberInvitation(tx, first.token, "bad", new Date(now.getTime() + 72 * 3600000)), false);
        await revokeMemberInvitation(tx, member.id);
        assert.equal(await acceptMemberInvitation(tx, first.token, "bad"), false);
        const second = await issueMemberInvitation(tx, member.id, member.id, new Date(now.getTime() + 61000));
        assert.equal(await usableInvitation(tx, first.token), null);
        reject = true;
        assert.equal(await deliverMemberInvitation(second, "Supervisor"), false);
        assert.equal((await tx.select().from(memberInvitations).where(eq(memberInvitations.userId, member.id)))[0].deliveryStatus, "failed");
        reject = false;
        await deliverMemberInvitation(first, "Supervisor");
        assert.equal((await tx.select().from(memberInvitations).where(eq(memberInvitations.userId, member.id)))[0].deliveryStatus, "failed", "stale delivery cannot overwrite newer token status");
        await tx.update(users).set({ email: `changed-${member.email}` }).where(eq(users.id, member.id));
        assert.equal(await usableInvitation(tx, second.token), null);
        const final = await issueMemberInvitation(tx, member.id, member.id, now, true);
        const hash = await bcrypt.hash("my-personal-password", 10);
        assert.equal(await acceptMemberInvitation(tx, final.token, hash), true);
        assert.equal(await acceptMemberInvitation(tx, final.token, "replayed"), false);
        const [joined] = await tx.select().from(users).where(eq(users.id, member.id));
        assert.equal(joined.invitationPending, false);
        assert.equal(joined.isActive, true);
        assert.equal(joined.sessionVersion, 1);
        assert.equal(joined.role, "advertiser");
        assert.equal(joined.advertiserLevel, "senior");
        assert.equal(await bcrypt.compare("my-personal-password", joined.passwordHash), true);
        await assert.rejects(() => issueMemberInvitation(tx, member.id, member.id), /sudah bergabung/);
        await assert.rejects(() => revokeMemberInvitation(tx, member.id), /sudah bergabung/);
      } finally { updateMock.mock.restore(); mailMock.mock.restore(); }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
