"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleDashedIcon, CircleDotIcon, CirclePauseIcon, CircleXIcon, ExternalLinkIcon, ImageIcon, PlayIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { updateCreatives } from "@/actions/creatives";
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
import type { CreativePost } from "@/lib/creatives-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Person = { id: number; name: string; creative: boolean };

const STATUS_ICON: Record<AdCreative["status"], LucideIcon> = {
  active: CircleDotIcon,
  paused: CirclePauseIcon,
  review: CircleDashedIcon,
  takedown: CircleXIcon,
};

/** One card per content (post); ads that run the same post are summed. */
export function CreativeGallery({ posts, people }: { posts: CreativePost[]; people: Person[] }) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const open = posts.find((p) => p.key === openKey) ?? null;
  const nameOf = (id: number | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);

  return (
    <>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
        {posts.map((post) => {
          const rates = creativeRates(sumCreatives([post]));
          const video = post.format === "video";
          const StatusIcon = STATUS_ICON[post.status];
          return (
            <button
              key={post.key}
              type="button"
              onClick={() => setOpenKey(post.key)}
              className={cn(
                "group grid overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                post.status === "takedown" && "opacity-60",
              )}
            >
              <span className="relative block aspect-square bg-muted">
                {post.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    {video ? <PlayIcon className="size-8" /> : <ImageIcon className="size-8" />}
                  </span>
                )}
                <span className="absolute top-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">
                  {CREATIVE_FORMAT_LABEL[post.format]}
                </span>
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px]">
                  <StatusIcon className="size-3" /> {CREATIVE_STATUS_LABEL[post.status]}
                </span>
                {post.label && (
                  <span
                    className={cn(
                      "absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      post.label === "winning" ? "bg-foreground text-background" : "bg-background/90 text-foreground",
                    )}
                  >
                    {CREATIVE_LABEL[post.label]}
                  </span>
                )}
              </span>
              <span className="grid gap-2 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{post.product ?? "Belum terpetakan"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {post.advertiser?.name ? `${post.advertiser.name} · ` : ""}
                    {post.adType}
                    {post.ads.length > 1 ? ` · ${post.ads.length} iklan` : ""}
                  </span>
                </span>
                <span className="grid grid-cols-3 gap-2 border-t pt-2 text-center">
                  <Metric label="Impr" value={fmt.compact(post.impressions)} />
                  {video ? <Metric label="Hook" value={fmt.pct(rates.hook)} /> : <Metric label="CTR" value={fmt.pct(rates.ctr)} />}
                  <Metric label="CPL" value={fmt.rpCompact(rates.cpl)} />
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {nameOf(post.creatorId) ?? "Creator –"}
                  {nameOf(post.editorId) ? ` · edit ${nameOf(post.editorId)}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {open && <CreativeDetail post={open} people={people} onClose={() => setOpenKey(null)} />}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium tabular-nums">{value}</span>
      <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
    </span>
  );
}

function CreativeDetail({ post, people, onClose }: { post: CreativePost; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState({
    label: post.label,
    format: post.format,
    creatorId: post.creatorId,
    editorId: post.editorId,
  });
  const totals = sumCreatives(post.ads);
  const rates = creativeRates(totals);
  const video = draft.format === "video";
  const ids = post.ads.map((a) => a.id);

  const save = (patch: Parameters<typeof updateCreatives>[1], next: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...next }));
    startTransition(async () => {
      const res = await updateCreatives(ids, patch);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  const stats: [string, string][] = [
    ["Impression", fmt.num(totals.impressions)],
    ["Jumlah reach iklan", fmt.num(totals.reach)],
    ["Spend", fmt.rp(totals.spend)],
    ["CPM", fmt.rp(rates.cpm)],
    ["Klik link", fmt.num(totals.clicks)],
    ["CTR", fmt.pct(rates.ctr)],
    ["Lead", fmt.num(totals.leads)],
    ["CPL", fmt.rp(rates.cpl)],
    ...(video
      ? ([
          ["Tonton 3 detik", fmt.num(totals.videoViews)],
          ["Hook rate", fmt.pct(rates.hook)],
          ["ThruPlays", fmt.num(totals.thruplays)],
          ["Hold rate", fmt.pct(rates.hold)],
          ["Avg play time", totals.avgPlayTime === null ? "–" : `${formatPlayTime(totals.avgPlayTime)} dtk`],
        ] as [string, string][])
      : []),
  ];
  const personSelect = (value: number | null, onChange: (id: number | null) => void, label: string) => (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="h-8 w-full rounded-md border bg-card px-2 text-sm"
    >
      <option value="">–</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.creative ? "" : " (non-creative)"}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post.product ?? "Konten belum terpetakan"}</DialogTitle>
          <DialogDescription>
            {post.advertiser?.name ? `${post.advertiser.name} · ` : ""}
            {post.adType} · {post.ads.length} iklan memakai konten ini
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <span className="relative block aspect-[4/5] overflow-hidden rounded-lg border bg-muted">
              {post.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  {video ? <PlayIcon className="size-10" /> : <ImageIcon className="size-10" />}
                </span>
              )}
            </span>
            {post.permalink && (
              <Button asChild variant="outline" size="sm">
                <a href={post.permalink} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon /> Buka post
                </a>
              </Button>
            )}
          </div>

          <div className="grid content-start gap-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">Keterangan</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Keterangan">
                  {([null, "winning", "good", "average", "poor"] as const).map((value) => (
                    <button
                      key={value ?? "none"}
                      type="button"
                      role="radio"
                      aria-checked={draft.label === value}
                      disabled={pending}
                      onClick={() => save({ label: value }, { label: value })}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        draft.label === value ? "border-foreground bg-foreground text-background" : "hover:bg-accent",
                      )}
                    >
                      {value ? CREATIVE_LABEL[value] : "Belum dinilai"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Format</span>
                  <select
                    value={draft.format}
                    onChange={(e) => {
                      const format = e.target.value as AdCreative["format"];
                      save({ formatOverride: format === post.ads[0]!.detectedFormat ? null : format }, { format });
                    }}
                    className="h-8 w-full rounded-md border bg-card px-2 text-sm"
                  >
                    {Object.entries(CREATIVE_FORMAT_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Creator</span>
                  {personSelect(draft.creatorId, (creatorId) => save({ creatorId }, { creatorId }), "Creator")}
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Editor</span>
                  {personSelect(draft.editorId, (editorId) => save({ editorId }, { editorId }), "Editor")}
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">Perubahan berlaku untuk semua {post.ads.length} iklan yang memakai konten ini.</p>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/60 text-[11px] tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Iklan</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Impr</th>
                    <th className="px-3 py-2 text-right font-semibold">Spend</th>
                    <th className="px-3 py-2 text-right font-semibold">CTR</th>
                    <th className="px-3 py-2 text-right font-semibold">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {post.ads.map((ad) => {
                    const r = creativeRates(sumCreatives([ad]));
                    return (
                      <tr key={ad.id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="block max-w-64 truncate">{ad.adName}</span>
                          <span className="block max-w-64 truncate text-xs text-muted-foreground">{ad.campaignName}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{CREATIVE_STATUS_LABEL[ad.status]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt.num(ad.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt.rpCompact(ad.spend)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt.pct(r.ctr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt.rp(r.cpl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
