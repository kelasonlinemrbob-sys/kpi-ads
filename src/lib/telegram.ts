import "server-only";
import { and, asc, desc, eq, inArray, lt, lte, gt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyReports, sharedTelegramConnection, telegramOutbox, telegramWorker, users } from "@/db/schema";
import { buildReportMessage } from "./whatsapp";
import { canonicalTelegramMessage, splitTelegramMessage } from "./report-message";
import { decryptSecret, encryptSecret } from "./secret-box";
import { can } from "./roles";
import { TelegramError, telegramApi, validateTelegramDestination, verifyTelegram } from "./telegram-client";

async function requireSupervisor(userId: number) {
  const [user] = await db.select({ role: users.role, active: users.isActive }).from(users).where(eq(users.id, userId));
  if (!user?.active || user.role !== "supervisor") throw new TelegramError("Hanya supervisor yang dapat mengatur Telegram bersama.");
}

export async function saveTelegramConnection(
  userId: number,
  input: { token: string; chatId: string; threadId: string; autoSend: boolean },
) {
  await requireSupervisor(userId);
  const destination = validateTelegramDestination(input.chatId, input.threadId);
  const [old] = await db.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
  const token = input.token || (old ? decryptSecret(old.token) : null);
  if (!token) throw new TelegramError("Isi Bot Token dari @BotFather.");
  const verified = await verifyTelegram(token, destination.chatId, destination.threadId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302421, 1)`);
    // Blank-token saves must not overwrite credentials replaced while the API check was running.
    const [current] = await tx.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
    if (!input.token && current?.token !== old?.token)
      throw new TelegramError("Koneksi berubah saat diperiksa. Muat ulang dan simpan kembali.");
    const changed =
      !current ||
      decryptSecret(current.token) !== token ||
      current.chatId !== verified.chatId ||
      current.threadId !== destination.threadId ||
      !current.enabled;
    const version = (current?.version ?? 0) + (changed ? 1 : 0);
    const values = {
      updatedById: userId,
      token: encryptSecret(token),
      ...verified,
      threadId: destination.threadId,
      autoSend: input.autoSend,
      enabled: true,
      version,
      updatedAt: new Date(),
    };
    await tx
      .insert(sharedTelegramConnection)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: sharedTelegramConnection.id, set: values });
    if (changed || !input.autoSend)
      await tx
        .update(telegramOutbox)
        .set({ status: "cancelled", error: "Pengaturan tujuan atau pengiriman berubah." })
        .where(
          and(
            eq(telegramOutbox.status, "pending"),
            ...(changed ? [] : [eq(telegramOutbox.manual, false)]),
          ),
        );
  });
  return verified;
}
export async function disconnectTelegramConnection(userId: number) {
  await requireSupervisor(userId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302421, 1)`);
    await tx
      .update(sharedTelegramConnection)
      .set({ enabled: false, token: "", version: sql`${sharedTelegramConnection.version} + 1`, updatedAt: new Date() })
      .where(eq(sharedTelegramConnection.id, 1));
    await tx
      .update(telegramOutbox)
      .set({ status: "cancelled", error: "Koneksi diputus." })
      .where(eq(telegramOutbox.status, "pending"));
  });
}
export async function queueTelegramReport(userId: number, reportId: number | null, updated: boolean, manual = false) {
  // Verify ownership even for internal callers. No report from another member may be sent.
  if (reportId !== null) {
    const [report] = await db
      .select({ id: dailyReports.id })
      .from(dailyReports)
      .where(and(eq(dailyReports.id, reportId), eq(dailyReports.userId, userId)));
    if (!report) throw new TelegramError("Laporan tidak ditemukan untuk akun ini.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302421, 1)`);
    const [connection] = await tx.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
    if (!connection?.enabled || (!manual && !connection.autoSend)) return false;
    const [latest] =
      reportId === null
        ? []
        : await tx
            .select()
            .from(telegramOutbox)
            .where(
              and(
                eq(telegramOutbox.userId, userId),
                eq(telegramOutbox.reportId, reportId),
                eq(telegramOutbox.connectionVersion, connection.version),
                or(inArray(telegramOutbox.status, ["sent", "sending", "unknown"]), and(eq(telegramOutbox.status, "pending"), gt(telegramOutbox.nextPart, 0))),
              ),
            )
            .orderBy(desc(telegramOutbox.id))
            .limit(1);
    const body =
      reportId === null
        ? "✅ Tes koneksi KPI Ads berhasil."
        : await buildReportMessage(reportId, updated && Boolean(latest), "telegram", tx);
    if (!body) throw new TelegramError("Laporan terakhir belum memiliki rincian iklan.");
    splitTelegramMessage(body); // Validate before committing the job.
    if (manual) {
      const [pending] = await tx
        .select({ id: telegramOutbox.id })
        .from(telegramOutbox)
        .where(and(eq(telegramOutbox.userId, userId), inArray(telegramOutbox.status, ["pending", "sending"])));
      if (pending) throw new TelegramError("Masih ada pesan dalam antrean. Tunggu hingga selesai sebelum mengirim lagi.");
      const [recent] = await tx
        .select()
        .from(telegramOutbox)
        .where(eq(telegramOutbox.userId, userId))
        .orderBy(desc(telegramOutbox.createdAt))
        .limit(1);
      if (recent && Date.now() - recent.createdAt.getTime() < 30000) throw new TelegramError("Tunggu 30 detik sebelum mengirim ulang.");
    } else if (reportId !== null) {
      await tx
        .delete(telegramOutbox)
        .where(
          and(
            eq(telegramOutbox.userId, userId),
            eq(telegramOutbox.reportId, reportId),
            eq(telegramOutbox.status, "pending"),
            eq(telegramOutbox.nextPart, 0),
          ),
        );
      if (latest && canonicalTelegramMessage(latest.body) === canonicalTelegramMessage(body)) return false;
    }
    await tx
      .insert(telegramOutbox)
      .values({
        userId,
        reportId,
        connectionVersion: connection.version,
        body,
        manual,
        sendAfter: new Date(Date.now() + (manual ? 0 : 60000)),
      });
    return true;
  });
}
export async function telegramStatus(userId: number, team = false) {
  const [[connection], [lastMessage], [worker], [latest]] = await Promise.all([
    db.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1)),
    db
      .select({
        status: telegramOutbox.status,
        error: telegramOutbox.error,
        createdAt: telegramOutbox.createdAt,
        nextPart: telegramOutbox.nextPart,
      })
      .from(telegramOutbox)
      .where(team ? undefined : eq(telegramOutbox.userId, userId))
      .orderBy(desc(telegramOutbox.id))
      .limit(1),
    db.select().from(telegramWorker).where(eq(telegramWorker.id, 1)),
    db.select({ id: dailyReports.id }).from(dailyReports).where(and(eq(dailyReports.source, "app"), team ? undefined : eq(dailyReports.userId, userId))).orderBy(desc(dailyReports.date)).limit(1),
  ]);
  return {
    connected: connection?.enabled ?? false,
    hasToken: Boolean(connection?.token),
    botName: connection?.botName ?? "",
    chatId: connection?.chatId ?? "",
    chatTitle: connection?.chatTitle ?? "",
    threadId: connection?.threadId ?? null,
    autoSend: connection?.autoSend ?? true,
    workerAlive: !!worker && Date.now() - worker.heartbeatAt.getTime() < 120000,
    lastMessage: lastMessage ? { ...lastMessage, createdAt: lastMessage.createdAt.toISOString() } : null,
    preview: latest ? await buildReportMessage(latest.id, false) : null,
  };
}
export type TelegramStatus = Awaited<ReturnType<typeof telegramStatus>>;

/** Called by a single timer process holding a global DB advisory lock. */
export async function processTelegramOutbox() {
  await db
    .insert(telegramWorker)
    .values({ id: 1, heartbeatAt: new Date() })
    .onConflictDoUpdate({ target: telegramWorker.id, set: { heartbeatAt: new Date() } });
  // A previous worker ended mid-send. Do not retry an ambiguous delivery automatically.
  await db
    .update(telegramOutbox)
    .set({ status: "unknown", error: "Pengiriman terputus. Periksa Telegram sebelum mengirim ulang." })
    .where(eq(telegramOutbox.status, "sending"));
  const pending = await db
    .select()
    .from(telegramOutbox)
    .where(and(eq(telegramOutbox.status, "pending"), lte(telegramOutbox.sendAfter, new Date())))
    .orderBy(asc(telegramOutbox.id))
    .limit(20);
  const usedDestinations = new Set<string>();
  for (const job of pending) {
    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7302421, 1)`);
      const [fresh] = await tx.select().from(telegramOutbox).where(eq(telegramOutbox.id, job.id));
      if (fresh?.status !== "pending") return null;
      const [connection] = await tx.select().from(sharedTelegramConnection).where(eq(sharedTelegramConnection.id, 1));
      const [user] = await tx.select().from(users).where(eq(users.id, job.userId));
      if (
        (!job.manual && job.reportId === null) ||
        !connection?.enabled ||
        connection.version !== job.connectionVersion ||
        (!job.manual && !connection.autoSend) ||
        !user?.isActive ||
        !can.runAds(user.role)
      ) {
        await tx
          .update(telegramOutbox)
          .set({ status: "cancelled", error: "Koneksi atau akun tidak aktif lagi." })
          .where(eq(telegramOutbox.id, job.id));
        return null;
      }
      if (Date.now() - job.createdAt.getTime() > 24 * 3600000) {
        await tx
          .update(telegramOutbox)
          .set({ status: "failed", error: "Pesan melewati batas antrean 24 jam. Kirim laporan terakhir bila diperlukan." })
          .where(eq(telegramOutbox.id, job.id));
        return null;
      }
      const [older] = await tx
        .select({ id: telegramOutbox.id })
        .from(telegramOutbox)
        .where(
          and(
            eq(telegramOutbox.userId, job.userId),
            eq(telegramOutbox.connectionVersion, job.connectionVersion),
            lt(telegramOutbox.id, job.id),
            inArray(telegramOutbox.status, ["pending", "sending"]),
          ),
        )
        .limit(1);
      if (older) return null;
      const destination = `${connection.botName}:${connection.chatId}`;
      if (usedDestinations.has(destination)) return null;
      usedDestinations.add(destination);
      await tx
        .update(telegramOutbox)
        .set({ status: "sending", attempts: job.attempts + 1 })
        .where(eq(telegramOutbox.id, job.id));
      return connection;
    });
    if (!claimed) continue;
    let delivered = false;
    try {
      const token = decryptSecret(claimed.token);
      if (!token) throw new TelegramError("Token tersimpan tidak dapat dibaca. Hubungkan ulang bot.");
      const parts = splitTelegramMessage(job.body);
      const sent = await telegramApi<{ message_id: number }>(token, "sendMessage", {
        chat_id: claimed.chatId,
        ...(claimed.threadId ? { message_thread_id: claimed.threadId } : {}),
        text: parts[job.nextPart],
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      if (!sent || !Number.isInteger(sent.message_id))
        throw new TelegramError("Hasil pengiriman belum pasti. Periksa Telegram sebelum mengirim ulang.", true);
      delivered = true;
      const complete = job.nextPart + 1 >= parts.length;
      await db
        .update(telegramOutbox)
        .set({
          status: complete ? "sent" : "pending",
          nextPart: job.nextPart + 1,
          attempts: 0,
          error: null,
          sendAfter: new Date(Date.now() + 30000),
          ...(complete ? { sentAt: new Date() } : {}),
        })
        .where(eq(telegramOutbox.id, job.id));
    } catch (error) {
      const failure =
        error instanceof TelegramError
          ? error
          : new TelegramError("Pengiriman belum dapat dipastikan. Periksa Telegram sebelum mengirim ulang.", true);
      const retry = !delivered && failure.retryAfter > 0 && job.attempts < 4;
      await db
        .update(telegramOutbox)
        .set({
          status: retry ? "pending" : delivered || failure.uncertain ? "unknown" : "failed",
          error: failure.message,
          ...(retry ? { sendAfter: new Date(Date.now() + failure.retryAfter * 1000) } : {}),
        })
        .where(eq(telegramOutbox.id, job.id));
    }
    await db.update(telegramWorker).set({ heartbeatAt: new Date() }).where(eq(telegramWorker.id, 1));
  }
}
