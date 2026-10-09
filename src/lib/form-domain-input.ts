export const FORM_DOMAIN_STATUS: Record<string, string> = {
  pending_dns: "Menunggu DNS", pending_tls: "Menyiapkan HTTPS", active: "Aktif",
  error: "Perlu diperiksa", removing: "Sedang dilepas",
};

export function normalizeFormDomain(input: string, appHostname: string) {
  const hostname = input.trim().toLowerCase();
  if (hostname.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
    || /\.(?:localhost|local|internal|test|invalid|example)$/.test(hostname)) {
    throw new Error("Isi domain/subdomain saja, tanpa https://, port, atau path. Contoh: daftar.kelasonlinemrbob.com.");
  }
  if (hostname === appHostname.toLowerCase()) throw new Error("Domain utama KPI Ads tidak dapat dipakai sebagai custom domain form.");
  return hostname;
}

export function formDomainTxt(token: string) { return `kpiads-verification=${token}`; }

export function formDomainDnsError(addresses: string[], ipv6: string[], records: string[][], targetIp: string, token: string) {
  if (!records.some(parts => parts.join("") === formDomainTxt(token))) return "Record TXT verifikasi belum cocok. Salin nilai TXT persis seperti petunjuk.";
  if (addresses.length === 0 || addresses.some(ip => ip !== targetIp) || ipv6.length > 0) return "Record A belum mengarah hanya ke IP VPS. Gunakan DNS only (awan abu-abu), dan hapus record AAAA pada hostname ini selama aktivasi.";
  return null;
}

export function sameRequestOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try { const url = new URL(origin); return url.origin === origin && url.host === host.toLowerCase() && ["http:", "https:"].includes(url.protocol); }
  catch { return false; }
}
