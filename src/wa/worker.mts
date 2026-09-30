/*
 * WhatsApp worker: keeps one Baileys connection per advertiser who linked their WhatsApp and sends
 * queued daily-report messages to their chosen group. Run next to the app with `pnpm wa:worker`.
 * The app and this process only talk through the database (wa_sessions, wa_auth, wa_outbox).
 *
 * To keep the numbers safe from WhatsApp's spam detection the worker behaves like a person on
 * WhatsApp Web: one worker per database (advisory lock), no reconnect storms (exponential backoff),
 * cached group metadata, "typing…" before each message, a randomised gap between messages and
 * hourly / daily caps per number.
 */
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type GroupMetadata,
  type proto,
  type WASocket,
} from "@whiskeysockets/baileys";
import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { Client } from "pg";
import pino from "pino";
import { db } from "@/db";
import { waOutbox, waSessions, waWorker, type WaSession } from "@/db/schema";
import { clearAuthState, usePostgresAuthState } from "./auth-state.mjs";

const TICK_MS = 2000;
const SEND_TICK_MS = 3000;
const MAX_ATTEMPTS = 3;
/** Messages still queued after this long (WhatsApp not connected) are dropped instead of sent late. */
const MESSAGE_TTL_MS = 12 * 3600_000;

/* Anti-ban limits, per WhatsApp number. Reports are a handful of messages a day, so these only
 * kick in when something goes wrong (e.g. a loop) — which is exactly when a ban would happen. */
const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const MAX_PER_HOUR = envNumber("WA_MAX_PER_HOUR", 20);
const MAX_PER_DAY = envNumber("WA_MAX_PER_DAY", 60);
/** Minimum pause between two messages from the same number; a random 0–100% is added on top. */
const MIN_GAP_MS = envNumber("WA_MIN_GAP_SEC", 20) * 1000;
/** Reconnect backoff: 5s, 10s, 20s … capped at 5 minutes, and give up after this many failures. */
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 5 * 60_000;
const MAX_RECONNECTS = 10;
/** Arbitrary key for the Postgres advisory lock that keeps a second worker from starting. */
const WORKER_LOCK_KEY = 7_302_418;

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "warn" });
const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[wa]", ...args);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number, spread = 0.25) => Math.round(ms * (1 - spread + Math.random() * spread * 2));

type Running = {
  sock: WASocket;
  connected: boolean;
  stopping: boolean;
  /** Group metadata cache, so Baileys doesn't query WhatsApp on every group message. */
  groups: Map<string, GroupMetadata>;
  /** Recently sent messages, for Baileys to re-send when a group member asks for a retry. */
  sent: Map<string, proto.IMessage>;
  nextSendAt: number;
};
const running = new Map<number, Running>();
/** Consecutive failed connection attempts and when the next attempt is allowed, per user. */
const reconnect = new Map<number, { failures: number; retryAt: number }>();

const setSession = (userId: number, patch: Partial<WaSession>) =>
  db.update(waSessions).set({ ...patch, updatedAt: new Date() }).where(eq(waSessions.userId, userId));

async function refreshGroups(userId: number, entry: Running) {
  try {
    const all = await entry.sock.groupFetchAllParticipating();
    entry.groups.clear();
    for (const [jid, metadata] of Object.entries(all)) entry.groups.set(jid, metadata);
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

/** Stops trying to connect until the advertiser clicks "Hubungkan" again (auth is kept). */
async function giveUp(userId: number, lastError: string) {
  reconnect.delete(userId);
  await setSession(userId, { status: "disconnected", wantConnected: false, qr: null, lastError });
}

async function start(userId: number) {
  if (running.has(userId)) return;
  log(userId, "connecting");
  await setSession(userId, { status: "connecting", lastError: null });
  const { state, saveCreds } = await usePostgresAuthState(userId);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const groups = new Map<string, GroupMetadata>();
  const sent = new Map<string, proto.IMessage>();
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.ubuntu("KPI Ads"),
    // Stay "offline" so the phone keeps getting notifications and the number doesn't look always-on.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    cachedGroupMetadata: async (jid) => groups.get(jid),
    getMessage: async (key) => (key.id ? sent.get(key.id) : undefined),
  });
  const entry: Running = { sock, connected: false, stopping: false, groups, sent, nextSendAt: 0 };
  running.set(userId, entry);

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("groups.update", (updates) => {
    for (const update of updates) {
      const current = update.id && entry.groups.get(update.id);
      if (current) entry.groups.set(update.id!, { ...current, ...update });
    }
  });
  // Membership changed: drop the cache so the next message fetches the new participant list once.
  sock.ev.on("group-participants.update", ({ id }) => entry.groups.delete(id));

  sock.ev.on("connection.update", async (update) => {
    try {
      if (update.qr) await setSession(userId, { status: "qr", qr: update.qr });
      if (update.connection === "open") {
        entry.connected = true;
        reconnect.delete(userId);
        // Don't fire the first message the instant we come online.
        entry.nextSendAt = Date.now() + jitter(10_000);
        const phone = sock.user?.id.split(":")[0]?.split("@")[0] ?? null;
        log(userId, "connected as", phone);
        await setSession(userId, { status: "connected", qr: null, phone, lastError: null });
        await refreshGroups(userId, entry);
      }
      if (update.connection === "close") {
        entry.connected = false;
        running.delete(userId);
        if (entry.stopping) return;
        const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        log(userId, "closed", code);
        if (code === DisconnectReason.loggedOut) {
          reconnect.delete(userId);
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
          await giveUp(userId, "QR kedaluwarsa. Klik Hubungkan untuk menampilkan QR baru.");
          return;
        }
        // Another client took over this session. Fighting over it is a classic ban trigger.
        if (code === DisconnectReason.connectionReplaced) {
          await giveUp(userId, "Sesi WhatsApp ini dibuka di tempat lain (worker lain?). Pastikan hanya satu worker berjalan, lalu klik Hubungkan.");
          return;
        }
        if (code === DisconnectReason.forbidden) {
          await giveUp(userId, "WhatsApp menolak koneksi (403) — nomor mungkin sedang dibatasi. Cek WhatsApp di HP sebelum menghubungkan lagi.");
          return;
        }
        // restartRequired is expected right after scanning; everything else backs off exponentially.
        if (code === DisconnectReason.restartRequired) {
          reconnect.set(userId, { failures: 0, retryAt: Date.now() });
          await setSession(userId, { status: "connecting", qr: null, lastError: null });
          return;
        }
        const failures = (reconnect.get(userId)?.failures ?? 0) + 1;
        if (failures > MAX_RECONNECTS) {
          await giveUp(userId, `Gagal tersambung ${MAX_RECONNECTS}× berturut-turut (${code ?? "?"}). Klik Hubungkan untuk mencoba lagi.`);
          return;
        }
        const delay = jitter(Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS));
        reconnect.set(userId, { failures, retryAt: Date.now() + delay });
        await setSession(userId, {
          status: "connecting",
          qr: null,
          lastError: `Koneksi terputus (${code ?? "?"}), menyambung ulang dalam ${Math.round(delay / 1000)} detik…`,
        });
      }
    } catch (error) {
      log(userId, "connection.update handler failed", error);
    }
  });
}

/** Stops a session; with `logout` the linked device is removed from the phone and the auth is wiped. */
async function stop(userId: number, logout: boolean) {
  reconnect.delete(userId);
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

/* --------------------------------- Sending --------------------------------- */

class PermanentError extends Error {}

/** Group metadata from the cache, fetched once when missing. Fails permanently when we're not a member. */
async function groupMetadata(entry: Running, jid: string) {
  const cached = entry.groups.get(jid);
  if (cached) return cached;
  try {
    const metadata = await entry.sock.groupMetadata(jid);
    entry.groups.set(jid, metadata);
    return metadata;
  } catch (error) {
    const status = (error as { output?: { statusCode?: number }; data?: number }).output?.statusCode;
    if (status === 403 || status === 404 || /forbidden|not-authorized|item-not-found/i.test((error as Error).message)) {
      throw new PermanentError("Nomor ini bukan anggota grup tujuan lagi. Pilih ulang grup di Settings.");
    }
    throw error;
  }
}

/** Sends like a person would: come online, type for a moment (longer for longer text), send, go offline. */
async function sendLikeHuman(entry: Running, jid: string, text: string) {
  const { sock } = entry;
  await groupMetadata(entry, jid);
  await sock.sendPresenceUpdate("available");
  await sleep(jitter(1500));
  await sock.sendPresenceUpdate("composing", jid);
  await sleep(jitter(Math.min(2000 + text.length * 30, 8000)));
  await sock.sendPresenceUpdate("paused", jid);
  const message = await sock.sendMessage(jid, { text });
  if (message?.key.id && message.message) {
    entry.sent.set(message.key.id, message.message);
    // Keep the retry store small.
    if (entry.sent.size > 200) entry.sent.delete(entry.sent.keys().next().value!);
  }
  await sleep(jitter(1500));
  await sock.sendPresenceUpdate("unavailable").catch(() => undefined);
}

async function sentSince(userId: number, since: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(waOutbox)
    .where(and(eq(waOutbox.userId, userId), eq(waOutbox.status, "sent"), gte(waOutbox.sentAt, since)));
  return row?.n ?? 0;
}

async function sendQueued() {
  const now = Date.now();
  const pending = await db
    .select()
    .from(waOutbox)
    .where(and(eq(waOutbox.status, "pending"), lte(waOutbox.sendAfter, new Date(now))))
    .orderBy(asc(waOutbox.sendAfter))
    .limit(50);
  const handled = new Set<number>(); // at most one message per number per pass
  for (const message of pending) {
    const entry = running.get(message.userId);
    if (!entry?.connected) {
      if (now - message.createdAt.getTime() > MESSAGE_TTL_MS) {
        await db
          .update(waOutbox)
          .set({ status: "failed", error: "Tidak terkirim: WhatsApp tidak terhubung lebih dari 12 jam." })
          .where(eq(waOutbox.id, message.id));
      }
      continue;
    }
    if (handled.has(message.userId) || Date.now() < entry.nextSendAt) continue;
    handled.add(message.userId);

    const [lastHour, lastDay] = await Promise.all([
      sentSince(message.userId, new Date(now - 3600_000)),
      sentSince(message.userId, new Date(now - 24 * 3600_000)),
    ]);
    if (lastHour >= MAX_PER_HOUR || lastDay >= MAX_PER_DAY) {
      const error = `Ditahan: batas ${lastHour >= MAX_PER_HOUR ? `${MAX_PER_HOUR} pesan/jam` : `${MAX_PER_DAY} pesan/hari`} tercapai, dikirim otomatis nanti.`;
      if (message.error !== error) await db.update(waOutbox).set({ error }).where(eq(waOutbox.id, message.id));
      continue;
    }

    try {
      await sendLikeHuman(entry, message.groupJid, message.body);
      await db.update(waOutbox).set({ status: "sent", sentAt: new Date(), error: null }).where(eq(waOutbox.id, message.id));
      log(message.userId, "sent message", message.id);
    } catch (error) {
      const permanent = error instanceof PermanentError;
      const attempts = message.attempts + 1;
      await db
        .update(waOutbox)
        .set({ attempts, error: (error as Error).message, status: permanent || attempts >= MAX_ATTEMPTS ? "failed" : "pending" })
        .where(and(eq(waOutbox.id, message.id), eq(waOutbox.status, "pending")));
      log(message.userId, "send failed", message.id, (error as Error).message);
    } finally {
      entry.nextSendAt = Date.now() + MIN_GAP_MS + Math.random() * MIN_GAP_MS;
    }
  }
}

/* ---------------------------------- Loops ---------------------------------- */

async function heartbeat() {
  await db
    .insert(waWorker)
    .values({ id: 1, heartbeatAt: new Date() })
    .onConflictDoUpdate({ target: waWorker.id, set: { heartbeatAt: new Date() } })
    .catch((error) => log("heartbeat failed", error));
}

let sessionsBusy = false;
async function syncSessions() {
  if (sessionsBusy) return;
  sessionsBusy = true;
  try {
    const sessions = await db.select().from(waSessions);
    for (const session of sessions) {
      const entry = running.get(session.userId);
      const retry = reconnect.get(session.userId);
      if (session.wantConnected && !entry) {
        if (!retry || Date.now() >= retry.retryAt) await start(session.userId).catch((e) => log(session.userId, "start failed", e));
      } else if (!session.wantConnected && (entry || session.status !== "disconnected")) await stop(session.userId, true);
      else if (session.refreshGroups && entry?.connected) await refreshGroups(session.userId, entry);
    }
  } catch (error) {
    log("session sync failed", error);
  } finally {
    sessionsBusy = false;
  }
}

// Sending is slow on purpose (typing, gaps), so it runs apart from the heartbeat and session sync.
let sendBusy = false;
async function sendLoop() {
  if (sendBusy) return;
  sendBusy = true;
  try {
    await sendQueued();
  } catch (error) {
    log("send loop failed", error);
  } finally {
    sendBusy = false;
  }
}

/** Two workers on the same sessions would kick each other off WhatsApp over and over. */
async function acquireWorkerLock() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [WORKER_LOCK_KEY]);
  if (!rows[0]?.locked) {
    log("another WhatsApp worker is already running for this database — exiting");
    process.exit(1);
  }
  // The lock lives as long as this connection; losing it means another worker could start.
  client.on("error", (error) => {
    log("lock connection lost, exiting", error);
    process.exit(1);
  });
  return client;
}

async function main() {
  await acquireWorkerLock();
  log("worker started", { MAX_PER_HOUR, MAX_PER_DAY, MIN_GAP_SEC: MIN_GAP_MS / 1000 });
  // Sessions that were mid-QR when the worker last stopped start over.
  await db.update(waSessions).set({ status: "disconnected", qr: null }).where(eq(waSessions.wantConnected, false));
  await heartbeat();
  setInterval(heartbeat, TICK_MS);
  setInterval(syncSessions, TICK_MS);
  setInterval(sendLoop, SEND_TICK_MS);
  await syncSessions();
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
