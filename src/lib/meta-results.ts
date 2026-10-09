/**
 * What counts as a "Lead" in reports for a Meta campaign or ad. Lead campaigns keep the configured lead
 * action types. Sales campaigns count what Ads Manager shows as their Results (Meta's `results` field):
 * WhatsApp conversations started, purchases, or a lead-type conversion, depending on what the campaign
 * optimises for. Other objectives (awareness, engagement, traffic) report reach or clicks as results,
 * which are not leads, so they keep the lead action types (usually 0).
 */

export type MetaAction = { action_type: string; value: string };
export type MetaResult = { indicator?: string; values?: { value?: string; attribution_windows?: string[] }[] };

const LEAD_ACTIONS = (process.env.META_LEAD_ACTION_TYPES ?? "lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

/** Sales objectives (and their pre-ODAX names) whose Results are conversions. */
export const SALES_OBJECTIVES: ReadonlySet<string> = new Set(["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES", "MESSAGES"]);

/** Insights fields to request so `metaLeads` can tell sales results apart. */
export const META_RESULT_FIELDS = "objective,results";

/** The first configured lead action type present, so overlapping lead types aren't double-counted. */
export function leadCount(actions?: MetaAction[]) {
  const lead = LEAD_ACTIONS.map((type) => actions?.find((a) => a.action_type === type)).find(Boolean);
  return Number(lead?.value ?? 0);
}

/** Meta's Results count when it is a conversion action ("actions:…"); null when Meta reported none. */
export function conversionResults(results?: MetaResult[]) {
  const result = results?.find((r) => r.indicator?.startsWith("actions:"));
  if (!result) return null;
  // A campaign without any result that day comes back with the indicator and no values.
  const value = result.values?.find((v) => !v.attribution_windows || v.attribution_windows.includes("default")) ?? result.values?.[0];
  const n = Number(value?.value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

const actionValue = (actions: MetaAction[] | undefined, types: string[]) => {
  const found = types.map((type) => actions?.find((a) => a.action_type === type)).find(Boolean);
  return found ? Number(found.value) : null;
};

/**
 * Leads of one insights row, for any objective. `objective` may come from the row or the campaign. When
 * Meta sent no `results` (breakdown rows), a sales row counts WhatsApp chats, else purchases, else leads:
 * the same order the team's sales campaigns optimise for.
 */
export function metaLeads(row: { objective?: string | null; actions?: MetaAction[]; results?: MetaResult[] }) {
  if (row.objective && SALES_OBJECTIVES.has(row.objective)) {
    const results = conversionResults(row.results);
    if (results !== null) return results;
    const inferred =
      actionValue(row.actions, ["onsite_conversion.messaging_conversation_started_7d"]) ??
      actionValue(row.actions, ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"]);
    if (inferred !== null) return inferred;
  }
  return leadCount(row.actions);
}
