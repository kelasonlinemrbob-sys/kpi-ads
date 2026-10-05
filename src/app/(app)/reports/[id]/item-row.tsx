"use client";

import * as React from "react";
import { ChevronRightIcon } from "lucide-react";
import type { AdvertiserReportItem, AdvertiserReportItemCampaign } from "@/db/schema";
import { PLATFORM_LABEL } from "@/lib/labels";
import { cn, formatNumber, formatRupiah } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";

/** One product row; when it was generated from the ads API it expands into its platform campaigns. */
export function ItemRow({
  item,
  campaigns,
}: {
  item: AdvertiserReportItem;
  campaigns: AdvertiserReportItemCampaign[];
}) {
  const [open, setOpen] = React.useState(false);
  const expandable = campaigns.length > 0;

  return (
    <>
      <TableRow
        className={cn(expandable && "cursor-pointer")}
        onClick={expandable ? () => setOpen((value) => !value) : undefined}
        aria-expanded={expandable ? open : undefined}
      >
        <TableCell>{PLATFORM_LABEL[item.platform]}</TableCell>
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-1.5">
            {expandable && (
              <ChevronRightIcon className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
            )}
            {item.product}
            {expandable && (
              <span className="text-xs font-normal text-muted-foreground">· {campaigns.length} campaign</span>
            )}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatRupiah(item.spent)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatNumber(item.impressions)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatNumber(item.clicks)}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{formatNumber(item.leads)}</TableCell>
        <TableCell className="text-right tabular-nums">{item.landingPageViews === null ? "—" : formatNumber(item.landingPageViews)}</TableCell>
        <TableCell className="text-right tabular-nums">{item.landingPageViews ? formatRupiah(item.spent / item.landingPageViews) : "—"}</TableCell>
      </TableRow>
      {open &&
        campaigns.map((campaign) => (
          <TableRow key={campaign.id} className="bg-muted/20 text-xs text-muted-foreground hover:bg-muted/20">
            <TableCell />
            <TableCell className="max-w-72 truncate pl-8" title={campaign.name}>
              {campaign.name}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatRupiah(campaign.spent)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(campaign.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(campaign.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(campaign.leads)}</TableCell>
            <TableCell className="text-right tabular-nums">{campaign.landingPageViews === null ? "—" : formatNumber(campaign.landingPageViews)}</TableCell>
            <TableCell className="text-right tabular-nums">{campaign.landingPageViews ? formatRupiah(campaign.spent / campaign.landingPageViews) : "—"}</TableCell>
          </TableRow>
        ))}
    </>
  );
}
