"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dailyReports, sharedTelegramConnection } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { buildReportMessage } from "@/lib/whatsapp";
import { decryptSecret } from "@/lib/secret-box";
import { disconnectTelegramConnection, queueTelegramReport, saveTelegramConnection, telegramStatus } from "@/lib/telegram";
import { discoverTelegramChats, TelegramError, telegramErrorMessage } from "@/lib/telegram-client";
import type { FormState } from "./auth";
async function advertiser() {
  const user = await requireUser();
  if (!can.runAds(user.role)) throw new Error("Hanya advertiser dan supervisor yang dapat menghubungkan Telegram.");
  return user;
}
export async function getTelegramStatus() {
  const user = await advertiser();
  return telegramStatus(user.id, user.role === "supervisor");
}
export async function saveTelegramAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await advertiser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Telegram bersama." };
  try {
    const result = await saveTelegramConnection(user.id, {
      token: String(form.get("token") ?? "").trim(),
      chatId: String(form.get("chatId") ?? "").trim(),
      threadId: String(form.get("threadId") ?? "").trim(),
      autoSend: form.get("autoSend") === "on",
    });
    revalidatePath("/settings");
    return { ok: true, message: `Bot @${result.botName} terhubung ke ${result.chatTitle}.` };
  } catch (error) {
    return { error: telegramErrorMessage(error) };
  }
}
export async function findTelegramChatsAction(token: string) {
  const user = await advertiser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Telegram bersama." };
  try {
    const [stored] = await db.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
    const secret = token.trim() || (stored ? decryptSecret(stored.token) : null);
    if (!secret) throw new TelegramError("Isi Bot Token terlebih dahulu.");
    return { chats: await discoverTelegramChats(secret) };
  } catch (error) {
    return { error: telegramErrorMessage(error) };
  }
}
export async function sendTelegramLatestAction(): Promise<FormState> {
  const user = await advertiser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Telegram bersama." };
  try {
    const [latest] = await db
      .select({ id: dailyReports.id, userId: dailyReports.userId })
      .from(dailyReports)
      .where(eq(dailyReports.source, "app"))
      .orderBy(desc(dailyReports.date))
      .limit(1);
    const reportId = latest && await buildReportMessage(latest.id, false) ? latest.id : null;
    const queued = await queueTelegramReport(latest && reportId ? latest.userId : user.id, reportId, false, true);
    if (!queued) return { error: "Hubungkan Telegram terlebih dahulu." };
    revalidatePath("/settings");
    return { ok: true, message: "Pesan masuk antrean Telegram dan akan diproses oleh server." };
  } catch (error) {
    return { error: telegramErrorMessage(error) };
  }
}
export async function disconnectTelegramAction(): Promise<FormState> {
  const user = await advertiser();
  if (user.role !== "supervisor") return { error: "Hanya supervisor yang dapat mengatur Telegram bersama." };
  try {
    await disconnectTelegramConnection(user.id);
    revalidatePath("/settings");
    return { ok: true, message: "Telegram diputus. Antrean yang belum diproses dibatalkan." };
  } catch (error) {
    return { error: telegramErrorMessage(error) };
  }
}
