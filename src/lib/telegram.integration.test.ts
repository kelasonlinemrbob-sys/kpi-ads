import { after, mock, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, campaigns, dailyReports, advertiserReportItems, sharedTelegramConnection, telegramOutbox, waOutbox } from "@/db/schema";
import {
  disconnectTelegramConnection,
  processTelegramOutbox,
  queueTelegramReport,
  saveTelegramConnection,
  telegramStatus,
} from "./telegram";
const token = "123456789:" + "a".repeat(35);
after(async () => {
  await db.$client.end();
});
test("Telegram lifecycle: ownership, encrypted token, coalescing, dedup, revisions, 429, uncertain delivery and WA isolation (rolled back)", async () => {
  const original = globalThis.fetch;
  const rollback = new Error("ROLLBACK_TELEGRAM");
  let mode: "ok" | "rate" | "timeout" = "ok";
  let sent = 0;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith(`https://api.telegram.org/bot${token}/`));
    const method = String(url).split("/").at(-1);
    if (method === "getMe") return Response.json({ ok: true, result: { id: 123456789, username: "fixture_bot", is_bot: true } });
    if (method === "getChat") return Response.json({ ok: true, result: { id: -1001, title: "Fixture", type: "supergroup" } });
    if (method === "getChatMember") return Response.json({ ok: true, result: { status: "administrator" } });
    assert.equal(method, "sendMessage");
    assert.equal(JSON.parse(String(init?.body)).parse_mode, "HTML");
    if (mode === "rate") return Response.json({ ok: false, error_code: 429, parameters: { retry_after: 300 } }, { status: 429 });
    if (mode === "timeout") throw new Error("Token must not leak " + token);
    sent++;
    return Response.json({ ok: true, result: { message_id: sent } });
  };
  try {
    await db.transaction(async (tx) => {
      const [user, other] = await tx
        .insert(users)
        .values(
          [1, 2].map((n) => ({
            name: `Telegram ${n}`,
            email: `telegram-${crypto.randomUUID()}@example.invalid`,
            passwordHash: "unused",
            role: n === 1 ? "supervisor" as const : "advertiser" as const,
          })),
        )
        .returning();
      await tx.delete(telegramOutbox);
      const [campaign] = await tx.insert(campaigns).values({ name: "Fixture", platform: "meta", ownerId: user.id }).returning();
      const [report] = await tx.insert(dailyReports).values({ userId: user.id, date: "2001-01-02", summary: "Notes" }).returning();
      const [item] = await tx
        .insert(advertiserReportItems)
        .values({
          reportId: report.id,
          campaignId: campaign.id,
          window: "previous_day",
          performanceDate: "2001-01-01",
          platform: "meta",
          product: "Product",
          spent: 100,
          impressions: 1,
          clicks: 1,
          leads: 1,
        })
        .returning();
      const [wa] = await tx
        .insert(waOutbox)
        .values({ userId: user.id, reportId: report.id, groupJid: "fixture", body: "WA unchanged" })
        .returning();
      const mocks = [
        mock.method(db, "select", tx.select.bind(tx)),
        mock.method(db, "insert", tx.insert.bind(tx)),
        mock.method(db, "update", tx.update.bind(tx)),
        mock.method(db, "delete", tx.delete.bind(tx)),
        mock.method(db, "transaction", tx.transaction.bind(tx)),
      ];
      const jobs = () => tx.select().from(telegramOutbox).where(eq(telegramOutbox.userId, user.id));
      const due = () =>
        tx
          .update(telegramOutbox)
          .set({ sendAfter: new Date(0) })
          .where(and(eq(telegramOutbox.userId, user.id), eq(telegramOutbox.status, "pending")));
      try {
        await saveTelegramConnection(user.id, { token, chatId: "-1001", threadId: "", autoSend: true });
        const [connection] = await tx.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
        assert.ok(connection.token.startsWith("v1:"));
        assert.ok(!connection.token.includes(token));
        assert.ok(!JSON.stringify(await telegramStatus(user.id)).includes(token));
        assert.equal((await telegramStatus(other.id)).connected, true);
        await assert.rejects(saveTelegramConnection(other.id, {token,chatId:"-1001",threadId:"",autoSend:true}), /supervisor/);
        await assert.rejects(disconnectTelegramConnection(other.id), /supervisor/);
        await assert.rejects(queueTelegramReport(other.id, report.id, false), /akun ini/);
        assert.equal(await queueTelegramReport(user.id, report.id, false), true);
        await tx.update(advertiserReportItems).set({ spent: 200 }).where(eq(advertiserReportItems.id, item.id));
        await queueTelegramReport(user.id, report.id, true);
        assert.equal((await jobs()).length, 1);
        assert.ok((await jobs())[0].body.includes("200"));
        await due();
        await processTelegramOutbox();
        assert.equal(sent, 1);
        assert.equal((await jobs())[0].status, "sent");
        assert.equal(await queueTelegramReport(user.id, report.id, true), false);
        await tx.update(advertiserReportItems).set({ spent: 300 }).where(eq(advertiserReportItems.id, item.id));
        await queueTelegramReport(user.id, report.id, true);
        assert.ok((await jobs()).at(-1)!.body.includes("<i>(revisi)</i>"));
        mode = "rate";
        await due();
        await processTelegramOutbox();
        assert.equal((await jobs()).at(-1)!.status, "pending");
        assert.ok((await jobs()).at(-1)!.sendAfter > new Date());
        mode = "ok";
        await due();
        await processTelegramOutbox();
        assert.equal(sent, 2);
        await tx.update(advertiserReportItems).set({ spent: 400 }).where(eq(advertiserReportItems.id, item.id));
        await queueTelegramReport(user.id, report.id, true);
        mode = "timeout";
        await due();
        await processTelegramOutbox();
        const unknown = (await jobs()).at(-1)!;
        assert.equal(unknown.status, "unknown");
        assert.ok(!unknown.error?.includes(token));
        await processTelegramOutbox();
        assert.equal(sent, 2);
        assert.equal(await queueTelegramReport(user.id, report.id, true), false);
        mode = "ok";
        await tx.update(advertiserReportItems).set({ spent: 500 }).where(eq(advertiserReportItems.id, item.id));
        await queueTelegramReport(user.id, report.id, true);
        const longJob = (await jobs()).at(-1)!;
        await tx
          .update(telegramOutbox)
          .set({ body: Array(160).fill("Facebook Product = Rp 500").join("\n") })
          .where(eq(telegramOutbox.id, longJob.id));
        await due();
        await processTelegramOutbox();
        assert.equal((await jobs()).at(-1)!.nextPart, 1);
        assert.equal((await jobs()).at(-1)!.status, "pending");
        await due();
        await processTelegramOutbox();
        assert.equal((await jobs()).at(-1)!.status, "sent");
        await tx.update(advertiserReportItems).set({ spent: 600 }).where(eq(advertiserReportItems.id, item.id));
        await queueTelegramReport(user.id, report.id, true);
        await saveTelegramConnection(user.id, { token: "", chatId: "-1001", threadId: "", autoSend: false });
        assert.equal((await jobs()).at(-1)!.status, "cancelled");
        assert.equal(await queueTelegramReport(user.id, report.id, true), false);
        await tx
          .update(telegramOutbox)
          .set({ createdAt: new Date(Date.now() - 60000) })
          .where(eq(telegramOutbox.userId, user.id));
        assert.equal(await queueTelegramReport(user.id, report.id, false, true), true);
        const [otherCampaign] = await tx.insert(campaigns).values({ name: "Other fixture", platform: "meta", ownerId: other.id }).returning();
        const [otherReport] = await tx.insert(dailyReports).values({userId:other.id,date:"2001-01-03",summary:"Other advertiser"}).returning();
        await tx.insert(advertiserReportItems).values({reportId:otherReport.id,campaignId:otherCampaign.id,window:"previous_day",performanceDate:"2001-01-02",platform:"meta",product:"Other product",spent:50,impressions:1,clicks:1,leads:1});
        await saveTelegramConnection(user.id,{token:"",chatId:"-1001",threadId:"",autoSend:true});
        assert.equal(await queueTelegramReport(other.id,otherReport.id,false),true);
        const [otherJob] = await tx.select().from(telegramOutbox).where(eq(telegramOutbox.userId,other.id));
        assert.ok(otherJob.body.includes("Other product"));
        assert.equal((await telegramStatus(other.id)).lastMessage?.status,"pending");
        await tx.update(telegramOutbox).set({sendAfter:new Date(0)}).where(eq(telegramOutbox.id,otherJob.id));
        await processTelegramOutbox();
        await processTelegramOutbox();
        assert.equal((await tx.select().from(telegramOutbox).where(eq(telegramOutbox.id,otherJob.id)))[0].status,"sent");
        await tx.update(advertiserReportItems).set({spent:75}).where(eq(advertiserReportItems.reportId,otherReport.id));
        assert.equal(await queueTelegramReport(other.id,otherReport.id,true),true);
        await disconnectTelegramConnection(user.id);
        assert.equal((await tx.select().from(telegramOutbox).where(eq(telegramOutbox.userId,other.id)).orderBy(telegramOutbox.id)).at(-1)!.status,"cancelled");
        assert.equal((await telegramStatus(other.id)).connected,false);
        assert.equal((await telegramStatus(user.id)).hasToken, false);
        assert.equal((await tx.select().from(waOutbox).where(eq(waOutbox.id, wa.id)))[0].body, "WA unchanged");
      } finally {
        mocks.forEach((m) => m.mock.restore());
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    globalThis.fetch = original;
  }
});
