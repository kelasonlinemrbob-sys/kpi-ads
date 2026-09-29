/*
 * WhatsApp worker: keeps one Baileys connection per advertiser who linked their WhatsApp and sends
 * queued daily-report messages to their chosen group. Run next to the app with `pnpm wa:worker`.
 * The app and this process only talk through the database (wa_sessions, wa_auth, wa_outbox).
 */
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { and, asc, eq } from "drizzle-orm";
import pino from "pino";
import { db } from "@/db";
import { waOutbox, waSessions, waWorker, type WaSession } from "@/db/schema";
import { clearAuthState, usePostgresAuthState } from "./auth-state.mjs";

const TICK_MS = 2000;
const MAX_ATTEMPTS = 3;
/** Messages still queued after this long (WhatsApp not connected) are dropped instead of sent late. */
const MESSAGE_TTL_MS = 12 * 3600_000;

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "warn" });
const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[wa]", ...args);

type Running = { sock: WASocket; connected: boolean; stopping: boolean };
const running = new Map<number, Running>();

const setSession = (userId: number, patch: Partial<WaSession>) =>
  db.update(waSessions).set({ ...patch, updatedAt: new Date() }).where(eq(waSessions.userId, userId));

async function refreshGroups(userId: number, sock: WASocket) {
  try {
    const all = await sock.groupFetchAllParticipating();
    const groups = Object.values(all)
      .map((g) => ({ id: g.id, subject: g.subject || g.id }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
    const [session] = await db.select().from(waSessions).where(eq(waSessions.userId, userId));
    const current = groups.find((g) => g.id === session?.groupJid);
    await setSession(userId, {
      groups,
      refreshGroups: false,
      ...(current ? { groupName: current.subject } : {}),
    });
  } catch (error) {
    log(userId, "group refresh failed", (error as Error).message);
    await setSession(userId, { refreshGroups: false });
  }
}

async function start(userId: number) {
  if (running.has(userId)) return;
  log(userId, "connecting");
  await setSession(userId, { status: "connecting", lastError: null });
  const { state, saveCreds } = await usePostgresAuthState(userId);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.ubuntu("KPI Ads"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  const entry: Running = { sock, connected: false, stopping: false };
  running.set(userId, entry);

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    try {
      if (update.qr) await setSession(userId, { status: "qr", qr: update.qr });
      if (update.connection === "open") {
        entry.connected = true;
        const phone = sock.user?.id.split(":")[0]?.split("@")[0] ?? null;
        log(userId, "connected as", phone);
        await setSession(userId, { status: "connected", qr: null, phone, lastError: null });
        await refreshGroups(userId, sock);
      }
      if (update.connection === "close") {
        entry.connected = false;
        running.delete(userId);
        if (entry.stopping) return;
        const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        log(userId, "closed", code);
        if (code === DisconnectReason.loggedOut) {
          await clearAuthState(userId);
          await setSession(userId, {
            status: "disconnected",
            wantConnected: false,
            qr: null,
            phone: null,
            groups: null,
            lastError: "WhatsApp dikeluarkan dari perangkat tertaut. Scan ulang untuk menghubungkan.",
          });
          return;
        }
        // Nobody scanned the QR in time: stop instead of generating QR codes forever.
        if (!state.creds.me && code === DisconnectReason.timedOut) {
          await setSession(userId, {
            status: "disconnected",
            wantConnected: false,
            qr: null,
            lastError: "QR kedaluwarsa. Klik Hubungkan untuk menampilkan QR baru.",
          });
          return;
        }
        // restartRequired is expected right after scanning; everything else is a transient drop.
        await setSession(userId, {
          status: "connecting",
          qr: null,
          lastError: code === DisconnectReason.restartRequired ? null : `Koneksi terputus (${code ?? "?"}), menyambung ulang…`,
        });
        setTimeout(() => start(userId).catch((e) => log(userId, "reconnect failed", e)), code === DisconnectReason.restartRequired ? 0 : 5000);
      }
    } catch (error) {
      log(userId, "connection.update handler failed", error);
    }
  });
}

/** Stops a session; with `logout` the linked device is removed from the phone and the auth is wiped. */
async function stop(userId: number, logout: boolean) {
  const entry = running.get(userId);
  if (entry) {
    entry.stopping = true;
    running.delete(userId);
    if (logout && entry.connected) await entry.sock.logout().catch(() => undefined);
    else entry.sock.end(undefined);
  }
  if (logout) await clearAuthState(userId);
  await setSession(userId, {
    status: "disconnected",
    qr: null,
    ...(logout ? { phone: null, groups: null, groupJid: null, groupName: null } : {}),
  });
  log(userId, logout ? "logged out" : "stopped");
}

async function sendQueued() {
  const pending = await db
    .select()
    .from(waOutbox)
    .where(eq(waOutbox.status, "pending"))
    .orderBy(asc(waOutbox.createdAt))
    .limit(20);
  for (const message of pending) {
    const entry = running.get(message.userId);
    if (!entry?.connected) {
      if (Date.now() - message.createdAt.getTime() > MESSAGE_TTL_MS) {
        await db
          .update(waOutbox)
          .set({ status: "failed", error: "Tidak terkirim: WhatsApp tidak terhubung lebih dari 12 jam." })
          .where(eq(waOutbox.id, message.id));
      }
      continue;
    }
    try {
      await entry.sock.sendMessage(message.groupJid, { text: message.body });
      await db.update(waOutbox).set({ status: "sent", sentAt: new Date(), error: null }).where(eq(waOutbox.id, message.id));
      log(message.userId, "sent message", message.id);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // gentle pacing between messages
    } catch (error) {
      const attempts = message.attempts + 1;
      await db
        .update(waOutbox)
        .set({ attempts, error: (error as Error).message, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending" })
        .where(and(eq(waOutbox.id, message.id), eq(waOutbox.status, "pending")));
      log(message.userId, "send failed", message.id, (error as Error).message);
    }
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await db
      .insert(waWorker)
      .values({ id: 1, heartbeatAt: new Date() })
      .onConflictDoUpdate({ target: waWorker.id, set: { heartbeatAt: new Date() } });

    const sessions = await db.select().from(waSessions);
    for (const session of sessions) {
      const entry = running.get(session.userId);
      if (session.wantConnected && !entry) await start(session.userId).catch((e) => log(session.userId, "start failed", e));
      else if (!session.wantConnected && (entry || session.status !== "disconnected")) await stop(session.userId, true);
      else if (session.refreshGroups && entry?.connected) await refreshGroups(session.userId, entry.sock);
    }
    await sendQueued();
  } catch (error) {
    log("tick failed", error);
  } finally {
    busy = false;
  }
}

async function main() {
  log("worker started");
  // Sessions that were mid-QR when the worker last stopped start over.
  await db.update(waSessions).set({ status: "disconnected", qr: null }).where(eq(waSessions.wantConnected, false));
  setInterval(tick, TICK_MS);
  await tick();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("shutting down");
    for (const entry of running.values()) {
      entry.stopping = true;
      entry.sock.end(undefined);
    }
    process.exit(0);
  });
}

main().catch((error) => {
  log("fatal", error);
  process.exit(1);
});
