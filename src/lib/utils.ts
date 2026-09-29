import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Unit = "number" | "currency" | "percent" | "ratio";

const idNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatRupiah(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1_000_000) {
    const v = value / 1_000_000;
    if (Math.abs(v) >= 1000) return `Rp ${formatNumber(v / 1000, 1)}M`;
    return `Rp ${formatNumber(v, 1)}jt`;
  }
  return `Rp ${idNumber.format(Math.round(value))}`;
}

export function formatValue(value: number, unit: Unit, compact = false) {
  switch (unit) {
    case "currency":
      return formatRupiah(value, compact);
    case "percent":
      return `${formatNumber(value, 1)}%`;
    case "ratio":
      return `${formatNumber(value, 2)}x`;
    default:
      return compact ? formatCompact(value) : formatNumber(value, 1);
  }
}

export function formatDelta(delta: number | null) {
  if (delta === null || !Number.isFinite(delta)) return "–";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta, 1)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Date helpers operate on "YYYY-MM-DD" strings in the app's local calendar. */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(s: string, n: number) {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function formatDate(s: string | Date, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof s === "string" ? parseISODate(s) : s;
  return d.toLocaleDateString("en-GB", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

/** Indonesian long date, e.g. "Sabtu, 26 September 2026". */
export function formatLongDateId(s: string) {
  return parseISODate(s).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(d: Date) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
