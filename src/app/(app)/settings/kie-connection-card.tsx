"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, LoaderIcon, PlugZapIcon, Settings2Icon, SparklesIcon, TriangleAlertIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { removeKieConnectionAction, saveKieConnectionAction, testKieConnectionAction } from "@/actions/kie-connection";
import type { KieConnectionStatus } from "@/lib/kie-connection";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";

export function KieStatusBadge({ status }: { status: KieConnectionStatus }) {
  if (status.state === "ok") return <Badge variant={status.info ? "success" : "outline"}>{status.info ? "Terhubung" : "Belum dites"}</Badge>;
  if (status.state === "invalid") return <Badge variant="warning">Perlu diperiksa</Badge>;
  return <Badge variant="outline">Belum terhubung</Badge>;
}

export function KieConnectionCard({ status, canManage }: { status: KieConnectionStatus; canManage: boolean }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, saving] = useActionState(saveKieConnectionAction, undefined);
  const [testing, startTest] = React.useTransition();

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  const test = () =>
    startTest(async () => {
      const res = await testKieConnectionAction();
      if (res.ok) toast.success("Koneksi Kie AI OK");
      else toast.error(res.error);
      router.refresh();
    });

  const remove = () => {
    if (!confirm("Putuskan koneksi Kie AI tim? Analisa AI seluruh anggota berhenti sampai API key diisi lagi.")) return;
    startTest(async () => {
      const res = await removeKieConnectionAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Koneksi Kie AI diputuskan");
        router.refresh();
      }
    });
  };

  const connected = status.keyHint !== null;
  const warn = status.state !== "ok";

  return (
    <Panel title="Kie AI" icon={SparklesIcon} iconPosition="left" action={<KieStatusBadge status={status} />} className="border-0 bg-none p-0" bodyClassName="grid min-w-0 gap-5 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        {canManage ? "Satu API key Kie.ai untuk seluruh tim." : "Koneksi Kie AI dikelola supervisor untuk seluruh tim; Anda tidak perlu mengisi API key."}{" "}
        Supervisor, advertiser, dan creative memakainya untuk <span className="text-foreground">Analisa AI</span> dan{" "}
        <span className="text-foreground">Analisa creative</span> di halaman Creative, dengan model {status.model}. Setiap analisa memotong kredit dari saldo
        Kie.ai tim (maks. {status.dailyLimit} analisa per orang per 24 jam); jumlahnya tercatat di hasil analisa.
      </p>

      <div className={cn("flex gap-2 rounded-lg border p-3 text-sm", warn && "border-warning/30 bg-warning/5")}>
        {warn ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" /> : <PlugZapIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="grid gap-1">
          <span>{status.summary}</span>
          {status.checkedLabel && <span className="text-xs text-muted-foreground">Dicek {status.checkedLabel}</span>}
        </div>
      </div>

      {canManage ? (
        <details open={!connected || Boolean(state?.error)} className="group/credentials min-w-0 rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <Settings2Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{connected ? "Ubah API key" : "Siapkan koneksi Kie AI"}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Buat API key di kie.ai → API Key, lalu tempel di sini.</span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 transition-transform group-open/credentials:rotate-180" />
          </summary>
          <form ref={formRef} action={action} className="grid min-w-0 gap-4 border-t p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="kie-api-key">API key</Label>
              <Input
                id="kie-api-key"
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={connected ? `Tersimpan (…${status.keyHint}) — kosongkan bila tidak diganti` : "Tempel API key Kie.ai di sini"}
              />
            </div>
            {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || testing}>
                {saving && <LoaderIcon className="animate-spin" />} Simpan &amp; tes
              </Button>
              {connected && (
                <Button type="button" variant="outline" onClick={test} disabled={saving || testing}>
                  {testing && <LoaderIcon className="animate-spin" />} Tes koneksi
                </Button>
              )}
              {connected && (
                <Button type="button" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={saving || testing}>
                  <UnplugIcon /> Putuskan
                </Button>
              )}
            </div>
          </form>
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">API key dan tes koneksi dikelola supervisor.</p>
      )}

      <p className="text-xs text-muted-foreground">
        Kie.ai adalah penyedia pihak ketiga, bukan Anthropic. Saat analisa dijalankan, nama iklan, nama campaign dan angka performa periode terpilih dikirim ke Kie.ai.
      </p>
    </Panel>
  );
}
