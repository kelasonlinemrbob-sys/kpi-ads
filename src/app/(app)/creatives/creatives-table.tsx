"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashedIcon,
  CircleDotIcon,
  CirclePauseIcon,
  CircleXIcon,
  ExternalLinkIcon,
  ImageIcon,
  LoaderIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { syncCreatives, updateCreative } from "@/actions/creatives";
import type { AdCreative } from "@/db/schema";
import {
  CREATIVE_FORMAT_LABEL,
  CREATIVE_LABEL,
  CREATIVE_STATUS_LABEL,
  creativeRates,
  fmt,
  formatPlayTime,
  sumCreatives,
} from "@/lib/creatives";
import type { CreativeRow } from "@/lib/creatives-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS_ICON: Record<AdCreative["status"], LucideIcon> = {
  active: CircleDotIcon,
  paused: CirclePauseIcon,
  review: CircleDashedIcon,
  takedown: CircleXIcon,
};

/** Keterangan in black & white: Winning solid, Good outlined, Average plain, Kurang dashed. */
const LABEL_STYLE: Record<NonNullable<AdCreative["label"]> | "none", string> = {
  winning: "bg-foreground text-background border-foreground font-medium",
  good: "border-foreground/60 text-foreground",
  average: "border-border text-muted-foreground",
  poor: "border-dashed border-foreground/40 text-muted-foreground",
  none: "border-dashed border-border text-muted-foreground",
};

const num = new Intl.NumberFormat("id-ID");
const cell = "px-2.5 py-1.5 align-middle";
const select =
  "h-7 w-full min-w-24 data-[person]:min-w-36 cursor-pointer appearance-none rounded-md border bg-card px-2 pr-6 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 bg-[length:10px] bg-[right_6px_center] bg-no-repeat";
// Small chevron for native selects, drawn in the current text colour.
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

type Person = { id: number; name: string; creative: boolean };

export function CreativesTable({ rows: initial, people }: { rows: CreativeRow[]; people: Person[] }) {
  const [rows, setRows] = React.useState(initial);
  React.useEffect(() => setRows(initial), [initial]);

  const save = async (row: CreativeRow, patch: Parameters<typeof updateCreative>[1], optimistic: Partial<CreativeRow>) => {
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, ...optimistic } : r)));
    const res = await updateCreative(row.id, patch);
    if (res.error) {
      toast.error(res.error);
      setRows((list) => list.map((r) => (r.id === row.id ? row : r)));
    }
  };

  const creativeTeam = people.filter((p) => p.creative);
  const others = people.filter((p) => !p.creative);
  const personOptions = (
    <>
      <option value="">–</option>
      {creativeTeam.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      {others.length > 0 && (
        <optgroup label="Anggota lain">
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1900px] border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className={cn(cell, "py-2")}>Advertiser</th>
            <th className={cn(cell, "py-2")}>Produk</th>
            <th className={cn(cell, "py-2")}>Link konten</th>
            <th className={cn(cell, "py-2")}>Tipe iklan</th>
            <th className={cn(cell, "py-2")}>Keterangan</th>
            <th className={cn(cell, "py-2")}>Status</th>
            <th className={cn(cell, "py-2")}>Format konten</th>
            <th className={cn(cell, "py-2")}>Creator</th>
            <th className={cn(cell, "py-2")}>Editor</th>
            <th className={cn(cell, "py-2 text-right")}>Impression</th>
            <th className={cn(cell, "py-2 text-right")} title="Rata-rata detik video ditonton">
              Avg play time
            </th>
            <th className={cn(cell, "py-2 text-right")} title="Video ditonton ≥ 15 detik atau sampai habis">
              ThruPlays
            </th>
            <th className={cn(cell, "py-2 text-right")}>Spend</th>
            <th className={cn(cell, "py-2 text-right")} title="Klik link ÷ impression">
              CTR
            </th>
            <th className={cn(cell, "py-2 text-right")} title="Tonton 3 detik ÷ impression (video)">
              Hook
            </th>
            <th className={cn(cell, "py-2 text-right")} title="ThruPlay ÷ tonton 3 detik (video)">
              Hold
            </th>
            <th className={cn(cell, "py-2 text-right")}>Lead</th>
            <th className={cn(cell, "py-2 text-right")} title="Spend ÷ lead">
              CPL
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const StatusIcon = STATUS_ICON[r.status];
            const video = r.format === "video";
            const rates = creativeRates(sumCreatives([r]));
            return (
              <tr key={r.id} className={cn("border-t hover:bg-muted/40", r.status === "takedown" && "text-muted-foreground")}>
                <td className={cell}>
                  <span className="whitespace-nowrap">{r.advertiser?.name ?? <span className="text-muted-foreground">–</span>}</span>
                </td>
                <td className={cell}>
                  <span className="whitespace-nowrap">{r.product ?? <span className="text-muted-foreground" title={r.campaignName ?? ""}>belum terpetakan</span>}</span>
                </td>
                <td className={cn(cell, "max-w-[27rem]")}>
                  <span className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {r.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnailUrl} alt="" className="size-full object-cover grayscale-[20%]" loading="lazy" />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0">
                      {r.permalink ? (
                        <a
                          href={r.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 truncate text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                        >
                          <span className="truncate">{r.permalink.replace(/^https:\/\/(www\.)?facebook\.com\//, "").replace(/\/$/, "")}</span>
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Tanpa post</span>
                      )}
                      <span className="block truncate text-[11px] text-muted-foreground" title={`${r.adName} · ${r.campaignName ?? ""}`}>
                        {r.adName}
                      </span>
                    </span>
                  </span>
                </td>
                <td className={cn(cell, "whitespace-nowrap")}>{r.adType}</td>
                <td className={cell}>
                  <select
                    aria-label="Keterangan"
                    value={r.label ?? ""}
                    onChange={(e) => {
                      const label = (e.target.value || null) as CreativeRow["label"];
                      save(r, { label }, { label });
                    }}
                    className={cn(select, "rounded-full", LABEL_STYLE[r.label ?? "none"])}
                    style={chevron}
                  >
                    <option value="">–</option>
                    {Object.entries(CREATIVE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={r.platformStatus ?? undefined}>
                    <StatusIcon className={cn("size-3.5", r.status === "active" ? "text-foreground" : "text-muted-foreground")} />
                    {CREATIVE_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className={cell}>
                  <select
                    aria-label="Format konten"
                    value={r.format}
                    onChange={(e) => {
                      const value = e.target.value as AdCreative["format"];
                      // Picking what Meta detected clears the override.
                      const formatOverride = value === r.detectedFormat ? null : value;
                      save(r, { formatOverride }, { format: value, formatOverridden: formatOverride !== null });
                    }}
                    className={cn(select, r.formatOverridden && "border-foreground/50")}
                    style={chevron}
                    title={r.formatOverridden ? `Diubah manual (Meta: ${CREATIVE_FORMAT_LABEL[r.detectedFormat]})` : "Dari Meta"}
                  >
                    {Object.entries(CREATIVE_FORMAT_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cell}>
                  <select
                    aria-label="Creator"
                    value={r.creatorId ?? ""}
                    data-person
                    onChange={(e) => {
                      const creatorId = e.target.value ? Number(e.target.value) : null;
                      save(r, { creatorId }, { creatorId });
                    }}
                    className={select}
                    style={chevron}
                  >
                    {personOptions}
                  </select>
                </td>
                <td className={cell}>
                  <select
                    aria-label="Editor"
                    value={r.editorId ?? ""}
                    data-person
                    onChange={(e) => {
                      const editorId = e.target.value ? Number(e.target.value) : null;
                      save(r, { editorId }, { editorId });
                    }}
                    className={select}
                    style={chevron}
                  >
                    {personOptions}
                  </select>
                </td>
                <td className={cn(cell, "text-right font-medium tabular-nums")}>{num.format(r.impressions)}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{video ? formatPlayTime(r.avgPlayTime) : <Muted />}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{video ? num.format(r.thruplays) : <Muted />}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{fmt.rpCompact(r.spend)}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{fmt.pct(rates.ctr)}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{video ? fmt.pct(rates.hook) : <Muted />}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{video ? fmt.pct(rates.hold) : <Muted />}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{num.format(r.leads)}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{fmt.rp(rates.cpl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Muted = () => <span className="text-muted-foreground">–</span>;

export function SyncCreativesButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      className="h-8"
      disabled={pending || disabled}
      title={disabled ? "Tambahkan akun Meta di Campaigns → Akun iklan" : "Ambil semua iklan & angka terbaru dari Meta Ads"}
      onClick={() =>
        startTransition(async () => {
          const res = await syncCreatives();
          if (!res.ok) toast.error(res.error);
          else {
            if (res.synced || !res.failed.length) toast.success(`${res.synced} iklan disinkron dari Meta`);
            for (const failure of res.failed) toast.error(`${failure.account}: ${failure.error}`);
          }
          router.refresh();
        })
      }
    >
      {pending ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Sinkron dari Meta
    </Button>
  );
}
