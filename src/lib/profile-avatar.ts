import { z } from "zod";

export const AVATAR_IDS = Array.from({ length: 48 }, (_, index) => index + 1);
export const avatarChoiceSchema = z.string().optional()
  .refine((value) => value === undefined || value === "" || (AVATAR_IDS.includes(Number(value)) && String(Number(value)) === value), "Pilih avatar dari koleksi yang tersedia.")
  .transform((value) => value === undefined ? undefined : value === "" ? null : Number(value));
