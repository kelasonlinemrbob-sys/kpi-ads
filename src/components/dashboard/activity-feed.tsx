"use client";

import * as React from "react";
import Link from "next/link";
import {
  ActivityIcon,
  AwardIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  ListPlusIcon,
  MegaphoneIcon,
  NewspaperIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareCheckBigIcon,
  TargetIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

export type FeedItem = {
  id: number;
  type: string;
  title: string;
  description: string | null;
  href: string | null;
  time: string;
  bucket: "today" | "yesterday" | "week";
};

const TYPE_META: Record<string, { icon: LucideIcon; tone: string }> = {
  report_submitted: { icon: ClipboardCheckIcon, tone: "text-info" },
  report_approved: { icon: CircleCheckIcon, tone: "text-success" },
  report_revision: { icon: RotateCcwIcon, tone: "text-warning" },
  task_created: { icon: ListPlusIcon, tone: "text-[oklch(0.55_0.2_295)] dark:text-[oklch(0.75_0.14_295)]" },
  task_updated: { icon: SquareCheckBigIcon, tone: "text-success" },
  campaign_created: { icon: MegaphoneIcon, tone: "text-info" },
  campaign_updated: { icon: MegaphoneIcon, tone: "text-warning" },
  target_updated: { icon: TargetIcon, tone: "text-destructive" },
  user_created: { icon: UserPlusIcon, tone: "text-success" },
  appraisal_final: { icon: AwardIcon, tone: "text-info" },
};

const TABS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
] as const;

export function ActivityFeed({ items, className }: { items: FeedItem[]; className?: string }) {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("today");
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const inTab = items.filter((i) => (tab === "week" ? true : i.bucket === tab));
  const shown = q ? inTab.filter((i) => `${i.title} ${i.description ?? ""}`.toLowerCase().includes(q)) : inTab;
  const label = tab === "today" ? "today" : tab === "yesterday" ? "yesterday" : "this week";

  return (
    <Panel title="Latest Updates" icon={NewspaperIcon} className={className} bodyClassName="flex flex-col">
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="grid grid-cols-3 gap-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-7 rounded-md border text-[13px] transition-colors",
                tab === t.key
                  ? "btn-primary-gradient border-transparent text-primary-foreground shadow-sm"
                  : "bg-card text-foreground/80 hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative mt-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activities"
            className="h-8 w-full rounded-md border bg-card pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </div>
        <p className="mt-2.5 text-[13px] text-muted-foreground">
          <span className="mr-1 text-base font-semibold text-foreground tabular-nums">{inTab.length}</span>
          {inTab.length === 1 ? "activity" : "activities"} {label}
        </p>
        <div className="dashed-divider mt-2 mb-0.5" />
        <ol className="relative -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 pb-4 max-xl:max-h-[480px] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]">
          {shown.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">No activity {label}.</li>}
          {shown.map((item, i) => {
            const meta = TYPE_META[item.type] ?? { icon: ActivityIcon, tone: "text-muted-foreground" };
            const Icon = meta.icon;
            const body = (
              <>
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md border bg-card">
                  <Icon className={cn("size-4", meta.tone)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.time}</span>
                  </span>
                  {item.description && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.description}</span>}
                </span>
              </>
            );
            return (
              <li key={item.id} className="relative py-2">
                {i < shown.length - 1 && (
                  <span aria-hidden className="absolute top-10 bottom-0 left-[14px] border-l border-dashed border-border" />
                )}
                {item.href ? (
                  <Link href={item.href} className="-mx-1.5 flex gap-3 rounded-lg px-1.5 transition-colors hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
