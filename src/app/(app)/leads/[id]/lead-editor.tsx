"use client";
import { useActionState,useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateLeadAction } from "@/actions/order-forms";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/order-form-constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
export function LeadEditor({lead,csos,canAssign}:{lead:{id:number;status:string;notes:string;assigneeId:number};csos:{id:number;name:string}[];canAssign:boolean}){
 const [state,action,pending]=useActionState(updateLeadAction,undefined);const router=useRouter();
 useEffect(()=>{if(state?.ok){toast.success(state.message);router.refresh();}},[state,router]);
 return <form action={action} className="grid gap-3 p-4"><input type="hidden" name="id" value={lead.id} /><Label htmlFor="lead-status">Status</Label><select id="lead-status" name="status" defaultValue={lead.status} className="h-10 rounded-md border bg-background px-3 text-sm">{LEAD_STATUSES.map(s=><option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}</select>{canAssign&&<><Label htmlFor="lead-cso">CSO penanganan</Label><select id="lead-cso" name="assigneeId" className="h-10 rounded-md border bg-background px-3 text-sm" defaultValue={lead.assigneeId}>{!csos.some(c=>c.id===lead.assigneeId)&&<option value={lead.assigneeId}>Pertahankan CSO saat ini</option>}{csos.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><p className="text-xs text-muted-foreground">Pemindahan mengubah akses penanganan; advertiser asal tetap. Percakapan WhatsApp yang sudah dibuka tidak berpindah otomatis.</p></>}<Label htmlFor="lead-notes">Catatan follow-up</Label><textarea id="lead-notes" name="notes" maxLength={4000} defaultValue={lead.notes} className="min-h-24 rounded-lg border bg-background p-3 text-sm" placeholder="Hasil percakapan, kebutuhan customer, tindak lanjut…" />{state?.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}<Button disabled={pending}>{pending?"Menyimpan…":"Simpan tindak lanjut"}</Button></form>;
}
