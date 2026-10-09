"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, GlobeIcon, LoaderIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { listSearchConsoleWebsitesAction, toggleSearchConsoleWebsiteAction } from "@/actions/search-console";
import type { SearchConsoleWebsiteChoice } from "@/lib/search-console";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PERMISSION: Record<NonNullable<SearchConsoleWebsiteChoice["permission"]>, string> = {
  siteOwner: "pemilik",
  siteFullUser: "akses penuh",
  siteRestrictedUser: "akses terbatas",
  siteUnverifiedUser: "belum terverifikasi",
};
/** "holiday.kampunginggris.com" for both kinds of property. */
const siteName = (url: string) => url.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** The team's Search Console websites: SEO specialists and web masters pick the ones they manage (any number), like ad accounts. */
export function SearchConsoleWebsitePicker({ connected, connectionError }: { connected: boolean; connectionError: string | null }) {
  const router = useRouter();
  const [choices, setChoices] = React.useState<SearchConsoleWebsiteChoice[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();

  const load = React.useCallback(
    () =>
      startLoading(async () => {
        try {
          const res = await listSearchConsoleWebsitesAction();
          if (!res.ok) { setError(res.error); return; }
          setChoices(res.choices);
          setError(null);
        } catch {
          setError("Daftar website belum dapat dimuat. Coba lagi.");
        }
      }),
    [],
  );
  React.useEffect(() => { if (connected) load(); }, [connected, load]);

  const act = async (site: SearchConsoleWebsiteChoice, pick: boolean) => {
    if (!pick && !confirm(`Lepas ${siteName(site.siteUrl)}? Website tidak lagi tampil di Performa SEO Anda sampai dipilih lagi.`)) return;
    setBusy(site.siteUrl);
    const res = await toggleSearchConsoleWebsiteAction(site.siteUrl, pick);
    setBusy(null);
    if (!res.ok) toast.error(res.error);
    else toast.success(pick ? `${siteName(site.siteUrl)} dipilih · ${res.count} website` : `${siteName(site.siteUrl)} dilepas`);
    load();
    router.refresh();
  };

  const q = query.trim().toLowerCase();
  const visible = (choices ?? []).filter((c) => !q || c.siteUrl.toLowerCase().includes(q));
  const mine = (choices ?? []).filter((c) => c.selected).length;

  return (
    <Panel
      title="Website Search Console saya"
      icon={GlobeIcon}
      iconPosition="left"
      action={choices && <Badge variant={mine ? "success" : "outline"}>{mine} dipilih</Badge>}
      bodyClassName="grid min-w-0 gap-4 p-4 sm:p-5"
    >
      <p className="text-sm text-muted-foreground">
        Pilih website yang Anda kelola, boleh lebih dari satu. Datanya ditarik lewat koneksi Google Search Console tim dan tampil di Performa SEO (klik, impresi, kata kunci,
        Analisa AI). Tidak perlu token atau kredensial; satu website juga boleh dipegang beberapa anggota.
      </p>
      {!connected ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{connectionError ?? "Koneksi Search Console tim belum diisi supervisor, jadi daftar website belum tersedia."}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari website…" className="h-9 pl-8" aria-label="Cari website" />
            </div>
            <Button type="button" variant="outline" size="icon" className="size-9" onClick={load} disabled={loading} aria-label="Muat ulang daftar website">
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
            </Button>
          </div>
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {!choices && loading && <p className="text-sm text-muted-foreground">Memuat website dari koneksi tim…</p>}
          {choices && (
            <div className="max-h-[28rem] divide-y overflow-y-auto rounded-lg border">
              {visible.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">{choices.length ? "Tidak ada website yang cocok." : "Koneksi tim belum punya akses ke website mana pun. Minta supervisor menambahkan akses properti ke akun Google tim."}</p>
              )}
              {visible.map((c) => (
                <div key={c.siteUrl} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", c.selected && "bg-success/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      {c.selected && <CheckCircle2Icon className="size-4 shrink-0 text-success" />}
                      <span className="truncate" title={c.siteUrl}>{siteName(c.siteUrl)}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.kind === "domain" ? "Properti domain" : c.siteUrl}
                      {c.permission && ` · ${PERMISSION[c.permission]}`}
                      {c.usedBy.length > 0 && ` · dipakai ${c.usedBy.join(", ")}`}
                      {!c.available && " · tidak lagi tersedia dari koneksi tim"}
                    </p>
                  </div>
                  {c.selected ? (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={busy !== null} onClick={() => act(c, false)}>
                      {busy === c.siteUrl && <LoaderIcon className="animate-spin" />} Lepas
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null || !c.available} onClick={() => act(c, true)}>
                      {busy === c.siteUrl && <LoaderIcon className="animate-spin" />} Pilih
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {mine > 0 && (
            <Link href="/seo" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
              Buka Performa SEO <ArrowRightIcon className="size-3.5" />
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}
