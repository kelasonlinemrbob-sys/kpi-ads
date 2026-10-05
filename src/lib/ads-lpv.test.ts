import assert from "node:assert/strict";
import { test } from "node:test";
import { generatedMetricStrings, metaLandingPageViews, sumLandingPageViews, validGoogleConversionResource } from "./ads-lpv";

test("Meta LPV reads only landing_page_view, never link clicks, leads or pixel page views", () => {
  assert.equal(metaLandingPageViews([{ action_type: "link_click", value: "500" }, { action_type: "landing_page_view", value: "120" }, { action_type: "offsite_conversion.fb_pixel_view_content", value: "99" }]), 120);
  assert.equal(metaLandingPageViews([{ action_type: "link_click", value: "500" }]), 0);
  assert.equal(metaLandingPageViews(), 0);
  assert.equal(metaLandingPageViews([{ action_type: "landing_page_view", value: "invalid" }]), null);
});
test("aggregate LPV only when complete and compute CPLV from the summed counts", () => {
  const lpv = sumLandingPageViews([{ landingPageViews: 100 }, { landingPageViews: 50 }]);
  assert.equal(lpv, 150); assert.equal(300000 / lpv!, 2000);
  assert.equal(sumLandingPageViews([{ landingPageViews: 100 }, { landingPageViews: null }]), null);
  assert.equal(sumLandingPageViews([{ landingPageViews: 0 }]), 0);
  assert.equal(sumLandingPageViews([], null), null);
  assert.equal(sumLandingPageViews([], 0), 0);
});
test("generated form fills LPV and clears stale manual data when unavailable", () => {
  const metrics = { spent: 510337, impressions: 45867, clicks: 263, leads: 21 };
  assert.equal(generatedMetricStrings({ ...metrics, landingPageViews: 200 }).landingPageViews, "200");
  assert.equal(generatedMetricStrings({ ...metrics, landingPageViews: 0 }).landingPageViews, "0");
  assert.equal(generatedMetricStrings({ ...metrics, landingPageViews: null }).landingPageViews, "");
});
test("Google conversion resources are validated before interpolating GAQL", () => {
  assert.equal(validGoogleConversionResource("customers/1234567890/conversionActions/123"), true);
  for (const value of ["123", "customers/1/conversionActions/2' OR 1=1", "", "customers/me/conversionActions/2"]) assert.equal(validGoogleConversionResource(value), false);
});
