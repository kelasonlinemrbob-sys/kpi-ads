"use client";
import { useRef, useState, useTransition } from "react";
import { openLeadWhatsAppAction } from "@/actions/lead-whatsapp";
import { WA_STEPS, type WaStep } from "@/lib/lead-wa-message";
import { Button } from "@/components/ui/button";

export function WaButtons({ id, phone, openedAt, compact = false }: { id: number; phone: string | null; openedAt: Record<string, string>; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<WaStep | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  function open(step: WaStep) {
    if (busy.current) return;
    busy.current = true;
    setActive(step); setError("");
    // Open during the click gesture, before the server call, to avoid popup
    // blocking. If unavailable, navigate the current tab after success instead.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    startTransition(async () => {
      try {
        const result = await openLeadWhatsAppAction(id, step);
        if (!result.ok) { tab?.close(); setError(result.error); return; }
        if (tab && !tab.closed) tab.location.replace(result.url);
        else window.location.assign(result.url);
      } catch { tab?.close(); setError("WhatsApp belum dapat dibuka. Coba lagi."); }
      finally { busy.current = false; setActive(null); }
    });
  }
  return <div className="grid gap-1.5">
    <div className={compact ? "flex gap-1" : "flex flex-wrap gap-1.5"}>{WA_STEPS.map(step => <Button key={step} type="button" size="sm" variant="outline"
      disabled={pending || !phone} onClick={() => open(step)} aria-label={`Buka WA ${step} untuk lead ${id}`}
      className={`${compact ? "h-6 rounded px-1.5 text-[11px] shadow-none pointer-coarse:h-8" : ""} ${openedAt[step] ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : ""}`}
      title={!phone ? "Nomor WhatsApp belum tersedia" : openedAt[step] ? `Terakhir dibuka ${new Date(openedAt[step]).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : `Buka WhatsApp dengan template ${step}`}>
      {pending && active === step ? "…" : `WA ${step}`}
    </Button>)}</div>
    {!phone && <span className="text-xs text-muted-foreground">Tanpa nomor WA</span>}
    {error && <p role="alert" className="max-w-64 text-xs text-destructive">{error}</p>}
  </div>;
}
