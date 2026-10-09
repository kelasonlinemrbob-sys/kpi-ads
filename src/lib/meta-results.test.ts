import assert from "node:assert/strict";
import { test } from "node:test";
import { conversionResults, leadCount, metaLeads } from "./meta-results";

const wa = { indicator: "actions:onsite_conversion.messaging_conversation_started_7d", values: [{ value: "13", attribution_windows: ["default"] }] };
const actions = [
  { action_type: "lead", value: "2" },
  { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "13" },
  { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
];

test("lead campaigns keep the lead action count, whatever else they record", () => {
  assert.equal(metaLeads({ objective: "OUTCOME_LEADS", actions, results: [wa] }), 2);
  assert.equal(leadCount([{ action_type: "onsite_conversion.lead_grouped", value: "5" }, { action_type: "lead", value: "7" }]), 7);
});

test("sales campaigns count Meta's Results: WhatsApp chats or purchases, as Ads Manager shows", () => {
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions, results: [wa] }), 13);
  const purchase = { indicator: "actions:offsite_conversion.fb_pixel_purchase", values: [{ value: "4" }] };
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions, results: [purchase] }), 4);
  // A day without results: indicator without values is a measured zero, not a fallback to leads.
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions, results: [{ indicator: wa.indicator }] }), 0);
  assert.equal(metaLeads({ objective: "CONVERSIONS", actions: [], results: [purchase] }), 4);
});

test("sales rows without a results field (breakdowns) infer chats, then purchases, then leads", () => {
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions }), 13);
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions: actions.filter((a) => !a.action_type.includes("messaging")) }), 4);
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions: [{ action_type: "lead", value: "3" }] }), 3);
});

test("awareness and engagement results (reach) never count as leads", () => {
  const reach = [{ indicator: "reach", values: [{ value: "29923" }] }];
  assert.equal(conversionResults(reach), null);
  assert.equal(metaLeads({ objective: "OUTCOME_AWARENESS", actions: [], results: reach }), 0);
  assert.equal(metaLeads({ objective: "OUTCOME_SALES", actions: [], results: reach }), 0);
  assert.equal(metaLeads({ objective: "OUTCOME_ENGAGEMENT", actions, results: [wa] }), 2);
  assert.equal(metaLeads({ actions }), 2, "unknown objective keeps lead counting");
});
