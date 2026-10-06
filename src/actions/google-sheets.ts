"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pauseSheetsSync, saveSheetsConnection, syncGoogleSheets } from "@/lib/google-sheets";
import { sheetsErrorMessage } from "@/lib/google-sheets-client";
import type { FormState } from "./auth";

export async function saveSheetsConnectionAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Google Sheets." };
  try {
    const result = await saveSheetsConnection(
      {
        url: String(form.get("url") ?? ""),
        clientId: String(form.get("clientId") ?? "").trim(),
        clientSecret: String(form.get("clientSecret") ?? "").trim(),
        refreshToken: String(form.get("refreshToken") ?? "").trim(),
        enabled: form.get("enabled") === "on",
      },
      user.id,
    );
    revalidatePath("/settings");
    return {
      ok: true,
      message: `Akses baca dan template ${result.title} → ${result.sheet.title} terverifikasi. Klik Sinkron sekarang untuk mengirim laporan 24 jam.`,
    };
  } catch (error) {
    return { error: sheetsErrorMessage(error) };
  }
}
export async function syncSheetsAction(): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengirim laporan tim ke Google Sheets." };
  try {
    const sync = await syncGoogleSheets();
    revalidatePath("/settings");
    if (sync.skipped) return { error: "Simpan koneksi Google Sheets terlebih dahulu." };
    return {
      ok: true,
      message: `${sync.result.appended} baris ditambahkan, ${sync.result.updated} diperbarui, ${sync.result.unchanged} sudah sesuai, ${sync.result.removed} baris sumber yang dihapus dibersihkan. ${sync.result.excluded} baris parsial/hari ini dilewati.`,
    };
  } catch (error) {
    revalidatePath("/settings");
    return { error: sheetsErrorMessage(error) };
  }
}
export async function pauseSheetsAction(): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Google Sheets." };
  try {
    await pauseSheetsSync(user.id);
    revalidatePath("/settings");
    return { ok: true, message: "Sinkronisasi otomatis dijeda. Data di sheet tetap tersimpan." };
  } catch (error) {
    return { error: sheetsErrorMessage(error) };
  }
}
