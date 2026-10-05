"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon, LoaderIcon, PlugIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteAdAccount, saveAdAccount, getLpvConversionOptions, saveLpvConversion } from "@/actions/ad-accounts";
import { PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import type { MetaConnectionStatus } from "@/lib/meta-connection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetaStatusBadge } from "@/components/meta-status";
import type { AdAccountOption } from "./campaign-dialog";

export function AdAccountsDialog({
  accounts,
  productCount,
  deletableIds,
  syncErrors,
  metaStatus,
}: {
  accounts: AdAccountOption[];
  /** Linked products per ad account id. */
  productCount: Record<number, number>;
  /** Accounts the current user may delete (supervisor: all, otherwise the ones they added). */
  deletableIds: number[];
  /** Last sync error per ad account id. */
  syncErrors: Record<number, string>;
  metaStatus: MetaConnectionStatus;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveAdAccount, undefined);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const remove = async (account: AdAccountOption) => {
    if (!confirm(`Hapus akun iklan “${account.name}”? Product yang terhubung kembali ke input manual.`)) return;
    const res = await deleteAdAccount(account.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Akun iklan dihapus");
      router.refresh();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8">
          <PlugIcon /> Akun iklan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Akun iklan</DialogTitle>
          <DialogDescription>
            Akun Meta / Google Ads yang datanya ditarik saat advertiser klik “Generate dari Ads”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          {metaStatus.state === "ok" ? (
            <PlugIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Koneksi Meta Ads</span> <MetaStatusBadge status={metaStatus} />
            </p>
            <p className="text-xs text-muted-foreground">{metaStatus.summary}</p>
            <Link href="/settings?tab=integrasi#meta-ads" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
              {metaStatus.state === "ok" ? "Kelola koneksi" : "Cara connect Meta Ads & isi token"} <ArrowRightIcon className="size-3" />
            </Link>
          </div>
        </div>

        <div className="grid gap-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">Koneksi Google Ads</p>
          <p className="text-xs text-muted-foreground">Isi Client ID, Client Secret, Refresh Token, dan MCC ID bila diperlukan. Tutorial lengkap tersedia di Settings.</p>
          <Link href="/settings?tab=integrasi#google-ads" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">Cara connect Google Ads &amp; isi kredensial <ArrowRightIcon className="size-3" /></Link>
        </div>

        <div className="divide-y rounded-lg border">
          {accounts.length === 0 && <p className="p-4 text-sm text-muted-foreground">Belum ada akun iklan.</p>}
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className={cn("size-2 shrink-0 rounded-full", PLATFORM_DOT[account.platform])} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{account.name}</p>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_LABEL[account.platform]} · {account.platform === "meta" ? `act_${account.accountId}` : account.accountId} ·{" "}
                  {productCount[account.id] ?? 0} product
                </p>
                {account.platform === "google" && deletableIds.includes(account.id) && <GoogleLpvConfig account={account} />}
                {syncErrors[account.id] && <p className="mt-0.5 text-xs text-destructive">{syncErrors[account.id]}</p>}
              </div>
              {deletableIds.includes(account.id) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(account)}
                  aria-label={`Hapus ${account.name}`}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
        </div>

        <form ref={formRef} action={action} className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select name="platform" defaultValue="meta">
            <SelectTrigger aria-label="Platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">{PLATFORM_LABEL.meta}</SelectItem>
              <SelectItem value="google">{PLATFORM_LABEL.google}</SelectItem>
            </SelectContent>
          </Select>
          <Input name="name" placeholder="Nama akun" aria-label="Nama akun" required />
          <Input name="accountId" placeholder="ID akun / customer ID" aria-label="ID akun" inputMode="numeric" required />
          <Button type="submit" disabled={pending}>
            {pending && <LoaderIcon className="animate-spin" />} Tambah
          </Button>
          {state?.error && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}


function GoogleLpvConfig({ account }: { account: AdAccountOption }) {
  const [options, setOptions] = React.useState<{ resourceName: string; name: string; category: string }[] | null>(null);
  const [value, setValue] = React.useState(account.lpvConversionAction ?? "");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const load = () => start(async () => {
    const result = await getLpvConversionOptions(account.id);
    if (!result.ok) return void toast.error(result.error);
    setOptions(result.actions);
  });
  const save = () => start(async () => {
    const result = await saveLpvConversion(account.id, value);
    if (result.error) return void toast.error(result.error);
    toast.success("Sumber LPV disimpan. Generate ulang laporan untuk mengambil datanya.");
    router.refresh();
  });
  return <div className="mt-2 grid gap-2">
    <p className="text-xs text-muted-foreground">{account.lpvConversionAction ? "LPV otomatis terhubung ke konversi Google Ads." : "LPV otomatis belum diatur."}</p>
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={load}>Pilih konversi LPV</Button>
    {options && <>
      <p className="text-xs text-muted-foreground">Pilih satu event yang menghitung kunjungan landing page dari iklan, misalnya event LPV dari Google tag atau GA4. Jangan pilih event lead atau kunjungan semua halaman.</p>
      <select aria-label={`Konversi LPV ${account.name}`} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm">
        <option value="">Belum ada / input manual</option>
        {value && !options.some((o) => o.resourceName === value) && <option value={value}>Konversi tersimpan tidak tersedia — pilih ulang</option>}
        {options.map((o) => <option key={o.resourceName} value={o.resourceName}>{o.name} · {o.category}</option>)}
      </select>
      {!options.length && <p className="text-xs text-warning">Belum ada konversi aktif. Siapkan tracking LPV di Google Ads terlebih dahulu.</p>}
      <Button type="button" size="sm" disabled={pending} onClick={save}>{pending && <LoaderIcon className="animate-spin" />}Simpan sumber LPV</Button>
    </>}
  </div>;
}
