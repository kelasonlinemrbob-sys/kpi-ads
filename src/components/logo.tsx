import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "btn-primary-gradient inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_3px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-6" />
      </svg>
    </span>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className="text-lg font-semibold tracking-tight">KPI Ads</span>}
    </span>
  );
}
