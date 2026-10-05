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
import type { CreativePeriodKey } from "@/lib/creative-period";
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
const cell = "border-b border-r border-border px-3 py-2.5 align-middle whitespace-nowrap last:border-r-0";
const select =
  "h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border bg-card px-2 pr-6 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 bg-[length:10px] bg-[right_6px_center] bg-no-repeat";
const columnWidths = [128, 168, 256, 144, 120, 116, 132, 144, 144, 112, 112, 104, 120, 80, 80, 80, 80, 136];
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
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg">
      <div role="region" aria-label="Tabel creative, geser untuk melihat semua kolom" tabIndex={0} className="relative max-h-[70vh] w-full overflow-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <table aria-label="Metrik dan pengelolaan creative" className="w-full table-fixed border-separate border-spacing-0 text-[13px]" style={{ minWidth: columnWidths.reduce((sum, width) => sum + width, 0) }}>
          <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <thead className="sticky top-0 z-20 bg-muted text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className={cn(cell, "bg-muted py-3 sm:sticky sm:left-0")}>Advertiser</th>
              <th scope="col" className={cn(cell, "py-2")}>Produk</th>
              <th scope="col" className={cn(cell, "py-2")}>Link konten</th>
              <th scope="col" className={cn(cell, "py-2")}>Tipe iklan</th>
              <th scope="col" className={cn(cell, "py-2")}>Keterangan</th>
              <th scope="col" className={cn(cell, "py-2")}>Status</th>
              <th scope="col" className={cn(cell, "py-2")}>Format konten</th>
              <th scope="col" className={cn(cell, "py-2")}>Creator</th>
              <th scope="col" className={cn(cell, "py-2")}>Editor</th>
              <th scope="col" className={cn(cell, "py-2 text-right")}>Impression</th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="Rata-rata detik video ditonton">
                Avg play time
              </th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="Video ditonton ≥ 15 detik atau sampai habis">
                ThruPlays
              </th>
              <th scope="col" className={cn(cell, "py-2 text-right")}>Spend</th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="Klik link ÷ impression">
                CTR
              </th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="Tonton 3 detik ÷ impression (video)">
                Hook
              </th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="ThruPlay ÷ tonton 3 detik (video)">
                Hold
              </th>
              <th scope="col" className={cn(cell, "py-2 text-right")}>Lead</th>
              <th scope="col" className={cn(cell, "py-2 text-right")} title="Spend ÷ lead">
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
                <tr key={r.id} className={cn("group even:bg-muted/20 hover:bg-muted/40", r.status === "takedown" && "text-muted-foreground")}>
                  <td className={cn(cell, "z-10 bg-card group-even:bg-muted group-hover:bg-muted sm:sticky sm:left-0")}>
                    <span className="block whitespace-normal break-words" title={r.advertiser?.name}>{r.advertiser?.name ?? <span className="text-muted-foreground">–</span>}</span>
                  </td>
                  <td className={cell}>
                    <span className="block whitespace-normal break-words" title={r.product ?? r.campaignName ?? undefined}>{r.product ?? <span className="text-muted-foreground">belum terpetakan</span>}</span>
                  </td>
                  <td className={cell}>
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
                            title={r.permalink}
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
                      title={people.find((person) => person.id === r.creatorId)?.name ?? "Pilih creator"}
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
                      title={people.find((person) => person.id === r.editorId)?.name ?? "Pilih editor"}
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
      <p className="px-3 py-2.5 text-xs text-muted-foreground">{num.format(rows.length)} iklan · Geser tabel ke kanan untuk melihat semua metrik. Keterangan, format, creator, dan editor dapat diubah langsung.</p>
    </div>
  );
}

const Muted = () => <span className="text-muted-foreground">–</span>;

export function SyncCreativesButton({ disabled, period = "7d" }: { disabled?: boolean; period?: CreativePeriodKey }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      className="h-8"
      disabled={pending || disabled}
      title={disabled ? "Tambahkan akun Meta di Campaigns → Akun iklan" : `Ambil Creative untuk ${period.slice(0, -1)} hari terakhir`}
      onClick={() =>
        startTransition(async () => {
          const res = await syncCreatives(period);
          if (!res.ok) toast.error(res.error);
          else {
            if (res.synced || !res.failed.length) toast.success(`${res.synced} iklan disinkron — ${res.period}`);
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
