"use client";

import { useState, useTransition } from "react";
import { formDomainAction } from "@/actions/form-domains";
import type { orderFormDomains } from "@/db/schema";
import { FORM_DOMAIN_STATUS, formDomainTxt } from "@/lib/form-domain-input";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FormDomainView = typeof orderFormDomains.$inferSelect;

export function CustomDomainSettings({ formId, domain, targetIp, onChange }: {
  formId?: number; domain: FormDomainView | null; targetIp: string; onChange: (domain: FormDomainView | null) => void;
}) {
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  function run(operation: "connect" | "check" | "remove" | "refresh") {
    if (!formId) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await formDomainAction(formId, operation, hostname);
        if (!result.ok) setError(result.error);
        else { onChange(result.domain); setConfirmRemove(false); }
      } catch { setError("Tidak dapat menghubungi server. Coba lagi."); }
    });
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { setError("Pilih teks DNS dan salin secara manual."); }
  }
  return <Panel title="Custom domain · opsional"><div className="grid gap-3 p-4 text-sm">
    <p>Gunakan domain sendiri untuk membuka form langsung, misalnya <span className="break-all">daftar.kelasonlinemrbob.com</span>. Satu domain untuk satu form.</p>
    {!formId ? <p className="text-muted-foreground">Simpan form terlebih dahulu untuk menghubungkan domain.</p> : !targetIp ? <p className="text-muted-foreground">Layanan custom domain belum diaktifkan oleh administrator server.</p> : !domain ? <>
      <Label htmlFor="of-custom-domain">Domain / subdomain</Label>
      <Input id="of-custom-domain" value={hostname} onChange={e => setHostname(e.target.value)} placeholder="daftar.kelasonlinemrbob.com" autoCapitalize="none" spellCheck={false} maxLength={253} />
      <Button type="button" disabled={pending || !hostname.trim()} onClick={() => run("connect")}>{pending ? "Menyimpan…" : "Hubungkan domain"}</Button>
      <p className="text-xs text-muted-foreground">Gunakan hostname yang belum dipakai website lain. DNS diatur pada penyedia domain Anda.</p>
    </> : <>
      <div className="rounded-lg border p-3"><p className="break-all font-medium">{domain.hostname}</p><p className="mt-1 text-xs" role="status">{FORM_DOMAIN_STATUS[domain.status] || domain.status}</p></div>
      {domain.status === "active" ? <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer" className="break-all underline">Buka https://{domain.hostname}</a> : domain.status !== "removing" && <>
        <p className="text-xs leading-relaxed text-muted-foreground">Tambahkan dua record DNS berikut. Pada Cloudflare, gunakan DNS only (awan abu-abu) selama aktivasi. Jangan pasang AAAA pada hostname ini. Nama record di bawah lengkap; panel DNS mungkin otomatis menambahkan nama domain induk.</p>
        {[{ type: "A", name: domain.hostname, value: targetIp }, { type: "TXT", name: `_kpiads.${domain.hostname}`, value: formDomainTxt(domain.verificationToken) }].map(record => <div key={record.type} className="grid gap-1 rounded-lg border p-3 text-xs">
          <p className="font-semibold">{record.type}</p><p>Nama: <code className="break-all">{record.name}</code></p>
          <p>Nilai: <code className="break-all select-all">{record.value}</code></p>
          <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => copy(record.value)}>Salin nilai</Button>
        </div>)}
        <p className="text-xs text-muted-foreground">DNS diperiksa otomatis setiap menit. HTTPS disiapkan setelah DNS cocok. Propagasi DNS dapat memerlukan waktu; tautan bawaan form tetap tersedia.</p>
      </>}
      {domain.error && <p role="status" className="text-xs text-destructive">{domain.error}</p>}
      {domain.status === "removing" && <p className="text-xs text-muted-foreground">Akses domain sudah dinonaktifkan. Server akan menyelesaikan pelepasan dalam beberapa menit. Hapus record DNS yang tadi dipasang bila domain tidak dipakai lagi.</p>}
      <div className="flex flex-wrap gap-2">
        {!["active", "removing"].includes(domain.status) && <Button type="button" size="sm" disabled={pending} onClick={() => run("check")}>Periksa DNS</Button>}
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run("refresh")}>{pending ? "Memeriksa…" : "Perbarui status"}</Button>
        {domain.status !== "removing" && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(true)}>Lepas domain</Button>}
      </div>
      {confirmRemove && <div className="grid gap-2 rounded-lg border p-3"><p className="text-xs">Lepas domain ini? Form tetap bisa dibuka melalui tautan bawaan.</p><div className="flex gap-2"><Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => run("remove")}>Ya, lepas</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirmRemove(false)}>Batal</Button></div></div>}
    </>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div></Panel>;
}
