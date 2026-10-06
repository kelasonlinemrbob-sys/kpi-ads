import { getCurrentUser } from "@/lib/auth";
import { csvCell, leadFilters, listLeads } from "@/lib/lead-list";
import { LEAD_STATUS_LABEL } from "@/lib/order-form-input";
import { PAYMENT_LABEL } from "@/lib/order-form-config";
export async function GET(request:Request){
 const actor=await getCurrentUser();if(!actor||!["supervisor","advertiser","cso"].includes(actor.role))return new Response("Tidak memiliki akses",{status:403});
 const filters=leadFilters(actor,Object.fromEntries(new URL(request.url).searchParams));const rows=await listLeads(filters.where,5001);
 if(rows.length>5000)return new Response("Maksimal 5.000 lead per ekspor. Persempit rentang tanggal atau filter.",{status:400});
 const header=["ID","Referensi","Nama","No. HP","Email","Kota","Produk","Platform","Sumber","Status","Pembayaran","Nilai order (Rp)","Advertiser","CSO","Masuk (WIB)","Follow-up","Jadwal (WIB)","UTM Source","UTM Medium","UTM Campaign","UTM Term","UTM Content"];
 const date=(v:Date|null)=>v?.toLocaleString("sv-SE",{timeZone:"Asia/Jakarta"})??"";
 const csv=[header,...rows.map(r=>[r.id,r.publicId,r.name,r.phone,r.email,r.city,r.product,r.platform,r.source,LEAD_STATUS_LABEL[r.status as keyof typeof LEAD_STATUS_LABEL]??r.status,PAYMENT_LABEL[r.paymentStatus as keyof typeof PAYMENT_LABEL]??r.paymentStatus,r.revenue,r.owner,r.cso,date(r.createdAt),r.followUpStep,date(r.followUpAt),...['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].map(k=>r.attribution[k]??"")])].map(row=>row.map(csvCell).join(',')).join('\r\n');
 return new Response('\ufeff'+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="leads-${filters.from}-${filters.to}.csv"`,"Cache-Control":"private, no-store"}});
}
