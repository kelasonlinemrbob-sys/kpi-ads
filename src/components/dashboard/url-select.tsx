"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Select bound to a URL search param; "all" removes the param. */
export function UrlSelect({
  param,
  value,
  options,
  label,
  icon,
  className,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const next = new URLSearchParams(params);
        if (v === "all") next.delete(param);
        else next.set(param, v);
        next.delete("page");
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
    >
      <SelectTrigger className={cn("h-8 w-auto min-w-40 gap-2 rounded-lg", className)} aria-label={label}>
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
