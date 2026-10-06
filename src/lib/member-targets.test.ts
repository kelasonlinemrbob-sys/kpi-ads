import assert from "node:assert/strict";
import { test } from "node:test";
import type { KpiMetric } from "@/db/schema";
import { parseMemberTargets, resolveMemberTargetPeriod, suggestedMemberTarget } from "./member-targets";
import { scoreMember } from "./kpi";
const metric = (patch: Partial<KpiMetric> = {}): KpiMetric => ({ id: 1, key: "leads", name: "Jumlah Chat", role: "advertiser", description: null, unit: "number", aggregation: "sum", numeratorKey: null, denominatorKey: null, higherIsBetter: true, weight: 100, defaultTarget: 900, targetMode: "monthly", sortOrder: 1, ...patch });
const form = (value: string, period = "2026-11") => { const data = new FormData(); data.set("targetPeriod", period); data.set("memberTarget_1", value); return data; };

test("targets support upcoming months and retain explicit zero; blanks preserve saved values", () => {
  assert.equal(resolveMemberTargetPeriod("2099-02").period, "2099-02");
  assert.deepEqual(parseMemberTargets(form(""), [metric()], { role: "advertiser" }).values, []);
  assert.equal(parseMemberTargets(form("0"), [metric()], { role: "advertiser" }).values[0].target, 0);
  assert.throws(() => parseMemberTargets(form("4", "2026-13"), [metric()], { role: "advertiser" }));
});
test("wrong-role metrics, duplicate fields and non-finite values are rejected", () => {
  assert.throws(() => parseMemberTargets(form("20"), [metric()], { role: "seo" }));
  for (const value of ["NaN", "Infinity", "-1"]) assert.throws(() => parseMemberTargets(form(value), [metric()], { role: "advertiser" }));
  const duplicate = form("20"); duplicate.append("memberTarget_1", "30");
  assert.throws(() => parseMemberTargets(duplicate, [metric()], { role: "advertiser" }));
});
test("SEO and webmaster standards remain enforced for individual targets", () => {
  for (const [key, role, invalid, valid] of [["seo_score", "seo", "84", "90"], ["articles", "seo", "0.5", "2"], ["seo_clicks", "seo", "4", "10"], ["task_completion", "webmaster", "99", "100"]] as const) {
    const m = metric({ key, role });
    assert.throws(() => parseMemberTargets(form(invalid), [m], { role }));
    assert.equal(parseMemberTargets(form(valid), [m], { role }).values[0].target, Number(valid));
  }
});
test("supervisors receive advertiser metrics and dual-role suggestions scale only monthly totals", () => {
  assert.equal(parseMemberTargets(form("700"), [metric()], { role: "supervisor" }).values[0].target, 700);
  const member = { role: "advertiser" as const, secondaryRole: "seo" as const, secondaryShare: 40 };
  assert.equal(suggestedMemberTarget(metric(), member), 540);
  assert.equal(suggestedMemberTarget(metric({ role: "seo", key: "articles", targetMode: "daily", defaultTarget: 1 }), member), 1);
});
test("individual targets drive different scores and are not reduced by role share", () => {
  const m = metric();
  const score = (target: number) => scoreMember({ metrics: [m], allMetrics: [m], entries: [{ userId: 1, metricId: 1, date: "2026-11-30", value: 300 }], targets: new Map([[1, target]]), period: "2026-11", asOf: "2026-11-30", targetScale: 0.6 });
  assert.equal(score(300).score, 100);
  assert.equal(score(600).score, 50);
  assert.equal(score(600).results[0].target, 600);
});
