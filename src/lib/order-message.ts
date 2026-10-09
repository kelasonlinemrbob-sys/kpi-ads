import { FIELD_LABELS, type FieldKey } from "./order-form-constants";

export const MESSAGE_VARIABLES: { token: string; label: string; field?: FieldKey; aliases: string[] }[] = [
  { token: "nama", label: "Nama", field: "name", aliases: ["name"] },
  { token: "no_hp", label: "No. HP", field: "phone", aliases: ["phone", "whatsapp"] },
  { token: "email", label: "Email", field: "email", aliases: [] },
  { token: "kota", label: "Kota", field: "city", aliases: ["city"] },
  { token: "produk", label: "Produk", aliases: ["product"] },
  { token: "referensi", label: "Referensi", aliases: ["reference"] },
  { token: "custom_fields", label: "Ringkasan data customer", aliases: [] },
];

export type MessageCustomer = Record<FieldKey, string | null>;
export type OrderMessageData = { customer: MessageCustomer; product: string; reference: string };

function customerLines(customer: MessageCustomer) {
  return (Object.keys(FIELD_LABELS) as FieldKey[])
    .filter(key => customer[key])
    .map(key => `${FIELD_LABELS[key]}: ${customer[key]}`);
}

function variableFor(key: string) {
  const normalized = key.trim().toLowerCase();
  return MESSAGE_VARIABLES.find(v => v.token === normalized || v.aliases.includes(normalized));
}

export function unknownMessageVariables(template: string) {
  return [...new Set([...template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .filter(match => !variableFor(match[1])).map(match => match[0]))];
}

/** One pass only: submitted values are plain text, never templates or executable code. */
export function renderOrderMessage(template: string, data: OrderMessageData) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => {
    const variable = variableFor(key);
    if (!variable) return match;
    if (variable.field) return data.customer[variable.field] ?? "";
    if (variable.token === "produk") return data.product;
    if (variable.token === "referensi") return data.reference;
    return customerLines(data.customer).join("\n");
  });
}

/** Retain the existing automatic details for both plain messages and templates. */
export function buildOrderMessage(template: string, data: OrderMessageData) {
  return [renderOrderMessage(template, data), `Produk: ${data.product}`,
    ...customerLines(data.customer), `Referensi: ${data.reference}`].filter(Boolean).join("\n");
}
