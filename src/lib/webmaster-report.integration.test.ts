import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyReports, tasks, users } from "@/db/schema";
import { saveWebmasterTaskItems, WebmasterReportError } from "./webmaster-report-data";
import { todayISO } from "./kpi";
import { addDays, parseISODate } from "./utils";
import type { WebmasterItemInput } from "./webmaster-report";

after(async () => { await db.$client.end(); });

test("task/report updates, authorization, retries and historical snapshots (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  try {
    await db.transaction(async (tx) => {
      const today = todayISO();
      const yesterday = addDays(today, -1);
      const token = crypto.randomUUID();
      const [member, supervisor] = await tx.insert(users).values([
        { name: "Webmaster test", email: `wm-${token}@example.invalid`, passwordHash: "test-only", role: "webmaster" as const },
        { name: "Supervisor test", email: `sup-${token}@example.invalid`, passwordHash: "test-only", role: "supervisor" as const },
      ]).returning();
      const [task] = await tx.insert(tasks).values({ title: "Tracking test", category: "tracking", status: "in_progress", createdById: supervisor!.id, assigneeId: member!.id, createdAt: parseISODate(yesterday) }).returning();
      const item: WebmasterItemInput = { taskId: task!.id, title: "Forged title", category: "general", priority: "urgent", status: "review", sourceStatus: "in_progress", dueDate: "", note: "Event diuji", resultUrl: "", minutesSpent: 30 };
      await assert.rejects(saveWebmasterTaskItems(tx, member!, today, [{ ...item, status: "done" }], []), WebmasterReportError);
      await assert.rejects(saveWebmasterTaskItems(tx, supervisor!, today, [item], []), WebmasterReportError);
      const snapshots = await saveWebmasterTaskItems(tx, member!, today, [item], []);
      assert.equal(snapshots[0]!.title, "Tracking test");
      assert.equal(snapshots[0]!.category, "tracking");
      assert.equal((await tx.select().from(tasks).where(eq(tasks.id, task!.id)))[0]!.status, "review");
      const [report] = await tx.insert(dailyReports).values({ userId: member!.id, date: today, summary: "Daily task integration test", webmasterTasks: snapshots }).returning();
      await tx.update(tasks).set({ title: "Renamed after report", status: "done", completedAt: new Date() }).where(eq(tasks.id, task!.id));
      const stored = (await tx.select().from(dailyReports).where(eq(dailyReports.id, report!.id)))[0]!.webmasterTasks;
      assert.equal(stored[0]!.title, "Tracking test");
      assert.equal(stored[0]!.status, "review");
      await assert.rejects(saveWebmasterTaskItems(tx, member!, today, [item], stored), /Status task telah berubah/);
      const historical = await saveWebmasterTaskItems(tx, member!, yesterday, [item], []);
      assert.equal(historical[0]!.status, "review");
      const historicalEdit = await saveWebmasterTaskItems(tx, member!, yesterday, [item], stored);
      assert.equal(historicalEdit[0]!.title, "Tracking test");
      assert.equal((await tx.select().from(tasks).where(eq(tasks.id, task!.id)))[0]!.status, "done");
      await assert.rejects(saveWebmasterTaskItems(tx, member!, yesterday, [{ ...item, status: "done" }], []), /belum disetujui Done/);
      const newItem = { ...item, taskId: null, clientKey: crypto.randomUUID(), title: "Task baru test", category: "bug_fix", status: "done" as const };
      const created = await saveWebmasterTaskItems(tx, member!, today, [newItem], []);
      const retry = await saveWebmasterTaskItems(tx, member!, today, [newItem], created);
      assert.equal(retry[0]!.taskId, created[0]!.taskId);
      await tx.delete(tasks).where(eq(tasks.id, task!.id));
      const archived = await saveWebmasterTaskItems(tx, member!, today, [item], stored);
      assert.equal(archived[0]!.title, "Tracking test");
      await assert.rejects(saveWebmasterTaskItems(tx, member!, today, [{ ...item, status: "done" }], stored), /riwayat/);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
