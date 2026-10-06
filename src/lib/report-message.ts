import { formatRp } from "./ad-metrics";
import { advertiserReportWindows } from "./reporting";
const PLATFORM: Record<string, string> = { meta: "Facebook", google: "Google", tiktok: "TikTok", shopee: "Shopee", other: "" };
const ORDER = Object.keys(PLATFORM);
export const escapeTelegramHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
export type ReportMessageItem = { performanceDate: string; platform: string; product: string; spent: number };
export function formatReportMessage(
  report: { date: string; name: string },
  items: ReportMessageItem[],
  updated: boolean,
  channel: "whatsapp" | "telegram" = "whatsapp",
) {
  const text = (value: string) => (channel === "telegram" ? escapeTelegramHtml(oneLine(value)) : oneLine(value));
  const bold = (value: string) => (channel === "telegram" ? `<b>${text(value)}</b>` : `*${text(value)}*`);
  const blocks: string[] = [];
  for (const period of advertiserReportWindows(report.date)) {
    const rows = items
      .filter((item) => item.performanceDate === period.performanceDate)
      .sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform));
    if (!rows.length) continue;
    blocks.push(
      [
        `Advertiser ${bold(report.name)}${updated && !blocks.length ? (channel === "telegram" ? " <i>(revisi)</i>" : " _(revisi)_") : ""}`,
        `Spent Iklan ${bold(period.performanceDate)}`,
        ...rows.map(
          (row) =>
            `${channel === "telegram" ? "=&gt;" : "=>"} ${text([PLATFORM[row.platform], row.product].filter(Boolean).join(" "))} = ${formatRp(row.spent)}`,
        ),
      ].join("\n"),
    );
  }
  return blocks.length ? blocks.join("\n\n") : null;
}
/** Split only between complete lines/tags; source fields are bounded to < 1000 escaped chars. */
export function splitTelegramMessage(body: string) {
  const parts: string[] = [];
  let part = "";
  for (const line of body.split("\n")) {
    if (line.length > 3500) throw new Error("Baris laporan terlalu panjang untuk Telegram.");
    if (part && part.length + line.length + 1 > 3500) {
      parts.push(part);
      part = "";
    }
    part += (part ? "\n" : "") + line;
  }
  if (part) parts.push(part);
  return parts;
}
export const canonicalTelegramMessage = (body: string) => body.replace(" <i>(revisi)</i>", "");
