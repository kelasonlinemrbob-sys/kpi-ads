import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionPolicy } from "./session-policy";

test("Remember me explicitly opts into a 30-day persistent cookie", () => {
  assert.deepEqual(sessionPolicy(true), { expiresIn: "30d", cookie: { maxAge: 2592000 } });
  assert.deepEqual(sessionPolicy(false), { expiresIn: "12h", cookie: {} });
});
