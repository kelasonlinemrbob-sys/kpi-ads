import { z } from "zod";
export const INVITATION_HOURS = 72;
export const invitationTokenValid = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const invitationPasswordInput = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Tautan undangan tidak valid."),
  password: z.string().min(8, "Password minimal 8 karakter.").max(72, "Password maksimal 72 byte.").refine((value) => new TextEncoder().encode(value).length <= 72, "Password maksimal 72 byte."),
  confirm: z.string(),
}).refine((input) => input.password === input.confirm, { message: "Konfirmasi password tidak sama." });
