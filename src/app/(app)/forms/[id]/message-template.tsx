"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type OrderFields } from "@/lib/order-form-constants";
import { buildOrderMessage, MESSAGE_VARIABLES, unknownMessageVariables, type MessageCustomer } from "@/lib/order-message";

export function MessageTemplate({ value, onChange, fields, product }: {
  value: string; onChange: (value: string) => void; fields: OrderFields; product: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [insertError, setInsertError] = useState("");
  const samples: MessageCustomer = { name: "Bernad", phone: "6281234567890", email: "bernad@example.com", city: "Kediri" };
  for (const key of Object.keys(fields) as (keyof OrderFields)[]) {
    if (fields[key] === "off") samples[key] = null;
  }
  const unknown = unknownMessageVariables(value);

  function insert(token: string) {
    const input = textarea.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const text = `{{${token}}}`;
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > 500) { setInsertError("Pesan maksimal 500 karakter. Kurangi teks sebelum menambahkan variabel."); return; }
    setInsertError("");
    onChange(next);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + text.length, start + text.length); });
  }

  return <div className="grid gap-3 p-4">
    <Label htmlFor="of-message">Pesan pembuka WhatsApp</Label>
    <textarea ref={textarea} id="of-message" name="message" className="min-h-24 rounded-md border bg-background p-3 text-sm" maxLength={500} value={value} onChange={e => { setInsertError(""); onChange(e.target.value); }} aria-describedby="of-message-help" required />
    <div className="grid gap-2">
      <p className="text-xs font-medium">Sisipkan variabel dari form</p>
      <div className="flex flex-wrap gap-2">
        {MESSAGE_VARIABLES.map(variable => <Button key={variable.token} type="button" size="sm" variant="outline"
          disabled={!!variable.field && fields[variable.field] === "off"}
          title={variable.field && fields[variable.field] === "off" ? `Aktifkan field ${variable.label} di langkah Tampilan` : `Sisipkan ${variable.label}`}
          onClick={() => insert(variable.token)}>
          {variable.label} <code className="text-[11px] text-muted-foreground">{`{{${variable.token}}}`}</code>
        </Button>)}
      </div>
    </div>
    <p id="of-message-help" className="text-xs leading-relaxed text-muted-foreground">
      {"Contoh: Halo, nama saya {{nama}}, dari {{kota}}. Saya tertarik {{produk}}. Variabel diganti dengan isian pengunjung. {{name}}, {{phone}}, {{city}}, {{product}}, dan {{reference}} juga bisa dipakai. {{custom_fields}} berisi ringkasan data customer yang terisi. Field kosong atau nonaktif menjadi teks kosong."}
    </p>
    {insertError && <p role="alert" className="text-xs text-destructive">{insertError}</p>}
    {unknown.length > 0 && <p role="status" className="text-xs text-destructive">Variabel belum dikenali: {unknown.join(", ")}. Gunakan tombol di atas; variabel ini akan tetap menjadi teks biasa.</p>}
    <p className="text-xs text-muted-foreground">Produk, data customer yang aktif, dan nomor referensi tetap ditambahkan otomatis di bawah pesan.</p>
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium">Contoh hasil chat · data ilustrasi</p>
      <p className="whitespace-pre-wrap break-words text-sm">{buildOrderMessage(value, { customer: samples, product: product || "Program pilihan", reference: "CONTOH-123" })}</p>
    </div>
  </div>;
}
