# KPI Ads — Dashboard KPI Tim Advertiser

Aplikasi untuk memonitor dan mengontrol KPI tim advertiser, web master dan SEO.
Stack: **Next.js 16 (App Router) · Postgres · Drizzle ORM · Tailwind v4 · komponen shadcn/ui (Radix)**.

## Role & akses

| Fitur | Supervisor | Advertiser | Web Master | SEO Specialist |
|---|:-:|:-:|:-:|:-:|
| Dashboard tim (skor KPI semua anggota, tren, update terbaru) | ✅ | — | — | — |
| Dashboard pribadi (skor KPI, breakdown, tugas) | — | ✅ | ✅ | ✅ |
| Submit daily report (angka KPI + ringkasan) | — | ✅ | ✅ | ✅ |
| Review & approve report (satuan / bulk) | ✅ | — | — | — |
| Campaigns | kelola semua | kelola milik sendiri | lihat saja | — |
| Tasks (kanban) | semua tugas | tugas sendiri | tugas sendiri | tugas sendiri |
| Team: tambah anggota, ganti role, nonaktifkan | ✅ | — | — | — |
| KPI Targets: bobot, target default, target per orang per bulan | ✅ | — | — | — |
| KPI Scorecard, Leaderboard, KPI Guide, export CSV | ✅ (semua) | ✅ (diri sendiri) | ✅ | ✅ |

## KPI bawaan (bisa diubah di halaman **KPI Targets**)

- **Advertiser**: Ad Spend (tracked), Leads, Closing, Revenue, ROAS = Revenue ÷ Ad Spend, CPL = Ad Spend ÷ Leads (lebih rendah lebih baik)
- **Web Master**: Landing Pages Delivered, Issues Resolved, PageSpeed Score (rata-rata), Uptime %
- **SEO Specialist**: Articles Published, Backlinks Built, Keywords in Top 10 (nilai terakhir), Organic Sessions

**Skor KPI** = rata-rata berbobot dari pencapaian tiap KPI (aktual ÷ target, maksimal 120%).
Target bulanan yang berupa total diprorata sesuai hari yang sudah berjalan. 100 = tepat target.
Status: ≥100 Exceeding · 80–99 On Track · 60–79 At Risk · <60 Off Track.

## Menjalankan secara lokal

Butuh Node.js 20+ dan pnpm, serta Postgres (lokal, Docker, atau hosted seperti Neon/Supabase).

```bash
pnpm install
cp .env.example .env            # isi DATABASE_URL dan AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # opsional: Postgres lokal di port 5432
pnpm db:migrate                 # buat tabel (migrasi ada di ./drizzle)
pnpm db:seed                    # data demo: 9 user, ±2 bulan laporan (MENGHAPUS data yang ada)
pnpm dev
```

Buka http://localhost:3000. Semua akun demo memakai password `password123`:

| Role | Email |
|---|---|
| Supervisor | supervisor@kpi.local |
| Advertiser | rizky@kpi.local, dewi@kpi.local, bima@kpi.local, salsa@kpi.local |
| Web Master | fajar@kpi.local, intan@kpi.local |
| SEO Specialist | nadia@kpi.local, yoga@kpi.local |

Untuk produksi: jangan jalankan `db:seed`. Buat akun supervisor pertama lalu tambahkan anggota lain dari halaman **Team**:

```bash
pnpm db:migrate
pnpm db:create-supervisor "Nama Lengkap" email@perusahaan.com "password-minimal-8"
```

## Struktur

```
src/
  app/(app)/        halaman setelah login: dashboard, reports, campaigns, tasks, team, targets,
                    scorecard, leaderboard, guide, settings
  app/login/        halaman login
  app/api/export/   export CSV scorecard
  actions/          server actions (auth, reports, campaigns, tasks, team, settings)
  components/       ui/ (shadcn), shell/ (sidebar, header, ⌘K), dashboard/ (panel, chart, feed, tabel)
  db/               schema Drizzle, koneksi, seed
  lib/kpi.ts        logika perhitungan KPI (agregasi, prorata, skor, status)
  proxy.ts          redirect ke /login bila belum ada sesi (pengganti middleware di Next 16)
```

## Catatan

- Zona waktu "hari ini" dan bulan KPI mengikuti `APP_TIMEZONE` (default `Asia/Jakarta`).
- Laporan bisa diisi mundur maksimal 7 hari dan bisa diedit sampai di-approve supervisor.
- Hari kerja dihitung Senin–Sabtu (dipakai untuk "Reports x/y").
- Bobot KPI dan target default berlaku untuk semua bulan (skor bulan lalu dihitung ulang memakai bobot terbaru);
  target per anggota disimpan per bulan.
