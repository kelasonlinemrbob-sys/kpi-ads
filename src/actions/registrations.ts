"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { isRegistrationSource, REGISTRATION_SOURCE_LABEL, removeRegistrationKey, saveRegistrationKey, setEffectiveFrom, syncRegistrations, type RegistrationSource } from "@/lib/registrations";
import { can } from "@/lib/roles";
import type { FormState } from "./auth";

const refresh = () => { revalidatePath("/settings"); revalidatePath("/dashboard"); revalidatePath("/scorecard"); revalidatePath("/leaderboard"); };

export async function saveRegistrationKeyAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { error: "Koneksi aplikasi pendaftaran hanya bisa diubah supervisor." };
  const source = formData.get("source") ?? "lkbi";
  if (!isRegistrationSource(source)) return { error: "Aplikasi pendaftaran tidak dikenal." };
  const apiKey = z.string().trim().max(200).safeParse(formData.get("apiKey"));
  if (!apiKey.success || !apiKey.data) return { error: "Tempel kunci API terlebih dahulu." };
  const res = await saveRegistrationKey(apiKey.data, user.id, source);
  if (!res.ok) return { error: res.error };
  await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: `Koneksi ${REGISTRATION_SOURCE_LABEL[source]} Diperbarui`, description: "Kunci API aplikasi pendaftaran disimpan dan dites.", href: `/settings?tab=integrasi&service=${serviceKey(source)}` });
  refresh();
  return { ok: true, message: `Terhubung ke ${REGISTRATION_SOURCE_LABEL[source]}${res.client ? ` sebagai "${res.client}"` : ""}. Klik Sinkron sekarang untuk menyalin data.` };
}

/** Settings → Integrasi tile of each registration app. */
const serviceKey = (source: RegistrationSource) => (source === "kelas" ? "kelas-online" : "pendaftaran");
const sourceOf = (v: unknown): RegistrationSource | null => (v === undefined ? "lkbi" : isRegistrationSource(v) ? v : null);

export async function syncRegistrationsAction(input?: RegistrationSource) {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { ok: false as const, error: "Sinkron pendaftaran hanya bisa dijalankan supervisor." };
  const source = sourceOf(input);
  if (!source) return { ok: false as const, error: "Aplikasi pendaftaran tidak dikenal." };
  try {
    const r = await syncRegistrations({ source });
    refresh();
    return { ok: true as const, message: `${r.upserted.toLocaleString("id-ID")} pendaftaran baru/berubah disalin${r.deleted ? `, ${r.deleted} dihapus` : ""}.` };
  } catch (error) {
    refresh();
    return { ok: false as const, error: error instanceof Error ? error.message : "Sinkron gagal." };
  }
}

export async function setRegistrationEffectiveFromAction(date: string, input?: RegistrationSource) {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { ok: false as const, error: "Hanya supervisor yang dapat mengubah tanggal berlaku." };
  const source = sourceOf(input);
  if (!source) return { ok: false as const, error: "Aplikasi pendaftaran tidak dikenal." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false as const, error: "Tanggal tidak valid." };
  await setEffectiveFrom(date, user.id, source);
  await logActivity({ actorId: user.id, subjectUserId: user.id, type: "campaign_updated", title: "Closing dari Pendaftaran", description: `Closing & Revenue dari ${REGISTRATION_SOURCE_LABEL[source]} dihitung mulai ${date}.`, href: `/settings?tab=integrasi&service=${serviceKey(source)}` });
  refresh();
  return { ok: true as const };
}

export async function removeRegistrationKeyAction(input?: RegistrationSource) {
  const user = await requireUser();
  if (!can.manageAdsConnection(user.role)) return { ok: false as const, error: "Hanya supervisor yang dapat memutus koneksi." };
  const source = sourceOf(input);
  if (!source) return { ok: false as const, error: "Aplikasi pendaftaran tidak dikenal." };
  await removeRegistrationKey(user.id, source);
  refresh();
  return { ok: true as const };
}
