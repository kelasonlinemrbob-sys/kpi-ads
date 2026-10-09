# KPI Ads — VPS deployment

- URL: https://ads.lkbimrbob.com
- VPS: `69.161.221.215`
- Runtime: Node.js 22.23.2, pnpm 10, PostgreSQL 16, Nginx, systemd.
- Current release: `/srv/kpiads/current` → `/srv/kpiads/releases/20261006-16`.
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


## Integration settings navigation (2026-10-06)

Release `20261006-01` replaces the long integration stack with responsive service cards and one selected service (`service=whatsapp`, `meta-ads`, or `google-ads`). Legacy settings hash links select the corresponding service. Ads configuration opens automatically for setup/errors and stays collapsed for successful connections; connection checks remain accessible above it. Guides and WhatsApp message previews expand on demand. WhatsApp group and automatic-send controls are separated, with pending controls disabled and service status refreshed after connection changes.

Existing integration credentials, account permissions, and server actions are preserved. No migration, resync, or credential changes are needed. Rollback release: `20261005-08`. Validation: production build, existing KPI tests, and authenticated HTTP checks of the service links and forms. Visual browser verification is unavailable in this environment.


## Per-member monthly KPI targets (2026-10-06)

Release `20261006-02` adds target fields to Team add/edit forms and a per-member target link. `/targets?user=<id>&period=YYYY-MM` now selects a person and month rather than editing role-wide defaults. Future months are supported. Main/secondary operational roles determine applicable metrics; supervisors use advertiser metrics. Existing role defaults provide initial suggestions only in this editor; saving writes explicit personal targets and never changes the metric definitions, another member, or another period. Untouched legacy periods retain their existing default fallback behavior. Blank inputs preserve stored values. Daily SEO article and growth-percentage units retain their existing scoring semantics.

Member creation/update and its targets share one database transaction. Supervisor authorization, member/metric validation, SEO minima, and webmaster 100% completion remain enforced. Existing `kpi_targets` records feed dashboards, scorecards, and SEO daily report targets without schema changes. Previous release: `20261006-01`; no migration or seed is required.

Validation: 35 KPI/unit tests, transactional local target-isolation integration test, local authenticated Server Action checks (create member with targets, save another month, invalid input, advertiser rejection, future-month form), production build, and production authenticated read-only Team/Targets checks. Test fixtures are removed or rolled back; no production member targets are overwritten by verification.


## Profile avatar collection (2026-10-06)

Release `20261006-03` adds 48 supplied PNG presets from `src/avatar`, a keyboard-accessible radio picker and live preview in Settings → Profil, and an initials option. Migration `0023_profile_avatar` adds nullable `users.avatar_id`; existing users retain initials until they select and save an avatar. Only the authenticated user can change their choice through the profile action, with a strict preset allowlist; older forms omitting the field preserve the existing choice.

The saved choice follows user DTOs into the shell, Team, dashboard, leaderboard, scorecards, reports, task assignees, product owners, and appraisals. Bundled images use Next.js image optimization and lazy loading. No uploads or external image URLs are accepted.

Validation: 38 unit tests, local authenticated HTTP profile-action checks (save, per-user isolation, invalid input, initials reset, legacy-form preservation), image delivery, production build and production read-only checks. Database backup: `/srv/kpiads/backups/kpiads-before-avatar-20261006.dump`. Prior release `20261006-02` remains compatible with the additive migration. Visual browser verification remains unavailable.

## Creative layout — 6 October 2026

Release `20261006-04` groups search, period and ranking in a responsive toolbar with collapsible advanced filters, removable filter chips and a reset that preserves the reporting period/view. Summary cards use the content width; ranked contents display ad names, product context and three distinct metrics. Funnel, creation-week chart and summary tables have clearer labels and contained scrolling; the gallery fits narrow screens. Shared shell content can shrink correctly. Reporting queries, sync windows, permissions and saved creative metadata remain unchanged.

Validation: production build, 38 KPI tests and authenticated read-only checks of summary/ranking/filter states, gallery, table and CSV export. Browser visual verification was unavailable. No migration or seed required. Previous release: `20261006-03`.

## Google Sheets full-day reports — 6 October 2026

Release `20261006-05` adds Settings → Integrasi → Google Sheets and a separate Sheets Refresh Token encrypted under `sheets.connection` in `app_settings`. It reuses the Google Ads OAuth Client ID/Secret without replacing the Ads token. Destination is configured with the exact spreadsheet URL and gid; both access and the existing A:J report headers are checked before connection replacement. The supplied destination is `12kdUiw3ulv0XQfRtkOOt2fxgxicGIHTlTObxT8rHRYk`, gid `1728024521`. Existing OAuth authorization was tested and only grants `adwords`; an Editor account must grant `spreadsheets` before actual export. The initial destination is prepared with automatic sync disabled until authorization is completed.

Only saved advertiser report items with `window=previous_day`, performance date before today in Asia/Jakarta and before their report date are eligible. Historical `today_to_cutoff` entries are never promoted. Monday's Friday–Sunday windows remain separate days. A:J follows the existing template: submitted timestamp, advertiser name (legacy B header is Timestamp), performance date, platform, product, spend, impressions, clicks, leads and notes. K:L and legacy rows are preserved. Extra metrics without template columns are not exported. Strings are written as literal cell values rather than formulas.

A hidden marker column is appended after the existing grid. Keys use member/date/product IDs, surviving report item replacement and row movement. Writes update A:J plus the marker atomically in batches of 100; a retry reads keys before adding rows. Deleted source items clear only managed A:J cells and the marker. Old/manual rows are never adopted or deleted. A database session advisory lock serializes connection changes, timer runs and manual sync. Do not remove the hidden marker column or manually copy its values to other rows. Status and safe error messages persist in `sheets.status`; source report saving is independent of Sheets availability.

Install `deploy/kpiads-sheets.service` and `.timer` into `/etc/systemd/system/`, run `systemctl daemon-reload`, then `systemctl enable --now kpiads-sheets.timer`. The timer checks enabled connections every five minutes. Manual command: `runuser -u kpiads -- pnpm run sheets:sync` from the current release. Check `journalctl -u kpiads-sheets.service` for sanitized results. Stop the timer before rolling back to `20261006-04`, which does not contain the worker. No migration or seed is needed.

Validation: production build, 38 KPI tests, 10 Sheets unit tests and a transaction-rolled-back integration test with mocked Google (multi-batch lost-response retry, exact values, partial exclusions, update/delete, encrypted storage, pause and mutual exclusion). Real production write verification requires the Sheets authorization described above; no success should be inferred from read-only access checks.

## Telegram reports — 6 October 2026

Release `20261006-06` adds Telegram as a personal integration for advertisers and supervisors, alongside WhatsApp. Both channels use a shared report formatter (advertiser, performance date, platform/product spend, optional revision). Telegram escapes user content as HTML, preserves all WhatsApp reporting windows including the partial current day, and splits long messages between complete lines. The Sheets 24-hour-only policy remains separate.

Migration `0024_telegram_integration` adds encrypted per-user connections, a persistent outbox and worker heartbeat. Settings supports Bot Token, Chat ID, optional Topic ID, auto-send, read-only connection checks, recent chat discovery (no update acknowledgment or webhook changes), preview and explicit latest-report/test send. No historical reports are sent merely by connecting. No real Telegram message can be verified until a user supplies a bot and destination in the UI.

Report submission independently queues WhatsApp and Telegram. Automatic edits coalesce for 60 seconds; unchanged deliveries are not repeated. A single timer worker sends one chunk per destination per run, persists chunk progress and obeys Telegram 429 retry_after. Interrupted/ambiguous sends are marked unknown and require checking Telegram before manual resend. Changing the destination or disconnecting cancels pending work; an already in-flight network send can still complete. Token-bearing network errors are never logged or surfaced.

Install `deploy/kpiads-telegram.service` and `.timer` in `/etc/systemd/system`, reload systemd and enable/start `kpiads-telegram.timer`. It checks every 30 seconds. A global database session lock prevents overlapping workers, with per-user transaction locks for queue/configuration changes. Back up before migration: `/srv/kpiads/backups/kpiads-before-telegram-20261006.dump`. Stop the Telegram timer before rolling back to `20261006-05`; the additive schema remains compatible.

Validation: build, 38 KPI tests, 5 Telegram unit tests and a transaction-rolled-back Telegram integration test with mocked API (ownership, token encryption/redaction, coalescing, deduplication, revisions, multi-part progress, 429, uncertain delivery, auto-send off, manual send, disconnect and WhatsApp isolation). Production verification is limited to rendered configuration, existing report pages and worker health until credentials are entered.

## Email member invitations — 6 October 2026

Release `20261006-07` changes Team → Undang anggota to email invitations using the existing Gmail SMTP configuration. New members remain inactive and pending until they open the invitation and choose their own password. Roles and monthly targets are saved with the pending account. Existing joined accounts remain unchanged. Invite links use trusted APP_URL, expire after 72 hours, and store only SHA-256 token hashes. Acceptance atomically consumes the invitation and activates the account; row locks serialize acceptance, resending and revocation. Passwords require 8 characters and at most 72 UTF-8 bytes.

Supervisors can resend (invalidating the old link), cancel, or correct the email address. Resends have a one-minute cooldown and a sender quota; acceptance is rate limited. Pending accounts cannot bypass activation through login, password reset or the Activate action. SMTP errors retain the pending member and target data with a visible delivery status. No real invitation is sent by deployment or tests. Existing SMTP credentials and APP_URL are reused.

Migration `0025_member_invitations` adds `users.invitation_pending` (false for existing accounts) and `member_invitations`. Back up first to `/srv/kpiads/backups/kpiads-before-invitations-20261006.dump`. Validation: production build, 38 KPI tests, auth integration tests, invitation lifecycle/SMTP-mock integration tests (rolled back), local authenticated HTTP flow and production read-only checks. Local HTTP SMTP is deliberately pointed at a closed loopback port to test delivery failure without mailing anyone. Prior release: `20261006-06`; if rolling back, do not activate or edit pending invited accounts with the old UI, since it lacks invitation guards.

## Legacy CSV report import — 6 October 2026

Release `20261006-08` supports read-only `legacy_csv` reports with original performance dates and a visible historical label. Historical month choices appear in both supervisor and personal report lists. Migration `0026_legacy_report_import` adds the source discriminator and an item-level audit trail (`legacy_report_rows`: source file hash, CSV record number, original normalized data and item ID). Historical data is explicitly excluded from Google Sheets export; the importer never queues WhatsApp/Telegram or invitation email.

Operator workflow: `python3 scripts/prepare-legacy-reports.py SOURCE.csv --duplicates hold --output PLAN.json`, then `node --env-file=.env scripts/import-legacy-reports.mjs PLAN.json EMAIL_MAPPING.json SOURCE.csv --receipt=RECEIPT.json`. This is a transaction-rolled-back dry run unless `--apply` is specified. Keep source, plan, email mapping and receipts private, outside the repository. Only ID `0` is eligible for this authorized migration; `Off`, `10.237` and the empty row are excluded. Normalize person names and match explicit email mappings; new advertiser accounts remain inactive/pending until a supervisor sends an invitation. Existing accounts/targets/access are not changed. Product matching includes owner and platform; newly created historical products are ended and disconnected from Ads sync.

Ambiguous product/date groups (including Facebook/Instagram mapped to Meta), unknown platforms, invalid dates/timestamps and missing or ambiguous numeric fields are held for review. No duplicate totals are summed and missing metrics are never replaced with zero. Daily totals and original notes are grouped by person/performance date. No claim is made that legacy submissions were measured over a verified 24-hour window. Original performance dates drive KPI aggregation; LPV remains unknown. `previous_day` is the internal daily-total bucket while `legacy_csv` controls display, immutability and export exclusion.

The importer validates source SHA-256, rejects existing report collisions, writes reports/items/KPI entries/audit and completion marker in one transaction, and verifies source/import row counts and metric totals before commit. Re-running a completed file is a no-op; a partial/colliding import rolls back. Receipt includes all created report/user/product IDs. Before applying, back up `/srv/kpiads/backups/kpiads-before-legacy-import-20261006.dump`. Previous release `20261006-07` lacks historical display/edit/export guards; roll back imported data as well before reverting code.

Validation: parser tests, local database import integration tests (rollback, ownership, pending accounts, totals, idempotency, conflicts), full 10,832-row dry run, authenticated historical report/month-view checks, 38 KPI tests, 10 Sheets tests, Sheets integration and production build. Source audit: 10,832 valid rows → 4,397 reports; 737 held; 418 Off + 6 other ID + 1 empty excluded. Audit artifacts are stored privately under `/home/wahib/.local/share/kpiads/imports/` and `/srv/kpiads/imports/20261006-rep/`.

## Order forms, CSO and lead reporting — 6 October 2026

Release `20261006-09` adds a dedicated CSO role, configurable public order forms, and an authenticated Leads inbox. Supervisor invites CSOs with a WhatsApp number in Team; CSOs activate their own account through the existing email invitation. Only active CSOs with a valid number can receive a published form. Advertisers manage forms for their own products; supervisors manage all. Customer fields Name/Phone/Email/City support off/optional/required, with at least Phone or Email required. Form identity, product ownership and source are resolved server-side; changing product/owner/platform cannot repurpose an existing form. Draft/pause is supported; source and product are immutable after creation.

Public routes `/f/<slug>` and `/api/order-forms/<slug>` use server-signed expiring form challenges, same-origin JSON POST, bounded request bodies, validation, honeypot, consent and persistent IP rate limits. Public forms reveal only customer-facing fields; no CSO roster or account credentials. A database transaction stores the lead before returning a wa.me URL. Repeated submissions with the same challenge return the original result; normalized contact/form/day duplicates are rejected without returning another customer's data. Row locks serialize round-robin assignment and skip inactive CSOs. If none are available, no lead is stored or counted. No message is automatically sent: the customer must open WhatsApp and press Send. The embedded flow retains a manual Continue button if a browser blocks the new window.

Each form offers a public link and `/embed/order.js?form=<slug>` HTML snippet, rendering an iframe with UTM/click-ID forwarding. It works on landing pages that allow scripts/iframes from the app domain. Organic forms are separate from paid-product forms; UTM is diagnostic, not trusted ownership or attribution. CSOs see only assigned leads and update status/notes; advertisers see their own leads, supervisors all. Reassignment preserves original advertiser attribution and records an audit event; existing WhatsApp conversations do not move automatically. CSO access to legacy KPI/Ads routes/actions is excluded centrally, with explicit access to Leads, profile/security settings and logout.

Migration `0027_order_forms_cso` adds the enum value, CSO phone, product form-lead effective date, order forms/leads/events and report source/comparison fields. Publishing can opt a product into form-based Results starting today or a future date (never retroactive). This policy persists when forms pause, avoiding accidental fallback to Ads numbers. Stored form leads replace Results for that product/date; Ads values are retained separately. Full-day and cutoff report windows are calculated separately in WIB. Submission updates existing app report snapshots/KPI entries; CSV reports remain unchanged. Live KPI includes leads before an Ads report is submitted without double counting once it exists. Spend remains from Ads; missing spend is not presented as zero acquisition cost. No queues/emails/WhatsApp/Telegram notifications are triggered merely by customer submission. Existing report submission integrations keep their normal behavior.

Validation: production build, 38 KPI tests, auth/invitation and Sheets integration regressions, order integration tests using independent concurrent database transactions (routing, ownership, retries, dedupe, organic isolation, cutoff, KPI, reassignment), and authenticated local HTTP checks of public submission/form editor/CSO access/authoritative reporting. No browser backend was available, so visual browser testing was unavailable. No real customer/CSO messages are sent by tests. Production checks are read-only; no live forms or CSOs are fabricated.

Backup before migration: `/srv/kpiads/backups/kpiads-before-order-forms-20261006.dump`. Prior release: `20261006-08`. If reverting, pause all published forms and block CSO login first; the old release lacks the new role and source guards. PostgreSQL role enum values are not removed by a code rollback. Preserve new tables for recovery. Existing reports, imported data, credentials and worker timers remain in place.

Production verification: release `20261006-09` active; authenticated Forms/Leads/Team/report/settings/dashboard pages and public embed/origin guards passed. Existing database contains 4,397 legacy reports and one app report; zero live forms/leads were created by verification. Nginx restores visitor IPs only from the [official Cloudflare proxy ranges](https://www.cloudflare.com/ips/) via CF-Connecting-IP so public form quotas are per visitor, following [Cloudflare guidance](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/). The pinned ranges in `deploy/nginx.conf` were verified on 2026-10-06; review them when updating infrastructure. Nginx configuration is tested before reload.

## Form builder and order operations — 6 October 2026

Release `20261006-10`, migration `0028_order_form_builder`: form appearance (CTA text/color, placeholder text, labels, card/plain layout) has an immediate non-submitting preview. Public forms reuse the settings; embed frames resize through origin/source-checked messages. Existing public links and embed snippets remain valid. Form owners configure fixed, equal or percentage CSO rotation. Percentages are integer weights totaling 100; zero-weight and inactive CSOs receive nothing. Smooth weighted credits persist under the existing form transaction lock, reset when routing changes, and retries do not consume turns.

Leads now has scoped search/date/product/advertiser/CSO/source/status/payment/due filters, optional columns including all five UTM dimensions, CSV export (all filtered rows, max 5,000, formula-escaped), bulk status updates (max 50, atomic permission checks), and manual payment status/order value/follow-up stage 0–4/next schedule in WIB. Details preserve the original owner and audit handling/payment changes. These are internal records, not a payment gateway; payment/closing changes do not change counted leads or send Purchase events. No logistics, courier or bulk-import workflow is implied.

Tracking configuration supports up to five Meta Pixel, GTM and TikTok IDs each; Meta event defaults to Lead, TikTok uses Lead. Browser tracking runs on the external embedding landing page only after a successful saved lead and optional measurement consent. The authenticated app origin and standalone public form never execute advertiser-controlled GTM. No scripts are accepted as configuration; IDs/events are validated. Only event_id and form_id are pushed with `kpiads_lead`; contact fields never pass to parent dataLayer. Iframe origin/window/slug are verified, and references deduplicated per page/session. Tracking failures cannot roll back a stored lead. Tag blockers/consent denial mean a lead may not appear in ad-platform tracking. Use either direct pixels or a GTM tag for the same destination, not both. Existing landing-page tags remain the owner's responsibility. Configure and publish a GTM Custom Event trigger named `kpiads_lead` for Google Ads/GA or other supported tags. SnackVideo has no dedicated adapter. CAPI/server-side delivery is not implemented; no access-token UI or successful-delivery claim is presented.

References: [Google dataLayer](https://developers.google.com/tag-platform/tag-manager/datalayer), [TikTok multiple-pixel setup](https://ads.tiktok.com/gateway/docs/index?doc_id=1701890973258754), [TikTok Lead event migration](https://ads.tiktok.com/resources/help/article/how-to-adopt-tiktoks-updated-standard-events), [Meta Pixel reference](https://developers.facebook.com/docs/meta-pixel/reference/). No tracking IDs from example screenshots are installed. Production needs each advertiser's actual IDs and platform-side Test Events/Tag Assistant verification; tests mock SDK delivery and send no real conversion events or messages.

Validation: `test:orders` validates schemas, weighting and isolated embed SDK/message behavior; `test:orders:integration` verifies concurrent 75/25 distribution and commerce authorization alongside previous ownership/idempotency/report regressions; 38 KPI tests; authenticated local HTTP checks cover builder persistence, render, public submission, scoped exports, bulk rollback, commerce and report integration. Production build passes. Interactive visual browser was unavailable. Backup: `/srv/kpiads/backups/kpiads-before-order-builder-20261006.dump`. Previous release is `20261006-09`; pause weighted forms before code rollback because the old code treats unknown routing modes as equal rotation. Preserve added columns/data and never run seed on production.

## Focused form wizard and categorized navigation — 6 October 2026

Release `20261006-11` replaces anchor-only form sections with five actual steps: Informasi, Tampilan, CSO, Tracking, and Simpan & pasang. Only the current section is visible; mounted fields and controlled state preserve input while navigating. Next validates relevant fields; final Save validates all fields and returns to the offending step. Tracking remains optional and drafts do not require assigned CSOs. Explicit keyed Next/Save buttons prevent a click entering the review step from implicitly submitting after React changes button type. A review summary precedes publishing. Desktop preview stays alongside the editor; mobile preview is expandable. Embed instructions appear at the final step. No autosave or schema migration is introduced.

Sidebar categories are Utama, Iklan & Konten, Form & Leads, Tim & Kinerja, and Bantuan, filtered using existing role permissions. CSOs retain only their Leads and account settings. Categories can collapse; preferences are saved per user, and the active route's category reopens automatically. Search still includes every authorized route, including collapsed groups. Mobile navigation closes after query-only as well as path changes. Forms/Leads have proper mobile breadcrumbs.

Validation: production build, order schema/rotation/embed tests, and an isolated Chromium browser session using disposable local fixtures. Browser checks cover step visibility, backward input retention, invalid tracking validation, no automatic save on review, explicit draft persistence across hidden steps, desktop/mobile screenshots, no horizontal mobile overflow, expandable preview, category navigation and mobile drawer closing. No customer messages, invitation emails or pixel events are emitted. Screenshots were inspected; fixtures were removed. Prior release: `20261006-10`; code rollback is compatible, with no database change required.


## Order form UI and Meta Conversions API — 6 October 2026

Release `20261006-12` adds the Mudah / Cepat / Aman header to preview and public forms, and removes the required contact-consent checkbox. Optional advertising measurement consent remains independent; declining it still saves the lead and returns the WhatsApp redirect.

Migration `0029_meta_capi_forms` adds encrypted per-form Pixel/token configuration, a safe public event snapshot, measurement consent and an encrypted delivery outbox. Form → Tracking supports enabling CAPI, masked retained credentials, test-event-only verification and recent delivery status. Enter a Pixel ID and its CAPI Access Token from Events Manager; deployment does not reuse Ads credentials or activate a real dataset automatically. Browser tracking on external embeds includes the CAPI Pixel and uses the exact event name/ID saved with the lead. Standalone public forms also queue CAPI when measurement is allowed. Tokens never reach public pages, embed scripts or serialized editor props. Phone/email are SHA-256 hashed, IP/UA are supplied by the trusted reverse proxy/request, and source URL query strings are stripped.

Install `deploy/kpiads-capi.service` and `.timer` under `/etc/systemd/system`, reload systemd and enable/start `kpiads-capi.timer`. The worker checks every 30 seconds, under a PostgreSQL session advisory lock. Delivery is independent of the public submission request. Transient failures retry with the same event ID/time, up to eight attempts or 24 hours; Meta deduplicates browser/server events with matching pixel, name and ID. Credential changes cancel queued events from the previous configuration. Encrypted payloads are cleared after delivery, cancellation or permanent failure. Events already sent cannot be recalled. Test requests require a Test Event Code, have a one-minute cooldown, and create no app lead or KPI data.

Back up to `/srv/kpiads/backups/kpiads-before-capi-20261006.dump` before migration. To roll back to release11, stop/disable the CAPI timer before switching the symlink; additive schema can remain. Real Meta delivery is not verified until the operator configures credentials and runs Test Events. Automated local tests mock all Meta HTTP requests and clean up disposable database fixtures.

Validation for release12: production build; 4 schema/rotation/embed tests; 2 order integration tests; CAPI integration coverage for ownership, encrypted storage, retained token, opt-out, idempotency, sanitized payload, transient retry, permanent rejection, cancellation and test-event isolation. Isolated Chromium checked desktop/mobile rendering, wizard CAPI validation/save, redacted reload, contact-checkbox removal, lead submission with and without measurement consent and a simulated WhatsApp redirect. No real Meta event or customer message was sent.

## CAPI delivery reliability — 6 October 2026

Release `20261006-14`, migration `0030_capi_delivery_status`, adds structured test success/failure and sanitized Meta code/trace diagnostics. The form Tracking panel shows lifetime counts, the latest 20 events with status filter, scheduled/sent timestamps, delivery worker heartbeat and manual retry for eligible failed events. API acceptance does not imply Ads attribution. Worker health is recorded in `app_settings` under `capi.worker`; a heartbeat older than seven minutes is shown as stale (worker timeout is six minutes).

Same-Pixel token rotation preserves pending/failed events and their original payload, event ID and event time. Switching Pixel or disabling CAPI cancels undelivered events. Failed payloads are encrypted and retained up to 24 hours to support correction/retry; eight total attempts remains the limit, including manual retries. Sent, cancelled, exhausted and expired payloads are cleared. Retry obeys the stored backoff and HTTP Retry-After, never resets attempt counts and only queues work; the form request never waits on Meta delivery. Existing failures whose payload was already cleared cannot be retried. Synthetic tests require Test Event Code and never create app leads or KPI entries.

Before rollout, back up the database and stop the CAPI timer/service so the old worker cannot process the new queue policy during migration/switch. Apply migration, switch release, restart the web/WA services, and enable the CAPI timer again. Rollback to release13 requires pausing CAPI first; the additive schema is compatible but release13 cancels token-rotation queues and discards failed payloads. Do not run integration fixtures on production.

Validation: mocked CAPI client tests (Retry-After, non-JSON 429, safe error/trace, missing receipt, network failures), CAPI integration (rotation, idempotency, permission/cooldown/retry guards, original event ID, stale payload purge, exhaustion, Pixel changes and failed-test status), existing order integration and six builder/embed tests. No live Meta events or customer messages are sent by tests or deployment verification.

## Tracking setup UX — 6 October 2026

Release `20261006-15` reorganizes the Tracking wizard step into Meta Ads, Google Tag Manager and TikTok provider panels. Meta has Connection, Test and Activity sections; counters/worker diagnostics/event history are shown in Activity, while setup starts with the CAPI switch, credentials and shared Meta event. Browser-only/additional Meta IDs and guides are expandable. Event diagnostics are expandable and the latest-event list is height-limited. The test panel explains why testing is unavailable before credentials are saved. API/network failures from test/retry actions display a recovery message.

All provider and CAPI panels remain mounted, including password/hidden settings inputs, so switching panels never omits configuration from the final form submission. Validation reveals the relevant provider/connection panel. This release changes UI only; no migration or tracking-delivery policy change is needed. Prior release: `20261006-14`.


## Personal Ads and shared reporting integrations (2026-10-06)

Release `20261006-16` scopes Meta/Google Ads credentials to the authenticated advertiser or supervisor. API calls use the registered ad account owner's credentials. Legacy saved credentials remain available only to their original `updated_by_id`; no advertiser inherits server environment credentials. Disconnecting a personal connection does not affect another member. WhatsApp remains per-user.

Google Sheets uses a shared supervisor-managed connection, with its own encrypted OAuth client and refresh token fields. Legacy Sheets authorization remains valid until resaved; personal Google Ads changes do not alter it. Full-day-only export rules remain unchanged.

Migration `0031_shared_telegram` adds a singleton Telegram destination. Only supervisors can save/disconnect/find chats/manually send. Automatic advertiser report delivery uses the shared bot; ownership, deduplication, retry and ambiguous-delivery safeguards remain enforced. Advertisers see shared status and only their own message history/preview. A single active legacy supervisor connection can be carried forward; multiple supervisor destinations require explicit reconfiguration. Legacy pending private messages are cancelled instead of rerouted. No historical reports are backfilled automatically.

Stop the Telegram timer/service during migration and release switch. Backup: `/srv/kpiads/backups/kpiads-before-shared-integrations-20261006-16.dump`. Previous release: `20261006-15`. Schema is additive, but rolling back application code restores private Telegram behavior, so keep its timer stopped until the intended destination is verified.

Validation: Ads/KPI/Telegram/Sheets unit suites, rolled-back personal isolation and Telegram/Sheets integration tests with mocked APIs, browser checks for advertiser read-only shared settings and supervisor controls, production build, then authenticated HTTPS and worker checks. Never run fixture integration tests on production.

## AI ad analysis with Claude via Kie.ai (2026-10-07)

Release `20261007-01` adds "Analisa AI" to Creative → Ringkasan for supervisors and advertisers. Each user stores a personal Kie.ai API key in Settings → Integrasi → Kie AI (AES-GCM encrypted in `app_settings`, checked against Kie's free credit endpoint). The server computes all rates and changes; Claude Opus 5.5 (`claude-opus-5-5` via `https://api.kie.ai/claude`) only interprets them. Optional extra Meta data (previous period for the same ads, daily trend, placement/age/gender) is pulled with the ad account owner's Meta token. The analysis runs after the HTTP response (`after()`) and the page polls, so nginx/Cloudflare timeouts don't apply.

Migration `0032_ai_analyses` adds one table; nothing existing changes. Optional env: `AI_ANALYSIS_DAILY_LIMIT` (default 30 per user per 24h), `AI_ANALYSIS_IMAGES` (default false), `KIE_BASE_URL`, `KIE_MODEL`.

Kie limitations verified live on 2026-10-07: requests with `tools` return 503, `output_config` is ignored, image blocks are silently dropped and non-streaming responses have no content. The app therefore streams, asks for JSON in the system prompt (validated with zod) and sends no images. A 2-ad test analysis took 34 s and 5.43 credits. Ad names, campaign names and performance numbers are sent to Kie.ai.

Backup: `/srv/kpiads/backups/kpiads-before-ai-analysis-20261007.dump`. Previous release: `20261006-16`. Rolling back the code is safe; the extra table is ignored by older releases.

## Creative analysis with Gemini; Gemini as default for Ringkasan (2026-10-07)

Release `20261007-02`. The content dialog in Creative → Galeri konten gets "Analisa creative": the server pulls the creative of the content's biggest-spend ad from Meta with the ad account owner's token (video file URL from Meta's CDN, full image or up to 5 carousel cards, ad copy) and Gemini 3.8 Flash (`gemini-3-8-flash` via `https://api.kie.ai/gemini/v1/models/...:streamGenerateContent`, Bearer auth) watches/reads it and relates it to the content's numbers against the period average. If the video file can't be read or processed, the cover is judged instead and noted. The latest analysis per content is visible to the whole Creative team; running one needs a supervisor/advertiser with a Kie key.

Ringkasan now runs on Gemini by default (`AI_SUMMARY_MODEL=gemini`, `claude` switches back) with creative images enabled automatically for Gemini (`AI_ANALYSIS_IMAGES` overrides). Live checks: Gemini on Kie really sees images and videos, honours the system instruction and `responseMimeType`, but does not enforce `responseSchema` enums, so answers are validated with zod and retried once. Kie may report failures as HTTP 200 with `{code, msg}`. Same 2-ad test as Claude: identical verdicts, 0.35 vs 5.43 credits. A 10 s video content analysis: about 36 s and 0.34 credits.

Migration `0033_ai_analysis_credits` adds `ai_analyses.credits` (credits Kie reports) and an index on `(kind, filter_key, created_at)`. Backup: `/srv/kpiads/backups/kpiads-before-gemini-20261007.dump`. Previous release: `20261007-01`. Rolling back is safe; older code ignores the new column.

Release `20261007-03` (no migration): Meta video files belong to the Page, so an ads-only token gets "(#10) Application does not have permission". The creative fetch now retries through the Page token (`/{page_id}?fields=access_token`), which works once the Meta token has `pages_read_engagement` and the Page is assigned to the System User. Until then the cover is judged and the result says which permission to add. Production comparison on 12 ads (1–7 Oct): Gemini succeeded in 67 s for 1.26 credits with 6 images; Claude Opus ran 203 s, produced 10,477 output tokens and failed JSON validation, so Gemini stays the default. Previous release: `20261007-02`.

Release `20261007-04` (no migration): with `pages_read_engagement` the System User token reads a video's length but Meta still omits `source`; only the Page token returns the file URL. The creative fetch now always tries the Page token when no file URL came back, not only on errors. Verified on production: the Kelas Online Mr.BOB video (21 s) is watched by Gemini. Previous release: `20261007-03`.

## Team-wide Meta / Google Ads connection (2026-10-07)

Release `20261007-05` reverses the personal credentials of `20261006-16`: a supervisor enters one Meta token and one Google Ads OAuth connection for the whole team (encrypted under `shared.meta.*` and `shared.google_ads.connection`). Every Ads API call (Generate dari Ads, campaign sync, Creative sync, AI enrichment and creative media) uses it. Advertisers no longer enter credentials; in Settings → Integrasi they pick their ad accounts from the accounts the team connection can read (`listAdAccountChoices` / `claimAdAccount`, re-checked server-side). Another advertiser's account shows as taken; a supervisor-registered account can be taken over; releasing only clears `created_by_id`, synced data stays. Only supervisors can save, test or disconnect the connections. The legacy `google.connection` key remains the Google Sheets fallback and is not touched.

Migration `0034_shared_ads_credentials` (data only) copies the newest personal Meta token / Google connection of an active supervisor into the shared keys, so syncing continues without re-entry. Advertisers' personal credential rows are left in place but no longer read. Validation: rewritten integration tests run the migration SQL in a rolled-back transaction and confirm personal and environment credentials are never inherited and Sheets keeps its own authorization; Sheets/Creative integration, all unit suites and production build. Backup: `/srv/kpiads/backups/kpiads-before-shared-ads-20261007.dump`. Previous release: `20261007-04`. Rolling back the code would make the app read personal credentials again; the shared rows are ignored by older code.

The same release also ships two UI changes made since `20261007-04`: a dark/light switch next to the sidebar logo, and the Dashboard date filter with rolling ranges (`?range=7d|14d|30d|90d`) and custom ranges (`?from=&to=`, up to 366 days) compared with the same-length range before; KPI scores over a custom range prorate monthly targets by the days covered in each month (month views are unchanged). New dependency: `@radix-ui/react-popover`.

## Diagnostic matrices in Analisa AI (2026-10-07)

Analisa AI results now include nine deterministic 2×2 matrices (Reach × Frequency, Frequency × CTR, CPM × Cost per Result, CPM × CTR, Hook × Hold, Hook × CTR, CTR × LPV rate, CTR × Conversion rate, CTR × Cost per Result) computed by `src/lib/ad-matrices.ts` from the stored numbers, a benchmark editor (per browser, redraws without an AI run) and a per-ad verdict: the main problem is the first red quadrant along delivery → creative → click → page → result. The same brief is sent to the model as `input.matrix`. The Meta enrichment adds one `level=ad, time_increment=1` insights request per account for daily frequency, daily reach and landing page views per ad. No migration (data lives in the analysis JSON). Older analyses still render the matrices that need no daily data.

Release `20261007-06` ships the detailed order-form theme (10 presets, detailed colours, page gradient, 11 self-hosted fonts via next/font, width that the embed iframe follows, logo/banner) and the Analisa AI diagnostic matrices. No migration. Backup: `/srv/kpiads/backups/kpiads-before-matrices-20261007.dump`. Previous release: `20261007-05`.

## Lighter access (2026-10-07)

Measured from the team's network: a request through Cloudflare (routed to the HKG edge) takes about 390 ms on a warm connection and 1.0–1.2 s cold, against 44 ms / 145 ms straight to the origin (29 ms ping). Server rendering is 15–90 ms per page, so the network path dominates. Code changes: zod no longer ships to the browser except in the order-form editor (constants moved to `order-form-constants.ts`, `avatar-ids.ts`, `webmaster-constants.ts`): −90 KB gzipped on Leads, Settings, "Isi laporan" and the public order form. `experimental.staleTimes` 30 s reuses visited pages instead of refetching on every menu click, and sidebar links fetch the whole page when the pointer rests on them (`IntentLink`). With 350 ms simulated latency: cold click 415 ms, revisit within 30 s 44 ms, hover 0.4 s then click 103 ms. A view can be up to 30 s old when revisited; saving a form revalidates it. No migration. Switching the DNS record to "DNS only" would remove the Cloudflare detour (nginx already has its own certificate) at the cost of Cloudflare's proxy protection.

## Advertiser data scope and team Kie key (2026-10-07)

Campaigns and Creative (pages, CSV export, Analisa AI inputs, content analyses, creative edits, syncs) are scoped for advertisers by `src/lib/ads-visibility.ts`: items mapped to a product they own (any ad account) plus unmapped items in accounts they picked; another advertiser's products are hidden even in a shared account. Supervisors, creatives and web masters see the whole team. Integration test: `pnpm test:scope:integration`.

The Kie.ai key becomes one team key (`shared.kie.api_key`) managed by supervisors; supervisors, advertisers and creatives run analyses with it (`can.runAiAnalysis`), the daily limit stays per person. Migration `0035_shared_kie_key` (data only) copies the newest active supervisor's saved key. Rolling back the code would make the app read personal keys again.

Release `20261007-07` ships the lighter-access changes, the advertiser data scope and the team Kie key (migration `0035`). Backup: `/srv/kpiads/backups/kpiads-before-scope-kie-20261007.dump`. Previous release: `20261007-06`.

## Sales campaigns in the daily report (2026-10-07)

"Generate dari Ads", the Campaigns page, the Creative sync and the Analisa AI enrichment now count a Meta campaign's Lead by objective (`src/lib/meta-results.ts`): lead campaigns keep the lead action types; sales campaigns (`OUTCOME_SALES`, legacy `CONVERSIONS` / `MESSAGES`) count Meta's `results` field, which is what Ads Manager shows as Results (WhatsApp conversations started or purchases); awareness / engagement results (reach) never count. Verified on production data 2026-10-07: "Pesantren | Sales Wa" reported 13 chats on 6 Oct, 0 before. Breakdown rows have no `results`, so the AI enrichment requests them at campaign level and infers sales results from chats, then purchases; its daily reach is then a sum over campaigns (frequency is approximate). No migration. Reports already saved are not recalculated; regenerate a day to refresh it.

Release `20261007-08` ships the sales-results counting. No migration. Backup: `/srv/kpiads/backups/kpiads-before-sales-results-20261007.dump`. Previous release: `20261007-07`.

## LKBI registration app → Closing & Revenue (2026-10-07)

Release `20261007-09` connects the LKBI Mr.BOB registration app (`https://lkbimrbob.com/api/integrasi/v1`, read only, docs "API Integrasi LKBI Mr.BOB versi 1"). The team key (`mrbob_…`, IP-locked by the app's owner to this server) is stored encrypted as `shared.registrations.api_key`, managed by supervisors in Settings → Integrasi → Pendaftaran LKBI. `kpiads-registrations.timer` runs `src/registrations/sync.mts` every 5 minutes: `/registrations` and `/deleted-registrations` from stored cursors (`registrations.cursor`, `registrations.deleted_cursor`), upserted into `external_registrations` by the source `id`. Only name, package, status, total, payment date, info source and city are copied; no phone, email, birth date, address or transfer proof.

A registration is paid on its earliest payment that is still `verified` (approvedAt, or its update time for payments accepted before 7 Oct 2026). Products claim packages with `campaigns.registration_packages` (comma-separated text matched inside `paketProgram`, longest wins, `*` = every other package). Paid registrations from `shared.registrations.effective_from` (default 2026-10-01, WIB) become the owner's Closing (count) and Revenue (`totalPrice`) KPI entries on the WIB payment date, replacing hand-entered values for that member/day; ROAS follows. Initial mapping: HOLIDAY (Khabib, Meta) ← `HOLIDAY`; MrbobAcademia (Khabib, Meta) ← `IELTS, TOEFL`; LKBI REGULER (Ryant, Meta) ← `*`.

Migration `0036_lkbi_registrations` (new table + column). Install: copy `deploy/kpiads-registrations.{service,timer}` to `/etc/systemd/system`, `systemctl daemon-reload`, `systemctl enable --now kpiads-registrations.timer`. Tests: `pnpm test:registrations:integration`. Backup: `/srv/kpiads/backups/kpiads-before-registrations-20261007.dump`. Previous release: `20261007-08`.

Release `20261007-10`: Ryant takes only Reguler packages, Khabib takes Akademik, Holiday, TOEFL and IELTS. Mapping is now HOLIDAY ← `HOLIDAY`; MrbobAcademia ← `IELTS, TOEFL, AKADEMIK, ACADEMIC` (so "Academic English Starter" and "Paket AKADEMIK NONCAMP" move to Khabib); LKBI REGULER ← `*`. Ryant's keywords stay `*`: a keyword such as `NON-CAMP` would also claim "IELTS 1 Bulan (NON-CAMP)". Settings → Pendaftaran LKBI lists the packages a `*` product takes, so a new program counted by the catch-all is visible. `test:registrations:integration` now fails on a server that has synced real registrations (its `*` product also claims them); the unit tests in `test:orders` cover the mapping. Backup: `/srv/kpiads/backups/pre-20261007-10.dump`. Previous release: `20261007-09`.

Release `20261008-01`: Closing, Revenue and ROAS count from the start of the registration app's data (default `effective_from` 2025-01-01, paid registrations from April 2026), so earlier months such as June 2026 show them too. No Closing or Revenue had been entered by hand, so nothing is replaced. "Grammar for Speaking", "PAKET SPESIAL RAMADHAN" and "SUPER PRIVATE REGULER" are Ryant's and stay with LKBI REGULER (`*`).

Release `20261008-02`: Campaigns → Campaign Ads rows open into their ad sets (Google: ad groups) and ads, read live for the selected period when a row is opened (`getCampaignBreakdownAction`, Meta `/{campaign}/adsets`, `/ads`, `/insights?level=adset|ad`; Google GAQL on `ad_group` / `ad_group_ad`), with budget, optimisation goal, audience summary and thumbnails. "Analisa AI" per campaign (`ai_analyses.kind = 'campaign'`, filter key `<ad campaign id>:<start>:<end>`) sends the campaign, its ad sets, its top 40 ads, the previous period and the product's LKBI closings to Gemini on Kie (team key, same daily limit); about 30–60 s and 0.5 credit per run. Both use the same visibility rule as the table (`loadVisibleAdCampaign`). No migration. Tests: `pnpm test:ads`. Backup: `/srv/kpiads/backups/pre-20261008-02.dump`. Previous release: `20261008-01`.

Release `20261008-03`: the Creative role works only in the Creative page, like CSO in Leads (`RESTRICTED_HOME` in `src/lib/roles.ts`). `requireUser()` sends them back to `/creatives`, and only the Creative page, its actions, Analisa AI and Pengaturan opt in with `requireUser(true)`. Their menu shows Creative and Pengaturan, sign-in lands on `/creatives`, they have no notifications or task board (no tasks to or from a Creative-only member; a member with Creative as second role is unaffected), and the scorecard CSV export answers 403. No migration. Previous release: `20261008-02`.

Release `20261008-04`: Campaign Ads works like Meta Ads Manager: tabs Campaign → Ad set → Iklan with tick boxes, a click on a name opens the next level for that item, separate Penayangan and Budget columns, a column preset menu, and "Hanya yang aktif / tayang" on by default. Ad sets and ads come from `getAdLevelsAction` → `fetchCampaignBreakdowns`: per ad account, `/act_<id>/adsets`, `/ads` and `/insights?level=adset|ad` filtered with `campaign.id IN [...]` (50 per request, at most 100 campaigns, by spend), instead of one set of requests per campaign. Account warnings with the same cause are folded into one line. No migration. Previous release: `20261008-03`.

Release `20261008-05`: the Campaign Ads summary and table totals count the campaigns whose numbers loaded and say how many were left out, so one failing account (e.g. an expired Google token) no longer blanks them. Previous release: `20261008-04`. Release `20261008-06`: on the Iklan tab the second line names the campaign before the ad set. Release `20261008-07`: full-width search on phones.

Release `20261008-08`: public privacy policy at https://ads.lkbimrbob.com/privacy-policy (Indonesian, `?lang=en` for English), open without sign-in in `src/proxy.ts` and linked from the login page; use it as the Privacy Policy URL (and data deletion instructions) in the Meta app and the Google OAuth consent screen. The contact for data requests comes from `PRIVACY_CONTACT_EMAIL` / `PRIVACY_CONTACT_WHATSAPP` in `/srv/kpiads/shared/.env` (restart `kpiads` after changing); without them the page points to the contact on lkbimrbob.com. Keep the page in step with the integrations it describes. Previous release: `20261008-07`.

Release `20261008-09`: Creative has no KPI tracker (`UNTRACKED_ROLES` in `src/lib/member-roles.ts`, like CSO): no role slots, targets, scorecard, leaderboard or report lists, and Creative can neither hold nor be a second role. A Creative can be linked to the advertisers they work for (`creative_advertisers`, migration `0037_creative_advertisers`; Team → Edit → "Creative untuk advertiser"); `adsScopeFor` then gives them exactly those advertisers' scope (`AdsScope.ownerIds`), so "Creative Ryant" sees only Ryant's contents on Creative. An unlinked Creative still sees the whole team. Previous release: `20261008-08`. Release `20261008-10`: the Creative page's Analisa AI result shows the headline and the five key numbers on top, and the rest in tabs (Ringkasan, Per iklan with a verdict filter, Matriks, Tren, Audiens, Catatan data). Release `20261008-11`: per-ad cards in one two-column grid with the verdict on each card; no scrollbar on the tab row. Release `20261008-12`: on phones Ringkasan lists the actions before the findings.

Release `20261008-13`: Kelas Online Mr.BOB (`https://app.kelasonlinemrbob.com/api/integrasi/v1`, same API shape as LKBI) is a second registration source. Settings → Integrasi → Kelas Online holds its own team key (`kelas_…`, stored encrypted as `shared.kelas_online.api_key`), cursors (`kelas_online.*`) and effective date. `external_registrations` gains `source` ("lkbi" | "kelas", primary key `(source, id)`) and products gain `registration_source`, so a product's package keywords match only its own app (migration `0038_kelas_online_registrations`). A Kelas Online registration counts when its transfer proof is sent (`confirmed`; the app has no admin acceptance for it), for the total transferred, on that date in WIB; renewals are not counted. Packages read "ADULT · class · package" / "KIDS · class · package". Initial mapping: Kelas Online Mr.BOB (id 1, Wahib, Meta) ← `ADULT`; KIDS KO (id 104, Fadhilah) ← `KIDS`. The same `kpiads-registrations.timer` syncs both apps. Tests: `pnpm test:registrations:integration` (the Kelas Online test uses 2099 dates). Previous release: `20261008-12`.

Release `20261008-14`: Performa SEO is a dashboard: the four totals against the previous period of the same length (Search Console report now also pulls that period, countries, and the top 250 keywords and pages), a daily chart per metric with the previous period dashed, quick ranges (7/28/90/180 days), and tabs Ringkasan (chart, position bands, keyword movers), Kata kunci / Halaman (search, position filter, sort, Δ clicks and Δ position), Peluang (`src/lib/seo-insights.ts`: positions 4–20 with demand, CTR under half the usual for the position, clicks down ≥30%), Perangkat & negara, and Analisa AI (Gemini on Kie, `ai_analyses.kind = 'seo'`, filter key `<start>:<end>:<site>`, shared with whoever can see the property; same daily limit). No migration. Previous release: `20261008-13`. Release `20261008-15`: whole-number axis for clicks/impressions, no overlapping last date label, and keyword movers by rank (≥10 impressions) and new keywords, since Google hides most per-keyword clicks on small sites. Release `20261008-16`: keyword/page ties sorted by impressions.

Release `20261009-01`: Google Keyword Planner on Performa SEO through the team's Google Ads connection (`src/lib/keyword-planner.ts`, `KeywordPlanIdeaService` `generateKeywordIdeas` / `generateKeywordHistoricalMetrics`, Indonesian / Indonesia by default, cached 12 h in memory). New tab "Riset kata kunci" (ideas from seed keywords and/or the site's page: volume, 12-month trend, competition, top-of-page bid range, the site's own position or "Belum muncul", CSV), a "Volume/bln" column on Kata kunci, and the SEO AI analysis gets the volumes and content-gap ideas. It runs in the first registered Google Ads account (override `GOOGLE_KEYWORD_PLANNER_CUSTOMER_ID`). Needs Basic or Standard Google Ads API access: with Explorer access (the team's level on 2026-10-09) Google answers `DEVELOPER_TOKEN_NOT_APPROVED` and the page explains what to apply for. No migration. Previous release: `20261008-16`.

Release `20261009-02`: SEO access (`canViewSeo` in `src/lib/roles.ts`) also covers members whose second role is SEO Specialist or Web Master (e.g. Fadhilah and Thoha, Advertiser + SEO): menu, Performa SEO, Search Console websites, Keyword Planner and the SEO AI analysis. Settings → Integrasi → Google Search Console shows non-supervisors a picker like the ad-account one: Pilih / Lepas per website saved at once (`toggleSearchConsoleWebsite`), any number of websites, property kind and permission, and the teammates who picked it (a website can be shared). No migration. Previous release: `20261009-01`. Release `20261009-03`: the SEO menu section lists Performa SEO, Kata kunci & halaman, Peluang, Riset kata kunci, Analisa AI SEO and Website saya (each a `?tab=` of /seo, kept in the address when switching tabs); it is open by default for members scored on SEO and tagged "KPI kedua" when SEO is their second role. Release `20261009-03` failed on /seo (a function exported from the client dashboard was called by the server page) and was rolled back to `20261009-02`; `20261009-04` moves the tab list to `src/app/(app)/seo/seo-tabs.ts`.

Release `20261009-05`: the daily SEO report has "Ambil dari Search Console" (`seoReportFigures` in `src/lib/search-console.ts`): clicks, impressions and keywords in the top 10 on the report date, summed over the websites the member picked (supervisors: all), with Google's fresh (not yet final) data and a per-website breakdown; it fills Klik Organik, Impression Organik and Keywords in Top 10 and adds one line to the activity summary. Before Google's Pacific day reaches the report date it offers the latest date with data. The form is shorter: Search Console figures first, SEO Score and articles, one hint per field, Kendala & rencana besok folded. No migration. Previous release: `20261009-04`. Release `20261009-06`: the sum leaves out URL properties inside a picked domain property (`withoutOverlaps`), which Google already counts in the domain.


## Google OAuth branding (2026-10-09)

Release `20261009-07`: `/` is a public KPI Ads homepage with the exact app name, operator, purpose, integration descriptions, sign-in button and privacy links. The proxy allows `/` without a session; workspace pages still require login. The Indonesian and English privacy policies now describe Google Ads, Keyword Planner, Search Console and Sheets access, AI sharing, Limited Use, storage, retention, revocation and deletion. Login and the policy link back to the homepage. No migration or environment change.

Built from production `20261009-06` with only the branding files overlaid; dependency lockfile unchanged. Validation: TypeScript, 3 proxy tests, 52 KPI/auth/role tests, production build, and HTTP checks before activation. Services `kpiads` and `kpiads-wa` restarted successfully. Previous release for rollback: `/srv/kpiads/releases/20261009-06`. Domain ownership still requires Google Search Console and the matching Google Cloud project account; this release does not verify ownership or resubmit branding. The operator subsequently confirmed the public privacy contact: `PRIVACY_CONTACT_EMAIL=mrbobkampunginggris@gmail.com`, `PRIVACY_CONTACT_WHATSAPP="+62 896-8535-0650"`. These are set in the production environment; the web service was restarted and both policy languages verified. See [Google branding setup](../docs/google-brand-verification.md).


Release `20261009-08`: added public robots.txt and sitemap.xml, with exact proxy exceptions and regression coverage; robots.txt previously redirected to login. Built from production 20261009-07, overlaid only crawler changes, with 55 tests and production build passing. Pre-activation checks verified both new endpoints and existing public pages return 200 while dashboard remains login-protected. No migration or environment change. Rollback: 20261009-07. The operator applied the scoped Cloudflare Browser Integrity Check exception and purged public URLs. Follow-up public HTTPS checks passed for all five public URLs (homepage, both policy languages, robots.txt, sitemap.xml) with browser, Googlebot and previously blocked Python-urllib/3.14 user agents: HTTP 200, no login redirect, expected content present. Dashboard remains protected: browser/Googlebot redirect to login; Python-urllib is still blocked by Cloudflare on that private path, as expected for the scoped exception. Google OAuth approval remains pending a fresh verification attempt; the verifier response itself has not been observed.


## WhatsApp form message variables (2026-10-09)

Release `20261009-09`: Forms → CSO → Pesan WhatsApp supports `{{nama}}`, `{{no_hp}}`, `{{email}}`, `{{kota}}`, `{{produk}}`, `{{referensi}}` and `{{custom_fields}}` (filled customer summary). English aliases `name`, `phone`, `whatsapp`, `city`, `product`, `reference` also work. Buttons insert at the cursor/selection, respecting 500 characters; a preview uses illustrative customer data. Disabled fields have disabled buttons, unknown variables show a warning and stay literal. Blank/disabled fields resolve to empty strings.

`src/lib/order-message.ts` renders validated customer data once before WhatsApp URL encoding; submitted values are never reinterpreted as templates. Existing automatic product/customer/reference details remain appended. Existing templates are not rewritten, and idempotent retries preserve their stored URLs. No migration. Built from production `20261009-08`, overlaying only template changes. Validation: TypeScript, 5 message tests, 13 order tests, 52 KPI tests, and 2 local order integration tests (actual submission, stored URL and retry assertions); production build and pre-activation HTTP checks. Prior release: `/srv/kpiads/releases/20261009-08`. Run message coverage with `pnpm exec tsx --test src/lib/order-message.test.ts`.


## Custom form domains (2026-10-09)

Release `20261009-10`: Forms → Simpan & pasang → Custom domain adds one optional hostname per form, generated A/TXT instructions, ownership checks, activation status and disconnect. Migration `0039_order_form_domains` is additive. The root-owned `kpiads-form-domains.timer` independently verifies DNS and provisions isolated Nginx/Certbot HTTPS; the web process has no privileged command access. Custom hosts serve only their bound form and permitted public assets, with exact submission-origin validation. Original form links and embed code remain available. No example hostname was registered.

See [installation and operations](custom-domains.md). Backup: `/srv/kpiads/backups/pre-20261009-10.dump` and `.env`; previous release: `20261009-09`. Validation: TypeScript; 7 provisioner tests; 3 hostname/DNS/origin tests; 1 transactional local domain integration test; 13 order, 5 message, 3 proxy and 52 KPI tests; 2 local order integration tests; production build; generated Nginx TLS configuration syntax; authenticated editor and public HTTP checks. Live certificate issuance awaits a user-owned hostname with the generated DNS records.


## Duplicate and delete forms (2026-10-09)

Release `20261009-11` adds Duplikat and Hapus to form cards. Duplicate creates a draft with a fresh public slug, the original owner/product, and copied field, appearance, routing, message and tracking settings. CAPI configuration stays encrypted, gets a fresh version and clears test history. Lead history, routing counters, events and custom domains are not copied. The editor opens for the new draft.

Delete requires a confirmation dialog. Migration `0040_order_forms_deleted_at` adds a nullable deletion timestamp; deletion hides the form and prevents editing, duplication, new submissions and stale retries while preserving existing leads and KPI counts. Associated domains enter the existing removal queue. CAPI is disabled and pending/failed events are cancelled; sent event history remains. Owner/supervisor checks and form-row locks apply to both operations.

Validation: TypeScript, transactional local management/domain tests (ownership, copying, domain revocation, lead/KPI preservation, stale writes and CAPI cancellation), existing order/CAPI integration tests, 52 KPI tests and production build. Backup: `/srv/kpiads/backups/pre-20261009-11.dump`; previous release: `20261009-10`. The migration is additive, but old application code does not hide deleted forms: do not roll back to unpatched release 10 after deletions without retaining the deletion guards.


## Lead WhatsApp follow-up (2026-10-09)

Release `20261009-12` makes Leads a customer contact/follow-up workspace. WA 1, WA 2 and WA 3 open the customer's number with the selected product template. The new Template WA menu sits below Leads; supervisors and product owners can edit three messages per product, with variables and a preview. CSOs can read templates for products in their assigned leads. Default messages apply until customized. The message variable `{{cso}}` uses the team member opening WhatsApp.

Migration `0041_lead_whatsapp_templates` adds `lead_wa_templates` and `order_leads.wa_opened_at`. WA clicks are authorized against current lead assignment, record each step separately and append an audit event. Green buttons indicate a previous open, never delivery. Status beside WA is independently editable (including Closing and Tidak lanjut) by the assigned CSO, owner or supervisor. Clicks do not change status or revenue. Templates do not replace the public form's opening WhatsApp message.

Lead list, details and CSV omit manual payment/revenue controls and the old manual follow-up stage/schedule. Existing stored values remain intact. Revenue/ROAS and registration API integrations are unchanged. The detail shows contacts, WA buttons, status, assignment and notes, with attribution/history collapsed.

Validation: TypeScript, 2 message/navigation tests, local transactional access/template/WA/status integration coverage, 2 existing order integration tests, 52 KPI tests. Isolated local Chromium testing covered template save/reload, CSO read-only access, all three exact customer redirects/messages, inline Closing/Tidak lanjut persistence, simplified detail and screenshots; WhatsApp requests were intercepted and no messages sent. Backup: `/srv/kpiads/backups/pre-20261009-12.dump`; previous release: `20261009-11`. Additive schema remains compatible with previous code.


## Five-step WhatsApp and compact leads (2026-10-09)

Release `20261009-13` extends follow-up to WA 1–5 across the list, detail, per-product template editor, authorized actions, click history and CSV. Existing saved WA 1–3 text is preserved; missing WA 4–5 use editable defaults without rewriting stored templates. Saving requires all five valid messages. No migration or environment changes.

The lead table uses 48px desktop rows, a two-line customer cell, smaller WA/status controls, narrower columns, alternating row stripes and a distinct selection highlight. Coarse-pointer controls remain at least 32px high. Filter, summary and table toolbar spacing is reduced.

Validation: TypeScript; message/navigation tests; transactional integration coverage for legacy three-message sets and five distinct click records; local Chromium checks for template save/reload, exact WA 1–5 customer redirects, status persistence, four measured 48px alternating rows and screenshots. WhatsApp navigation was intercepted; no messages were sent. Production build and 52 KPI tests passed. Previous release: `20261009-12`.


## Delete leads (2026-10-09)

Release `20261009-14` adds a compact Hapus action per lead for its advertiser owner and supervisors. The confirmation names the customer and explains permanent deletion of the lead and follow-up history. CSOs cannot delete; server-side ownership checks apply independently of the UI. Form/config/campaign locks serialize deletion with submissions and CAPI delivery. Existing foreign keys remove lead events and CAPI outbox records; form settings and templates remain. Ads lead deletion recalculates form-derived report/KPI counts, including zero; imported reports and external API revenue are unchanged.

No migration or environment change. Validation: TypeScript; transactional local integration coverage for ownership, repeat/stale operations, history/outbox cleanup, preserved form configuration and KPI zeroing; isolated local Chromium checks for cancel, confirm, table refresh and CSO visibility; 52 KPI tests and production build. Browser tests used disposable local fixtures. Previous release: `20261009-13`. Rolling back code does not restore deleted leads.
