import "server-only";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import type { parseMemberTargets } from "./member-targets";

export async function writeMemberTargets(tx: Pick<typeof db, "insert">, userId: number, input: ReturnType<typeof parseMemberTargets>) {
  for (const value of input.values) {
    await tx.insert(kpiTargets).values({ userId, period: input.period, ...value }).onConflictDoUpdate({
      target: [kpiTargets.userId, kpiTargets.metricId, kpiTargets.period],
      set: { target: value.target, updatedAt: new Date() },
    });
  }
}
