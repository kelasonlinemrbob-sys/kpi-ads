import assert from "node:assert/strict";
import { test } from "node:test";
import { can, isSeniorAdvertiser, rolesLabel } from "./roles";
import { memberRoles, roleSlots, needsReview, reportsMondayToFriday } from "./member-roles";
import { allowedStatuses, canAssign, categoryFits } from "./task-rules";
import { buildNav } from "../components/shell/nav";

const supervisor = { id: 1, role: "supervisor" as const };
const senior = { id: 2, role: "advertiser" as const, advertiserLevel: "senior" as const };

test("supervisor reports and KPI use advertiser rules without changing account authority", () => {
  assert.deepEqual(memberRoles(supervisor), ["advertiser"]);
  assert.deepEqual(roleSlots(supervisor), [{ role: "advertiser", share: 100 }]);
  assert.equal(needsReview(supervisor), false);
  assert.equal(reportsMondayToFriday(supervisor), true);
  assert.equal(can.runAds(supervisor.role), true);
  assert.equal(can.submitReports(supervisor.role), true);
  assert.equal(can.reviewReports(supervisor.role), true);
  assert.equal(can.manageTargets(supervisor.role), true);
  assert.equal(rolesLabel(supervisor), "Supervisor");
  assert.equal(isSeniorAdvertiser(supervisor), false);
});

test("advertiser and dual-role review rules retain their existing permissions", () => {
  assert.equal(can.runAds(senior.role), true);
  assert.equal(can.reviewReports(senior.role), false);
  assert.equal(needsReview(senior), false);
  const dual = { ...senior, secondaryRole: "seo" as const, secondaryShare: 40 };
  assert.equal(needsReview(dual), true);
  assert.equal(reportsMondayToFriday(dual), false);
  assert.deepEqual(roleSlots(dual), [{ role: "advertiser", share: 60 }, { role: "seo", share: 40 }]);
  for (const role of ["seo", "webmaster", "creative"] as const) assert.equal(can.runAds(role), false);
});

test("supervisor can carry advertising tasks and approve work without allowing members to assign to supervisors", () => {
  assert.equal(categoryFits("campaign_setup", supervisor), true);
  assert.equal(categoryFits("mentoring", supervisor), true);
  assert.equal(categoryFits("mentoring", { id: 3, role: "advertiser", advertiserLevel: "junior" }), false);
  assert.equal(canAssign(senior, supervisor), false);
  assert.equal(canAssign(supervisor, senior), true);
  assert.ok(allowedStatuses(supervisor, { createdById: 2, assigneeId: 3 }).includes("done"));
});

test("supervisor navigation exposes own advertising alongside team review", () => {
  const nav = buildNav("supervisor", { pendingReviews: 3, openTasks: 0, revisions: 0 });
  const links = nav.flatMap((section) => section.items.flatMap((item) => [item, ...(item.children ?? [])]));
  for (const href of ["/dashboard?view=ads", "/reports/new", "/reports?view=mine", "/reports/notes", "/reports?status=submitted", "/targets", "/appraisals"])
    assert.ok(links.some((link) => link.href === href), href);
});
