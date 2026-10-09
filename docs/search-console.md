# Google Search Console

Supervisor menghubungkan akun melalui **Pengaturan → Integrasi → Google Search Console**. Hanya supervisor yang melihat form Client ID, Client Secret, Refresh Token, tutorial, serta tombol putus koneksi. Gunakan akun Google yang hanya diberi akses ke website tim.

SEO Specialist dan webmaster membuka halaman integrasi yang sama untuk memilih website dari koneksi tim, lalu menekan **Simpan pilihan website**. Pilihan disimpan per pengguna dan tetap tersedia setelah login ulang. Anggota tidak perlu memasukkan kredensial atau URL website manual. Satu website boleh dipilih beberapa anggota yang bekerja bersama.

**Performa SEO** (`/seo`) untuk anggota hanya menampilkan website pilihannya. Website yang belum dipilih tidak bisa dibuka dengan mengganti parameter URL. Supervisor dapat memantau semua properti tim tanpa harus memilihnya terlebih dahulu. Akses Google diperiksa kembali setiap kali membaca data; pilihan yang aksesnya dicabut ditandai tidak tersedia pada pemilih website.

## Konfigurasi

1. Pastikan akun Google memiliki akses properti di Search Console (Domain atau URL-prefix).
2. Aktifkan Google Search Console API pada Google Cloud project.
3. Konfigurasikan OAuth consent screen dan OAuth client bertipe Web application. Tambahkan `https://developers.google.com/oauthplayground` sebagai Authorized redirect URI.
4. Di OAuth Playground, aktifkan **Use your own OAuth credentials**, isi Client ID/Secret, dan authorize scope `https://www.googleapis.com/auth/webmasters.readonly`.
5. Exchange authorization code for tokens, lalu salin Refresh Token ke form koneksi. Untuk penggunaan berkelanjutan, perhatikan status publikasi consent screen: token aplikasi External dalam mode Testing biasanya berlaku tujuh hari.
6. Klik **Simpan & tes koneksi**. Aplikasi memuat daftar website dan menguji akses menggunakan salah satu properti. Anggota tim kemudian memilih website masing-masing di halaman integrasi.

Koneksi ini terpisah dari Google Ads/Sheets dan tidak memerlukan developer token. Client Secret dan Refresh Token dienkripsi menggunakan mekanisme `AUTH_SECRET` aplikasi, disimpan dalam `app_settings` pada key `shared.search_console.connection`. Tidak diperlukan migrasi database atau environment variable baru. Perubahan `AUTH_SECRET` mengharuskan kredensial diisi ulang.

Pilihan website disimpan sebagai daftar URL properti dalam `app_settings` pada key `user.<id>.search_console.sites`. Server mengambil ID pengguna dari sesi login, bukan dari form. Kredensial, Client ID, dan metadata konfigurasi tidak dikirim ke komponen pemilih website anggota. Pilihan lama tetap disimpan jika koneksi tim diputus, dan pengguna dapat mengosongkannya. Saat mengaktifkan perubahan ini, anggota perlu memilih websitenya sekali; tidak ada properti yang otomatis ditetapkan ke anggota.

## Data

- Data dibaca langsung dari API saat halaman dibuka; tidak ada sinkronisasi terjadwal atau perubahan otomatis pada laporan KPI manual.
- Jenis pencarian Web, hanya data final. Rentang awal adalah 28 hari hingga tiga hari sebelum hari ini menurut Pacific Time, sesuai kalender API Search Console.
- Total klik, impresi, CTR, dan posisi rata-rata berasal dari query tanpa dimensi, bukan penjumlahan tabel kata kunci.
- Tabel harian, maksimal 50 kata kunci/halaman teratas berdasarkan klik, serta perangkat. Query yang disembunyikan Google dan batas API dapat membuat total tabel berbeda dari ringkasan.
- Properti diperiksa kembali saat membaca data. Kegagalan koneksi ditampilkan tanpa mengungkap respons mentah atau kredensial. Kredensial baru hanya disimpan setelah tes berhasil.
- Memutus koneksi menghapus kredensial tersimpan dan menghentikan akses melalui aplikasi; tidak mencabut grant OAuth pada akun Google.

## Pengujian

`npm run test:search-console` menguji client API dengan respons tiruan, validasi, dan akses navigasi. `npm run test:search-console:integration` menguji penyimpanan terenkripsi serta siklus koneksi dalam transaksi database yang di-rollback; API Google ditiru. Pengujian live memerlukan kredensial Google dengan izin properti yang sesuai.

Referensi: [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [Sites API](https://developers.google.com/webmaster-tools/v1/sites/list), [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
