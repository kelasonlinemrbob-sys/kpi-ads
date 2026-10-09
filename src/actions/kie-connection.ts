"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { removeKieConnection, saveKieConnection, testKieConnection } from "@/lib/kie-connection";
import { can } from "@/lib/roles";
import type { FormState } from "./auth";

const schema = z.object({ apiKey: z.string().trim().max(300).optional() });

const credits = (n: number | null) => (n === null ? "?" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n));

export async function saveKieConnectionAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { error: "Koneksi Kie AI tim hanya bisa diubah supervisor." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const res = await saveKieConnection(parsed.data, user.id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/settings");
  revalidatePath("/creatives");
  return { ok: true, message: `Kie AI terhubung — sisa ${credits(res.info.credits)} kredit.` };
}

export async function testKieConnectionAction() {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { ok: false as const, error: "Koneksi Kie AI tim hanya bisa dites supervisor." };
  const res = await testKieConnection(user.id);
  revalidatePath("/settings");
  return res.ok ? { ok: true as const, credits: res.info.credits } : res;
}

export async function removeKieConnectionAction() {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { error: "Koneksi Kie AI tim hanya bisa diputus supervisor." };
  await removeKieConnection(user.id);
  revalidatePath("/settings");
  revalidatePath("/creatives");
  return { ok: true };
}
