"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeftIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "./nav";

export function CommandMenu({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavSection[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);

  const entries = React.useMemo(
    () =>
      nav.flatMap((s) =>
        s.items.flatMap((item) => [
          { title: item.title, href: item.href, section: s.label, icon: item.icon },
          ...(item.children ?? [])
            .filter((c) => c.href !== item.href)
            .map((c) => ({ title: c.title, href: c.href, section: item.title, icon: item.icon })),
        ]),
      ),
    [nav],
  );
  const q = query.trim().toLowerCase();
  const results = q ? entries.filter((e) => `${e.title} ${e.section}`.toLowerCase().includes(q)) : entries;

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  React.useEffect(() => setIndex(0), [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover shadow-2xl"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-4">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setIndex((i) => Math.min(i + 1, results.length - 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setIndex((i) => Math.max(i - 1, 0)));
                if (e.key === "Enter" && results[index]) go(results[index].href);
              }}
              placeholder="Search pages…"
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results.</li>}
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={r.href + r.title}>
                  <button
                    type="button"
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => go(r.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                      i === index && "bg-accent",
                    )}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{r.section}</span>
                    {i === index && <CornerDownLeftIcon className="size-3.5 text-muted-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
