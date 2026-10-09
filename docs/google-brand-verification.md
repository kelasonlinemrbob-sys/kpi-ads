# Google OAuth branding — KPI Ads

The public homepage is `/`, separate from the authenticated workspace at `/dashboard`.
It must return HTTP 200 without a session and show the exact name **KPI Ads**, the
operator, the app's purpose, its integrations, and a visible privacy policy link.
Do not redirect the homepage to the dashboard or login, even for Google reviewers.
The policy is `/privacy-policy` (Indonesian) and `/privacy-policy?lang=en` (English).

## Before deploying

- Run `pnpm exec tsx --test src/proxy.test.ts`, `pnpm run typecheck`,
  `pnpm run test:kpi`, and `pnpm run build`.
- Follow `deploy/README.md` for release deployment; no database migration is needed
  for this branding change.
- Set the real, monitored `PRIVACY_CONTACT_EMAIL` and/or `PRIVACY_CONTACT_WHATSAPP`
  in the production environment. Confirm the displayed contact accepts access and
  deletion requests. No contact address is invented by the application.
- Review the policy against operational practices, including the existing 30-day
  deletion commitment, third-party AI processing, stored reports and backups.

## Google Auth Platform → Branding

Use these exact values for the OAuth client/project actually used by the integrations:

| Field | Value |
| --- | --- |
| App name | `KPI Ads` |
| Application home page | `https://ads.lkbimrbob.com` |
| Application privacy policy | `https://ads.lkbimrbob.com/privacy-policy` |
| Authorized domain | `lkbimrbob.com` |
| User support email | A monitored email belonging to the operator |

Ensure any submitted app logo matches the one shown on the homepage. Keep all
other required authorized domains for existing OAuth redirect URLs; do not remove
working OAuth client settings to fix this branding issue.

## Domain ownership — required outside the codebase

1. Open [Google Search Console](https://search.google.com/search-console) with a
   Google account that is an **Owner or Editor of the relevant Google Cloud project**.
2. Add a **Domain** property for `lkbimrbob.com`, or check its existing ownership
   verification. Having access to performance reports alone is not proof that this
   account is a verified owner.
3. Obtain the DNS TXT verification value from Search Console and add that exact
   value to the root domain's DNS records (Cloudflare for this deployment), preserving
   all existing TXT records. A Domain property covers `ads.lkbimrbob.com` as well.
4. Click Verify in Search Console and confirm successful ownership verification.
   Do not remove the verification TXT record afterwards.
5. Ensure that the verified owner's account is associated with the Google Cloud
   project. If a different account owns the domain, arrange verified ownership or
   the appropriate project membership with the administrator.
6. Follow the rejection screen's instruction to wait **24 hours after ownership
   verification** before retrying, so Google's systems can update.

## Check the deployed result and retry

Open these URLs in a signed-out/private window: `/`, `/privacy-policy`, and
`/privacy-policy?lang=en`. All must show their full text without requiring login.
Check `/dashboard` still redirects to `/login`. Confirm the privacy policy links
and contact work, and the Google data sections cover Ads, Search Console, Sheets,
AI sharing, storage, retention, deletion and revocation.

Only after deployment, verified domain ownership and the required waiting period,
choose **I have fixed the issues** and retry branding verification. Approval is
determined by Google; a code change alone does not verify domain ownership or
publish branding. If Google reports Ready to publish, use **Publish branding**.

References:
- [Google's brand verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080)

## Crawler access follow-up (2026-10-09)

The homepage and policy return 200 with server-rendered content for browser,
Googlebot and Google-InspectionTool user-agent tests. These simulations do not
prove which response Google's OAuth verifier receives. `/robots.txt` was still
redirected to `/login`; the crawler follow-up release adds public `/robots.txt`
and `/sitemap.xml` routes and exact proxy exceptions for both.

A request using `Python-urllib/3.14` receives Cloudflare HTTP 403 with body
`error code: 1010`. Cloudflare documents this as browser signature blocking and
recommends adjusting Browser Integrity Check. This is a confirmed access problem
for that client, but not yet a proven cause of Google's OAuth result.

In Cloudflare for `lkbimrbob.com`, create a Configuration Rule named
`KPI Ads public verification pages` with this expression:

```text
(http.host eq "ads.lkbimrbob.com" and http.request.method in {"GET" "HEAD"} and http.request.uri.path in {"/" "/privacy-policy" "/privacy-policy/" "/robots.txt" "/sitemap.xml"})
```

Set **Browser Integrity Check → Off** for this rule only. Keep the remaining
security settings and all login/API routes unchanged. If that feature is exposed
through Security custom rules instead, the same expression can use **Skip →
Browser Integrity Check**. This cannot be changed from the origin VPS alone.

Purge cached URLs for the homepage, privacy policy (including `?lang=en`),
`/robots.txt` and `/sitemap.xml`, particularly if the old robots redirect was
cached. Retest these URLs without cookies with both a browser user agent and
`Python-urllib/3.14`, then choose **I have fixed the issues** to rerun Google
branding verification. If a fresh attempt still reports login/name/content
errors after public access is confirmed, use **I believe the issues found are
incorrect** to request additional review.

References:
- [Cloudflare error 1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)
- [Disable Browser Integrity Check selectively](https://developers.cloudflare.com/waf/tools/browser-integrity-check/#disable-selectively)


Follow-up validation after the operator applied the Cloudflare changes: all five public URLs returned HTTP 200 with the expected server-rendered content for browser, Googlebot and Python-urllib/3.14 user agents (15 successful checks). The previous 1010 block no longer affects these public pages. Private dashboard requests still redirect to login for browser/Googlebot and remain blocked at the edge for Python-urllib, consistent with the narrow exception. A fresh Google branding verification is the next step; approval has not been confirmed.
