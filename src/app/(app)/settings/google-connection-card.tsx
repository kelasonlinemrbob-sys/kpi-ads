"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderIcon, PlugIcon, PlusIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { saveGoogleConnectionAction, testGoogleConnectionAction, disableGoogleConnectionAction } from "@/actions/google-connection";
import { saveAdAccount } from "@/actions/ad-accounts";
import type { GoogleConnectionStatus } from "@/lib/google-connection";
import type { GoogleVerifiedAccount } from "@/lib/google-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";

const labels = { none: "Belum terhubung", configured: "Belum dites", ok: "Tes berhasil", error: "Perlu diperiksa", disabled: "Dinonaktifkan" };
export function GoogleConnectionCard({ status, canManage, registeredAccountIds, guide }: {
  status: GoogleConnectionStatus; canManage: boolean; registeredAccountIds: string[]; guide: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, saving] = React.useActionState(saveGoogleConnectionAction, undefined);
  const [pending, start] = React.useTransition();
  const [account, setAccount] = React.useState<GoogleVerifiedAccount | null>(status.account);
  const [added, setAdded] = React.useState<string[]>([]);
  const [testError, setTestError] = React.useState("");
  React.useEffect(() => { setAccount(status.account); }, [status.account]);
  React.useEffect(() => {
    if (state?.ok) { toast.success(state.message); setTestError(""); formRef.current?.reset(); router.refresh(); }
  }, [state, router]);
  const test = () => start(async () => {
    const form = formRef.current;
    const customerId = form ? String(new FormData(form).get("customerId") ?? "") : "";
    const result = await testGoogleConnectionAction(customerId);
    if (!result.ok) { setAccount(null); setTestError(result.error); toast.error(result.error); }
    else { setAccount(result.account); setTestError(""); toast.success(`Akses berhasil: ${result.account.name}`); }
    router.refresh();
  });
  const disconnect = () => {
    if (!confirm("Putuskan koneksi Google Ads? Sinkronisasi dan Generate dari akun Google berhenti sampai kredensial diisi kembali.")) return;
    start(async () => {
      const result = await disableGoogleConnectionAction();
      if (result.error) toast.error(result.error);
      else { setAccount(null); setTestError(""); toast.success("Koneksi Google Ads dinonaktifkan"); router.refresh(); }
    });
  };
  const add = () => start(async () => {
    if (!account) return;
    const form = new FormData(); form.set("platform", "google"); form.set("name", account.name.slice(0, 120)); form.set("accountId", account.accountId);
    const result = await saveAdAccount(undefined, form);
    if (result?.error) toast.error(result.error);
    else { setAdded((ids) => [...ids, account.accountId]); toast.success("Akun Google ditambahkan. Lanjutkan Sinkron dari Ads di Campaigns."); router.refresh(); }
  });
  const connected = status.hasClientSecret && status.hasRefreshToken;
  return <Panel title="Koneksi Google Ads" icon={PlugIcon} iconPosition="left" action={<Badge variant={status.state === "ok" ? "success" : "secondary"}>{labels[status.state]}</Badge>} bodyClassName="grid gap-4 p-4">
    <p className="text-sm text-muted-foreground">Hubungkan akun Google untuk metrik campaign, Sinkron dari Ads, dan Generate laporan harian. Koneksi ini dipakai bersama oleh semua akun Google yang terdaftar.</p>
    <div className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm"><p>{status.summary}</p>{status.checkedAt && <p className="text-xs text-muted-foreground">Terakhir dites: {new Date(status.checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>}{status.source === "env" && <p className="text-xs text-muted-foreground">Konfigurasi berasal dari server. Kredensial yang disimpan di form ini akan diprioritaskan.</p>}</div>
    {canManage ? <form key={`${status.clientId}:${status.loginCustomerId}:${status.state}`} ref={formRef} action={action} className="grid gap-3">
      <div className="grid gap-1.5"><Label htmlFor="google-client-id">Client ID</Label><Input id="google-client-id" name="clientId" defaultValue={status.clientId} placeholder="123456789-xxxxxxxx.apps.googleusercontent.com" autoComplete="off" spellCheck={false} required maxLength={250} /><p className="text-xs text-muted-foreground">Google Cloud → Google Auth Platform → Clients → OAuth client Web application.</p></div>
      <div className="grid gap-1.5"><Label htmlFor="google-client-secret">Client Secret</Label><Input id="google-client-secret" name="clientSecret" type="password" autoComplete="new-password" spellCheck={false} maxLength={1000} required={!status.hasClientSecret} placeholder={status.hasClientSecret ? "Tersimpan — kosongkan bila tidak diganti" : "Secret dari OAuth client yang sama"} /></div>
      <div className="grid gap-1.5"><Label htmlFor="google-refresh-token">Refresh Token</Label><Input id="google-refresh-token" name="refreshToken" type="password" autoComplete="new-password" spellCheck={false} maxLength={4000} required={!status.hasRefreshToken} placeholder={status.hasRefreshToken ? "Tersimpan — kosongkan bila tidak diganti" : "Refresh token dari OAuth Playground"} /><p className="text-xs text-muted-foreground">Ikuti langkah 4 di tutorial. Gunakan scope adwords dan OAuth client sendiri.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5"><Label htmlFor="google-mcc-id">MCC / Login Customer ID (opsional)</Label><Input id="google-mcc-id" name="loginCustomerId" defaultValue={status.loginCustomerId} inputMode="numeric" placeholder="9876543210" maxLength={20} /><p className="text-xs text-muted-foreground">ID manager jika akses melalui MCC. Kosongkan untuk akses langsung.</p></div>
        <div className="grid content-start gap-1.5"><Label htmlFor="google-customer-id">Customer ID untuk tes</Label><Input id="google-customer-id" name="customerId" defaultValue={status.account?.accountId ?? registeredAccountIds[0] ?? ""} inputMode="numeric" placeholder="1234567890" required maxLength={20} /><p className="text-xs text-muted-foreground">ID akun iklan yang menjalankan campaign (10 digit). ID manager diisi pada kolom MCC.</p></div>
      </div>
      <p className="text-xs text-muted-foreground">Client Secret dan Refresh Token disimpan terenkripsi. Jika Client ID diganti, masukkan juga secret dan token baru. Developer token tidak diperlukan.</p>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {testError && <p role="alert" className="text-sm text-destructive">{testError}</p>}
      {state?.ok && <p role="status" className="text-sm text-success">{state.message}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || pending}>{saving && <LoaderIcon className="animate-spin" />}Simpan &amp; tes</Button>{connected && <Button type="button" variant="outline" disabled={saving || pending} onClick={test}>{pending && <LoaderIcon className="animate-spin" />}Tes kredensial tersimpan</Button>}{connected && <Button type="button" variant="ghost" disabled={saving || pending} onClick={disconnect}><UnplugIcon />Putuskan</Button>}</div>
    </form> : <p className="text-sm text-muted-foreground">Kredensial dan tes koneksi dikelola oleh supervisor. Tutorial berikut dapat dibaca oleh seluruh advertiser.</p>}
    {account && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="font-medium">{account.name}</p><p className="text-xs text-muted-foreground">Customer ID {account.accountId} · {account.currency}</p></div>{registeredAccountIds.includes(account.accountId) || added.includes(account.accountId) ? <Badge variant="success">Terdaftar</Badge> : canManage && <Button type="button" variant="outline" size="sm" onClick={add} disabled={saving || pending}><PlusIcon />Tambahkan akun ini</Button>}</div>}
    <Link href="/campaigns" className="text-sm font-medium underline underline-offset-2">Buka Campaigns untuk sinkronisasi, product, dan sumber LPV</Link>
    <details open={status.state !== "ok"} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Tutorial lengkap: hubungkan Google Ads dari awal</summary><div className="mt-4">{guide}</div></details>
  </Panel>;
}
