"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, LoaderIcon, PlugIcon, PlugZapIcon, Settings2Icon, TriangleAlertIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { removeMetaConnectionAction, saveMetaConnectionAction, testMetaConnectionAction } from "@/actions/meta-connection";
import type { MetaConnectionStatus } from "@/lib/meta-connection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";
import { MetaConnectGuide } from "@/components/meta-connect-guide";
import { MetaStatusBadge } from "@/components/meta-status";

/** The team's Meta Ads connection. Supervisors manage the token; others see its status. */
export function MetaConnectionCard({ status, canManage }: { status: MetaConnectionStatus; canManage: boolean }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, saving] = useActionState(saveMetaConnectionAction, undefined);
  const [testing, startTest] = React.useTransition();
  const [guideOpen, setGuideOpen] = React.useState(false);

  const test = React.useCallback(
    (silent = false) =>
      startTest(async () => {
        const res = await testMetaConnectionAction();
        if (res.ok) {
          if (!silent) toast.success(`Koneksi OK — ${res.accounts.length} akun iklan bisa dibaca`);
        } else toast.error(res.error);
        router.refresh();
      }),
    [router],
  );

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
      test(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const remove = () => {
    if (!confirm("Putuskan koneksi Meta Ads tim? Generate, sinkron, dan Creative dari akun Meta seluruh advertiser akan berhenti sampai token diisi lagi.")) return;
    startTest(async () => {
      const res = await removeMetaConnectionAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Koneksi Meta Ads diputuskan");
        router.refresh();
      }
    });
  };

  const connected = status.source !== null;
  const warn = status.state !== "ok";

  return (
    <Panel title="Koneksi Meta Ads" icon={PlugIcon} iconPosition="left" action={<MetaStatusBadge status={status} />} className="border-0 bg-none p-0" bodyClassName="grid min-w-0 gap-5 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        {canManage ? (
          <>
            Satu token Meta Marketing API untuk seluruh tim. Semua akun iklan Meta yang dipilih advertiser ditarik lewat token ini saat{" "}
            <span className="text-foreground">Generate dari Ads</span>, <span className="text-foreground">Sinkron dari Ads</span>, dan Creative. Advertiser tidak perlu
            mengisi token; mereka cukup memilih akun iklannya di bawah. Pastikan semua akun iklan tim sudah di-assign ke System User.
          </>
        ) : (
          <>Koneksi Meta Ads dikelola supervisor untuk seluruh tim. Anda cukup memilih akun iklan yang Anda kelola di bawah.</>
        )}
      </p>

      <div className={cn("flex gap-2 rounded-lg border p-3 text-sm", warn && "border-warning/30 bg-warning/5")}>
        {warn ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" /> : <PlugZapIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="grid gap-1">
          <span>{status.summary}</span>
          {status.source === "env" && (
            <span className="text-xs text-muted-foreground">
              Token dibaca dari <code className="rounded bg-muted px-1">META_ACCESS_TOKEN</code> di .env. Token yang disimpan di sini
              akan dipakai lebih dulu.
            </span>
          )}
          {status.info && (
            <span className="text-xs text-muted-foreground">
              Dicek {status.checkedLabel}
              {status.info.appName && ` · aplikasi ${status.info.appName}`}
            </span>
          )}
        </div>
      </div>

      {canManage && connected && <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={() => test()} disabled={saving || testing}>{testing ? <LoaderIcon className="animate-spin" /> : <PlugZapIcon />}Tes koneksi</Button><span className="text-xs text-muted-foreground">Periksa akses akun iklan dari token tersimpan.</span></div>}
      {canManage ? (
        <details open={warn || Boolean(state?.error)} className="group/credentials min-w-0 rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden"><Settings2Icon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{connected ? "Ubah konfigurasi" : "Siapkan koneksi Meta Ads"}</span><span className="mt-0.5 block text-xs text-muted-foreground">Access token dan konfigurasi aplikasi Meta.</span></span><ChevronDownIcon className="size-4 shrink-0 transition-transform group-open/credentials:rotate-180" /></summary>
        <form ref={formRef} action={action} className="grid min-w-0 gap-4 border-t p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="meta-token">Access token</Label>
            <Input
              id="meta-token"
              name="token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={status.source === "app" ? `Tersimpan (…${status.tokenHint}) — kosongkan bila tidak diganti` : "Tempel token System User di sini"}
            />
          </div>
          <Collapsible defaultOpen={Boolean(status.appId)}>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
              Opsional: App ID &amp; App Secret (untuk memperpanjang token user jadi ±60 hari)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="meta-app-id">App ID</Label>
                <Input id="meta-app-id" name="appId" inputMode="numeric" defaultValue={status.appId ?? ""} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meta-app-secret">App Secret</Label>
                <Input
                  id="meta-app-secret"
                  name="appSecret"
                  type="password"
                  autoComplete="off"
                  placeholder={status.hasAppSecret ? "Tersimpan — kosongkan bila tidak diganti" : ""}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
          {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || testing}>
              {saving && <LoaderIcon className="animate-spin" />} Simpan &amp; tes
            </Button>
            {connected && (
              <Button type="button" variant="outline" onClick={() => test()} disabled={saving || testing}>
                {testing && <LoaderIcon className="animate-spin" />} Tes koneksi
              </Button>
            )}
            {status.source === "app" && (
              <Button type="button" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={saving || testing}>
                <UnplugIcon /> Putuskan
              </Button>
            )}
          </div>
        </form>
        </details>
      ) : null}

      {canManage && <Collapsible open={guideOpen} onOpenChange={setGuideOpen} className="rounded-lg border bg-muted/20">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium">
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          Panduan menghubungkan Meta Ads
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-3">
          <MetaConnectGuide />
        </CollapsibleContent>
      </Collapsible>}
    </Panel>
  );
}
