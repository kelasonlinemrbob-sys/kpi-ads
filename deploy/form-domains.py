#!/usr/bin/env python3
"""Install as a root-owned /usr/local/libexec/kpiads-form-domains.py.

Only validated DNS owners get a form-only vhost. Never run app-writable JS or
shell input as root. Certbot uses the server's existing ACME account.
"""
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import subprocess

CONFIG = Path('/etc/kpiads-form-domains.json')
NGINX = Path('/etc/nginx/conf.d')
WEBROOT = '/var/www/kpiads'
HOST = re.compile(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\Z')


def command(args, timeout=30):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout).stdout


def sql(query):
    return command(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', 'kpiads', '-c', query])


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def valid_row(row, main_host):
    return (type(row.get('id')) is int and row['id'] > 0
            and isinstance(row.get('hostname'), str) and len(row['hostname']) <= 253
            and bool(HOST.fullmatch(row['hostname'])) and row['hostname'] != main_host
            and not row['hostname'].endswith(('.local', '.localhost', '.internal', '.test', '.invalid', '.example'))
            and bool(re.fullmatch(r'[a-f0-9]{48}', row.get('verification_token', '')))
            and bool(re.fullmatch(r'[a-f0-9]{24}', row.get('slug', ''))))


def where(row):
    return f"id={row['id']} AND hostname={literal(row['hostname'])} AND verification_token={literal(row['verification_token'])}"


def state(row, status, error=None, attempt=False):
    extra = ', tls_attempt_at=now()' if attempt else ''
    if status == 'active': extra += ', activated_at=now()'
    sql(f"UPDATE order_form_domains SET status={literal(status)}, error={'NULL' if error is None else literal(error)}, checked_at=now(), updated_at=now(){extra} WHERE {where(row)} AND status <> 'removing'")


def dns_error(row, target_ip):
    hostname = row['hostname']
    txt = command(['dig', '+short', '+time=3', '+tries=1', 'TXT', '_kpiads.' + hostname])
    if 'kpiads-verification=' + row['verification_token'] not in [''.join(shlex.split(line)) for line in txt.splitlines()]:
        return 'Record TXT verifikasi belum cocok. Periksa nama dan nilai record DNS.'
    def addresses(kind):
        result = []
        for line in command(['dig', '+short', '+time=3', '+tries=1', kind, hostname]).splitlines():
            try: result.append(str(ipaddress.ip_address(line.strip())))
            except ValueError: pass  # CNAME lines are followed by their resolved address.
        return result
    ipv4, ipv6 = addresses('A'), addresses('AAAA')
    if not ipv4 or any(ip != target_ip for ip in ipv4) or ipv6:
        return 'Arahkan record A hanya ke IP VPS, gunakan DNS only, dan hapus AAAA pada hostname ini selama aktivasi.'
    return None


def nginx_config(row, tls=False):
    hostname, slug, row_id = row['hostname'], row['slug'], row['id']
    challenge = f'location ^~ /.well-known/acme-challenge/ {{ root {WEBROOT}; default_type text/plain; }}'
    plain = f'''server {{
    listen 80;
    listen [::]:80;
    server_name {hostname};
    server_tokens off;
    {challenge}
    location / {{ {'return 308 https://' + hostname + '$request_uri;' if tls else 'return 404;'} }}
}}
'''
    if not tls: return plain
    proxy = 'include /etc/nginx/snippets/kpiads-form-proxy.conf;'
    return plain + f'''server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {hostname};
    server_tokens off;
    ssl_certificate /etc/letsencrypt/live/kpiads-form-{row_id}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kpiads-form-{row_id}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 16k;
    access_log /var/log/nginx/kpiads-form-access.log kpiads_form_safe;
    include /etc/nginx/snippets/kpiads-form-realip.conf;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    {challenge}
    location = / {{ limit_except GET {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000/f/{slug}$is_args$args; }}
    location = /f/{slug} {{ limit_except GET {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000; }}
    location = /api/order-forms/{slug} {{ limit_except POST {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000; }}
    location ^~ /_next/static/ {{ limit_except GET {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000; }}
    location = /favicon.ico {{ limit_except GET {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000; }}
    location = /privacy-policy {{ limit_except GET {{ deny all; }} {proxy} proxy_pass http://127.0.0.1:3000; }}
    location = /robots.txt {{ default_type text/plain; return 200 "User-agent: *\\nDisallow: /\\n"; }}
    location / {{ return 404; }}
}}
'''


def install_config(path, content):
    previous = path.read_text() if path.exists() else None
    try:
        if content is None: path.unlink(missing_ok=True)
        else:
            temp = path.with_suffix('.tmp')
            temp.write_text(content)
            os.chmod(temp, 0o644)
            temp.replace(path)
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
    except Exception:
        if previous is None: path.unlink(missing_ok=True)
        else: path.write_text(previous)
        # If reload itself failed, restore the last known valid on-disk config too.
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
        raise


def process(row, settings):
    if not valid_row(row, settings['app_hostname']):
        print('Ignored invalid domain row', row.get('id'))
        return
    path = NGINX / f"kpiads-form-{row['id']}.conf"
    if row['status'] == 'removing':
        install_config(path, None)
        # Keep the certificate files until an administrator cleans them up. They
        # contain no form data and retaining them makes interrupted cleanup safe.
        sql(f"DELETE FROM order_form_domains WHERE {where(row)} AND status='removing'")
        print('Removed domain', row['id'])
        return
    if row['status'] == 'active': return
    if row['status'] not in ('pending_dns', 'pending_tls', 'error'): return
    try:
        error = dns_error(row, settings['target_ip'])
        if error:
            state(row, 'pending_dns', error)
            return
        if row.get('attempt_age') is not None and row['attempt_age'] < 3600:
            sql(f"UPDATE order_form_domains SET checked_at=now() WHERE {where(row)} AND status <> 'removing'")
            return  # Failed ACME issuance is retried at most once an hour.
        # Never override a vhost managed outside this provisioner.
        all_config = command(['nginx', '-T'])
        own_config = path.read_text() if path.exists() else ''
        other_config = all_config.replace(own_config, '') if own_config else all_config
        names = re.findall(r'(?m)^\s*server_name\s+([^;]+);', other_config)
        if any(row['hostname'] in names_line.split() for names_line in names):
            state(row, 'error', 'Domain sudah dipakai konfigurasi website lain di VPS. Pilih hostname lain.')
            return
        state(row, 'pending_tls', attempt=True)
        # Disconnects win even if they arrive while DNS is being checked.
        if sql(f"SELECT status FROM order_form_domains WHERE {where(row)}").strip() != 'pending_tls': return
        install_config(path, nginx_config(row))
        command(['certbot', 'certonly', '--webroot', '-w', WEBROOT, '--cert-name', f"kpiads-form-{row['id']}", '-d', row['hostname'], '--non-interactive', '--keep-until-expiring'], timeout=150)
        if sql(f"SELECT status FROM order_form_domains WHERE {where(row)}").strip() == 'removing': return
        install_config(path, nginx_config(row, tls=True))
        state(row, 'active')
        print('Activated domain', row['id'])
    except Exception as error:
        state(row, 'error', 'Aktivasi HTTPS belum berhasil. Periksa DNS, CAA, serta akses port 80/443. Sistem mencoba kembali paling cepat satu jam; hubungi administrator bila berulang.')
        print('Provisioning failed for domain', row['id'], type(error).__name__)


def main():
    with open('/run/lock/kpiads-form-domains.lock', 'w') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return
        settings = json.loads(CONFIG.read_text())
        ipaddress.IPv4Address(settings['target_ip'])
        rows = sql("SELECT COALESCE(json_agg(t),'[]') FROM (SELECT d.*, f.slug, EXTRACT(EPOCH FROM now()-d.tls_attempt_at) AS attempt_age FROM order_form_domains d JOIN order_forms f ON f.id=d.form_id WHERE d.status <> 'active' ORDER BY (d.status='removing') DESC, d.checked_at NULLS FIRST LIMIT 3) t")
        for row in json.loads(rows): process(row, settings)


if __name__ == '__main__': main()
