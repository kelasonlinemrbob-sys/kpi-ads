import test from "node:test";
import assert from "node:assert/strict";
import { canonicalTelegramMessage, formatReportMessage, splitTelegramMessage } from "./report-message";
import {
  discoverTelegramChats,
  telegramApi,
  telegramErrorMessage,
  TelegramError,
  validateTelegramDestination,
  verifyTelegram,
} from "./telegram-client";
const token = "123456789:" + "a".repeat(35);
test("same WA structure and numbers, safe Telegram HTML, Monday weekends and revision", () => {
  const items = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((performanceDate) => ({
    performanceDate,
    platform: "meta",
    product: "Kids & <Online>",
    spent: 123456,
  }));
  const wa = formatReportMessage({ name: "Wahib", date: "2026-10-05" }, items, false)!;
  assert.ok(wa.startsWith("Advertiser *Wahib*\nSpent Iklan *2026-10-02*\n=> Facebook Kids & <Online> = Rp"));
  assert.equal(wa.split("Advertiser").length, 5);
  const telegram = formatReportMessage({ name: "<b>Name</b>", date: "2026-10-05" }, items, true, "telegram")!;
  assert.ok(telegram.startsWith("Advertiser <b>&lt;b&gt;Name&lt;/b&gt;</b> <i>(revisi)</i>"));
  assert.ok(telegram.includes("Kids &amp; &lt;Online&gt;"));
  assert.equal((telegram.match(/revisi/g) ?? []).length, 1);
  assert.ok(!canonicalTelegramMessage(telegram).includes("revisi"));
});
test("long reports split at line boundaries without broken tags or exceeding Telegram limits", () => {
  const body = Array.from({ length: 180 }, (_, i) => `<b>Product ${i} &amp; 😀</b> = Rp 123.456`).join("\n");
  const parts = splitTelegramMessage(body);
  assert.ok(parts.length > 1);
  assert.equal(parts.join("\n"), body);
  assert.ok(parts.every((part) => part.length <= 3500));
  assert.throws(() => splitTelegramMessage("a".repeat(3501)));
});
test("destination validates group, channel, optional topics and rejects injected routes", () => {
  assert.deepEqual(validateTelegramDestination("-1001234567890", "42"), { chatId: "-1001234567890", threadId: 42 });
  assert.equal(validateTelegramDestination("@report_group", "").threadId, null);
  for (const value of ["https://evil.test", "../../getUpdates", "0", "@x"]) assert.throws(() => validateTelegramDestination(value, ""));
  assert.throws(() => validateTelegramDestination("12345", "2147483648"));
});
test("API sanitizes token-bearing errors and distinguishes safe 429 retry from ambiguous delivery", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error(`https://api.telegram.org/bot${token}/sendMessage`);
    };
    await assert.rejects(
      telegramApi(token, "sendMessage"),
      (e: unknown) => e instanceof TelegramError && e.uncertain && !e.message.includes(token),
    );
    globalThis.fetch = async () =>
      Response.json({ ok: false, error_code: 429, description: token, parameters: { retry_after: 120 } }, { status: 429 });
    await assert.rejects(
      telegramApi(token, "sendMessage"),
      (e: unknown) => e instanceof TelegramError && e.retryAfter === 120 && !e.uncertain && !e.message.includes(token),
    );
    assert.ok(!telegramErrorMessage(new Error(token)).includes(token));
  } finally {
    globalThis.fetch = original;
  }
});
test("verification checks membership; discovery does not acknowledge updates or change webhook", async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1)!;
    methods.push(method);
    const body = JSON.parse(String(init?.body));
    const result =
      method === "getMe"
        ? { id: 123, username: "fixture_bot", is_bot: true }
        : method === "getChat"
          ? { id: -1001, title: "Team", type: "supergroup" }
          : method === "getChatMember"
            ? { status: "left" }
            : [{ message: { chat: { id: -1001, title: "Team", type: "supergroup" }, text: "private text" } }];
    if (method === "getUpdates") {
      assert.equal(body.offset, undefined);
      assert.equal(body.allowed_updates, undefined);
    }
    return Response.json({ ok: true, result });
  };
  try {
    await assert.rejects(verifyTelegram(token, "-1001", null), /izin/);
    const chats = await discoverTelegramChats(token);
    assert.deepEqual(chats, [{ id: "-1001", title: "Team", type: "supergroup" }]);
    assert.ok(!methods.includes("sendMessage"));
  } finally {
    globalThis.fetch = original;
  }
});
