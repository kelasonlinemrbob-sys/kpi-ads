import { BarChart3Icon } from "lucide-react";
import type { AdvertiserReportItem, AdvertiserReportItemCampaign } from "@/db/schema";
import { advertiserReportWindows } from "@/lib/reporting";
import { formatDate, formatNumber, formatRupiah } from "@/lib/utils";
import { Panel } from "@/components/dashboard/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemRow } from "./item-row";

type ItemWithCampaigns = AdvertiserReportItem & { campaigns: AdvertiserReportItemCampaign[] };

export function AdvertiserReportDetail({
  reportDate,
  cutoff,
  items,
}: {
  reportDate: string;
  /** Report deadline "HH:MM" from the reporting rules. */
  cutoff?: string;
  items: ItemWithCampaigns[];
}) {
  const windows = advertiserReportWindows(reportDate, cutoff);

  return (
    <div className="grid gap-3">
      {windows.map((window) => {
        const rows = items.filter((item) => item.performanceDate === window.performanceDate);
        return (
          <WindowPanel
            key={window.performanceDate}
            title={window.title}
            date={window.performanceDate}
            timeRange={window.timeRange}
            rows={rows}
          />
        );
      })}
    </div>
  );
}

function WindowPanel({
  title,
  date,
  timeRange,
  rows,
}: {
  title: string;
  date: string;
  timeRange: string;
  rows: ItemWithCampaigns[];
}) {
  const totals = rows.reduce(
    (total, row) => ({
      spent: total.spent + row.spent,
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      leads: total.leads + row.leads,
      landingPageViews: total.landingPageViews + (row.landingPageViews ?? 0),
    }),
    { spent: 0, impressions: 0, clicks: 0, leads: 0, landingPageViews: 0 },
  );

  const completeLpv = rows.length > 0 && rows.every((r) => r.landingPageViews !== null);
  return (
    <Panel
      title={title}
      icon={BarChart3Icon}
      iconPosition="left"
      action={
        <span className="text-xs text-muted-foreground">
          {formatDate(date, { weekday: "long", day: "2-digit", month: "long" })} · {timeRange}
        </span>
      }
    >
      <div className="p-1.5">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Platform</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Impression</TableHead>
              <TableHead className="text-right">Click</TableHead>
              <TableHead className="text-right">Result lead</TableHead>
              <TableHead className="text-right">LPV</TableHead>
              <TableHead className="text-right">CPLV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Periode ini belum dilaporkan.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <ItemRow key={row.id} item={row} campaigns={row.campaigns} />
            ))}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={2} className="font-medium">
                Total
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatRupiah(totals.spent)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatNumber(totals.impressions)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatNumber(totals.clicks)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatNumber(totals.leads)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{completeLpv ? formatNumber(totals.landingPageViews) : "—"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{completeLpv && totals.landingPageViews > 0 ? formatRupiah(totals.spent / totals.landingPageViews) : "—"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}
