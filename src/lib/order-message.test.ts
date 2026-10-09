import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderMessage, renderOrderMessage, unknownMessageVariables } from "./order-message";
import { validateCustomer } from "./order-form-input";

const data = { customer: { name: "Bernad", phone: "6281234567890", email: "bernad@example.com", city: "Kediri" }, product: "Kelas Online", reference: "ref-123" };

test("customer and product placeholders resolve, including existing English aliases and repeated variables", () => {
  assert.equal(renderOrderMessage("Hallo, nama saya {{nama}}, dari {{kota}}. Tanya {{produk}}. {{nama}}", data), "Hallo, nama saya Bernad, dari Kediri. Tanya Kelas Online. Bernad");
  assert.equal(renderOrderMessage("{{ NAME }}|{{city}}|{{phone}}|{{whatsapp}}|{{email}}|{{product}}|{{reference}}|{{no_hp}}|{{referensi}}", data), "Bernad|Kediri|6281234567890|6281234567890|bernad@example.com|Kelas Online|ref-123|6281234567890|ref-123");
});

test("plain legacy messages retain exactly the same automatic details", () => {
  assert.equal(buildOrderMessage("Halo CSO", data), "Halo CSO\nProduk: Kelas Online\nNama: Bernad\nNo. HP: 6281234567890\nEmail: bernad@example.com\nKota: Kediri\nReferensi: ref-123");
});

test("disabled and blank fields never leak raw submitted values into templates or the summary", () => {
  const customer = validateCustomer({ name: "off", phone: "required", email: "optional", city: "off" }, { name: "hidden name", phone: "081234567890", email: "", city: "hidden city" });
  const current = { ...data, customer };
  assert.equal(renderOrderMessage("{{nama}}|{{email}}|{{city}}|{{custom_fields}}", current), "|||No. HP: 6281234567890");
  assert.equal(buildOrderMessage("Halo", current), "Halo\nProduk: Kelas Online\nNo. HP: 6281234567890\nReferensi: ref-123");
});

test("unknown variables stay literal; inserted values are not interpreted or recursively expanded", () => {
  const current = { ...data, customer: { ...data.customer, name: "$& {{produk}} <script>" } };
  assert.equal(renderOrderMessage("{{nama}} {{unknown}} {{constructor}}", current), "$& {{produk}} <script> {{unknown}} {{constructor}}");
  assert.deepEqual(unknownMessageVariables("{{nama}} {{name}} {{custom_fields}} {{unknown}} {{unknown}} {{constructor}}"), ["{{unknown}}", "{{constructor}}"]);
});

test("WhatsApp URL encoding preserves punctuation, Unicode and line breaks after rendering", () => {
  const message = buildOrderMessage("Halo {{name}} 👋\nSaya tanya {{produk}} & jadwal?", { ...data, product: "Kelas A&B #1" });
  const url = new URL(`https://wa.me/6281234567890?text=${encodeURIComponent(message)}`);
  assert.equal(url.searchParams.get("text"), message);
  assert.equal([...url.searchParams.keys()].length, 1);
  assert.ok(message.startsWith("Halo Bernad 👋\nSaya tanya Kelas A&B #1 & jadwal?"));
});
