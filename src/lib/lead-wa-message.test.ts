import assert from "node:assert/strict";
import { test } from "node:test";
import { renderWaMessage, unknownWaVariables, DEFAULT_WA_MESSAGES } from "./lead-wa-message";
import { buildNav, breadcrumbFor } from "@/components/shell/nav";

test("WA variables render once, preserve punctuation and accept empty optional data", () => {
  const data = { nama: "Bernad {{produk}} & + 😊", no_hp: "6281234567890", email: null, kota: "Kediri", produk: "Kelas Online", cso: "Echa", referensi: "ref-123" };
  const message = renderWaMessage("Halo {{ NAMA }}\n{{produk}} / {{cso}} / {{email}} / {{kota}} / {{no_hp}} / {{referensi}}", data);
  assert.equal(message, "Halo Bernad {{produk}} & + 😊\nKelas Online / Echa /  / Kediri / 6281234567890 / ref-123");
  assert.deepEqual(unknownWaVariables("{{nama}} {{NAMA}} {{name}} {{unknown}} {{unknown}}"), ["{{name}}", "{{unknown}}"]);
  for (const text of Object.values(DEFAULT_WA_MESSAGES)) assert.deepEqual(unknownWaVariables(text), []);
  assert.equal(new URL(`https://wa.me/${data.no_hp}?text=${encodeURIComponent(message)}`).searchParams.get("text"), message);
});

test("Template WA follows Leads in supervisor, advertiser and CSO menus only", () => {
  const counts = { pendingReviews: 0, openTasks: 0, revisions: 0 };
  for (const role of ["supervisor", "advertiser", "cso", "seo", "webmaster", "creative"] as const) {
    const items = buildNav(role, counts).flatMap(section => section.items);
    const index = items.findIndex(item => item.href === "/leads/templates");
    if (["supervisor", "advertiser", "cso"].includes(role)) {
      assert(index > 0); assert.equal(items[index - 1].href, "/leads");
    } else assert.equal(index, -1);
  }
  assert.equal(breadcrumbFor("/leads/templates").page, "Template WA");
});
