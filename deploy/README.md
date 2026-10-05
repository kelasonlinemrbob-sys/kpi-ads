# KPI Ads — VPS deployment

- URL: https://ads.lkbimrbob.com
- VPS: `69.161.221.215`
- Runtime: Node.js 22.23.2, pnpm 10, PostgreSQL 16, Nginx, systemd.
- Current release: `/srv/kpiads/current` → `/srv/kpiads/releases/20261005-08`.
- Production environment: `/srv/kpiads/shared/.env` (root:kpiads, mode 640).
- Database: `kpiads`, accessible on localhost only.
- Services: `kpiads` (web, localhost:3000), `kpiads-wa` (WhatsApp worker).
- Initial account: `admin@ads.lkbimrbob.com`. The generated password is stored separately at `/root/kpiads-initial-admin.txt` on the VPS and `/home/wahib/.local/share/kpiads/deployment-credentials.txt` on the development machine (mode 600).

The production database starts with one administrator and 23 KPI definitions. Demo users, reports, tasks, local API credentials, and WhatsApp sessions are not copied. Configure integrations in the application after signing in.

## Service operations

```bash
systemctl status kpiads kpiads-wa
journalctl -u kpiads -u kpiads-wa --since '10 minutes ago'
systemctl restart kpiads kpiads-wa
nginx -t
systemctl reload nginx
```

## Subsequent releases

1. Back up the production database with `pg_dump -Fc` before applying migrations; retain the current release directory and environment file.
2. Copy application sources to a new directory under `/srv/kpiads/releases/`, excluding `.env`, `node_modules`, and `.next`. Set ownership to `kpiads:kpiads` and link `.env` to `/srv/kpiads/shared/.env`.
3. As `kpiads`, run `pnpm install --frozen-lockfile --prod=false`, `pnpm run test:kpi`, and `pnpm run build` in the new release.
4. Run migrations as `kpiads`: `node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate`. Never run the demo seed on production. `src/db/init-production.ts` is a non-destructive initializer for missing KPI definitions and a new admin account; it requires `INIT_ADMIN_EMAIL` and `INIT_ADMIN_PASSWORD`.
5. Switch `/srv/kpiads/current` to the validated release, restart both services, then verify HTTPS, login, targets, and reports. Keep the prior release available for rollback; schema changes must remain compatible before reverting application code.

## HTTPS

Let's Encrypt certificate: `/etc/letsencrypt/live/ads.lkbimrbob.com/`.
`certbot.timer` renews it automatically. `/etc/letsencrypt/renewal-hooks/deploy/kpiads-nginx` reloads Nginx after successful renewal.
HTTP-01 challenge files are served from `/var/www/kpiads/.well-known/acme-challenge/`.
DNS is proxied through Cloudflare. Keep the origin pointed at the VPS and use Full (strict) TLS.

```bash
certbot certificates
certbot renew --dry-run --run-deploy-hooks
```

The firewall permits SSH, HTTP and HTTPS; Node.js and PostgreSQL listen only on loopback. Service units and the active Nginx configuration are included in this directory.

## Supervisor advertising update (2026-10-05)

Release `20261005-02` adds personal advertising dashboards, product ownership, advertiser reports, targets and WhatsApp settings for supervisors while retaining team review. No schema migration or database initialization is needed. The previous release is `20261005-01`; the pre-update database backup is `/srv/kpiads/backups/kpiads-before-supervisor-20261005.dump`.

## Password recovery and Remember me (2026-10-05)

Release `20261005-03` adds public `/forgot-password` and `/reset-password` pages. Migration `0020_password_reset` adds hashed, expiring, single-use tokens and shared request limits. SMTP settings live in `/srv/kpiads/shared/.env`: `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_NAME`. Use a Gmail App Password with TLS on port 465. SMTP credentials are never part of the release source.

Reset links last 15 minutes; requesting another replaces the old link. A successful reset revokes every existing login through the user's session version. Requests return the same response for unknown/inactive accounts, with quotas of 3 per email, 10 per origin IP and 100 total per 15 minutes. Email delivery runs after the HTTP response; delivery failures produce a redacted service-log message. The reverse proxy must overwrite `X-Real-IP` (the included Nginx config does this). Nginx access logs omit query strings and referrers so reset tokens are not recorded.

Remember me opts into a 30-day persistent cookie. Without it, the cookie lasts for the browser session and the signed token expires after 12 hours. Changing the password from Settings preserves this preference on the current device.

The pre-update database backup is `/srv/kpiads/backups/kpiads-before-auth-20261005.dump`; the prior release is `20261005-02`. No existing accounts or passwords are replaced by deployment. Tests: `pnpm run test:kpi` and, against a test/local database, `pnpm run test:auth:integration` (fixtures rolled back).

SMTP configuration follows [Nodemailer SMTP documentation](https://nodemailer.com/smtp) and [Google App Password guidance](https://support.google.com/accounts/answer/185833).

## Automatic LPV and CPLV (2026-10-05)

Release `20261005-04`, migration `0021_automatic_lpv`: Meta LPV reads `actions.landing_page_view`. Google Ads LPV reads `metrics.all_conversions` for one explicitly selected landing-page conversion action (choose it in Campaigns → Akun iklan → Pilih konversi LPV). Configure a landing-page-specific event, preferably secondary so it does not inflate primary lead conversions. Google does not supply a native LPV count equivalent to Meta; clicks and the `landing_page_view` reporting resource are not treated as LPV counts. Credentials for the Google Ads API must already be configured.

LPV travels through campaign-to-product aggregation, the generated form, saved campaign breakdowns and KPI entries. CPLV is spend divided by known, positive LPV; unknown/failed LPV remains blank with a warning for Google. Re-generate an existing report and save to update its LPV; deployment never rewrites report history. Automated Google API tests mock responses; live Meta generation can be verified without saving reports. References: [Google conversion reporting](https://developers.google.com/google-ads/api/docs/conversions/reporting), [Google landing-page reporting resource](https://developers.google.com/google-ads/api/fields/v22/landing_page_view).

Backup before this release: `/srv/kpiads/backups/kpiads-before-lpv-20261005.dump`. Previous release: `20261005-03`.

## Campaign performance metrics (2026-10-05)

Release `20261005-05` reads campaign performance directly from Meta/Google for six preset date ranges. Campaigns no longer require saved daily reports to display performance. The table provides summary, traffic, conversions, video and all-metrics views, local search, sortable metric columns, and weighted totals. API calls occur server-side on page load with no persistent cache; switching metric views/search/sort does not call the API again. Existing reports and KPI entries are not modified.

Meta includes reach, impressions, frequency, all/link/outbound clicks, CTR/CPC/CPM, leads/CPR, messaging conversations/cost per chat, LPV/CPLV, purchases/value/ROAS and video engagement. Reach is requested for the whole range and is not summed across campaigns. Missing/failed data is distinct from zero activity; different currencies are not combined into monetary totals. Google conversions remain separately labelled, with LPV requiring the existing conversion-action mapping. Google-specific credentials must be configured to use its API.

No database migration is required. Backup: `/srv/kpiads/backups/kpiads-before-campaign-metrics-20261005.dump`; rollback release: `20261005-04`. Validation: `pnpm run test:ads`, `pnpm run test:kpi`, `pnpm run build`, live Meta range response and authenticated HTTPS campaign/product pages. Browser visual checks were unavailable in this environment.

## Google Ads connection and tutorial (2026-10-05)

Release `20261005-06` adds Settings → Integrasi → Koneksi Google Ads (`/settings?tab=integrasi#google-ads`), with an in-app seven-step Indonesian tutorial, OAuth credential form, account-specific access test, and registration of the verified account. Supervisor authorization is enforced independently inside save/test/disconnect server actions. Advertisers can read the guide. Client Secret and Refresh Token are never returned in status DTOs or rendered HTML.

Credentials are stored as one AES-256-GCM encrypted `google.connection` object in the existing `app_settings` table, using `AUTH_SECRET`. The app configuration takes precedence over the three OAuth environment variables. Save tests the proposed credentials against the supplied advertising customer before replacing the saved connection; blank secret fields retain saved values unless Client ID changes. A disconnect marker also prevents environment fallback from silently reconnecting. Google access-token caching is keyed by credential fingerprint and tests force a refresh. No database migration is needed.

Google sunset developer tokens on September 9, 2026. The application no longer requires or sends `GOOGLE_ADS_DEVELOPER_TOKEN`; production API access must be granted to the Google Cloud project owning the OAuth client. The default API version is now v25, and the production version setting is upgraded from v22. The active connection is shared by all Google ad accounts; for access through an MCC, the configured manager must cover those accounts. LPV event mapping remains per account in Campaigns → Akun iklan.

Validation: 17 Ads/API unit tests, 30 existing KPI tests, one transactional database integration test (`pnpm run test:google:integration`, local database only), supervisor/advertiser HTTP authorization checks, production build, and authenticated production settings/campaign pages. Google network behavior was mocked because real OAuth credentials have not been supplied. Browser visual validation remains unavailable.

Backup: `/srv/kpiads/backups/kpiads-before-google-connection-20261005.dump`; previous release: `20261005-05`. The shared environment file is backed up before its API version setting is changed. Rolling back code to release 05 also removes support for the new app-stored Google credentials; Meta and existing reports remain compatible.

Official references: [Google Cloud API access](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [developer token sunset](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [OAuth Playground](https://developers.google.com/oauthplayground/), [refresh token expiry](https://developers.google.com/identity/protocols/oauth2#expiration), [API versions](https://developers.google.com/google-ads/api/docs/sunset-dates).

## Creative date-limited sync (2026-10-05)

Release `20261005-07` fixes Meta's reduce-data error by replacing the lifetime Insights query and full-account ad inventory with a bounded reporting window: 7 days by default, or 14/30 days including today. The period is applied to Meta's ad-level Insights request; metadata is fetched only for returned ads. Ads created before the period remain included if they delivered during it. Insights pagination starts at 50 rows, reducing to 10/1 on data-volume errors. Ad metadata is fetched via individual nodes in groups of four concurrent requests (multi-ID reads are deprecated on the production Graph API version).

Migration `0022_creative_period_snapshots` adds `creative_syncs` and `creative_metrics`. Complete account/range snapshots are replaced atomically, including zero-activity results. Failed API calls leave previous snapshots intact. Account-level advisory locks and start timestamps prevent older syncs replacing newer results. Manual annotations remain on `ad_creatives`; absence from a limited window never marks an ad deleted. Legacy lifetime values are retained but are not used in the new Creative views.

The same period selects the report, gallery, table, search/filter options and CSV. CSV includes period start/end and a dated filename. Newly selected or rolled-forward date ranges require clicking Sinkron dari Meta; missing account snapshots are identified in the page. Reach is aggregated at the API for each ad's complete window; combined ad reach is labelled as a sum which can contain duplicated people.

Validation: 22 Ads/API unit tests, one transactional snapshot integration test (`pnpm run test:creative:integration`, local only), production build and real Meta sync checks for supported periods. Production database backup: `/srv/kpiads/backups/kpiads-before-creative-periods-20261005.dump`. Prior release: `20261005-06`; the additive migration is rollback-compatible. The previous release would display its legacy lifetime metrics, not these new snapshots.


## Campaign and Creative table layout (2026-10-05)

Release `20261005-08` adds cell borders, explicit column widths, alternating row backgrounds, and bounded scrolling to Campaign and Creative tables. Monetary values remain on one line; long campaign/product names wrap within their columns. Headers remain visible when scrolling vertically and the first column stays visible on screens at least 640px wide. Creative editing controls fit their columns and full link/person values are available in tooltips. Table scrolling is keyboard accessible.

No database migration or data resync is required. Previous release: `20261005-07`. Verification includes production build and authenticated HTTP checks for both tables. Direct visual browser verification is unavailable in this environment.
