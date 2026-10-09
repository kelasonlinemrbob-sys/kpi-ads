export const WA_STEPS = [1, 2, 3, 4, 5] as const;
export type WaStep = typeof WA_STEPS[number];
export type WaMessages = Record<WaStep, string>;
export const WA_VARIABLES = ["nama", "no_hp", "email", "kota", "produk", "cso", "referensi"] as const;
export type WaMessageData = Record<typeof WA_VARIABLES[number], string | null>;
export const DEFAULT_WA_MESSAGES: WaMessages = {
  1: "Halo Kak {{nama}}, saya {{cso}} dari tim {{produk}}. Terima kasih sudah mengisi form. Ada yang ingin Kakak tanyakan tentang program kami?",
  2: "Halo Kak {{nama}}, saya {{cso}}. Saya ingin menindaklanjuti minat Kakak pada {{produk}}. Apakah ada informasi yang masih dibutuhkan?",
  3: "Halo Kak {{nama}}, apakah Kakak masih tertarik dengan {{produk}}? Jika belum ingin melanjutkan, boleh kabari saya ya. Terima kasih, Kak.",
  4: "Halo Kak {{nama}}, saya {{cso}}. Kalau Kakak masih mempertimbangkan {{produk}}, saya siap membantu menjawab pertanyaan atau menjelaskan pilihan kelasnya.",
  5: "Halo Kak {{nama}}, saya {{cso}} dari tim {{produk}}. Saya tutup tindak lanjut ini dulu ya. Kalau nanti Kakak ingin melanjutkan, silakan balas pesan ini. Terima kasih atas waktunya.",
};

/** Older saved sets contain only WA 1–3. Preserve them and fill missing steps. */
export function completeWaMessages(saved?: Partial<WaMessages> | null): WaMessages {
  return Object.fromEntries(WA_STEPS.map(step => [step,
    typeof saved?.[step] === "string" && saved[step].trim() ? saved[step] : DEFAULT_WA_MESSAGES[step],
  ])) as WaMessages;
}

/** Insert customer values once; never interpret placeholders inside those values. */
export function renderWaMessage(template: string, data: WaMessageData) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => {
    const token = key.trim().toLowerCase();
    return WA_VARIABLES.includes(token as typeof WA_VARIABLES[number]) ? data[token as keyof WaMessageData] ?? "" : match;
  });
}
export function unknownWaVariables(template: string) {
  return [...new Set([...template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .filter(match => !WA_VARIABLES.includes(match[1].trim().toLowerCase() as typeof WA_VARIABLES[number])).map(match => match[0]))];
}
