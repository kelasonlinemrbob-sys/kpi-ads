"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { removeMetaConnection, saveMetaConnection, testMetaConnection } from "@/lib/meta-connection";
import { can } from "@/lib/roles";
import type { FormState } from "./auth";

const schema = z.object({
  token: z.string().trim().max(1000).optional(),
  appId: z
    .string()
    .trim()
    .regex(/^\d*$/, "App ID hanya berisi angka.")
    .max(32)
    .optional(),
  appSecret: z.string().trim().max(200).optional(),
});

const expiryText = ({ expiresAt, expiryKnown }: { expiresAt: string | null; expiryKnown: boolean }) =>
  !expiryKnown
    ? "masa berlaku tidak diketahui"
    : expiresAt
      ? `berlaku sampai ${new Date(expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
      : "tidak kedaluwarsa";

export async function saveMetaConnectionAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengubah koneksi Meta Ads." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const res = await saveMetaConnection(parsed.data, user.id);
  if (!res.ok) return { error: res.error };
  await logActivity({
    actorId: user.id,
    subjectUserId: user.id,
    type: "campaign_updated",
    title: "Koneksi Meta Ads Diperbarui",
    description: `Token ${res.info.subject ?? ""} — ${expiryText(res.info)}`.trim(),
    href: "/settings#meta-ads",
  });
  revalidatePath("/settings");
  revalidatePath("/campaigns");
  return { ok: true, message: `Meta Ads terhubung sebagai ${res.info.subject} — token ${expiryText(res.info)}.` };
}

export async function testMetaConnectionAction() {
  const user = await requireUser();
  if (!can.editCampaigns(user.role)) return { ok: false as const, error: "Kamu tidak punya akses ke koneksi Meta Ads." };
  const res = await testMetaConnection(user.id);
  revalidatePath("/settings");
  revalidatePath("/campaigns");
  return res;
}

export async function removeMetaConnectionAction() {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat memutus koneksi Meta Ads." };
  await removeMetaConnection(user.id);
  revalidatePath("/settings");
  revalidatePath("/campaigns");
  return { ok: true };
}
