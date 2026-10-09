"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireRole } from "@/lib/auth";
import { duplicateOrderForm, deleteOrderForm } from "@/lib/order-form-management";
import { leadErrorMessage } from "@/lib/order-leads";

export async function duplicateOrderFormAction(id: number) {
  const actor = await requireRole("supervisor", "advertiser");
  try {
    const copy = await db.transaction(tx => duplicateOrderForm(tx, actor, id));
    revalidatePath("/forms");
    return { ok: true as const, id: copy.id };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}

export async function deleteOrderFormAction(id: number) {
  const actor = await requireRole("supervisor", "advertiser");
  try {
    const form = await db.transaction(tx => deleteOrderForm(tx, actor, id));
    revalidatePath("/forms");
    revalidatePath(`/forms/${id}`);
    revalidatePath(`/f/${form.slug}`);
    revalidatePath("/embed/order.js");
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}
