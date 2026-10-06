import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { AVATAR_IDS, avatarChoiceSchema } from "./profile-avatar";

test("all selectable avatars exist in the supplied collection", () => {
  assert.equal(AVATAR_IDS.length, 48);
  for (const id of AVATAR_IDS) {
    assert.ok(existsSync(new URL(`../avatar/${id}.png`, import.meta.url)));
    assert.equal(avatarChoiceSchema.parse(String(id)), id);
  }
});
test("initials clear the choice while an omitted field preserves existing avatars", () => {
  assert.equal(avatarChoiceSchema.parse(""), null);
  assert.equal(avatarChoiceSchema.parse(undefined), undefined);
});
test("unknown presets, paths, URLs and non-canonical IDs are rejected", () => {
  for (const value of ["0", "49", "-1", "1.5", "01", " 1", "Infinity", "../../.env", "https://example.com/avatar.png", null, 1]) {
    assert.equal(avatarChoiceSchema.safeParse(value).success, false);
  }
});
