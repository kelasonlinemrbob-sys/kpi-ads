"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, LoaderIcon, RefreshCwIcon, SearchIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { claimAdAccount, listAdAccountChoices, releaseAdAccount, type AdAccountChoice } from "@/actions/ad-accounts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/dashboard/panel";

/** The team connection's ad accounts: advertisers pick the ones they run, without any credentials. */
export function AdAccountPicker({ platform, connected }: { platform: "meta" | "google"; connected: boolean }) {
  const router = useRouter();
  const [choices, setChoices] = React.useState<AdAccountChoice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();
  const label = platform === "meta" ? "Meta" : "Google Ads";

  const load = React.useCallback(
    () =>
      startLoading(async () => {
        const res = await listAdAccountChoices(platform);
        if (res.ok) {
          setChoices(res.choices);
          setError(null);
        } else {
          setChoices(null);
          setError(res.error);
        }
      }),
    [platform],
  );
  React.useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const act = async (choice: AdAccountChoice, kind: "claim" | "release") => {
    if (kind === "release" && !confirm(`Lepas ${choice.name}? Akun tetap terdaftar beserta datanya, tetapi tidak lagi menjadi milik Anda, dan produk Anda di akun ini tidak ikut tersinkron sampai dipilih lagi.`)) return;
    setBusy(choice.accountId);
    const res = kind === "claim" ? await claimAdAccount(platform, choice.accountId) : await releaseAdAccount(platform, choice.accountId);
    setBusy(null);
    if (!res.ok) toast.error(res.error);
    else toast.success(kind === "claim" && "message" in res ? String(res.message) : `${choice.name} dilepas`);
    load();
    router.refresh();
  };

  const q = query.trim().toLowerCase();
  const visible = (choices ?? []).filter((c) => !q || `${c.name} ${c.accountId}`.toLowerCase().includes(q));
  const mine = (choices ?? []).filter((c) => c.mine).length;

  return (
    <Panel
      title={`Akun iklan ${label} saya`}
      icon={UserIcon}
      iconPosition="left"
      action={choices && <Badge variant={mine ? "success" : "outline"}>{mine} dipilih</Badge>}
      className="border-0 bg-none p-0"
      bodyClassName="grid min-w-0 gap-4 p-4 sm:p-5"
    >
      <p className="text-sm text-muted-foreground">
        Pilih akun iklan yang Anda kelola. Data akun yang dipilih ditarik lewat koneksi tim, lalu dipakai untuk Generate dari Ads, Sinkron, dan Creative. Tidak perlu token
        atau kredensial.
      </p>
      {!connected ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Koneksi {label} tim belum diisi supervisor, jadi daftar akun belum tersedia.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau ID akun…" className="h-9 pl-8" aria-label="Cari akun iklan" />
            </div>
            <Button type="button" variant="outline" size="icon" className="size-9" onClick={load} disabled={loading} aria-label="Muat ulang daftar akun">
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {!choices && loading && <p className="text-sm text-muted-foreground">Memuat akun iklan dari koneksi tim…</p>}
          {choices && (
            <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {visible.length === 0 && <p className="p-4 text-sm text-muted-foreground">{choices.length ? "Tidak ada akun yang cocok." : "Koneksi tim belum punya akses ke akun iklan mana pun."}</p>}
              {visible.map((c) => (
                <div key={c.accountId} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", c.mine && "bg-success/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {c.mine && <CheckCircle2Icon className="size-4 shrink-0 text-success" />}
                      <span className="truncate">{c.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {platform === "meta" ? `act_${c.accountId}` : `Customer ID ${c.accountId}`}
                      {c.currency && ` · ${c.currency}`}
                      {c.note && ` · ${c.note}`}
                      {c.owner && !c.mine && ` · dipakai ${c.owner.name}${c.owner.supervisor ? " (supervisor)" : ""}`}
                    </p>
                  </div>
                  {c.mine ? (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={busy !== null} onClick={() => act(c, "release")}>
                      {busy === c.accountId && <LoaderIcon className="animate-spin" />} Lepas
                    </Button>
                  ) : c.claimable ? (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => act(c, "claim")} title={c.owner ? `Ambil alih dari ${c.owner.name}` : undefined}>
                      {busy === c.accountId && <LoaderIcon className="animate-spin" />} {c.owner ? "Ambil alih" : "Pilih"}
                    </Button>
                  ) : (
                    <Badge variant="outline">Dipakai</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
