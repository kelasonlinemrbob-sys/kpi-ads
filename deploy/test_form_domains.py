import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('domains', Path(__file__).with_name('form-domains.py'))
domains = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domains)


class DomainProvisionerTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(id=123, hostname='daftar.example.com', slug='a' * 24,
                        verification_token='b' * 48, status='pending_dns', attempt_age=None)
        self.settings = dict(app_hostname='ads.lkbimrbob.com', target_ip='69.161.221.215')

    def test_untrusted_rows_cannot_inject_nginx_or_commands(self):
        self.assertTrue(domains.valid_row(self.row, self.settings['app_hostname']))
        for field, value in [('id', '../foo'), ('hostname', 'x.com; return 200;'),
                             ('hostname', '*.example.com'), ('slug', 'a; malicious'),
                             ('verification_token', '\n')]:
            self.assertFalse(domains.valid_row({**self.row, field: value}, self.settings['app_hostname']))

    def test_vhost_has_exact_form_routes_no_dashboard_or_generic_api(self):
        config = domains.nginx_config(self.row, tls=True)
        self.assertIn('proxy_pass http://127.0.0.1:3000/f/' + 'a' * 24 + '$is_args$args', config)
        self.assertIn('location = /api/order-forms/' + 'a' * 24, config)
        self.assertIn('limit_except GET { deny all; }', config)
        self.assertIn('location / { return 404; }', config)
        self.assertNotIn('location /api/', config)
        self.assertNotIn('/dashboard', config)
        self.assertNotIn('ssl_certificate', domains.nginx_config(self.row))

    def test_failed_nginx_validation_restores_previous_config(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'domain.conf'
            path.write_text('previous valid config')
            with patch.object(domains, 'command', side_effect=[RuntimeError('invalid'), '', '']) as command:
                with self.assertRaises(RuntimeError): domains.install_config(path, 'bad config')
                self.assertEqual(path.read_text(), 'previous valid config')
                self.assertEqual(command.call_args_list[-1].args[0], ['systemctl', 'reload', 'nginx'])

    def test_dns_failure_never_calls_certbot(self):
        with patch.object(domains, 'dns_error', return_value='TXT missing'), patch.object(domains, 'state') as state, patch.object(domains, 'command') as command:
            domains.process(self.row, self.settings)
            state.assert_called_once_with(self.row, 'pending_dns', 'TXT missing')
            command.assert_not_called()

    def test_success_requires_dns_and_certbot_before_active(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory, patch.object(domains, 'NGINX', Path(directory)), patch.object(domains, 'dns_error', return_value=None), patch.object(domains, 'sql', return_value='pending_tls'), patch.object(domains, 'state', side_effect=lambda *a, **kw: calls.append(('state', a[1]))), patch.object(domains, 'install_config', side_effect=lambda *a: calls.append(('config', 'ssl_certificate' in a[1]))), patch.object(domains, 'command', side_effect=lambda args, **kw: calls.append(('command', args[0])) or ''):
            domains.process(self.row, self.settings)
        self.assertLess(calls.index(('command', 'certbot')), calls.index(('state', 'active')))
        self.assertLess(calls.index(('config', True)), calls.index(('state', 'active')))

    def test_disconnect_wins_during_certificate_issuance(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(domains, 'NGINX', Path(directory)), patch.object(domains, 'dns_error', return_value=None), patch.object(domains, 'sql', side_effect=['pending_tls', 'removing']), patch.object(domains, 'state') as state, patch.object(domains, 'install_config') as install, patch.object(domains, 'command', return_value=''):
            domains.process(self.row, self.settings)
            self.assertEqual(install.call_count, 1)
            self.assertFalse(any(call.args[1] == 'active' for call in state.call_args_list))

    def test_removal_keeps_db_row_when_nginx_cleanup_fails(self):
        with patch.object(domains, 'install_config', side_effect=RuntimeError('reload failed')), patch.object(domains, 'sql') as sql:
            with self.assertRaises(RuntimeError): domains.process({**self.row, 'status': 'removing'}, self.settings)
            sql.assert_not_called()


if __name__ == '__main__': unittest.main()
