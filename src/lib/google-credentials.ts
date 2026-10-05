import { z } from "zod";

export const googleCustomerId = z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{10}$/, "Customer ID harus 10 digit, contoh 1234567890."));
export const googleConnectionInput = z.object({
  clientId: z.string().trim().max(250).regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "Client ID harus berakhiran .apps.googleusercontent.com."),
  clientSecret: z.string().trim().max(1000).refine((v) => !/\s/.test(v), "Client Secret tidak boleh mengandung spasi."),
  refreshToken: z.string().trim().max(4000).refine((v) => !/\s/.test(v), "Refresh Token tidak boleh mengandung spasi."),
  loginCustomerId: z.union([z.literal(""), googleCustomerId]),
  customerId: googleCustomerId,
});
export type GoogleCredentials = { clientId: string; clientSecret: string; refreshToken: string; loginCustomerId: string };
export function mergeGoogleCredentials(input: z.infer<typeof googleConnectionInput>, current: GoogleCredentials | null): GoogleCredentials {
  if (current && input.clientId !== current.clientId && (!input.clientSecret || !input.refreshToken)) throw new Error("Jika Client ID diganti, isi Client Secret dan Refresh Token baru dari client yang sama.");
  const result = { clientId: input.clientId, clientSecret: input.clientSecret || current?.clientSecret || "", refreshToken: input.refreshToken || current?.refreshToken || "", loginCustomerId: input.loginCustomerId };
  if (!result.clientSecret || !result.refreshToken) throw new Error("Client Secret dan Refresh Token wajib diisi untuk koneksi baru.");
  return result;
}
