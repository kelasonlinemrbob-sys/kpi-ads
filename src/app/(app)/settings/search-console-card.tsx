"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { saveSearchConsoleAction, disconnectSearchConsoleAction } from "@/actions/search-console";
import type { SearchConsoleStatus } from "@/lib/search-console";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SearchConsoleCard({ status, canManage }: { status: SearchConsoleStatus; canManage: boolean }) {
  const [state, action, saving] = useActionState(saveSearchConsoleAction, undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { form.current?.reset(); toast.success(state.message); router.refresh(); }
  }, [state, router]);
  return <Panel title="Google Search Console" icon={SearchIcon} action={<Badge variant={status.connected ? "success" : "outline"}>{status.connected ? "Terhubung" : "Belum terhubung"}</Badge>} bodyClassName="grid gap-4 p-4 sm:p-5">
    <p className="text-sm text-muted-foreground">Atur satu koneksi Google Search Console untuk seluruh tim. SEO Specialist dan webmaster cukup memilih website masing-masing dari koneksi ini.</p>
    {status.error && <p role="alert" className="text-sm text-destructive">{status.error}</p>}
    {status.connected && <div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="break-all">Website tes terakhir: {status.siteUrl}</p><p className="text-xs text-muted-foreground">{status.sites.length} properti tersedia · Terakhir diuji {new Date(status.checkedAt!).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p></div>}
    <Link href="/seo" className="text-sm font-medium underline underline-offset-4">Buka performa SEO</Link>
    {canManage && <>
      <form ref={form} action={action} className="grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="gsc-client">Client ID</Label><Input id="gsc-client" name="clientId" defaultValue={status.clientId} required maxLength={250} autoComplete="off" placeholder="123-xxxx.apps.googleusercontent.com" /></div>
        <div className="grid gap-1.5"><Label htmlFor="gsc-secret">Client Secret</Label><Input id="gsc-secret" name="clientSecret" type="password" required={!status.hasClientSecret} maxLength={1000} autoComplete="new-password" placeholder={status.hasClientSecret ? "Tersimpan — kosongkan bila tidak diganti" : "Secret OAuth client"} /></div>
        <div className="grid gap-1.5"><Label htmlFor="gsc-token">Refresh Token</Label><Input id="gsc-token" name="refreshToken" type="password" required={!status.hasRefreshToken} maxLength={4000} autoComplete="new-password" placeholder={status.hasRefreshToken ? "Tersimpan — kosongkan bila tidak diganti" : "Token dengan scope webmasters.readonly"} /></div>
        <p className="text-xs text-muted-foreground">Secret dan token disimpan terenkripsi. Jika Client ID diganti, isi juga secret dan token baru. Website yang dapat diakses akun Google ini akan muncul pada pemilih website anggota tim. Supervisor dapat memantau seluruh website.</p>
        {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state?.ok && <p role="status" className="text-sm text-success">{state.message}</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={saving || pending}>{saving ? "Menguji koneksi…" : "Simpan & tes koneksi"}</Button>{status.connected && <Button type="button" variant="outline" disabled={saving || pending} onClick={() => {
          if (!confirm("Putuskan koneksi Search Console untuk seluruh tim?")) return;
          start(async () => { const result = await disconnectSearchConsoleAction(); if (result.error) toast.error(result.error); else { toast.success("Koneksi Search Console diputus."); router.refresh(); } });
        }}>Putuskan koneksi</Button>}</div>
      </form>
      <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Cara menghubungkan Google Search Console</summary><ol className="mt-3 grid list-decimal gap-2 pl-5 text-muted-foreground">
        <li>Pastikan akun Google memiliki akses ke properti website di <a className="underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Search Console</a>.</li>
        <li>Aktifkan <a className="underline" href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noreferrer">Google Search Console API</a> pada project Google Cloud. Siapkan consent screen dan OAuth client bertipe Web application.</li>
        <li>Tambahkan https://developers.google.com/oauthplayground sebagai Authorized redirect URI pada OAuth client.</li>
        <li>Buka <a className="underline" href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer">OAuth Playground</a>, klik pengaturan, aktifkan Use your own OAuth credentials, lalu isi Client ID dan Client Secret.</li>
        <li>Masukkan scope <code className="break-all">https://www.googleapis.com/auth/webmasters.readonly</code>, authorize akun pemilik akses properti, lalu Exchange authorization code for tokens. Salin Refresh Token ke form ini.</li>
        <li>Klik Simpan &amp; tes koneksi. Anggota tim kemudian memilih website di Pengaturan → Integrasi → Google Search Console. Gunakan consent screen Production untuk pemakaian berkelanjutan; token aplikasi External berstatus Testing biasanya kedaluwarsa setelah 7 hari.</li>
      </ol></details>
    </>}
  </Panel>;
}
