import { z } from "zod";
import { appearanceSchema, trackingSchema } from "./order-form-config";
export const FIELD_LABELS = { name: "Nama", phone: "No. HP", email: "Email", city: "Kota" } as const;
export type FieldKey = keyof typeof FIELD_LABELS;
export type FieldMode = "off" | "optional" | "required";
export type OrderFields = Record<FieldKey, FieldMode>;
export const DEFAULT_ORDER_FIELDS: OrderFields = { name: "required", phone: "required", email: "optional", city: "optional" };
const mode = z.enum(["off", "optional", "required"]);
export const orderFieldsSchema = z.object({ name: mode, phone: mode, email: mode, city: mode }).refine((f) => f.phone === "required" || f.email === "required", "Minimal No. HP atau Email harus wajib diisi.");
export const LEAD_STATUSES = ["new", "contacted", "follow_up", "won", "lost"] as const;
export const LEAD_STATUS_LABEL = { new: "Baru", contacted: "Dihubungi", follow_up: "Follow-up", won: "Closing", lost: "Tidak lanjut" };
export function normalizePhone(raw: string) {
  let value = raw.trim().replace(/[\s()+.-]/g, "");
  if (value.startsWith("0")) value = "62" + value.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(value)) throw new Error("Nomor HP tidak valid. Gunakan 08… atau kode negara, misalnya 628….");
  return value;
}
export function validateCustomer(fields: OrderFields, raw: Record<string, unknown>) {
  const result: Record<FieldKey, string | null> = { name: null, phone: null, email: null, city: null };
  for (const key of Object.keys(FIELD_LABELS) as FieldKey[]) {
    if (fields[key] === "off") continue;
    const value = typeof raw[key] === "string" ? raw[key].trim() : "";
    if (!value) { if (fields[key] === "required") throw new Error(`${FIELD_LABELS[key]} wajib diisi.`); continue; }
    if (value.length > (key === "email" ? 180 : 120) || /[\u0000-\u001f]/.test(value)) throw new Error(`${FIELD_LABELS[key]} tidak valid.`);
    if (key === "email" && !z.email().max(180).safeParse(value).success) throw new Error("Email tidak valid.");
    result[key] = key === "phone" ? normalizePhone(value) : key === "email" ? value.toLowerCase() : value;
  }
  return result;
}
export const orderFormInput = z.object({
  id: z.number().int().positive().optional(), campaignId: z.number().int().positive(),
  title: z.string().trim().min(3).max(120), description: z.string().trim().max(600),
  fields: orderFieldsSchema, routing: z.enum(["fixed", "round_robin", "weighted"]),
  appearance: appearanceSchema.default(appearanceSchema.parse({})), tracking: trackingSchema.default(trackingSchema.parse({})),
  weights: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(100)).default({}),
  assigneeIds: z.array(z.number().int().positive()).max(30), published: z.boolean(),
  source: z.enum(["ads", "organic"]),
  message: z.string().trim().min(3).max(500), useFormLeads: z.boolean(), effectiveDate: z.iso.date(),
}).refine((v) => v.routing !== "weighted" || (v.assigneeIds.length > 0 && v.assigneeIds.reduce((n,id)=>n+(v.weights[id]??0),0)===100 && Object.keys(v.weights).every(id=>v.assigneeIds.includes(Number(id)))), {message:"Total persentase CSO terpilih harus tepat 100%.",path:["weights"]})
 .refine((v) => new Set(v.assigneeIds).size === v.assigneeIds.length, {message:"CSO tidak boleh duplikat.",path:["assigneeIds"]})
 .refine((v) => !v.published || (v.routing === "fixed" ? v.assigneeIds.length === 1 : v.assigneeIds.length > 0), {message:"Pilih satu CSO untuk penerima tetap atau minimal satu CSO untuk bergiliran.",path:["assigneeIds"]});
