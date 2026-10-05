/** Adds missing KPI definitions and a new administrator; never seeds demo data or resets accounts. */
import bcrypt from "bcryptjs";
import { db } from "./index";
import { kpiMetrics, users } from "./schema";
import { DEFAULT_METRICS } from "./metric-defaults";

async function main() {
  const email = process.env.INIT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INIT_ADMIN_PASSWORD;
  if (!email || !password || password.length < 16) throw new Error("Set INIT_ADMIN_EMAIL and INIT_ADMIN_PASSWORD (at least 16 characters).");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.transaction(async (tx) => {
    await tx.insert(kpiMetrics).values(DEFAULT_METRICS).onConflictDoNothing({ target: kpiMetrics.key });
    await tx.insert(users).values({ name: "Administrator", email, passwordHash, role: "supervisor" })
      .onConflictDoNothing({ target: users.email });
  });
  console.log("Production KPI definitions and administrator are ready.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await db.$client.end(); });
