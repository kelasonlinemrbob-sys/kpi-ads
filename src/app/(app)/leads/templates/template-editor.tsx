"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveWaTemplatesAction } from "@/actions/lead-whatsapp";
import { WA_STEPS, WA_VARIABLES, renderWaMessage, unknownWaVariables, type WaMessages, type WaStep } from "@/lib/lead-wa-message";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";

export function TemplateEditor({ campaignId, product, initial, canEdit }: { campaignId: number; product: string; initial: WaMessages; canEdit: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fields = useRef<Partial<Record<WaStep, HTMLTextAreaElement | null>>>({});
  function insert(step: WaStep, variable: string) {
    const field = fields.current[step]; if (!field) return;
    const start = field.selectionStart, end = field.selectionEnd, token = `{{${variable}}}`;
    const value = messages[step].slice(0, start) + token + messages[step].slice(end);
    if (value.length > 2000) { setError("Maksimal 2.000 karakter per template."); return; }
    setMessages(previous => ({ ...previous, [step]: value }));
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + token.length, start + token.length); });
  }
  return <form className="grid gap-4" onSubmit={event => { event.preventDefault(); setError(""); startTransition(async () => {
    try { const result = await saveWaTemplatesAction(campaignId, messages); if (!result.ok) setError(result.error); else toast.success("Template WA berhasil disimpan."); }
    catch { setError("Template belum tersimpan. Coba lagi."); }
  }); }}>
    <p className="text-sm text-muted-foreground">{canEdit ? "Template berlaku untuk semua lead produk ini. Variabel diisi otomatis saat tombol WA diklik." : "Template ini dikelola oleh advertiser pemilik atau supervisor. Anda dapat menggunakannya dari daftar lead."}</p>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{WA_STEPS.map(step => <Panel key={step} title={`WA ${step}`}><div className="grid gap-3 p-4">
      <label htmlFor={`wa-template-${step}`} className="text-sm font-medium">Pesan follow-up {step}</label>
      <textarea id={`wa-template-${step}`} ref={element => { fields.current[step] = element; }} value={messages[step]} required maxLength={2000} readOnly={!canEdit} disabled={pending}
        className="min-h-48 w-full rounded-lg border bg-background p-3 text-sm" onChange={event => setMessages(previous => ({ ...previous, [step]: event.target.value }))} />
      <span className="text-xs text-muted-foreground">{messages[step].length}/2.000 karakter</span>
      {canEdit && <div className="flex flex-wrap gap-1.5">{WA_VARIABLES.map(variable => <Button key={variable} type="button" size="sm" variant="outline" disabled={pending} onClick={() => insert(step, variable)}>{`{{${variable}}}`}</Button>)}</div>}
      {!!unknownWaVariables(messages[step]).length && <p role="alert" className="text-xs text-destructive">Variabel tidak dikenal: {unknownWaVariables(messages[step]).join(", ")}</p>}
      <div className="rounded-lg bg-muted/40 p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Contoh preview · data ilustrasi</p><p className="whitespace-pre-wrap break-words text-sm">{renderWaMessage(messages[step], { nama: "Bernad", produk: product, cso: "Echa", no_hp: "6281234567890", email: "bernad@example.com", kota: "Kediri", referensi: "contoh-referensi" })}</p></div>
    </div></Panel>)}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {canEdit && <Button className="w-fit" disabled={pending || WA_STEPS.some(step => !messages[step].trim() || unknownWaVariables(messages[step]).length > 0)}>{pending ? "Menyimpan…" : "Simpan template WA"}</Button>}
  </form>;
}
