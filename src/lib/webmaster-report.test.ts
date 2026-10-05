import assert from "node:assert/strict";
import { test } from "node:test";
import { webmasterItemsSchema, webmasterStatusError, webmasterSummary, type WebmasterItemInput } from "./webmaster-report";

const row: WebmasterItemInput = { taskId: 1, title: "Perbaiki tracking", category: "tracking", priority: "medium", status: "review", sourceStatus: "in_progress", dueDate: "", note: "Pixel diuji", resultUrl: "https://example.com/result", minutesSpent: 30 };
const actor = { id: 10, role: "webmaster" as const };
const assigned = { assigneeId: 10, createdById: 20, status: "in_progress" as const };

test("daily tasks validate categories, URL protocols, dates and whole-minute duration", () => {
  assert.ok(webmasterItemsSchema.safeParse([row]).success);
  const newRow = { ...row, taskId: null, clientKey: "550e8400-e29b-41d4-a716-446655440000" };
  assert.ok(webmasterItemsSchema.safeParse([newRow]).success);
  for (const patch of [{ category: "article" }, { title: "" }, { resultUrl: "javascript:alert(1)" }, { dueDate: "2026-02-30" }, { minutesSpent: -1 }, { minutesSpent: 1.5 }, { clientKey: undefined }]) {
    assert.equal(webmasterItemsSchema.safeParse([{ ...newRow, ...patch }]).success, false);
  }
});

test("duplicate tasks and more than 24 hours of combined work are rejected", () => {
  assert.equal(webmasterItemsSchema.safeParse([row, row]).success, false);
  assert.equal(webmasterItemsSchema.safeParse([{ ...row, minutesSpent: 800 }, { ...row, taskId: 2, minutesSpent: 800 }]).success, false);
  assert.ok(webmasterItemsSchema.safeParse([]).success);
});

test("assignee can report Review but cannot approve another person's task", () => {
  assert.equal(webmasterStatusError(actor, assigned, row, true), null);
  assert.ok(webmasterStatusError(actor, assigned, { ...row, status: "done" }, true));
  assert.ok(webmasterStatusError(actor, assigned, { ...row, status: "done" }, false));
  assert.ok(webmasterStatusError({ ...actor, id: 11 }, assigned, row, true));
  assert.equal(webmasterStatusError(actor, { ...assigned, createdById: actor.id }, { ...row, status: "done" }, true), null);
});

test("stale form cannot roll back the latest task status", () => {
  assert.ok(webmasterStatusError(actor, { ...assigned, status: "done" }, row, true));
  assert.equal(webmasterStatusError(actor, { ...assigned, status: "done" }, { ...row, status: "done" }, true), null);
});

test("completion counts only Done, and no tasks is not 100 percent", () => {
  assert.equal(webmasterSummary([]).completion, null);
  const summary = webmasterSummary([{ status: "done", minutesSpent: 60 }, { status: "review", minutesSpent: 30 }, { status: "in_progress", minutesSpent: 10 }, { status: "todo", minutesSpent: 0 }]);
  assert.equal(summary.completion, 25);
  assert.equal(summary.review, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.minutes, 100);
});
