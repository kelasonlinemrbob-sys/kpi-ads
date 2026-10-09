import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const origin = "https://ads.lkbimrbob.com";

test("OAuth reviewers can read the homepage and both privacy policy languages without a session", () => {
  for (const path of ["/", "/privacy-policy", "/privacy-policy?lang=en", "/robots.txt", "/sitemap.xml"]) {
    const response = proxy(new NextRequest(`${origin}${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("location"), null, path);
    assert.equal(response.headers.get("x-robots-tag"), null, path);
  }
});

test("public homepage access does not expose workspace pages or similarly named paths", () => {
  for (const path of ["/dashboard", "/settings", "/reports", "/seo", "/team", "/privacy-policy/private", "/robots.txt/private", "/sitemap.xml/private"]) {
    const response = proxy(new NextRequest(`${origin}${path}`));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `${origin}/login`, path);
  }
});

test("invitation, password recovery and public forms retain their privacy headers", () => {
  for (const path of ["/forgot-password", "/reset-password", "/accept-invitation", "/f/example", "/embed/order.js"]) {
    const response = proxy(new NextRequest(`${origin}${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", path);
  }
});
