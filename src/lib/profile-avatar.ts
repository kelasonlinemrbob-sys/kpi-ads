import { z } from "zod";

import { AVATAR_IDS } from "./avatar-ids";
export { AVATAR_IDS };
export const avatarChoiceSchema = z.string().optional()
  .refine((value) => value === undefined || value === "" || (AVATAR_IDS.includes(Number(value)) && String(Number(value)) === value), "Pilih avatar dari koleksi yang tersedia.")
  .transform((value) => value === undefined ? undefined : value === "" ? null : Number(value));
