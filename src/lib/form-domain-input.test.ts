import assert from "node:assert/strict";
import test from "node:test";
import { formDomainDnsError, formDomainTxt, normalizeFormDomain, sameRequestOrigin } from "./form-domain-input";

test("custom hostnames normalize and reject URLs, ports, IPs, local hosts and config injection", () => {
  assert.equal(normalizeFormDomain(" Daftar.KelasOnlineMrBob.com ", "ads.lkbimrbob.com"), "daftar.kelasonlinemrbob.com");
  assert.equal(normalizeFormDomain("my-domain.id", "ads.lkbimrbob.com"), "my-domain.id");
  for (const input of ["ads.lkbimrbob.com", "https://daftar.foo.com", "foo.com/path", "foo.com:443", "*.foo.com", "localhost", "127.0.0.1", "[::1]", "foo.local", "foo.internal", "x..com", "-x.com", "x-.com", "foo.com;return 200;", "foo.com\nserver {}", "a".repeat(64) + ".com", "foo.com.", "x@foo.com"]) {
    assert.throws(() => normalizeFormDomain(input, "ads.lkbimrbob.com"), Error, input);
  }
});

test("DNS requires exact ownership token, all A records pointing to VPS, and no AAAA", () => {
  const ip = "69.161.221.215", token = "a".repeat(48);
  assert.equal(formDomainDnsError([ip], [], [[formDomainTxt(token)]], ip, token), null);
  assert.equal(formDomainDnsError([ip], [], [["kpiads-verification=", token]], ip, token), null);
  assert.match(formDomainDnsError([ip], [], [[formDomainTxt("b".repeat(48))]], ip, token)!, /TXT/);
  for (const addresses of [[], ["1.2.3.4"], [ip, "1.2.3.4"]]) {
    assert.match(formDomainDnsError(addresses, [], [[formDomainTxt(token)]], ip, token)!, /record A/i);
  }
  assert.match(formDomainDnsError([ip], ["::1"], [[formDomainTxt(token)]], ip, token)!, /AAAA/);
});

test("POST origin must match the request host exactly, including scheme syntax and port", () => {
  assert.equal(sameRequestOrigin("https://daftar.foo.com", "daftar.foo.com"), true);
  assert.equal(sameRequestOrigin("http://localhost:3000", "localhost:3000"), true);
  for (const origin of [null, "null", "https://attacker.com", "https://daftar.foo.com/path", "https://daftar.foo.com/", "https://daftar.foo.com:444", "https://user@daftar.foo.com", "https://daftar.foo.com@attacker.com", "ftp://daftar.foo.com"]) {
    assert.equal(sameRequestOrigin(origin, "daftar.foo.com"), false, String(origin));
  }
  assert.equal(sameRequestOrigin("https://daftar.foo.com", null), false);
});
