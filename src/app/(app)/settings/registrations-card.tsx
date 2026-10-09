"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderIcon, RefreshCwIcon, TriangleAlertIcon, UnplugIcon, UserRoundCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { removeRegistrationKeyAction, saveRegistrationKeyAction, setRegistrationEffectiveFromAction, syncRegistrationsAction } from "@/actions/registrations";
import type { RegistrationStatus } from "@/lib/registrations";
import { cn, formatRupiah } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";

const n = (v: number) => v.toLocaleString("id-ID");
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function RegistrationsStatusBadge({ status }: { status: RegistrationStatus }) {
  if (!status.connected) return <Badge variant="outline">Belum terhubung</Badge>;
  if (status.last && !status.last.ok) return <Badge variant="warning">Perlu diperiksa</Badge>;
  return <Badge variant="success">{status.last ? "Tersinkron" : "Belum sinkron"}</Badge>;
}

/** A registration app (LKBI or Kelas Online) → Closing & Revenue. Supervisors manage the key; everyone sees the mapping. */
export function RegistrationsCard({ status, canManage, monthLabel }: { status: RegistrationStatus; canManage: boolean; monthLabel: string }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, saving] = useActionState(saveRegistrationKeyAction, undefined);
  const [busy, start] = React.useTransition();
  const [from, setFrom] = React.useState(status.effectiveFrom);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  const sync = () =>
    start(async () => {
      const res = await syncRegistrationsAction(status.source);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      router.refresh();
    });
  const saveFrom = () =>
    start(async () => {
      const res = await setRegistrationEffectiveFromAction(from, status.source);
      if (res.ok) toast.success(`Closing & Revenue dihitung mulai ${from}`);
      else toast.error(res.error);
      router.refresh();
    });
  const remove = () => {
    if (!confirm(`Putuskan koneksi ${status.label}? Data yang sudah tersalin tetap dipakai, tapi tidak bertambah lagi.`)) return;
    start(async () => {
      const res = await removeRegistrationKeyAction(status.source);
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  };

  const warn = Boolean(status.problem || (status.last && !status.last.ok));
  const kelas = status.source === "kelas";
  const id = (name: string) => `${status.source}-${name}`;
  return (
    <Panel title={status.label} icon={UserRoundCheckIcon} iconPosition="left" action={<RegistrationsStatusBadge status={status} />} className="border-0 bg-none p-0" bodyClassName="grid min-w-0 gap-5 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        {kelas ? (
          <>
            Pendaftaran Kelas Online Mr.BOB (app.kelasonlinemrbob.com) disalin otomatis tiap 5 menit. Pendaftaran yang bukti transfernya sudah dikirim menjadi{" "}
            <span className="text-foreground">Closing</span>, dan total transfernya menjadi <span className="text-foreground">Revenue</span> produk yang cocok, pada tanggal bukti
            dikirim (WIB). Paket terbaca sebagai &quot;ADULT · kelas · paket&quot; atau &quot;KIDS · kelas · paket&quot;. Perpanjangan member tidak dihitung. ROAS ikut terhitung dari Revenue ÷ Ad Spend.
          </>
        ) : (
          <>
            Pendaftaran dari aplikasi LKBI Mr.BOB (lkbimrbob.com) disalin otomatis tiap 5 menit. Pendaftaran yang pembayarannya sudah diterima admin menjadi{" "}
            <span className="text-foreground">Closing</span>, dan totalnya menjadi <span className="text-foreground">Revenue</span> produk yang paketnya cocok, pada tanggal
            pembayaran diterima (WIB). ROAS ikut terhitung dari Revenue ÷ Ad Spend.
          </>
        )}
      </p>

      <div className={cn("grid gap-1 rounded-lg border p-3 text-sm", warn && "border-warning/30 bg-warning/5")}>
        <span className="flex items-start gap-2">
          {warn && <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />}
          {status.problem ??
            (!status.connected
              ? `Kunci API ${status.label} belum diisi supervisor.`
              : status.last
                ? status.last.ok
                  ? `Sinkron terakhir ${when(status.last.at)} WIB · ${n(status.total)} pendaftaran tersalin, ${n(status.paid)} sudah dibayar.`
                  : `Sinkron ${when(status.last.at)} WIB gagal: ${status.last.error}`
                : "Terhubung, belum pernah disinkron.")}
        </span>
        <span className="text-xs text-muted-foreground">
          {kelas
            ? "Data yang disalin: nama, jenis program (Adult/Kids), kelas, paket, status, total transfer, tanggal bukti dikirim dan kota. Nomor WhatsApp, email, Instagram dan bukti transfer tidak disalin."
            : "Data yang disalin: nama, paket, status, total bayar, tanggal bayar, sumber info dan kota. Nomor HP, email, alamat dan bukti transfer tidak disalin."}
        </span>
      </div>

      {canManage && (
        <div className="grid gap-4 rounded-lg border p-4">
          <form ref={formRef} action={action} className="grid gap-2">
            <input type="hidden" name="source" value={status.source} />
            <Label htmlFor={id("key")}>Kunci API</Label>
            <div className="flex flex-wrap gap-2">
              <Input id={id("key")} name="apiKey" type="password" autoComplete="off" spellCheck={false} className="min-w-0 flex-1" placeholder={status.keyHint ? `Tersimpan (…${status.keyHint}) — isi untuk mengganti` : `${status.keyPrefix}…`} />
              <Button type="submit" disabled={saving || busy}>{saving && <LoaderIcon className="animate-spin" />} Simpan &amp; tes</Button>
            </div>
            {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
            <p className="text-xs text-muted-foreground">Kunci dikunci ke IP server oleh pengelola aplikasi pendaftaran, dan disimpan terenkripsi.</p>
          </form>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={id("from")}>Hitung Closing &amp; Revenue mulai</Label>
              <Input id={id("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </div>
            <Button type="button" variant="outline" onClick={saveFrom} disabled={busy || from === status.effectiveFrom}>Simpan tanggal</Button>
            {status.connected && (
              <Button type="button" variant="outline" onClick={sync} disabled={busy}>
                {busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Sinkron sekarang
              </Button>
            )}
            {status.connected && (
              <Button type="button" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={busy}>
                <UnplugIcon /> Putuskan
              </Button>
            )}
          </div>
        </div>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Paket → produk · {monthLabel}</h3>
        {status.byProduct.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada produk yang diberi paket {status.label}. Pilih aplikasi <span className="text-foreground">{status.label}</span> dan isi kolom paket pendaftaran di{" "}
            <Link href="/campaigns?tab=products" className="underline underline-offset-4">Campaigns → Product</Link>.
          </p>
        ) : (
          <div className="divide-y rounded-lg border text-sm">
            {status.byProduct.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span> <span className="text-muted-foreground">· {p.ownerName}</span>
                  <span className="block text-xs text-muted-foreground">Paket: {p.keywords === "*" ? "semua paket lainnya" : p.keywords}</span>
                  {p.keywords.split(",").some((k) => k.trim() === "*") && status.viaFallback.some((f) => f.productId === p.id) && (
                    <span className="block text-xs text-muted-foreground">
                      Termasuk lewat *: {status.viaFallback.filter((f) => f.productId === p.id).map((f) => `${f.packageName} (${n(f.n)})`).join(", ")}
                    </span>
                  )}
                </span>
                <span className="text-right tabular-nums">
                  {n(p.closing)} closing
                  <span className="block text-xs text-muted-foreground">{formatRupiah(p.revenue)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {status.unmapped.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Paket dibayar (sejak {status.effectiveFrom}) yang belum masuk produk mana pun:{" "}
            {status.unmapped.slice(0, 12).map((p) => `${p.packageName} (${n(p.n)})`).join(", ")}
            {status.unmapped.length > 12 && `, dan ${status.unmapped.length - 12} lainnya`}.
          </p>
        )}
      </section>
    </Panel>
  );
}
