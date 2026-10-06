"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderIcon, SendIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectTelegramAction,
  findTelegramChatsAction,
  getTelegramStatus,
  saveTelegramAction,
  sendTelegramLatestAction,
} from "@/actions/telegram";
import type { TelegramStatus } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";
const labels: Record<string, string> = {
  pending: "Menunggu dikirim",
  sending: "Sedang dikirim",
  sent: "Terkirim",
  failed: "Gagal",
  unknown: "Perlu dicek di Telegram",
  cancelled: "Dibatalkan",
};
export function TelegramCard({ initial, canManage }: { initial: TelegramStatus; canManage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initial);
  const [state, action, saving] = React.useActionState(saveTelegramAction, undefined);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState("");
  const [chats, setChats] = React.useState<{ id: string; title: string; type: string }[]>([]);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [chatId, setChatId] = React.useState(initial.chatId);
  React.useEffect(() => {
    setStatus(initial);
    setChatId(initial.chatId);
  }, [initial]);
  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      setError("");
      const token = formRef.current?.elements.namedItem("token") as HTMLInputElement | null;
      if (token) token.value = "";
      router.refresh();
    }
  }, [state, router]);
  React.useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (!document.hidden)
        getTelegramStatus()
          .then((next) => {
            if (active) setStatus(next);
          })
          .catch(() => {});
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const run = (operation: typeof sendTelegramLatestAction) =>
    start(async () => {
      const result = await operation();
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setError("");
        toast.success(result?.message);
        router.refresh();
      }
    });
  const find = () =>
    start(async () => {
      const token = String(new FormData(formRef.current!).get("token") ?? "");
      const result = await findTelegramChatsAction(token);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChats(result.chats ?? []);
      setError("");
      if (!result.chats?.length)
        toast.info("Belum ada chat terdeteksi. Kirim /start ke bot atau /start@username_bot di grup, lalu cari lagi.");
    });
  return (
    <Panel
      title="Telegram laporan iklan"
      icon={SendIcon}
      iconPosition="left"
      className="border-0 bg-none p-0"
      bodyClassName="grid gap-5 p-4 sm:p-5"
    >
      <p className="text-sm text-muted-foreground">
        Satu bot dan grup tujuan untuk laporan seluruh advertiser. Konfigurasi dikelola supervisor. Telegram dan WhatsApp berjalan terpisah; aktifkan keduanya untuk
        mengirim ke dua layanan.
      </p>
      <div className="rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-medium">{status.connected ? `@${status.botName} → ${status.chatTitle}` : "Telegram belum terhubung"}</p>
        {status.connected && (
          <p className="mt-1 text-xs text-muted-foreground">
            Chat ID {status.chatId}
            {status.threadId ? ` · Topik ${status.threadId}` : ""} · {status.autoSend ? "Kirim otomatis aktif" : "Kirim otomatis nonaktif"}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {status.workerAlive ? "Layanan pengiriman aktif" : "Layanan pengiriman belum aktif — antrean menunggu server"}
        </p>
      </div>
      {status.lastMessage && (
        <div className="rounded-lg border p-3 text-sm">
          <p>
            Pesan terakhir: <strong>{labels[status.lastMessage.status] ?? status.lastMessage.status}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(status.lastMessage.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
            {status.lastMessage.nextPart > 0 ? ` · ${status.lastMessage.nextPart} bagian terkirim` : ""}
          </p>
          {status.lastMessage.error && <p className="mt-2 text-xs text-warning">{status.lastMessage.error}</p>}
        </div>
      )}
      {(error || state?.error) && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error || state?.error}
        </p>
      )}
      {canManage && status.connected && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={saving || pending || ["pending", "sending"].includes(status.lastMessage?.status ?? "")}
            onClick={() => {
              if (
                status.lastMessage?.status === "unknown" &&
                !confirm("Periksa grup Telegram terlebih dahulu. Pengiriman sebelumnya mungkin sudah masuk. Kirim ulang laporan terakhir?")
              )
                return;
              run(sendTelegramLatestAction);
            }}
          >
            {pending ? <LoaderIcon className="animate-spin" /> : <SendIcon />}
            {status.preview ? "Kirim laporan terakhir" : "Kirim pesan tes"}
          </Button>
          <Button
            variant="outline"
            disabled={saving || pending}
            onClick={() => {
              if (confirm("Putuskan Telegram dan batalkan antrean yang belum diproses? Pesan yang sedang dikirim mungkin tetap masuk."))
                run(disconnectTelegramAction);
            }}
          >
            Putuskan
          </Button>
        </div>
      )}
      {!canManage && <p className="rounded-lg border bg-muted/20 p-4 text-sm">Integrasi bersama tim. Hubungi supervisor untuk mengubah bot, grup tujuan, atau pengiriman otomatis.</p>}
      {canManage && <details open={!status.connected || !!state?.error} className="rounded-lg border">
        <summary className="cursor-pointer p-4 text-sm font-medium">
          {status.connected ? "Ubah koneksi & pengiriman" : "Hubungkan bot Telegram"}
        </summary>
        <form ref={formRef} action={action} className="grid gap-4 border-t p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="telegram-token">Bot Token</Label>
            <Input
              id="telegram-token"
              name="token"
              type="password"
              autoComplete="new-password"
              maxLength={140}
              required={!status.hasToken}
              placeholder={status.hasToken ? "Tersimpan — kosongkan bila tidak diganti" : "Token dari @BotFather"}
            />
            <p className="text-xs text-muted-foreground">Token disimpan terenkripsi dan tidak ditampilkan kembali.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="telegram-chat">Chat ID tujuan</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="telegram-chat"
                name="chatId"
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                required
                maxLength={40}
                placeholder="-1001234567890 atau @channel"
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="outline" disabled={saving || pending} onClick={find}>
                <SearchIcon />
                Cari Chat ID
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Grup privat menggunakan ID angka negatif. Pencarian membaca chat terbaru yang diterima bot.
            </p>
          </div>
          {chats.length > 0 && (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2">
              {chats.map((chat) => (
                <button
                  type="button"
                  key={chat.id}
                  onClick={() => setChatId(chat.id)}
                  className="rounded-md p-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{chat.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {chat.id} · {chat.type}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="telegram-thread">Topic ID (opsional)</Label>
            <Input
              id="telegram-thread"
              name="threadId"
              type="number"
              min={1}
              max={2147483647}
              defaultValue={status.threadId ?? ""}
              placeholder="Kosongkan untuk chat utama"
            />
            <p className="text-xs text-muted-foreground">
              Hanya untuk grup dengan topik. Isi ID topik tujuan dari tautan pesan di topik tersebut.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="autoSend" defaultChecked={status.autoSend} className="mt-1 accent-primary" />
            <span>
              Kirim otomatis ketika laporan disimpan atau diperbarui
              <span className="mt-1 block text-xs text-muted-foreground">
                Edit beruntun digabung selama 60 detik, lalu server memproses antrean setiap 30 detik. Laporan lama tidak otomatis dikirim
                saat koneksi dibuat.
              </span>
            </span>
          </label>
          <Button type="submit" disabled={saving || pending} className="w-fit">
            {saving && <LoaderIcon className="animate-spin" />}Simpan &amp; periksa koneksi
          </Button>
        </form>
      </details>}
      {status.preview && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer p-4 text-sm font-medium">Contoh laporan yang dikirim</summary>
          <pre className="overflow-x-auto border-t p-4 text-xs leading-relaxed whitespace-pre-wrap break-words">{status.preview}</pre>
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Susunan dan angka sama dengan WhatsApp. Tanda * pada contoh ditampilkan sebagai teks tebal di Telegram. Pesan panjang dibagi
            menjadi beberapa bagian.
          </p>
        </details>
      )}
      <details className="rounded-lg border" open={!status.connected}>
        <summary className="cursor-pointer p-4 text-sm font-medium">Panduan membuat bot dan menghubungkan grup</summary>
        <ol className="list-decimal space-y-3 border-t py-4 pr-4 pl-9 text-sm leading-relaxed text-muted-foreground">
          <li>
            Buka{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline">
              @BotFather
            </a>{" "}
            resmi di Telegram. Ketik <strong>/newbot</strong>, lalu tentukan nama dan username bot. Salin token yang diberikan ke kolom Bot
            Token.
          </li>
          <li>
            Tambahkan bot ke grup tujuan. Pastikan bot boleh mengirim pesan. Untuk channel, jadikan bot administrator dengan izin posting.
            Untuk chat pribadi, buka bot lalu tekan <strong>Start</strong>.
          </li>
          <li>
            Kirim perintah <strong>/start@username_bot</strong> di grup tujuan, lalu klik <strong>Cari Chat ID</strong> dan pilih grup yang
            muncul. Jika belum muncul, kirim perintah baru dan ulangi pencarian. Bot yang sudah dipakai aplikasi lain/webhook dapat diisi
            Chat ID-nya secara manual.
          </li>
          <li>
            Kosongkan Topic ID untuk chat utama, atau isi ID topik jika memakai forum. Klik <strong>Simpan &amp; periksa koneksi</strong>.
            Aplikasi memeriksa identitas dan akses bot tanpa mengirim pesan saat menyimpan.
          </li>
          <li>
            Klik <strong>Kirim laporan terakhir</strong> (atau pesan tes jika belum ada laporan), lalu periksa grup. Biarkan pengiriman
            otomatis aktif agar laporan baru dan revisi ikut masuk Telegram.
          </li>
        </ol>
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Panduan resmi:{" "}
          <a href="https://core.telegram.org/bots/features#botfather" target="_blank" rel="noreferrer" className="underline">
            BotFather
          </a>{" "}
          ·{" "}
          <a href="https://core.telegram.org/bots/api#sendmessage" target="_blank" rel="noreferrer" className="underline">
            Pengiriman pesan Telegram
          </a>
          .
        </p>
      </details>
    </Panel>
  );
}
