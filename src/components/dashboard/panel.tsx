import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hatched outer frame + white inner card, the core surface of the design. */
export function Panel({
  title,
  icon: Icon,
  iconPosition = "right",
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("hatched flex min-w-0 flex-col rounded-xl border p-1", className)}>
      {(title || action) && (
        <header className="flex min-h-8 items-center gap-2 px-2 pt-0.5 pb-1">
          {Icon && iconPosition === "left" && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/80">{title}</h2>
          {action}
          {Icon && iconPosition === "right" && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        </header>
      )}
      <div className={cn("min-h-0 min-w-0 flex-1 rounded-lg border bg-card", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <span className="mb-1 rounded-lg border bg-muted/50 p-2.5">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
