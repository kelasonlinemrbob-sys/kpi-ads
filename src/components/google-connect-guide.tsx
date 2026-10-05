import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">{children}<ExternalLinkIcon className="size-3 shrink-0" /></a>;
}
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border p-4"><h3 className="mb-2 font-semibold text-foreground">{number}. {title}</h3><div className="space-y-2">{children}</div></section>;
}
function Code({ children }: { children: React.ReactNode }) { return <code className="break-all rounded bg-muted px-1 py-0.5 text-xs text-foreground">{children}</code>; }

/** Checked against Google's September 2026 Cloud-project onboarding and OAuth documentation. */
export function GoogleConnectGuide() {
  return <div className="grid gap-3 text-sm leading-relaxed text-muted-foreground">
    <p>Ikuti langkah ini sekali untuk menghubungkan KPI Ads. Gunakan akun Google yang memiliki akses baca ke akun Google Ads yang akan dilaporkan. Password Gmail atau App Password SMTP tidak dipakai untuk koneksi ini.</p>
    <div className="rounded-lg border border-info/30 bg-muted/50 p-3">
      <p className="font-medium text-foreground">Alur terbaru Google — diperiksa 5 Oktober 2026</p>
      <p>Sejak 9 September 2026, akses Google Ads API dikelola pada Google Cloud project. Developer token tidak lagi wajib dan pendaftaran baru melalui API Center MCC telah dihentikan. Ajukan akses melalui Google Cloud. <A href="https://developers.google.com/google-ads/api/docs/api-policy/developer-token">Perubahan resmi Google</A>.</p>
    </div>
    <Step number={1} title="Siapkan akun Google Ads dan catat Customer ID">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Buka <A href="https://ads.google.com/">Google Ads</A>, pilih akun yang menjalankan campaign.</li>
        <li>Catat Customer ID 10 digit di pemilih akun, misalnya <Code>123-456-7890</Code>. Masukkan ke KPI Ads sebagai <Code>1234567890</Code>.</li>
        <li>Pastikan email yang akan dipakai saat otorisasi ada di <strong>Admin → Access and security</strong>. Akses Read-only cukup untuk membaca laporan.</li>
        <li>Jika akses melalui Manager Account/MCC, catat juga ID manager dan pastikan akun iklan telah terhubung di bawah manager tersebut.</li>
      </ol>
      <p>Contoh: Customer ID akun iklan <Code>1234567890</Code>; MCC ID <Code>9876543210</Code>. Jika pengguna Google memiliki akses langsung tanpa MCC, kolom MCC ID boleh kosong. MCC ID bukan Customer ID akun anak. <A href="https://developers.google.com/google-ads/api/docs/concepts/call-structure#login-customer-id">Panduan MCC</A>.</p>
    </Step>
    <Step number={2} title="Buat project dan aktifkan akses Google Ads API">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Buka <A href="https://console.cloud.google.com/">Google Cloud Console</A> → pilih atau buat project, misalnya <Code>KPI Ads MrBOB</Code>.</li>
        <li>Buka <strong>APIs &amp; Services → Library</strong> → cari <strong>Google Ads API</strong> → klik <strong>Enable</strong>.</li>
        <li>Buka <A href="https://console.cloud.google.com/apis/api/googleads.googleapis.com/overview">Google Ads API Overview</A> pada project yang sama.</li>
        <li>Jika level akses masih <strong>Test</strong>, buka <strong>Upgrade access level</strong>, pilih <strong>Explorer</strong>, lalu <strong>Apply for access</strong>. Isi informasi penggunaan secara benar: aplikasi internal untuk membaca campaign dan laporan KPI.</li>
        <li>Tunggu sampai project memiliki akses <strong>Explorer, Basic, atau Standard</strong> untuk membaca akun iklan produksi. Test access hanya dapat membaca akun uji coba.</li>
      </ol>
      <p>Gunakan project ini juga saat membuat Client ID di langkah berikut. <A href="https://developers.google.com/google-ads/api/docs/api-policy/access-levels">Panduan akses API</A>.</p>
    </Step>
    <Step number={3} title="Atur Google Auth Platform dan buat OAuth client">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Di Google Cloud, buka <strong>Google Auth Platform</strong> (atau <strong>APIs &amp; Services → OAuth consent screen</strong>).</li>
        <li>Isi <strong>Branding</strong>: App name <Code>KPI Ads</Code>, User support email dan Developer contact email dengan email pengelola yang aktif.</li>
        <li>Pada <strong>Audience</strong>, pilih <strong>External</strong> jika menggunakan Gmail pribadi. Internal hanya untuk organisasi Google Workspace yang sesuai. Saat Testing, tambahkan email yang akan login ke daftar <strong>Test users</strong>.</li>
        <li>Pada <strong>Data Access</strong>, tambahkan scope <Code>https://www.googleapis.com/auth/adwords</Code>.</li>
        <li>Buka <strong>Clients → Create client</strong>, pilih <strong>Web application</strong>, beri nama <Code>KPI Ads OAuth</Code>.</li>
        <li>Tambahkan <strong>Authorized redirect URI</strong> persis <Code>https://developers.google.com/oauthplayground</Code>, lalu Create. Untuk alur Playground ini, Authorized JavaScript origins tidak diperlukan.</li>
        <li>Salin <strong>Client ID</strong> dan <strong>Client Secret</strong>. Keduanya harus berasal dari client yang sama.</li>
      </ol>
      <p>Domain aplikasi adalah <Code>ads.lkbimrbob.com</Code>. Jika Google meminta Authorized domain pada Branding, gunakan domain induk <Code>lkbimrbob.com</Code> yang Anda kuasai dan verifikasi. Isi halaman utama/kebijakan privasi sesuai halaman nyata yang diminta Google.</p>
      <p><A href="https://developers.google.com/workspace/guides/configure-oauth-consent">Pengaturan consent screen</A> · <A href="https://developers.google.com/oauthplayground/">Redirect URI Playground</A>.</p>
    </Step>
    <Step number={4} title="Buat Refresh Token melalui OAuth Playground">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Buka <A href="https://developers.google.com/oauthplayground/">OAuth 2.0 Playground</A>, lalu klik ikon roda gigi.</li>
        <li>Pilih OAuth flow <strong>Server-side</strong>, OAuth endpoints <strong>Google</strong>, Access type <strong>Offline</strong>, dan Force prompt <strong>Consent Screen</strong>.</li>
        <li>Centang <strong>Use your own OAuth credentials</strong>. Isi Client ID dan Client Secret dari langkah 3, lalu tutup pengaturan.</li>
        <li>Di Step 1, isi scope <Code>https://www.googleapis.com/auth/adwords</Code>, lalu klik <strong>Authorize APIs</strong>.</li>
        <li>Login dengan email yang memiliki akses Google Ads, periksa nama aplikasi dan izinnya, lalu setujui akses.</li>
        <li>Di Step 2, klik <strong>Exchange authorization code for tokens</strong>. Salin nilai <strong>Refresh token</strong> ke form KPI Ads. Kolom aplikasi membutuhkan Refresh Token, bukan Access Token atau Authorization Code.</li>
      </ol>
      <p><strong>Gunakan OAuth client sendiri:</strong> token yang dibuat dengan kredensial bawaan Playground dicabut setelah 24 jam. <A href="https://developers.google.com/oauthplayground/">Ketentuan Playground</A>.</p>
      <p><strong>Untuk pemakaian rutin:</strong> OAuth External dengan status Testing menghasilkan Refresh Token yang berlaku 7 hari untuk scope Ads. Atur Audience ke <strong>In production / Publish app</strong> dan ikuti verifikasi yang diminta Google, lalu buat ulang token. Publish app tidak otomatis menyelesaikan verifikasi. Token tetap bisa dicabut oleh pemilik akun. <A href="https://developers.google.com/identity/protocols/oauth2#expiration">Masa berlaku token</A>.</p>
    </Step>
    <Step number={5} title="Isi form Koneksi Google Ads di KPI Ads">
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="py-2 pr-3">Kolom</th><th>Isi dengan</th></tr></thead><tbody>
        {[
          ["Client ID", "OAuth Client ID dari Google Cloud, berakhiran .apps.googleusercontent.com"],
          ["Client Secret", "Secret dari OAuth client yang sama"],
          ["Refresh Token", "Refresh token dari Step 2 OAuth Playground"],
          ["MCC / Login Customer ID", "Opsional: ID manager 10 digit bila akses melalui MCC"],
          ["Customer ID untuk tes", "ID akun iklan anak yang menjalankan campaign, 10 digit"],
        ].map(([field, description]) => <tr key={field} className="border-b last:border-0"><td className="py-2 pr-3 font-medium text-foreground">{field}</td><td>{description}</td></tr>)}
      </tbody></table></div>
      <p>Klik <strong>Simpan &amp; tes</strong>. Aplikasi memeriksa otorisasi dan akses akun sebelum menyimpan. Jika berhasil, nama akun muncul. Klik <strong>Tambahkan akun ini</strong> atau daftarkan melalui <Link href="/campaigns" className="underline">Campaigns → Akun iklan</Link>: Platform Google Ads, Nama akun bebas dikenali, Customer ID akun iklan.</p>
      <p>Supervisor dapat mengisi/mengganti kredensial. Secret dan token disimpan terenkripsi dan tidak ditampilkan kembali. Untuk mengganti MCC, isi MCC baru lalu tes akun anak yang berada di bawahnya. Satu koneksi dipakai bersama oleh semua akun Google di aplikasi.</p>
    </Step>
    <Step number={6} title="Sinkronkan campaign dan hubungkan ke product">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Buka <strong>Campaigns → Sinkron dari Ads</strong>. Pastikan nama campaign Google muncul.</li>
        <li>Pilih periode pada tab Campaign Ads untuk melihat spend, impression, klik, CTR, CPC, CPM, serta konversi Google.</li>
        <li>Di tab <strong>Product</strong>, tambah/edit product: Platform Google Ads, pilih akun Google yang tadi didaftarkan, tentukan Owner dan isi <strong>Kode product</strong>.</li>
        <li>Contoh kode <Code>KELAS-ONLINE</Code> harus muncul di nama campaign Google, misalnya <Code>Search - KELAS-ONLINE - Leads</Code>. Gunakan kode yang unik antar-product dalam akun yang sama.</li>
        <li>Buka <strong>Daily Reports → laporan baru → Generate dari Ads</strong>, periksa tanggal dan nilai yang masuk, lalu simpan laporan.</li>
      </ol>
      <p>Campaign Ads dapat menampilkan metrik sebelum dipetakan. Pemetaan akun, kode product, dan Owner diperlukan untuk masuk ke laporan harian advertiser. Kolom Lead pada laporan harian Google saat ini memakai total konversi utama Google; pastikan tujuan utama campaign memang lead. Pada tabel Campaign Ads, metrik ini diberi label Konversi Google.</p>
    </Step>
    <Step number={7} title="Aktifkan LPV dan CPLV otomatis">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Pasang Google tag/GTM atau GA4 pada landing page. Buat event khusus, misalnya <Code>lpv_kelas_online</Code>, saat landing page tujuan benar-benar dimuat. Jangan gunakan klik tombol atau page_view semua halaman sebagai pengganti.</li>
        <li>Di Google Ads, buka <strong>Goals → Conversions</strong> dan buat conversion action untuk event tersebut, atau impor event GA4 yang sesuai melalui akun GA4 yang sudah ditautkan.</li>
        <li>Gunakan <strong>Secondary action</strong> jika LPV hanya untuk pemantauan, agar tidak menjadi sasaran bidding/lead utama. Hindari memasukkannya ke custom goal yang dipakai untuk bidding. Periksa cara menghitung event agar kunjungan tidak tercatat ganda.</li>
        <li>Uji event dengan Tag Assistant/GA4 DebugView dan tunggu sampai Google Ads memproses atribusi konversinya.</li>
        <li>Di KPI Ads, buka <strong>Campaigns → Akun iklan</strong>, pada akun Google klik <strong>Pilih konversi LPV</strong>, pilih event yang benar, lalu <strong>Simpan sumber LPV</strong>.</li>
        <li>Generate ulang laporan bila diperlukan. CPLV dihitung otomatis: <strong>Spend ÷ LPV</strong>. Jika LPV belum tersedia atau nol, CPLV tampil —.</li>
      </ol>
      <p>Aplikasi membaca jumlah konversi teratribusi untuk satu event LPV yang dipilih per akun. Angka ini bukan seluruh kunjungan website dan tidak identik dengan LPV native Meta. Tracking baru tidak mengisi riwayat sebelum event terpasang. Jika satu akun mengiklankan beberapa landing page, pilih event LPV yang mencakup landing page relevan secara konsisten.</p>
      <p><A href="https://support.google.com/google-ads/answer/11461796">Primary dan secondary conversions</A> · <A href="https://developers.google.com/google-ads/api/docs/conversions/reporting">Pelaporan konversi</A>.</p>
    </Step>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold text-foreground">Jika koneksi gagal</summary><dl className="mt-3 grid gap-3">
      {[
        ["redirect_uri_mismatch", "Pastikan URI OAuth client persis https://developers.google.com/oauthplayground, tanpa tambahan slash, dan gunakan Web application."],
        ["access_denied / user belum diizinkan", "Gunakan email yang benar. Jika aplikasi masih Testing, tambahkan email ke Test users dan periksa kebijakan organisasi."],
        ["invalid_client", "Client ID dan Client Secret harus berasal dari OAuth client yang sama."],
        ["invalid_grant / token berhenti setelah 7 hari", "Buat ulang Refresh Token. Periksa status Testing, pencabutan akses, dan kecocokan Client ID. Setelah Publish app, lakukan otorisasi ulang."],
        ["USER_PERMISSION_DENIED", "Periksa akses email ke akun, Customer ID akun anak, MCC ID, dan hubungan manager dengan akun anak."],
        ["CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION / ACTION_NOT_PERMITTED", "Aktifkan Google Ads API dan ajukan Explorer access pada project pemilik Client ID."],
        ["LPV kosong", "Periksa event tracking, sumber LPV yang dipilih, aktivitas iklan, tanggal, serta jeda pemrosesan konversi Google."],
        ["Campaign muncul tetapi laporan kosong", "Periksa Owner product, akun iklan, kode product di nama campaign, dan periode laporan."],
      ].map(([error, help]) => <div key={error}><dt className="font-medium text-foreground">{error}</dt><dd>{help}</dd></div>)}
    </dl></details>
  </div>;
}
