import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { advertiserReportItems, dailyReports, users, waOutbox, waSessions, waWorker } from "@/db/schema";
import { formatRp } from "@/lib/ad-metrics";
import { advertiserReportWindows } from "@/lib/reporting";

/** The worker writes a heartbeat every 2s; older than this means it is not running. */
const WORKER_STALE_MS = 15_000;

export async function isWorkerAlive() {
  const [row] = await db.select().from(waWorker).where(eq(waWorker.id, 1));
  return !!row && Date.now() - row.heartbeatAt.getTime() < WORKER_STALE_MS;
}

/** Platform names as advertisers say them in the group ("Facebook", not "Meta Ads"). */
const WA_PLATFORM: Record<(typeof advertiserReportItems.$inferSelect)["platform"], string> = {
  meta: "Facebook",
  google: "Google",
  tiktok: "TikTok",
  shopee: "Shopee",
  other: "",
};
const PLATFORM_ORDER = Object.keys(WA_PLATFORM);

/**
 * WhatsApp text for one advertiser daily report, one block per period (day):
 *
 *   Advertiser *wahib*
 *   Spent Iklan *2026-09-25*
 *   => Facebook Kelas Online = Rp 653.851
 *   => Google Kelas Online = Rp 988.978
 *
 * Periods without numbers are left out.
 */
export async function buildReportMessage(reportId: number, updated: boolean) {
  const [report] = await db
    .select({ date: dailyReports.date, name: users.name })
    .from(dailyReports)
    .innerJoin(users, eq(users.id, dailyReports.userId))
    .where(eq(dailyReports.id, reportId));
  if (!report) return null;
  const items = await db
    .select()
    .from(advertiserReportItems)
    .where(eq(advertiserReportItems.reportId, reportId))
    .orderBy(asc(advertiserReportItems.product));

  const blocks: string[] = [];
  for (const period of advertiserReportWindows(report.date)) {
    const rows = items
      .filter((item) => item.performanceDate === period.performanceDate)
      .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
    if (!rows.length) continue;
    blocks.push(
      [
        `Advertiser *${report.name}*${updated && !blocks.length ? " _(revisi)_" : ""}`,
        `Spent Iklan *${period.performanceDate}*`,
        ...rows.map((row) => `=> ${[WA_PLATFORM[row.platform], row.product].filter(Boolean).join(" ")} = ${formatRp(row.spent)}`),
      ].join("\n"),
    );
  }
  return blocks.length ? blocks.join("\n\n") : null;
}

/**
 * Wait this long before sending a report message. When the advertiser edits the report again in the
 * meantime, the pending message is replaced, so the group gets one message instead of several.
 */
const SEND_DELAY_MS = Number(process.env.WA_SEND_DELAY_SEC ?? 60) * 1000;

/**
 * Queues the report for the advertiser's WhatsApp group when they linked WhatsApp, picked a group
 * and kept auto-send on. Returns whether a message was queued.
 */
export async function queueReportMessage(userId: number, reportId: number, updated: boolean) {
  const [session] = await db.select().from(waSessions).where(eq(waSessions.userId, userId));
  if (!session?.wantConnected || !session.autoSend || !session.groupJid) return false;
  const [lastSent] = await db
    .select({ body: waOutbox.body })
    .from(waOutbox)
    .where(and(eq(waOutbox.reportId, reportId), eq(waOutbox.groupJid, session.groupJid), eq(waOutbox.status, "sent")))
    .orderBy(desc(waOutbox.sentAt))
    .limit(1);
  // A pending message for this report is superseded by the newer version.
  await db.delete(waOutbox).where(and(eq(waOutbox.reportId, reportId), eq(waOutbox.status, "pending")));

  // "Revisi" only when the group already received this report.
  const body = await buildReportMessage(reportId, updated && Boolean(lastSent));
  if (!body) return false;
  // Saved again without changing any number: don't repeat the same message in the group.
  if (lastSent && stripRevision(lastSent.body) === stripRevision(body)) return false;
  await db.insert(waOutbox).values({ userId, reportId, groupJid: session.groupJid, body, sendAfter: new Date(Date.now() + SEND_DELAY_MS) });
  return true;
}

const stripRevision = (body: string) => body.replace(" _(revisi)_", "");
