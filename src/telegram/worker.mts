import { Client } from "pg";
import { db } from "@/db";
import { processTelegramOutbox } from "@/lib/telegram";
const lock = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await lock.connect();
  const result = await lock.query("SELECT pg_try_advisory_lock(7302420) AS locked");
  if (result.rows[0]?.locked) await processTelegramOutbox();
} catch { console.error("[telegram] Worker failed; inspect service and database connectivity.");process.exitCode = 1; }
finally { await lock.end();await db.$client.end(); }
