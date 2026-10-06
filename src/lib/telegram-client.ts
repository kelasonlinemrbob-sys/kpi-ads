import "server-only";
export class TelegramError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export const telegramErrorMessage = (error: unknown) =>
  error instanceof TelegramError ? error.message : "Telegram belum dapat diproses. Coba lagi nanti.";
export function validateBotToken(token: string) {
  if (!/^\d{5,16}:[A-Za-z0-9_-]{25,100}$/.test(token)) throw new TelegramError("Bot Token tidak valid. Salin token dari @BotFather.");
  return token;
}
export function validateTelegramDestination(chatId: string, threadId: string) {
  if (!/^-?[1-9]\d{0,15}$/.test(chatId) && !/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chatId))
    throw new TelegramError("Isi Chat ID numerik (contoh -1001234567890) atau @username grup/channel publik.");
  if (threadId && (!/^[1-9]\d{0,9}$/.test(threadId) || Number(threadId) > 2147483647))
    throw new TelegramError("Topic ID harus berupa angka positif atau dikosongkan.");
  return { chatId, threadId: threadId ? Number(threadId) : null };
}
export async function telegramApi<T>(
  token: string,
  method: "getMe" | "getChat" | "getChatMember" | "getUpdates" | "sendMessage",
  payload = {},
): Promise<T> {
  validateBotToken(token);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const data = (await response.json()) as {
      ok: boolean;
      result: T;
      error_code?: number;
      parameters?: { retry_after?: number; migrate_to_chat_id?: number };
    };
    if (!response.ok || !data.ok) {
      const code = data.error_code ?? response.status;
      if (code === 429)
        throw new TelegramError(
          "Batas pengiriman Telegram tercapai; pesan dijadwalkan ulang.",
          false,
          Math.max(1, Math.min(86400, Number(data.parameters?.retry_after) || 60)),
        );
      if (code === 401 || code === 404) throw new TelegramError("Bot Token ditolak. Periksa atau buat ulang token melalui @BotFather.");
      if (code === 403)
        throw new TelegramError(
          "Bot tidak diizinkan mengirim. Tambahkan bot ke grup, buka blokir bot, atau beri izin posting pada channel.",
        );
      if (code === 409)
        throw new TelegramError(
          "Bot memakai webhook atau sedang dibaca aplikasi lain. Isi Chat ID secara manual; koneksi bot lain tidak diubah.",
        );
      if (data.parameters?.migrate_to_chat_id)
        throw new TelegramError(`Grup berubah menjadi supergroup. Simpan ulang Chat ID ${data.parameters.migrate_to_chat_id}.`);
      if (code >= 500)
        throw new TelegramError("Hasil pengiriman belum pasti. Periksa Telegram sebelum mengirim ulang.", method === "sendMessage");
      throw new TelegramError("Telegram menolak tujuan atau isi pesan. Periksa Chat ID, Topic ID, keanggotaan dan izin bot.");
    }
    return data.result;
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    // Fetch errors may include the token-bearing URL. Never log/return the raw error.
    throw new TelegramError(
      method === "sendMessage"
        ? "Hasil pengiriman belum pasti. Periksa Telegram sebelum mengirim ulang."
        : "Tidak dapat menghubungi Telegram. Coba lagi nanti.",
      method === "sendMessage",
    );
  }
}
type Chat = {
  id: number;
  title?: string;
  first_name?: string;
  username?: string;
  type: string;
  is_forum?: boolean;
  permissions?: { can_send_messages?: boolean };
};
export async function verifyTelegram(token: string, chatId: string, threadId: number | null) {
  const bot = await telegramApi<{ id: number; username: string; is_bot: boolean }>(token, "getMe");
  if (!bot.is_bot) throw new TelegramError("Token harus milik bot Telegram.");
  const chat = await telegramApi<Chat>(token, "getChat", { chat_id: chatId });
  if (threadId && !chat.is_forum) throw new TelegramError("Topic ID hanya diisi untuk chat dengan fitur topik aktif.");
  if (chat.type !== "private") {
    const member = await telegramApi<{ status: string; can_post_messages?: boolean; can_send_messages?: boolean; is_member?: boolean }>(
      token,
      "getChatMember",
      { chat_id: chat.id, user_id: bot.id },
    );
    if (
      ["left", "kicked"].includes(member.status) ||
      (member.status === "restricted" && (!member.is_member || !member.can_send_messages)) ||
      (chat.type === "channel" && member.status !== "creator" && !member.can_post_messages) ||
      (member.status === "member" && chat.permissions?.can_send_messages === false)
    )
      throw new TelegramError("Bot belum mempunyai izin mengirim ke tujuan ini. Periksa keanggotaan dan izin posting bot.");
  }
  return { botName: bot.username, chatId: String(chat.id), chatTitle: chat.title || chat.first_name || chat.username || String(chat.id) };
}
export async function discoverTelegramChats(token: string) {
  const updates = await telegramApi<{ message?: { chat: Chat }; channel_post?: { chat: Chat }; my_chat_member?: { chat: Chat } }[]>(
    token,
    "getUpdates",
    { limit: 100, timeout: 0 },
  );
  // No offset/allowed_updates: do not acknowledge messages or alter another integration's subscription.
  const chats = updates.map((u) => u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat).filter((c): c is Chat => !!c);
  return [
    ...new Map(
      chats.map((c) => [c.id, { id: String(c.id), title: c.title || c.first_name || c.username || String(c.id), type: c.type }]),
    ).values(),
  ];
}
