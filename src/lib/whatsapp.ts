import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { advertiserReportItems, dailyReports, users, waOutbox, waSessions, waWorker } from "@/db/schema";
import { cpr, formatId, formatRp, sumMetrics } from "@/lib/ad-metrics";
import { PLATFORM_LABEL } from "@/lib/labels";
import { advertiserReportWindows } from "@/lib/reporting";
import { formatLongDateId, parseISODate } from "@/lib/utils";

/** The worker writes a heartbeat every 2s; older than this means it is not running. */
const WORKER_STALE_MS = 15_000;

export async function isWorkerAlive() {
  const [row] = await db.select().from(waWorker).where(eq(waWorker.id, 1));
  return !!row && Date.now() - row.heartbeatAt.getTime() < WORKER_STALE_MS;
}

/** WhatsApp text for one advertiser daily report: every period with its products, totals and the notes. */
export async function buildReportMessage(reportId: number, updated: boolean) {
  const [report] = await db
    .select({ date: dailyReports.date, summary: dailyReports.summary, name: users.name })
    .from(dailyReports)
    .innerJoin(users, eq(users.id, dailyReports.userId))
    .where(eq(dailyReports.id, reportId));
  if (!report) return null;
  const items = await db
    .select()
    .from(advertiserReportItems)
    .where(eq(advertiserReportItems.reportId, reportId))
    .orderBy(asc(advertiserReportItems.product));

  const shortDate = (date: string) =>
    parseISODate(date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
  const lines = [
    `📊 *Laporan Iklan Harian*${updated ? " _(diperbarui)_" : ""}`,
    `👤 ${report.name}`,
    `📅 ${formatLongDateId(report.date)}`,
  ];

  for (const period of advertiserReportWindows(report.date)) {
    const rows = items.filter((item) => item.performanceDate === period.performanceDate);
    const day = shortDate(period.performanceDate);
    // Monday's weekend periods are labelled by weekday already ("Jumat"), so don't repeat it.
    const heading = day.startsWith(period.label) ? day : `${period.label} · ${day}`;
    lines.push("", `*${heading}* (${period.timeRange})`);
    if (!rows.length) {
      lines.push("_Belum diisi_");
      continue;
    }
    rows.forEach((row, index) => {
      lines.push(
        `${index + 1}. ${row.product} (${PLATFORM_LABEL[row.platform]})`,
        `    Spend ${formatRp(row.spent)} · Imp ${formatId(row.impressions)} · Click ${formatId(row.clicks)} · Lead ${formatId(row.leads)} · CPR ${formatRp(cpr(row))}`,
      );
    });
    if (rows.length > 1) {
      const total = sumMetrics(rows);
      lines.push(`*Total:* Spend ${formatRp(total.spent)} · Lead ${formatId(total.leads)} · CPR ${formatRp(cpr(total))}`);
    }
  }

  lines.push("", `📝 *Catatan:* ${report.summary}`);
  return lines.join("\n");
}

/**
 * Queues the report for the advertiser's WhatsApp group when they linked WhatsApp, picked a group
 * and kept auto-send on. Returns whether a message was queued.
 */
export async function queueReportMessage(userId: number, reportId: number, updated: boolean) {
  const [session] = await db.select().from(waSessions).where(eq(waSessions.userId, userId));
  if (!session?.wantConnected || !session.autoSend || !session.groupJid) return false;
  const body = await buildReportMessage(reportId, updated);
  if (!body) return false;
  await db.insert(waOutbox).values({ userId, reportId, groupJid: session.groupJid, body });
  return true;
}
