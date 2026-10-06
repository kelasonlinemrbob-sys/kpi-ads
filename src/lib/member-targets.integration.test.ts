import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { kpiMetrics, kpiTargets, users } from "@/db/schema";
import { writeMemberTargets } from "./member-target-store";
import { parseMemberTargets } from "./member-targets";
after(async () => { await db.$client.end(); });

test("personal targets isolate member and month, update existing values, preserve blanks and never change role defaults (rolled back)", async () => {
  const rollback = new Error("ROLLBACK_FIXTURES");
  try {
    await db.transaction(async (tx) => {
      const metrics = await tx.select().from(kpiMetrics);
      const chat = metrics.find((metric) => metric.key === "leads")!;
      assert.ok(chat);
      const people = await tx.insert(users).values([1, 2].map((n) => ({ name: `Target fixture ${n}`, email: `target-${crypto.randomUUID()}@example.invalid`, passwordHash: "unused", role: "advertiser" as const }))).returning();
      const save = async (userId: number, period: string, value: string) => {
        const form = new FormData(); form.set("targetPeriod", period); form.set(`memberTarget_${chat.id}`, value);
        await writeMemberTargets(tx, userId, parseMemberTargets(form, metrics, people[0]));
      };
      await save(people[0].id, "2026-11", "300");
      await save(people[1].id, "2026-11", "700");
      await save(people[0].id, "2026-12", "500");
      await save(people[0].id, "2026-11", "400");
      await save(people[1].id, "2026-11", "");
      const rows = await tx.select().from(kpiTargets).where(and(inArray(kpiTargets.userId, people.map((p) => p.id)), eq(kpiTargets.metricId, chat.id)));
      assert.equal(rows.length, 3);
      assert.equal(rows.find((r) => r.userId === people[0].id && r.period === "2026-11")?.target, 400);
      assert.equal(rows.find((r) => r.userId === people[1].id)?.target, 700);
      assert.equal(rows.find((r) => r.period === "2026-12")?.target, 500);
      assert.deepEqual(await tx.select().from(kpiMetrics), metrics);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
