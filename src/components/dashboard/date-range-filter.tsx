"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDaysIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import type { DateSelection } from "@/lib/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Option = { value: string; label: string };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Period picker with months, rolling ranges and a custom from–to range, bound to the URL. */
export function DateRangeFilter({
  label,
  selection,
  months,
  rolling,
  today,
  maxDays,
  defaultRange,
}: {
  label: string;
  selection: DateSelection;
  months: Option[];
  rolling: readonly Option[];
  today: string;
  maxDays: number;
  /** Start / end of the current window, to prefill the custom range. */
  defaultRange: { from: string; to: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(selection.type === "custom" ? selection.from : defaultRange.from);
  const [to, setTo] = React.useState(selection.type === "custom" ? selection.to : defaultRange.to);

  React.useEffect(() => {
    if (!open) return;
    setFrom(selection.type === "custom" ? selection.from : defaultRange.from);
    setTo(selection.type === "custom" ? selection.to : defaultRange.to);
  }, [open, selection, defaultRange.from, defaultRange.to]);

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const key of ["period", "range", "from", "to", "page"]) next.delete(key);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setOpen(false);
    router.push(`${pathname}?${next.toString()}`);
  };

  const error = !from || !to
    ? "Isi tanggal mulai dan selesai."
    : from > to
      ? "Tanggal mulai harus sebelum tanggal selesai."
      : to > today
        ? "Tanggal selesai tidak boleh setelah hari ini."
        : daysBetween(from, to) > maxDays
          ? `Maksimal ${maxDays} hari.`
          : null;
  const isMonth = (value: string) => selection.type === "month" && selection.period === value;
  const isRolling = (value: string) => selection.type === "rolling" && selection.range === value;

  const item = (key: string, text: string, active: boolean, onSelect: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", active && "bg-accent font-medium")}
    >
      {text}
      {active && <CheckIcon className="size-4" />}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Periode"
          className="flex h-8 min-w-44 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <CalendarDaysIcon className="size-4 shrink-0 text-foreground/70" />
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),34rem)] p-0">
        <div className="grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-0.5 border-b p-1.5 sm:max-h-96 sm:overflow-y-auto sm:border-r sm:border-b-0">
            {months.slice(0, 2).map((m) => item(m.value, m.label, isMonth(m.value), () => go({ period: m.value })))}
            <div className="my-1 border-t" />
            {rolling.map((r) => item(r.value, r.label, isRolling(r.value), () => go({ range: r.value })))}
            <div className="my-1 border-t" />
            <p className="px-2 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bulan</p>
            {months.slice(2).map((m) => item(m.value, m.label, isMonth(m.value), () => go({ period: m.value })))}
          </div>
          <form
            className="grid content-start gap-3 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!error) go({ from, to });
            }}
          >
            <div>
              <p className="text-sm font-medium">Rentang kustom</p>
              <p className="text-xs text-muted-foreground">Dibandingkan dengan rentang sepanjang yang sama tepat sebelumnya.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="range-from" className="text-xs">Dari</Label>
                <Input id="range-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="h-8" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="range-to" className="text-xs">Sampai</Label>
                <Input id="range-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-8" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["Kemarin", shift(today, -1), shift(today, -1)],
                ["Minggu ini", shift(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)), today],
                ["Tahun ini", `${today.slice(0, 4)}-01-01`, today],
              ].map(([text, f, t]) => (
                <button key={text} type="button" onClick={() => (setFrom(f!), setTo(t!))} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent">
                  {text}
                </button>
              ))}
            </div>
            <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
              {error ?? `${daysBetween(from, to)} hari dipilih.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={!!error}>
                Terapkan
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
