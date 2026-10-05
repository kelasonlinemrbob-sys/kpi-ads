"use server";

import { and, desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { dailyReports, waOutbox, waSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { buildReportMessage, isWorkerAlive } from "@/lib/whatsapp";

async function requireAdvertiser() {
  const user = await requireUser();
  if (!can.runAds(user.role)) throw new Error("Hanya advertiser yang dapat menghubungkan WhatsApp.");
  return user;
}

const upsert = (userId: number, patch: Partial<typeof waSessions.$inferInsert>) =>
  db
    .insert(waSessions)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: waSessions.userId, set: { ...patch, updatedAt: new Date() } });

const latestReportId = (userId: number) =>
  db.select({ id: dailyReports.id }).from(dailyReports).where(eq(dailyReports.userId, userId)).orderBy(desc(dailyReports.date)).limit(1);

export type WhatsAppStatus = {
  workerAlive: boolean;
  status: "disconnected" | "connecting" | "qr" | "connected";
  wantConnected: boolean;
  qrDataUrl: string | null;
  phone: string | null;
  groupJid: string | null;
  groupName: string | null;
  groups: { id: string; subject: string }[];
  autoSend: boolean;
  lastError: string | null;
  lastMessage: { status: "pending" | "sent" | "failed"; createdAt: string; error: string | null } | null;
  /** The latest report as it will look in the group. */
  preview: string | null;
};

/** Current WhatsApp link state for the signed-in advertiser (polled by the settings card). */
export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const user = await requireAdvertiser();
  const [[session], workerAlive, [lastMessage], [latest]] = await Promise.all([
    db.select().from(waSessions).where(eq(waSessions.userId, user.id)),
    isWorkerAlive(),
    db
      .select({ status: waOutbox.status, createdAt: waOutbox.createdAt, error: waOutbox.error })
      .from(waOutbox)
      .where(eq(waOutbox.userId, user.id))
      .orderBy(desc(waOutbox.createdAt))
      .limit(1),
    latestReportId(user.id),
  ]);
  return {
    workerAlive,
    status: session?.status ?? "disconnected",
    wantConnected: session?.wantConnected ?? false,
    qrDataUrl: session?.status === "qr" && session.qr ? await QRCode.toDataURL(session.qr, { margin: 1, width: 240 }) : null,
    phone: session?.phone ?? null,
    groupJid: session?.groupJid ?? null,
    groupName: session?.groupName ?? null,
    groups: session?.groups ?? [],
    autoSend: session?.autoSend ?? true,
    lastError: session?.lastError ?? null,
    lastMessage: lastMessage ? { ...lastMessage, createdAt: lastMessage.createdAt.toISOString() } : null,
    preview: latest ? await buildReportMessage(latest.id, false) : null,
  };
}

export async function connectWhatsApp() {
  const user = await requireAdvertiser();
  await upsert(user.id, { wantConnected: true, status: "connecting", lastError: null });
}

/** Unlinks the device from the advertiser's phone and forgets the session. */
export async function disconnectWhatsApp() {
  const user = await requireAdvertiser();
  await upsert(user.id, { wantConnected: false });
}

export async function refreshWhatsAppGroups() {
  const user = await requireAdvertiser();
  await upsert(user.id, { refreshGroups: true });
}

export async function setWhatsAppGroup(groupJid: string) {
  const user = await requireAdvertiser();
  const [session] = await db.select().from(waSessions).where(eq(waSessions.userId, user.id));
  const group = session?.groups?.find((g) => g.id === groupJid);
  if (!group) return { error: "Grup tidak ditemukan. Muat ulang daftar grup." };
  await upsert(user.id, { groupJid: group.id, groupName: group.subject });
  return { ok: true };
}

export async function setWhatsAppAutoSend(autoSend: boolean) {
  const user = await requireAdvertiser();
  await upsert(user.id, { autoSend });
}

/** Sends the latest report (or a short test line when there is none) to the chosen group now. */
export async function sendWhatsAppTest() {
  const user = await requireAdvertiser();
  const [session] = await db.select().from(waSessions).where(eq(waSessions.userId, user.id));
  if (!session?.groupJid) return { error: "Pilih grup tujuan terlebih dahulu." };
  if (session.status !== "connected") return { error: "WhatsApp belum terhubung." };
  const [queued] = await db
    .select({ id: waOutbox.id })
    .from(waOutbox)
    .where(and(eq(waOutbox.userId, user.id), eq(waOutbox.status, "pending")))
    .limit(1);
  if (queued) return { error: "Masih ada pesan yang menunggu dikirim. Tunggu sebentar agar nomor aman dari spam." };
  const [latest] = await latestReportId(user.id);
  const body = (latest && (await buildReportMessage(latest.id, false))) ?? "✅ Tes koneksi KPI Ads berhasil.";
  await db.insert(waOutbox).values({ userId: user.id, reportId: latest?.id ?? null, groupJid: session.groupJid, body });
  return { ok: true };
}
