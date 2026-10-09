/**
 * Labels and plain types of order forms and leads, without the zod schemas. Client components import
 * from here so the browser (including visitors of the public form) never downloads the validation library.
 */
export const FIELD_LABELS = { name: "Nama", phone: "No. HP", email: "Email", city: "Kota" } as const;
export type FieldKey = keyof typeof FIELD_LABELS;
export type FieldMode = "off" | "optional" | "required";
export type OrderFields = Record<FieldKey, FieldMode>;
export const DEFAULT_ORDER_FIELDS: OrderFields = { name: "required", phone: "required", email: "optional", city: "optional" };
export const LEAD_STATUSES = ["new", "contacted", "follow_up", "won", "lost"] as const;
export const LEAD_STATUS_LABEL = { new: "Baru", contacted: "Dihubungi", follow_up: "Follow-up", won: "Closing", lost: "Tidak lanjut" };
export const PAYMENT_STATUSES=["unpaid","partial","paid","refunded"] as const;
export const PAYMENT_LABEL={unpaid:"Belum bayar",partial:"DP / sebagian",paid:"Lunas",refunded:"Dikembalikan"};
