"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2Icon, DownloadCloudIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { seoReportFiguresAction } from "@/actions/search-console";
import type { SeoReportFigures } from "@/lib/search-console";
import { Button } from "@/components/ui/button";

const num = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
const siteName = (url: string) => url.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** "Ambil dari Search Console" on the daily SEO report: clicks, impressions and top-10 keywords of the member's websites. */
export function SeoSearchConsoleFill({ date, minDate, disabled, onFill, onPickDate }: { date: string; minDate: string; disabled: boolean; onFill: (figures: SeoReportFigures) => void; onPickDate: (date: string) => void }) {
  const [suggest, setSuggest] = React.useState<string | null>(null);
  const [busy, start] = React.useTransition();
  const [figures, setFigures] = React.useState<SeoReportFigures | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { setFigures(null); setError(null); }, [date]);

  const run = () =>
    start(async () => {
      const res = await seoReportFiguresAction(date);
      if (!res.ok) { setError(res.error); setFigures(null); setSuggest(res.suggestDate && res.suggestDate >= minDate ? res.suggestDate : null); return; }
      setSuggest(null);
      setError(null);
      setFigures(res.figures);
      onFill(res.figures);
      toast.success(`Search Console: ${num(res.figures.clicks)} klik, ${num(res.figures.impressions)} impresi`);
    });

  return (
    <div className="grid gap-3 rounded-xl border border-info/25 bg-info/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Data Google Search Console</p>
          <p className="text-xs text-muted-foreground">Klik dan impresi organik pada tanggal laporan, dijumlah dari website yang Anda pegang.</p>
        </div>
        <Button type="button" size="sm" onClick={run} disabled={busy || disabled}>
          {busy ? <LoaderIcon className="animate-spin" /> : <DownloadCloudIcon />} {figures ? "Ambil ulang" : "Ambil dari Search Console"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {error}{" "}
            {suggest && <button type="button" onClick={() => onPickDate(suggest)} className="font-medium text-foreground underline underline-offset-4">Pakai tanggal {new Date(`${suggest}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })}</button>}
            {/Website saya|belum ada website/i.test(error) && <Link href="/settings?tab=integrasi&service=search-console" className="font-medium underline underline-offset-4">Pilih website</Link>}
          </span>
        </p>
      )}
      {figures && (
        <div className="grid gap-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2Icon className="size-4" /> {num(figures.clicks)} klik · {num(figures.impressions)} impresi · {num(figures.top10)} kata kunci di 10 besar</p>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {figures.sites.map((s) => (
              <li key={s.siteUrl} className="flex flex-wrap justify-between gap-x-3">
                <span className="truncate">{siteName(s.siteUrl)}</span>
                <span className="tabular-nums">{num(s.clicks)} klik · {num(s.impressions)} impresi{s.position !== null && ` · posisi ${s.position.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`}</span>
              </li>
            ))}
          </ul>
          {figures.skipped.length > 0 && (
            <p className="text-xs text-muted-foreground">Tidak dijumlah lagi karena sudah termasuk di properti domainnya: {figures.skipped.map(siteName).join(", ")}.</p>
          )}
          {!figures.final && (
            <p className="text-xs text-muted-foreground">
              Data tanggal ini belum final: Google masih memperbaruinya sampai ±3 hari. Klik <span className="font-medium text-foreground">Ambil ulang</span> saat mengedit laporan nanti untuk angka akhirnya.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
