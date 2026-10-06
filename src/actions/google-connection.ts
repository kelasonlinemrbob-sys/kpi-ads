"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/roles";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { disableGoogleConnection, saveGoogleConnection, testGoogleConnection } from "@/lib/google-connection";
import { googleCustomerId } from "@/lib/google-credentials";
import type { FormState } from "./auth";

function refresh() { revalidatePath("/settings"); revalidatePath("/campaigns"); }
export async function saveGoogleConnectionAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.runAds(user.role)) return { error: "Kamu tidak punya akses untuk mengubah koneksi Google Ads." };
  const result = await saveGoogleConnection(Object.fromEntries(formData), user.id);
  if (!result.ok) return { error: result.error };
  await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: "Koneksi Google Ads Diperbarui", description: `Akses akun ${result.account.accountId} berhasil diuji.`, href: "/settings?tab=integrasi#google-ads" });
  refresh();
  return { ok: true, message: `Google Ads terhubung: ${result.account.name}. Kredensial tersimpan terenkripsi.` };
}
export async function testGoogleConnectionAction(customerId: string) {
  const user = await requireUser();
  if (!can.runAds(user.role)) return { ok: false as const, error: "Kamu tidak punya akses untuk menguji koneksi Google Ads." };
  const parsed = googleCustomerId.safeParse(customerId);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Customer ID tidak valid." };
  const result = await testGoogleConnection(parsed.data, user.id);
  refresh(); return result;
}
export async function disableGoogleConnectionAction() {
  const user = await requireUser();
  if (!can.runAds(user.role)) return { error: "Kamu tidak punya akses untuk memutus koneksi Google Ads." };
  await disableGoogleConnection(user.id);
  await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: "Koneksi Google Ads Dinonaktifkan", description: "Sinkronisasi Google Ads dihentikan sampai kredensial disimpan kembali.", href: "/settings?tab=integrasi#google-ads" });
  refresh(); return { ok: true };
}
