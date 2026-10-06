"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2Icon,
  LoaderIcon,
  LogOutIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  refreshWhatsAppGroups,
  sendWhatsAppTest,
  setWhatsAppAutoSend,
  setWhatsAppGroup,
  type WhatsAppStatus,
} from "@/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/dashboard/panel";

const MESSAGE_STATUS = { pending: "menunggu dikirim", sent: "terkirim", failed: "gagal" } as const;

/** Renders WhatsApp's *bold* and _italic_ markup. */
function WaText({ text }: { text: string }) {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
      <strong key={i}>{part.slice(1, -1)}</strong>
    ) : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}

/** Link the advertiser's own WhatsApp (Baileys, via QR) and choose the report group. */
export function WhatsAppCard({ initial }: { initial: WhatsAppStatus }) {
  const router = useRouter();
  const connectionRef = React.useRef(`${initial.status}:${initial.workerAlive}`);
  const [status, setStatus] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  const refresh = React.useCallback(async () => {
    const next = await getWhatsAppStatus();
    setStatus(next);
    const connection = `${next.status}:${next.workerAlive}`;
    if (connection !== connectionRef.current) { connectionRef.current = connection; router.refresh(); }
  }, [router]);
  // Poll fast while linking (the QR rotates every ~20s), slowly otherwise.
  const linking = status.wantConnected && status.status !== "connected";
  React.useEffect(() => {
    const id = setInterval(refresh, linking ? 2000 : 10000);
    return () => clearInterval(id);
  }, [linking, refresh]);

  const run = (fn: () => Promise<unknown>, success?: string) =>
    startTransition(async () => {
      const res = (await fn()) as { error?: string } | undefined;
      if (res?.error) toast.error(res.error);
      else if (success) toast.success(success);
      await refresh();
    });

  const connected = status.status === "connected";

  return (
    <Panel title="WhatsApp laporan iklan" icon={MessageCircleIcon} iconPosition="left" className="border-0 bg-none p-0" action={<Badge variant={!status.workerAlive ? "warning" : connected ? "success" : "outline"}>{!status.workerAlive ? "Layanan offline" : connected ? "Terhubung" : linking ? "Menghubungkan" : "Belum terhubung"}</Badge>} bodyClassName="grid min-w-0 gap-5 p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        Hubungkan WhatsApp-mu sendiri. Setiap kali laporan harian dikirim atau diperbarui, ringkasannya otomatis
        terkirim dari nomormu ke grup yang dipilih.
      </p>

      {!status.workerAlive && (
        <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Layanan WhatsApp belum berjalan, jadi QR belum bisa tampil dan pesan belum terkirim. Hubungi admin untuk mengaktifkan kembali layanan.
          </span>
        </p>
      )}

      {status.lastError && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" /> {status.lastError}
        </p>
      )}

      {!status.wantConnected ? (
        <div>
          <Button onClick={() => run(connectWhatsApp)} disabled={pending}>
            {pending ? <LoaderIcon className="animate-spin" /> : <SmartphoneIcon />} Hubungkan WhatsApp
          </Button>
        </div>
      ) : !connected ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex size-[240px] shrink-0 items-center justify-center rounded-lg border bg-white">
            {status.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={status.qrDataUrl} alt="QR WhatsApp" width={240} height={240} />
            ) : (
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid gap-2 text-sm">
            <p className="font-medium">{status.qrDataUrl ? "Scan QR dengan WhatsApp-mu" : "Menyiapkan QR…"}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Buka WhatsApp di HP</li>
              <li>
                Ketuk <span className="text-foreground">⋮ / Setelan → Perangkat tertaut</span>
              </li>
              <li>
                Ketuk <span className="text-foreground">Tautkan perangkat</span>, lalu arahkan kamera ke QR ini
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">QR diperbarui otomatis.</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => run(disconnectWhatsApp)} disabled={pending}>
                Batal
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/20 bg-success/5 p-4">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-4 text-success" />
              Terhubung sebagai <span className="font-medium">+{status.phone}</span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("Putuskan WhatsApp? Perangkat akan dikeluarkan dari daftar perangkat tertaut di HP-mu.")) {
                  run(disconnectWhatsApp, "WhatsApp diputuskan");
                }
              }}
              disabled={pending}
            >
              <LogOutIcon /> Putuskan
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="grid content-start gap-2 rounded-lg border p-4">
              <Label htmlFor="wa-report-group">Grup tujuan</Label>
              <div className="flex gap-2">
                <Select disabled={pending} value={status.groupJid ?? undefined} onValueChange={(jid) => run(() => setWhatsAppGroup(jid), "Grup tujuan disimpan")}>
                  <SelectTrigger id="wa-report-group" className="min-w-0 flex-1 [&>span]:truncate">
                    <SelectValue placeholder={status.groups.length ? "Pilih grup laporan iklan" : "Belum ada grup"} />
                  </SelectTrigger>
                  <SelectContent>
                    {status.groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => run(refreshWhatsAppGroups)} disabled={pending} aria-label="Muat ulang daftar grup">
                  <RefreshCwIcon />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Nomormu harus menjadi anggota grup tersebut.</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <Checkbox className="mt-0.5" disabled={pending} checked={status.autoSend} onCheckedChange={(checked) => run(() => setWhatsAppAutoSend(checked === true))} />
              <span><span className="block font-medium">Pengiriman otomatis</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Kirim ringkasan saat laporan dikirim atau diperbarui.</span>{!status.groupJid && <span className="mt-2 block text-xs text-warning">Pilih grup tujuan agar laporan dapat dikirim.</span>}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => run(sendWhatsAppTest, "Pesan tes masuk antrean")} disabled={pending || !status.groupJid}>
              <SendIcon /> Kirim laporan terakhir sekarang
            </Button>
            {status.lastMessage && (
              <span className="text-xs text-muted-foreground">
                Pesan terakhir {MESSAGE_STATUS[status.lastMessage.status]} ·{" "}
                {new Date(status.lastMessage.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {status.lastMessage.error && ` · ${status.lastMessage.error}`}
              </span>
            )}
          </div>

          {status.preview && (
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">Pratinjau laporan terakhir</summary>
              <div className="mt-3 max-w-sm break-words rounded-lg rounded-tl-none bg-[#d9fdd3] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                <WaText text={status.preview} />
              </div>
            </details>
          )}

          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
            <p>
              Pengiriman memakai antrean dan jeda antar pesan. Pembaruan laporan yang berdekatan digabung agar grup tidak menerima pesan berulang.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
