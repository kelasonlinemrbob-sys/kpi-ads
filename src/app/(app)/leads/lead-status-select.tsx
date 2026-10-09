"use client";
import { useTransition, useState } from "react";
import { changeLeadStatusAction } from "@/actions/lead-whatsapp";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/order-form-constants";

export function LeadStatusSelect({ id, status }: { id: number; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="grid gap-1.5"><select aria-label={`Status lead ${id}`} value={status} disabled={pending}
    className={`h-7 w-28 rounded border px-1.5 text-xs pointer-coarse:h-8 ${status === "won" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : status === "lost" ? "border-rose-300 bg-rose-50 text-rose-800" : "bg-background"}`}
    onChange={event => { const value = event.target.value; setError(""); startTransition(async () => {
      try { const result = await changeLeadStatusAction(id, value); if (!result.ok) setError(result.error); }
      catch { setError("Status belum tersimpan. Coba lagi."); }
    }); }}>
    {LEAD_STATUSES.map(value => <option key={value} value={value}>{LEAD_STATUS_LABEL[value]}</option>)}
  </select>{pending && <span role="status" className="text-xs text-muted-foreground">Menyimpan…</span>}
    {error && <p role="alert" className="max-w-48 text-xs text-destructive">{error}</p>}
  </div>;
}
