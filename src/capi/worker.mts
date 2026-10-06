import { Client } from "pg";
import { db } from "@/db";
import { processCapiOutbox,markCapiWorker } from "@/lib/meta-capi";
let acquired=false;
const lock = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await lock.connect();
  const result = await lock.query("SELECT pg_try_advisory_lock(7302430) AS locked");
  if (result.rows[0]?.locked) {acquired=true;await markCapiWorker("running");await processCapiOutbox();await markCapiWorker("healthy");}
} catch { if(acquired)try{await markCapiWorker("error");}catch{}console.error("[meta-capi] Worker failed; inspect service and database connectivity.");process.exitCode = 1; }
finally { await lock.end();await db.$client.end(); }
