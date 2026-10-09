"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { deleteLead } from "@/lib/delete-lead";
import { leadErrorMessage } from "@/lib/order-leads";

export async function deleteLeadAction(id: number) {
  const actor = await requireRole("supervisor", "advertiser");
  try {
    await db.transaction(tx => deleteLead(tx, actor, id));
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: leadErrorMessage(error) }; }
}
