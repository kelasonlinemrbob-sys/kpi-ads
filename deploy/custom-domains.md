# Custom form domains

Forms → Simpan & pasang → Custom domain supports one hostname per saved form.
Saving a hostname creates a random TXT ownership token. The user adds the shown
A and TXT records at their DNS provider, using DNS only and no AAAA while
activating. The original `/f/<slug>` link remains available. No example domain
is registered automatically.

Migration `0039_order_form_domains` adds the mapping and activation state.
Set `FORM_DOMAIN_TARGET_IP=69.161.221.215` in the shared environment and restart
the web service only after the provisioner is installed.

## Provisioner installation

- Install `form-domains.py` as root-owned, mode 755,
  `/usr/local/libexec/kpiads-form-domains.py`. Never execute an app-writable
  release script as root from systemd.
- Install `kpiads-form-domains.service` and `.timer` in `/etc/systemd/system/`.
- Install `kpiads-form-proxy.conf` in `/etc/nginx/snippets/`.
- Install `00-kpiads-form-log.conf` in `/etc/nginx/conf.d/` before generated vhosts.
- Create `/etc/nginx/snippets/kpiads-form-realip.conf` from the main site's
  trusted Cloudflare `set_real_ip_from` and `real_ip_header` directives. Never
  trust arbitrary incoming forwarded IP headers.
- Create root-owned `/etc/kpiads-form-domains.json`, mode 600:
  `{"app_hostname":"ads.lkbimrbob.com","target_ip":"69.161.221.215"}`.
- Require `python3`, `dig`, `nginx`, `certbot`, local PostgreSQL peer access for
  postgres, the existing registered ACME account, and writable challenge root
  `/var/www/kpiads/.well-known/acme-challenge/`. Ports 80/443 must be reachable.
- Keep the certbot deployment hook that validates and reloads nginx on renewal.
- Run `nginx -t`, reload nginx, then `systemctl daemon-reload` and
  `systemctl enable --now kpiads-form-domains.timer`.

The timer checks at most three queued domains per run, every minute after the
previous run completes. DNS ownership and addresses are independently checked
by the root provisioner. It installs an HTTP challenge vhost, obtains a
certificate using the existing ACME account, and enables an isolated HTTPS
vhost only after success. Failed certificate requests retry at most hourly.
Domain names and form slugs are validated before configuration generation.
The web process cannot execute privileged commands.

HTTPS domains expose their own form, submission endpoint, static assets and
privacy policy; other application routes return 404. Submission origins must
match an active domain bound to that form. Disconnect revokes form access
immediately and queues nginx cleanup. Certificate files are retained; an
administrator can remove unused certbot lineages after checking references.

## Checks and rollback

Use `systemctl status kpiads-form-domains.timer`,
`journalctl -u kpiads-form-domains.service`, and `nginx -t`.
Unit tests: `python3 -m unittest discover -s deploy -p 'test_form_domains.py'` and
`pnpm exec tsx --test src/lib/form-domain-input.test.ts`.
Run `form-domains.integration.test.ts` only with the local/test database; its
fixtures are rolled back. Real ACME activation requires a user-owned hostname
with the generated DNS records.

Before migration, back up the production database and environment. The new
table is additive and compatible with the previous application release.
For a full rollback, stop/disable the domain timer, remove only its generated
`kpiads-form-<id>.conf` vhosts, validate/reload nginx, and restore the previous
release symlink. Retain the table and certificate data for recovery.
