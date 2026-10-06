"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, LoaderIcon, RefreshCwIcon, TableIcon } from "lucide-react";
import { toast } from "sonner";
import { saveSheetsConnectionAction, syncSheetsAction, pauseSheetsAction } from "@/actions/google-sheets";
import type { SheetsStatus } from "@/lib/google-sheets";
import { SHEETS_SCOPE } from "@/lib/sheets-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";

export function GoogleSheetsCard({ status, canManage }: { status: SheetsStatus; canManage: boolean }) {
  const router = useRouter();
  const form = React.useRef<HTMLFormElement>(null);
  const [state, action, saving] = React.useActionState(saveSheetsConnectionAction, undefined);
  const [pending, start] = React.useTransition();
  const [feedback, setFeedback] = React.useState<{ error?: string; message?: string }>();
  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      setFeedback(undefined);
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  const run = (operation: typeof syncSheetsAction) =>
    start(async () => {
      const result = await operation();
      setFeedback(result);
      if (result?.error) toast.error(result.error);
      else if (result?.message) toast.success(result.message);
      router.refresh();
    });
  return (
    <Panel
      title="Laporan 24 jam ke Google Sheets"
      icon={TableIcon}
      iconPosition="left"
      className="border-0 bg-none p-0"
      bodyClassName="grid min-w-0 gap-5 p-4 sm:p-5"
    >
      <p className="text-sm text-muted-foreground">
        Kirim laporan advertiser yang sudah disimpan, satu baris per orang, produk, dan tanggal performa. Nilai dan catatan mengikuti
        laporan aplikasi.
      </p>
      <div className="rounded-lg border border-info/20 bg-info/5 p-4 text-sm">
        <p className="font-medium">Hanya data sehari penuh · 00.00–24.00 WIB</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Bagian “hari ini sampai batas jam” selalu dilewati, termasuk jika laporan itu sudah lama. Data baru dapat dikirim ketika disimpan
          kembali sebagai hasil sehari penuh pada laporan berikutnya. Laporan Senin mencakup Jumat, Sabtu, dan Minggu.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Baris sehari penuh</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{status.eligible}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Parsial / hari ini dilewati</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{status.excluded}</p>
        </div>
      </div>
      {status.url && (
        <div className="min-w-0 rounded-lg border bg-muted/20 p-3 text-sm">
          <a
            href={status.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-2 font-medium underline underline-offset-4"
          >
            <span className="truncate">{status.title ? `${status.title} → ${status.tab}` : "Buka sheet tujuan"}</span>
            <ExternalLinkIcon className="size-3.5 shrink-0" />
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.enabled ? "Otomatis aktif · diperiksa setiap 5 menit oleh server" : "Otomatis belum aktif / dijeda"}
          </p>
        </div>
      )}
      {status.result && (
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <p className="font-medium">Sinkron terakhir berhasil</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(status.result.at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · {status.result.appended} baru ·{" "}
            {status.result.updated} diperbarui · {status.result.unchanged} sudah sesuai · {status.result.removed} dibersihkan
          </p>
        </div>
      )}
      {(state?.error || feedback?.error || status.error) && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {state?.error || feedback?.error || status.error}
        </p>
      )}
      {feedback?.message && (
        <p role="status" className="text-sm text-success">
          {feedback.message}
        </p>
      )}
      {canManage && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => run(syncSheetsAction)} disabled={saving || pending || !status.configured}>
              {pending ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />}Sinkron sekarang
            </Button>
            {status.enabled && (
              <Button type="button" variant="outline" disabled={saving || pending} onClick={() => run(pauseSheetsAction)}>
                Jeda otomatis
              </Button>
            )}
          </div>
          <details open={!status.hasRefreshToken || !!state?.error} className="rounded-lg border">
            <summary className="cursor-pointer p-4 text-sm font-medium">Konfigurasi Google Sheets</summary>
            <form ref={form} action={action} className="grid gap-4 border-t p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="sheets-url">URL spreadsheet dan tab tujuan</Label>
                <Input
                  id="sheets-url"
                  name="url"
                  type="url"
                  required
                  defaultValue={status.url}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
                />
                <p className="text-xs text-muted-foreground">
                  Salin URL setelah membuka tab yang dituju. Nilai gid menentukan tab, bukan urutannya.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheets-client-id">Client ID Google Sheets</Label>
                <Input id="sheets-client-id" name="clientId" required defaultValue={status.clientId} maxLength={250} autoComplete="off" placeholder="123-xxx.apps.googleusercontent.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheets-client-secret">Client Secret Google Sheets</Label>
                <Input id="sheets-client-secret" name="clientSecret" type="password" autoComplete="new-password" maxLength={1000} required={!status.hasClientSecret} placeholder={status.hasClientSecret ? "Tersimpan — kosongkan bila tidak diganti" : "Secret OAuth client untuk Sheets"} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheets-refresh-token">Refresh Token Google Sheets</Label>
                <Input
                  id="sheets-refresh-token"
                  name="refreshToken"
                  type="password"
                  autoComplete="new-password"
                  maxLength={4000}
                  placeholder={status.hasRefreshToken ? "Tersimpan — kosongkan jika tidak diganti" : "Token dengan izin spreadsheets"}
                />
                <p className="text-xs text-muted-foreground">
                  Kredensial Sheets disimpan terenkripsi untuk seluruh tim, terpisah dari Google Ads pribadi. Jika Client ID berubah, isi Client Secret dan Refresh Token baru.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={status.enabled || !status.hasRefreshToken}
                  className="mt-1 accent-primary"
                />
                <span>
                  Aktifkan sinkronisasi otomatis setiap 5 menit
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Laporan sehari penuh yang lama ikut dikirim. Perubahan laporan memperbarui baris milik aplikasi, tanpa menggandakan
                    baris.
                  </span>
                </span>
              </label>
              <Button type="submit" className="w-fit" disabled={saving || pending}>
                {saving && <LoaderIcon className="animate-spin" />}Simpan &amp; periksa akses
              </Button>
            </form>
          </details>
        </>
      )}
      <details className="rounded-lg border" open={!status.hasRefreshToken}>
        <summary className="cursor-pointer p-4 text-sm font-medium">Panduan menghubungkan Google Sheets</summary>
        <ol className="list-decimal space-y-3 border-t py-4 pr-4 pl-9 text-sm leading-relaxed text-muted-foreground">
          <li>
            Buka spreadsheet dengan akun Google yang akan dihubungkan. Pastikan akun tersebut memiliki akses{" "}
            <strong className="text-foreground">Editor</strong>, termasuk akses edit tab yang diproteksi.
          </li>
          <li>
            Di{" "}
            <a
              href="https://console.cloud.google.com/apis/library/sheets.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Cloud → Google Sheets API
            </a>
            , pilih project yang sama dengan Client ID Google Sheets, lalu klik <strong>Enable</strong>. Tambahkan scope Sheets pada Google
            Auth Platform → Data Access bila diperlukan.
          </li>
          <li>
            Di Google Auth Platform → Clients, buka OAuth client yang dipakai aplikasi. Tambahkan{" "}
            <code className="break-all">https://developers.google.com/oauthplayground</code> sebagai Authorized redirect URI.
          </li>
          <li>
            Buka{" "}
            <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" className="underline">
              OAuth 2.0 Playground
            </a>
            . Klik roda gigi, centang <strong>Use your own OAuth credentials</strong>, lalu isi Client ID dan Client Secret yang sama dengan
            Google Sheets di atas. Pilih akses <strong>Offline</strong> dan prompt <strong>Consent</strong>.
          </li>
          <li>
            Masukkan scope <code className="break-all text-foreground">{SHEETS_SCOPE}</code> pada Step 1. Klik{" "}
            <strong>Authorize APIs</strong>, masuk sebagai akun Editor sheet, lalu setujui akses.
          </li>
          <li>
            Di Step 2, klik <strong>Exchange authorization code for tokens</strong>. Salin <strong>Refresh token</strong> ke form di atas.
            Jangan menggunakan Access Token atau mengganti token Google Ads dengan token yang hanya memiliki izin Sheets.
          </li>
          <li>
            Klik <strong>Simpan &amp; periksa akses</strong>, kemudian <strong>Sinkron sekarang</strong>. Periksa hasil sinkron dan baris
            baru di sheet. Pemeriksaan akses memvalidasi pembacaan dan header; izin menulis dikonfirmasi saat sinkron.
          </li>
          <li>
            Untuk penggunaan rutin, atur Audience OAuth ke <strong>In production</strong> dan ikuti persyaratan verifikasi Google. Token
            aplikasi External berstatus Testing dapat kedaluwarsa setelah 7 hari.{" "}
            <a
              href="https://developers.google.com/identity/protocols/oauth2#expiration"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Panduan masa berlaku token
            </a>
            .
          </li>
        </ol>
      </details>
      <details className="rounded-lg border">
        <summary className="cursor-pointer p-4 text-sm font-medium">Pemetaan kolom dan pembaruan data</summary>
        <div className="grid gap-3 border-t p-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            A: waktu laporan dikirim (WIB) · B: nama advertiser · C: tanggal performa · D: Facebook/Google · E: produk · F: spent · G:
            impression · H: klik · I: lead · J: catatan.
          </p>
          <p>
            Header B pada template lama bernama “Timestamp”, tetapi isinya nama advertiser. Kolom ID dan Post Name (K–L) serta data lama
            tidak diubah. CPR, LPV, dan CPLV tidak ditulis karena template ini tidak mempunyai kolom tersebut.
          </p>
          <p>
            Aplikasi menambahkan satu kolom penanda tersembunyi di paling kanan. Jangan hapus penanda ini. Jika produk dihapus dari laporan,
            hanya isi A–J dan penanda pada baris milik aplikasi yang dibersihkan; baris historis lainnya tetap dipertahankan.
          </p>
        </div>
      </details>
    </Panel>
  );
}
