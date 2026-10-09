"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { checkFormDomain, connectFormDomain, FormDomainError, getFormDomain, removeFormDomain } from "@/lib/form-domains";
import { orderForms } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function formDomainAction(formId: number, operation: "connect" | "check" | "remove" | "refresh", hostname = "") {
  const actor = await requireRole("supervisor", "advertiser");
  try {
    if (operation === "connect") await db.transaction(tx => connectFormDomain(tx, actor, formId, hostname));
    else if (operation === "check") await checkFormDomain(actor, formId);
    else if (operation === "remove") await db.transaction(tx => removeFormDomain(tx, actor, formId));
    else if (operation !== "refresh") throw new FormDomainError("Pilihan tidak valid.");
    const [form] = await db.select().from(orderForms).where(eq(orderForms.id, formId));
    if (!form || form.deletedAt || (actor.role !== "supervisor" && form.ownerId !== actor.id)) throw new FormDomainError("Form tidak ditemukan.");
    const domain = await getFormDomain(formId);
    revalidatePath(`/forms/${formId}`);
    return { ok: true as const, domain };
  } catch (error) {
    return { ok: false as const, error: error instanceof FormDomainError ? error.message : "Pengaturan domain belum berhasil. Coba lagi." };
  }
}
