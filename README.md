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
| Tasks (kanban) | semua tugas, filter per role | tugas sendiri (+ tim junior untuk Senior) | tugas sendiri | tugas sendiri |
| Team: tambah anggota, ganti role, nonaktifkan | ✅ | — | — | — |
| KPI Targets: bobot, target default, target per orang per bulan | ✅ | — | — | — |
| KPI Scorecard, Leaderboard, KPI Guide, export CSV | ✅ (semua) | ✅ (diri sendiri) | ✅ | ✅ |
| Penilaian Kinerja (khusus Advertiser Senior) | isi & finalisasi | lihat milik sendiri (Senior, setelah final) | — | — |

Advertiser punya dua level, **Junior** dan **Senior**, diatur di **Team → Members** (edit anggota → Level advertiser).
Semua fitur advertiser sama; bedanya hanya Senior yang ikut **Penilaian Kinerja**.

## Tasks per role

Aturan di `src/lib/task-rules.ts`, dipakai server (validasi) dan UI (pilihan yang ditawarkan):

| Pemberi tugas | Boleh memberi tugas ke |
|---|---|
| Supervisor | semua anggota |
| Advertiser Senior | diri sendiri, Advertiser Junior (mentoring), Web Master, SEO |
| Advertiser Junior | diri sendiri, Web Master, SEO (mis. request landing page) |
| Web Master / SEO | diri sendiri, Web Master, SEO |

- **Kategori** mengikuti role penerima (Advertiser: setup/optimasi campaign, brief creative, laporan, budget, dan
  *Mentoring* khusus Senior; Web Master: landing page, revisi LP, tracking & pixel, bug, speed; SEO: artikel, backlink,
  riset keyword, on-page, laporan). Beberapa kategori mengisi checklist bawaan di deskripsi.
- **Alur review**: penerima tugas dari orang lain hanya bisa memindahkan sampai *In Review*; pemberi tugas (atau
  supervisor) yang **Setujui** (Done) atau **Minta revisi**. Tugas untuk diri sendiri bisa langsung Done.
- Scope board: *Menunggu review saya*, *Tim advertiser junior* (Senior), filter role (Supervisor) dan filter kategori.
  Badge menu Tasks = tugas terbuka + tugas yang menunggu persetujuanmu.

## Creative (konten iklan Meta)

Role **Creative** (tambah di Team → Members) punya KPI sendiri (Konten Diproduksi, Konten Tayang, Konten Winning) dan menu
**Creative** (juga terlihat oleh supervisor dan advertiser). Klik **Sinkron dari Meta** untuk mengambil semua iklan dari
akun Meta yang terdaftar, dengan kolom seperti spreadsheet tim:

| Kolom | Sumber |
|---|---|
| Advertiser, Produk | kode product di nama campaign (sama seperti Generate dari Ads) |
| Link konten | post iklan (`effective_object_story_id` → facebook.com/{page}/posts/{post}) |
| Tipe iklan | objective campaign (konversi, traffic, leads, …) |
| Keterangan | diisi tim: Winning / Good / Average / Kurang |
| Status | status iklan di Meta: Active / Paused / Review / Takedown (ditolak, dihapus, diarsipkan) |
| Format konten | dari Meta (Video / Grafis / Carousel), bisa diubah manual |
| Creator, Editor | dipilih dari anggota tim (role Creative di urutan atas) |
| Impression, Avg play time, ThruPlays | insights Meta lifetime |

Isian tim tidak tertimpa saat sinkron. Ada filter (advertiser, produk, status, format, keterangan, creator, "Konten saya"),
pencarian, urutan, dan **Export CSV** dengan urutan kolom yang sama. Data contoh: `pnpm db:seed-ads-demo`.
Semua anggota bisa memberi tugas ke Creative (kategori Video iklan, Desain grafis/carousel, Revisi konten, Script).

## Pengaturan

Halaman **Pengaturan** dibagi per tab: *Profil* (nama, jabatan, role & info akun), *Keamanan* (ganti password dengan
indikator kekuatan; setelah diganti semua perangkat lain otomatis keluar, plus tombol *Keluarkan perangkat lain*),
*Tampilan* (Terang / Gelap / Ikuti sistem), *Integrasi* (WhatsApp laporan untuk advertiser, koneksi Meta Ads) dan
*Aturan Laporan* (supervisor): jam batas laporan advertiser (default 15.30 WIB) dan batas isi/edit mundur (default 7 hari),
yang langsung dipakai di form laporan, dashboard, validasi dan teks aplikasi. Reset password oleh supervisor di Team juga
mengeluarkan sesi anggota tersebut.

## Role rangkap (1 orang 2 role)

Di **Team → Members → Edit**, pilih **Role kedua** (mis. Advertiser + SEO Specialist) dan atur **porsi skor**
(default 60% role utama / 40% role kedua). Advertiser harus menjadi role utama bila digabung, karena fitur iklan
(campaign, Generate dari Ads, WhatsApp) mengikuti role utama.

- **Skor KPI total** = porsi × skor tiap role (mis. 60% × skor Advertiser + 40% × skor SEO). Skor tiap role dihitung
  dari KPI role itu saja.
- **Target**: target default yang berupa total bulanan diprorata sesuai porsi (Leads 900 → 540 pada porsi 60%);
  rata-rata/rasio/posisi (CPL, PageSpeed, Keywords Top 10) tidak. Target khusus per orang di KPI Targets berlaku apa
  adanya (anggota rangkap juga muncul di tab role keduanya).
- **Laporan harian**: satu laporan per hari dengan tab per role (*Laporan Iklan* dan *Laporan SEO Specialist*); tiap tab
  hanya mengganti angka KPI role-nya. Bagian non-advertiser tetap direview supervisor; hari lapor Senin–Sabtu.
- **Scorecard**: tab *Gabungan* / per role, breakdown per role dengan poin yang dijumlah menjadi skor total.
  **Leaderboard** per role memakai skor role itu saja (adil dibanding anggota yang 100% di role tersebut);
  *All roles* memakai skor total. Tasks menerima tugas & kategori dari kedua role.

## Penilaian Kinerja Advertiser Senior

Menerapkan dokumen HRGA *Rancangan Skema Sistem Penilaian Kinerja — Advertiser Senior* (SG/ADV-SR/HRGA/2026),
template-nya di `src/lib/appraisal.ts`. Supervisor membuat penilaian per karyawan per periode di menu
**Penilaian Kinerja**, mengisi, menyimpan draft, lalu **Finalisasi** (baru terlihat oleh karyawan; bisa dibuka kembali).
Tombol **Cetak** menghasilkan borang siap tanda tangan.

1. **Borang Pencairan Tunjangan Skill & Responsibility** — 6 aspek (bobot 20/20/15/15/15/15), masing-masing 5 indikator
   diberi skor 1–5. Skor aspek = rata-rata indikatornya; *Skor x Bobot* = rata-rata × bobot%; total = jumlahnya (skala 1–5),
   dibulatkan ke Skala Penilaian (5 Sangat Baik … 1 Sangat Kurang).
2. **Borang KPI Performance** — 4 KPI @25%: Jumlah Lead (real ÷ target), Efisiensi CPL (target ÷ real), Kualitas Lead &
   Conversation (rasio lead qualified real ÷ target) dan Improvement & Efisiensi Budget (skor % diisi penilai); tiap skor
   maksimal 100%. Total menentukan tier: ≥95 Istimewa, 85–94 Sangat Baik, 75–84 Baik, 60–74 Cukup, <60 Kurang.
   *Real* Jumlah Lead dan CPL terisi otomatis dari laporan harian (periode sehari penuh) pada rentang penilaian.

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
- Laporan advertiser memakai satu form: pilih periode **kemarin** atau **hari ini**, lalu kirim. Menyimpan satu periode tidak
  menimpa periode lain. **Laporan Senin** punya 4 periode: Jumat, Sabtu, Minggu (sehari penuh) dan Senin (s/d 15.30).
  KPI (Ad Spend, Leads) dihitung dari semua periode sehari penuh.
- **Generate dari Ads**: laporan tetap per product, datanya ditarik per akun iklan.
  1. Di halaman **Campaigns → Akun iklan**, daftarkan akun Meta (ID tanpa `act_`) atau Google Ads (customer ID).
  2. Di tiap campaign/product, pilih akun iklannya dan isi **kode product**, mis. `SERUM`.
  3. Nama campaign di Ads Manager / Google Ads harus mengandung kode itu, mis. `[SERUM] Retargeting 30D`.
  Saat advertiser klik *Generate dari Ads*, semua campaign di akun dijumlahkan per product (kode terpanjang menang bila
  lebih dari satu cocok). Campaign ber-spend tanpa kode ditampilkan sebagai *belum terpetakan*. Token Meta diisi supervisor
  di **Settings → Koneksi Meta Ads** (lihat di bawah); kredensial `GOOGLE_ADS_*` diset di `.env` (lihat `.env.example`). Tanggal mengikuti zona waktu akun iklan; untuk "hari ini"
  angkanya adalah data sampai saat tombol diklik.
- **Koneksi Meta Ads** (Settings, supervisor): tempel access token lalu *Simpan & tes*. Token divalidasi ke Meta
  (pemilik, izin `ads_read`, masa berlaku), disimpan terenkripsi (kunci dari `AUTH_SECRET`), dan daftar akun iklan yang
  bisa dibaca token langsung tampil dengan tombol *Tambahkan*. Panduan langkah demi langkah ada di kartu itu.
  Agar tidak kedaluwarsa, pakai token **System User** (Pengaturan bisnis → Pengguna sistem → assign akun iklan +
  aplikasi → Buat token, masa berlaku *Tidak pernah*, izin `ads_read`). Token user dari Graph API Explorer (1–2 jam)
  otomatis ditukar menjadi token ±60 hari bila App ID + App Secret diisi. Aplikasi memperingatkan 14 hari sebelum token
  kedaluwarsa. `META_ACCESS_TOKEN` di `.env` tetap dipakai sebagai cadangan. Mengganti `AUTH_SECRET` berarti token
  harus ditempel ulang.
- Saat akun Meta ditambahkan, aplikasi mengecek bahwa token bisa membaca akun itu (ID salah / belum di-assign ke
  System User langsung ditolak dengan pesan yang jelas).
- Rincian per campaign dari hasil generate ikut disimpan saat laporan dikirim (`advertiser_report_item_campaigns`) dan
  bisa dibuka di halaman detail laporan dengan klik baris product. Kalau angka product diubah manual, rinciannya
  tidak disimpan karena sudah tidak cocok dengan totalnya.
- **Campaigns** punya dua tab. *Campaign Ads* berisi campaign asli dari akun Meta/Google (tombol **Sinkron dari Ads**:
  nama, status, budget harian, jadwal; campaign yang dihapus di platform ditandai Ended). Tiap campaign dicocokkan ke
  product lewat kode product, dan spend/lead/CPR bulan ini diambil dari rincian laporan harian advertiser.
  *Product* berisi daftar product yang dipilih di laporan.
- Data contoh tanpa kredensial API: `pnpm db:seed-ads-demo` (hanya menambah data; hapus lagi dengan
  `pnpm db:seed-ads-demo --remove`).

## WhatsApp laporan iklan (Baileys)

Setiap advertiser menautkan WhatsApp-nya sendiri di **Settings → WhatsApp laporan iklan** (scan QR lewat
*Perangkat tertaut*), memilih grup tujuan, dan setiap laporan harian yang dikirim/diperbarui otomatis
terkirim dari nomornya ke grup itu.

- Koneksi dipegang oleh proses terpisah: jalankan `pnpm wa:worker` di samping `pnpm dev` / `pnpm start`
  (di server produksi jalankan dengan pm2/systemd agar selalu hidup). Tanpa worker, QR tidak muncul dan
  pesan tertahan di antrean (dibuang setelah 12 jam).
- Sesi login disimpan di Postgres (`wa_auth`), jadi tidak perlu scan ulang setelah restart.
- Aplikasi dan worker hanya berkomunikasi lewat database (`wa_sessions`, `wa_outbox`, `wa_worker`).
- Format pesan di grup, satu blok per hari (hari tanpa angka dilewati; kiriman ulang setelah laporan diubah diberi
  tanda _(revisi)_):

  ```
  Advertiser *wahib*
  Spent Iklan *2026-09-25*
  => Facebook Kelas Online = Rp 653.851
  => Google Kelas Online = Rp 988.978
  ```
- Pengaman anti-banned di worker:
  - hanya satu worker per database (Postgres advisory lock) — dua worker akan saling menendang sesi;
  - reconnect dengan backoff eksponensial (5 dtk → maks 5 menit), berhenti setelah 10× gagal, saat sesi dibuka
    di tempat lain (440) atau ditolak WhatsApp (403);
  - metadata grup di-cache, dan pesan terkirim disimpan sementara untuk permintaan kirim ulang anggota grup;
  - tiap pesan: online → "mengetik…" (lama sesuai panjang pesan) → kirim → offline lagi;
  - jeda acak antar pesan per nomor dan batas per jam/hari (`WA_MIN_GAP_SEC`, `WA_MAX_PER_HOUR`, `WA_MAX_PER_DAY`);
  - pesan ditahan `WA_SEND_DELAY_SEC` (default 60 dtk): edit beruntun digabung jadi satu pesan, dan simpan ulang tanpa
    perubahan angka tidak dikirim lagi.
- Baileys adalah library WhatsApp Web **tidak resmi**. Pakai untuk kirim ke grup internal saja (bukan
  broadcast/spam) agar nomor tidak berisiko dibatasi WhatsApp.
