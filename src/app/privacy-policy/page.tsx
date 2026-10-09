import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Public privacy policy (https://ads.lkbimrbob.com/privacy-policy), linked from the login page and given
 * to Meta and Google in app review. It describes what this app really collects and sends; keep it in
 * step with the integrations. The contact comes from PRIVACY_CONTACT_EMAIL / PRIVACY_CONTACT_WHATSAPP.
 */

export const metadata: Metadata = {
  title: "Kebijakan Privasi · Privacy Policy",
  description: "Kebijakan privasi aplikasi KPI Ads Mr.BOB Kampung Inggris (ads.lkbimrbob.com).",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://ads.lkbimrbob.com/privacy-policy" },
};

const EFFECTIVE = { id: "9 Oktober 2026", en: "9 October 2026" };
const ORG = "Mr.BOB Kampung Inggris (LKBI Mr.BOB)";
const APP = "KPI Ads";
const DOMAIN = "ads.lkbimrbob.com";

type Lang = "id" | "en";
type Block = string | { list: string[] } | { href: string; label: string };
type Section = { id: string; title: string; body: Block[] };

function contact(lang: Lang) {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  const whatsapp = process.env.PRIVACY_CONTACT_WHATSAPP?.trim();
  const ways = [email && `email ${email}`, whatsapp && `WhatsApp ${whatsapp}`].filter(Boolean).join(lang === "id" ? " atau " : " or ");
  if (ways) return ways;
  return lang === "id" ? "kontak resmi Mr.BOB Kampung Inggris yang tercantum di lkbimrbob.com" : "the official Mr.BOB Kampung Inggris contact listed on lkbimrbob.com";
}

function sections(lang: Lang): Section[] {
  const reach = contact(lang);
  if (lang === "en") {
    return [
      { id: "about", title: "About this app", body: [
        `${APP} (${DOMAIN}) is the internal application of ${ORG}. Our advertising, web master, SEO, creative and customer service team use it to track ad performance, daily reports and team KPIs. Apart from the registration/order forms we publish for prospective students, the app is only used by team members with an account.`,
        `This policy explains what data the app processes, why, who it is shared with, and how you can ask for access to or deletion of your data.`,
      ] },
      { id: "data", title: "Data we process", body: [
        "Team member accounts:",
        { list: [
          "name, email address, role, chosen avatar and, for customer service (CSO), a WhatsApp number;",
          "password, stored only as a one-way hash (bcrypt);",
          "daily reports, tasks, notes, KPI targets and appraisals entered in the app, plus sign-in times.",
        ] },
        "Advertising data, read from the ad accounts our team manages:",
        { list: [
          "Meta Marketing API (permission ads_read, and pages_read_engagement to read the videos of our own ads) and Google Ads API (scope https://www.googleapis.com/auth/adwords);",
          "names, status, budgets and schedules of campaigns, ad sets / ad groups and ads; aggregated performance (spend, impressions, reach, clicks, leads, conversions, video views); ad creatives (image, video, text) of our own ads;",
          "this data is aggregated: it does not identify the people who saw or clicked the ads.",
        ] },
        "Registration / order forms (pages under /f/ and forms embedded on our websites):",
        { list: [
          "the fields of the form, for example name, WhatsApp number, email and city, the chosen product and the time of registration;",
          "where the visit came from (UTM parameters, fbclid / gclid click ids, the page address);",
          "the visitor's IP address and browser user agent, used to prevent abuse and duplicate submissions, and, only with consent, for ad measurement (see below);",
          "the Meta browser identifiers _fbp / _fbc on our website, only with consent.",
        ] },
        "Student registrations from the LKBI Mr.BOB (lkbimrbob.com) and Kelas Online Mr.BOB (app.kelasonlinemrbob.com) registration apps: name, chosen package, status, total price, payment date, how they heard about us and city. Phone numbers, email, birth date, address and transfer receipts are not copied.",
      ] },
      { id: "use", title: "How we use the data", body: [{ list: [
        "to compute team KPIs (leads, closings, revenue, ROAS, cost per result) and prepare daily and monthly reports;",
        "to pass a registration to the assigned CSO through WhatsApp so they can follow it up;",
        "to measure and improve our ads, including AI-assisted analysis of ad performance and creatives;",
        "to run accounts: sign-in, invitations, password reset, roles and access control;",
        "to keep the app secure and prevent abuse.",
      ] }, "We do not sell personal data and do not use it for anything unrelated to these purposes."] },
      { id: "sharing", title: "Third parties that process data for us", body: [{ list: [
        "Meta Platforms (Facebook/Instagram): reading our ad accounts. If a visitor ticks the optional ad measurement box on a form, the registration event is sent through the Meta Conversions API with the email and phone number hashed with SHA-256, the IP address, user agent and _fbp / _fbc. Forms whose owner turns them on may also load the Meta Pixel, Google Tag Manager or TikTok Pixel, only after that consent.",
        "Google: reading our Google Ads accounts, keyword research and Search Console website performance, and reading and updating the report spreadsheet selected by a supervisor. The Google data section below explains each integration.",
        "Kie.ai, which provides access to Google Gemini and optionally Anthropic Claude models: when a team member requests an AI analysis, receives the relevant advertising metrics, campaign names, our own ad creatives, or SEO data (website/page URLs, search queries, clicks, impressions, rankings, device/country summaries and keyword research). Campaign analyses may include aggregate registration counts and revenue, but do not send individual form submissions or student records. The returned analysis is stored in KPI Ads for authorized team members. KPI Ads does not use Google user data to train or improve generalized AI or machine-learning models.",
        "WhatsApp and Telegram: sending team reports to our internal groups; form visitors are sent to a WhatsApp chat with our CSO.",
        "Our email provider (SMTP) for invitations and password reset messages, and the server provider that hosts the app.",
      ] }, "Each of these services handles data under its own terms and privacy policy."] },
      { id: "google", title: "Google user data: access and use", body: [
        "Google connections are optional and configured by a supervisor with the Google account holder's authorization. Signing in to KPI Ads itself uses a team account and does not require Google authorization. We process the data made available by the connected account for these visible app features:",
        { list: [
          "Google Ads — https://www.googleapis.com/auth/adwords: read accessible advertising account IDs/names, campaigns, ad groups, ads, budgets, creatives, conversion actions and aggregate performance such as spend, impressions, clicks and conversions. Keyword Planner reads keyword ideas, search volumes, competition and bid estimates. KPI Ads uses these for campaign dashboards, KPI reports, keyword research and requested AI analysis. Although the Google permission also allows managing ads, these integrations do not create or modify Google Ads campaigns.",
          "Google Search Console — https://www.googleapis.com/auth/webmasters.readonly: read the list of accessible website properties and permission levels, and search performance by date, query, page, country and device (clicks, impressions, CTR and average position). We use this to display SEO dashboards, compare periods, fill daily SEO reports and produce requested SEO analysis. This connection does not change website properties or their settings.",
          "Google Sheets — https://www.googleapis.com/auth/spreadsheets: read the selected spreadsheet's title, sheet structure, headers and report rows, then write or update team reports and synchronization markers. The API permission covers spreadsheets accessible to the connected account; the feature operates on the report spreadsheet configured by the supervisor. We do not scan unrelated spreadsheets or request access to Gmail or Google Contacts.",
          "OAuth credentials: client IDs, client secrets and refresh tokens supplied for the integrations, plus temporary access tokens, allow the server to call the authorized APIs. KPI Ads does not collect the Google account password.",
        ] },
      ] },
      { id: "google-sharing", title: "Google data sharing and Limited Use", body: [
        "Google data is available to authorized team members according to their role and assigned accounts or websites. If report delivery is enabled, report figures can also be included in the team's configured Google Sheets, WhatsApp or Telegram destination. Hosting providers process stored data to operate the application; the AI provider receives only the analysis inputs described above when that feature is requested. OAuth tokens and client secrets are not included in AI inputs.",
        `${APP}'s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We use that information only to provide or improve the user-facing features described in this policy. We do not sell Google user data, transfer it to data brokers, use it for personalized advertising or retargeting, or use it to train generalized AI models. Transfers are limited to those necessary for these features, with user consent, security purposes, legal obligations, or a business transfer with the required consent. Human access is limited to the user's consent for the relevant data, security investigations, legal requirements, or aggregated and anonymized internal operations as permitted by the policy.`,
        { href: "https://developers.google.com/terms/api-services-user-data-policy", label: "Google API Services User Data Policy (including Limited Use)" },
      ] },
      { id: "google-retention", title: "Google data storage, retention and deletion", body: [
        "Google API requests use HTTPS. Saved OAuth credentials are encrypted on the application server; temporary access tokens are held in server memory. Synced advertising records, saved reports, selected account/property identifiers and saved AI analyses are stored in the application database, with access controlled by team roles. Live API results may be cached temporarily; keyword research results are cached in server memory for up to 12 hours.",
        "We retain connection credentials while the integration is enabled, and saved reports and analyses while needed for the team's reporting purposes or until an authorized deletion request is fulfilled, unless retention is legally required. Disconnecting Google Ads or Search Console in Settings → Integrations removes that integration's saved credentials and stops its subsequent access. It does not automatically delete previously saved reports, analyses, exported spreadsheets or messages. The Google Sheets connection is separate; ask the administrator to disable its synchronization and remove its credentials as well.",
        "You can revoke KPI Ads access at any time through your Google Account's third-party connections page. Revocation stops future authorized API access but does not itself delete data already stored in KPI Ads or previously exported destinations.",
        { href: "https://myaccount.google.com/connections", label: "Manage or revoke access in your Google Account" },
        `To request deletion of Google data already stored by KPI Ads, contact ${reach} with the subject "Google data deletion", the connected account or website, and the records you want removed. Do not send passwords or OAuth tokens. We verify your authority and handle the request under the deletion process below, including relevant saved reports and analyses.`,
      ] },
      { id: "cookies", title: "Cookies and local storage", body: [{ list: [
        "kpi_session: a secure, HTTP-only cookie that keeps team members signed in. It is not used for tracking.",
        "the light/dark theme choice is kept in the browser's local storage.",
        "on forms, third-party pixels and their cookies are only used after the visitor gives consent.",
      ] }] },
      { id: "security", title: "Security and retention", body: [
        "The app runs over HTTPS. API tokens and keys are stored encrypted (AES-GCM), passwords are hashed, and access depends on the role: an advertiser sees only their own campaigns and leads, a CSO only the leads assigned to them.",
        "We keep data while it is needed for the purposes above: account data while the account exists, and reports, registrations and leads while they are needed for KPI reporting and follow-up, or until deletion is requested and no legal obligation requires us to keep them. Ad data can be read again from Meta and Google at any time.",
      ] },
      { id: "rights", title: "Your rights and data deletion", body: [
        "Under Indonesia's Personal Data Protection Law (UU No. 27 Tahun 2022) you may ask to access, correct or delete your personal data, or withdraw consent for ad measurement.",
        `To ask for deletion, contact us via ${reach} with the subject "Data deletion" and the name, phone number or email you used. We confirm and delete the data within 30 days, and ask the services above to delete what we sent them where they allow it. Team members can also ask their supervisor to deactivate and remove their account.`,
        `People who used Facebook or Instagram to reach our forms can also remove access in their Facebook settings (Settings & privacy → Settings → Apps and websites).`,
      ] },
      { id: "children", title: "Children", body: [
        "The app itself is for our team members only. Registration forms for programmes for children should be filled in by a parent or guardian.",
      ] },
      { id: "changes", title: "Changes and contact", body: [
        "We will update this page when the app's use of data changes; the date at the top shows the latest version.",
        `Questions about this policy: ${ORG}, via ${reach}.`,
      ] },
    ];
  }
  return [
    { id: "tentang", title: "Tentang aplikasi ini", body: [
      `${APP} (${DOMAIN}) adalah aplikasi internal ${ORG}. Tim iklan, web master, SEO, creative dan customer service kami memakainya untuk memantau performa iklan, laporan harian dan KPI tim. Selain form pendaftaran/order yang kami terbitkan untuk calon peserta, aplikasi ini hanya dipakai oleh anggota tim yang memiliki akun.`,
      "Kebijakan ini menjelaskan data apa yang diproses aplikasi, untuk apa, dibagikan kepada siapa, dan bagaimana Anda dapat meminta akses atau penghapusan data.",
    ] },
    { id: "data", title: "Data yang kami proses", body: [
      "Akun anggota tim:",
      { list: [
        "nama, alamat email, peran, avatar pilihan dan, untuk customer service (CSO), nomor WhatsApp;",
        "kata sandi, yang hanya disimpan dalam bentuk hash satu arah (bcrypt);",
        "laporan harian, tugas, catatan, target KPI dan penilaian kinerja yang diisi di aplikasi, serta waktu masuk.",
      ] },
      "Data iklan, dibaca dari akun iklan yang dikelola tim kami:",
      { list: [
        "Meta Marketing API (izin ads_read, dan pages_read_engagement untuk membaca video iklan kami sendiri) serta Google Ads API (scope https://www.googleapis.com/auth/adwords);",
        "nama, status, budget dan jadwal campaign, ad set / ad group dan iklan; performa agregat (spend, impression, reach, klik, lead, konversi, tayangan video); materi iklan (gambar, video, teks) milik iklan kami;",
        "data ini bersifat agregat: tidak mengidentifikasi orang yang melihat atau mengklik iklan.",
      ] },
      "Form pendaftaran / order (halaman /f/ dan form yang dipasang di website kami):",
      { list: [
        "isian form, misalnya nama, nomor WhatsApp, email dan kota, produk yang dipilih serta waktu pendaftaran;",
        "asal kunjungan (parameter UTM, ID klik fbclid / gclid, alamat halaman);",
        "alamat IP dan user agent browser, untuk mencegah penyalahgunaan dan pendaftaran ganda, dan, hanya dengan persetujuan, untuk pengukuran iklan (lihat di bawah);",
        "pengenal browser Meta _fbp / _fbc di website kami, hanya dengan persetujuan.",
      ] },
      "Pendaftaran peserta dari aplikasi LKBI Mr.BOB (lkbimrbob.com) dan Kelas Online Mr.BOB (app.kelasonlinemrbob.com): nama, paket, status, total biaya, tanggal pembayaran, sumber informasi dan kota. Nomor HP, email, tanggal lahir, alamat dan bukti transfer tidak disalin.",
    ] },
    { id: "penggunaan", title: "Cara kami menggunakan data", body: [{ list: [
      "menghitung KPI tim (lead, closing, revenue, ROAS, biaya per hasil) dan menyusun laporan harian dan bulanan;",
      "meneruskan pendaftaran ke CSO yang ditugaskan melalui WhatsApp agar dapat ditindaklanjuti;",
      "mengukur dan memperbaiki iklan kami, termasuk analisa performa dan materi iklan dengan bantuan AI;",
      "menjalankan akun: login, undangan, reset kata sandi, peran dan pembatasan akses;",
      "menjaga keamanan aplikasi dan mencegah penyalahgunaan.",
    ] }, "Kami tidak menjual data pribadi dan tidak memakainya untuk tujuan di luar daftar di atas."] },
    { id: "pihak-ketiga", title: "Pihak ketiga yang memproses data untuk kami", body: [{ list: [
      "Meta Platforms (Facebook/Instagram): membaca akun iklan kami. Bila pengunjung mencentang kotak opsional pengukuran iklan pada form, peristiwa pendaftaran dikirim melalui Meta Conversions API dengan email dan nomor HP yang di-hash SHA-256, alamat IP, user agent serta _fbp / _fbc. Form yang diaktifkan pemiliknya juga dapat memuat Meta Pixel, Google Tag Manager atau TikTok Pixel, hanya setelah persetujuan tersebut.",
      "Google: membaca akun Google Ads, riset kata kunci dan performa website Search Console, serta membaca dan memperbarui spreadsheet laporan yang dipilih supervisor. Bagian data Google di bawah menjelaskan setiap integrasi.",
      "Kie.ai, yang menyediakan akses ke model Google Gemini dan opsional Anthropic Claude: saat anggota tim meminta analisa AI, menerima metrik iklan, nama campaign, materi iklan kami, atau data SEO yang relevan (URL website/halaman, kueri penelusuran, klik, impression, peringkat, ringkasan perangkat/negara dan riset kata kunci). Analisa campaign dapat menyertakan jumlah pendaftaran dan revenue agregat, tetapi tidak mengirim isian form atau data individu peserta. Hasil analisa disimpan di KPI Ads untuk anggota tim yang berwenang. KPI Ads tidak memakai data pengguna Google untuk melatih atau meningkatkan model AI atau machine learning umum.",
      "WhatsApp dan Telegram: mengirim laporan tim ke grup internal kami; pendaftar form diarahkan ke percakapan WhatsApp dengan CSO kami.",
      "Penyedia email (SMTP) untuk undangan dan reset kata sandi, serta penyedia server tempat aplikasi berjalan.",
    ] }, "Setiap layanan tersebut memproses data sesuai ketentuan dan kebijakan privasinya masing-masing."] },
    { id: "google", title: "Data pengguna Google: akses dan penggunaan", body: [
      "Koneksi Google bersifat opsional dan diatur supervisor dengan izin pemilik akun Google. Login ke KPI Ads memakai akun tim dan tidak memerlukan otorisasi Google. Data yang tersedia dari akun terhubung diproses untuk fitur aplikasi berikut:",
      { list: [
        "Google Ads — https://www.googleapis.com/auth/adwords: membaca ID/nama akun iklan yang dapat diakses, campaign, ad group, iklan, budget, materi iklan, tindakan konversi dan performa agregat seperti spend, impression, klik dan konversi. Keyword Planner membaca ide kata kunci, volume pencarian, kompetisi dan estimasi bid. KPI Ads menggunakannya untuk dashboard campaign, laporan KPI, riset kata kunci dan analisa AI yang diminta. Meskipun izin Google ini juga memungkinkan pengelolaan iklan, integrasi tersebut tidak membuat atau mengubah campaign Google Ads.",
        "Google Search Console — https://www.googleapis.com/auth/webmasters.readonly: membaca daftar properti website yang dapat diakses beserta tingkat izinnya, dan performa penelusuran berdasarkan tanggal, kueri, halaman, negara dan perangkat (klik, impression, CTR dan posisi rata-rata). Data digunakan untuk dashboard SEO, perbandingan periode, pengisian laporan SEO harian dan analisa SEO yang diminta. Koneksi ini tidak mengubah properti website atau pengaturannya.",
        "Google Sheets — https://www.googleapis.com/auth/spreadsheets: membaca judul spreadsheet yang dipilih, struktur sheet, header dan baris laporan, kemudian menulis atau memperbarui laporan tim dan penanda sinkronisasi. Izin API mencakup spreadsheet yang dapat diakses akun terhubung; fitur bekerja pada spreadsheet laporan yang diatur supervisor. Kami tidak memindai spreadsheet lain atau meminta akses Gmail maupun Google Contacts.",
        "Kredensial OAuth: Client ID, Client Secret dan Refresh Token yang disediakan untuk integrasi, serta Access Token sementara, memungkinkan server memanggil API yang diizinkan. KPI Ads tidak mengumpulkan kata sandi akun Google.",
      ] },
    ] },
    { id: "google-sharing", title: "Pembagian data Google dan Limited Use", body: [
      "Data Google tersedia bagi anggota tim yang berwenang sesuai peran dan akun atau website yang ditugaskan. Jika pengiriman laporan diaktifkan, angka laporan juga dapat disertakan pada tujuan Google Sheets, WhatsApp atau Telegram yang diatur tim. Penyedia hosting memproses data tersimpan untuk menjalankan aplikasi; penyedia AI menerima hanya masukan analisa yang dijelaskan di atas ketika fitur tersebut diminta. Token OAuth dan Client Secret tidak disertakan dalam masukan AI.",
      `Penggunaan dan pemindahan informasi yang diterima ${APP} dari Google API mematuhi Google API Services User Data Policy, termasuk ketentuan Limited Use. Informasi tersebut hanya digunakan untuk menyediakan atau meningkatkan fitur yang dijelaskan dalam kebijakan ini. Kami tidak menjual data pengguna Google, meneruskannya kepada broker data, memakainya untuk iklan personal atau retargeting, atau melatih model AI umum. Pemindahan dibatasi untuk kebutuhan fitur tersebut dengan persetujuan pengguna, keamanan, kewajiban hukum, atau peralihan usaha dengan persetujuan yang diwajibkan. Akses manusia dibatasi pada persetujuan pengguna untuk data terkait, investigasi keamanan, kewajiban hukum, atau operasi internal dengan data agregat dan anonim sebagaimana diizinkan kebijakan tersebut.`,
      { href: "https://developers.google.com/terms/api-services-user-data-policy", label: "Google API Services User Data Policy (termasuk Limited Use)" },
    ] },
    { id: "google-retention", title: "Penyimpanan, masa simpan dan penghapusan data Google", body: [
      "Permintaan Google API menggunakan HTTPS. Kredensial OAuth yang disimpan dienkripsi pada server aplikasi; Access Token sementara berada di memori server. Catatan iklan tersinkron, laporan tersimpan, pengenal akun/properti yang dipilih dan hasil analisa AI disimpan dalam database aplikasi dengan akses berdasarkan peran tim. Hasil API langsung dapat disimpan sementara dalam cache; hasil riset kata kunci disimpan dalam memori server hingga 12 jam.",
      "Kredensial koneksi disimpan selama integrasi aktif; laporan dan analisa tersimpan dipertahankan selama diperlukan untuk pelaporan tim atau sampai permintaan penghapusan yang sah dipenuhi, kecuali diwajibkan hukum. Memutus koneksi Google Ads atau Search Console di Pengaturan → Integrasi menghapus kredensial tersimpan integrasi tersebut dan menghentikan akses berikutnya. Tindakan ini tidak otomatis menghapus laporan, analisa, spreadsheet ekspor atau pesan yang sudah ada. Koneksi Google Sheets terpisah; minta administrator menghentikan sinkronisasi dan menghapus kredensialnya juga.",
      "Anda dapat mencabut akses KPI Ads kapan saja melalui halaman koneksi pihak ketiga pada Akun Google. Pencabutan menghentikan akses API terotorisasi selanjutnya, tetapi tidak dengan sendirinya menghapus data yang sudah disimpan KPI Ads atau dikirim ke tujuan ekspor.",
      { href: "https://myaccount.google.com/connections", label: "Kelola atau cabut akses melalui Akun Google" },
      `Untuk meminta penghapusan data Google yang telah disimpan KPI Ads, hubungi ${reach} dengan judul "Penghapusan data Google", akun atau website terhubung, dan catatan yang ingin dihapus. Jangan mengirim kata sandi atau token OAuth. Kami memverifikasi kewenangan Anda dan menangani permintaan sesuai proses penghapusan di bawah, termasuk laporan dan analisa tersimpan yang terkait.`,
    ] },
    { id: "cookie", title: "Cookie dan penyimpanan lokal", body: [{ list: [
      "kpi_session: cookie aman (HTTP-only) agar anggota tim tetap login. Tidak dipakai untuk pelacakan.",
      "pilihan tema terang/gelap disimpan di local storage browser.",
      "pada form, piksel pihak ketiga beserta cookie-nya hanya dipakai setelah pengunjung memberi persetujuan.",
    ] }] },
    { id: "keamanan", title: "Keamanan dan masa simpan", body: [
      "Aplikasi berjalan melalui HTTPS. Token dan kunci API disimpan terenkripsi (AES-GCM), kata sandi di-hash, dan akses dibatasi sesuai peran: advertiser hanya melihat campaign dan lead miliknya, CSO hanya lead yang ditugaskan kepadanya.",
      "Kami menyimpan data selama diperlukan untuk tujuan di atas: data akun selama akun ada, sedangkan laporan, pendaftaran dan lead selama diperlukan untuk laporan KPI dan tindak lanjut, atau sampai diminta dihapus dan tidak ada kewajiban hukum untuk menyimpannya. Data iklan dapat dibaca ulang dari Meta dan Google kapan saja.",
    ] },
    { id: "hak", title: "Hak Anda dan penghapusan data", body: [
      "Sesuai Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022), Anda dapat meminta akses, perbaikan atau penghapusan data pribadi Anda, atau menarik persetujuan pengukuran iklan.",
      `Untuk meminta penghapusan, hubungi kami melalui ${reach} dengan judul "Penghapusan data" serta nama, nomor HP atau email yang Anda pakai. Kami mengonfirmasi dan menghapus data dalam 30 hari, dan meminta layanan di atas menghapus data yang telah kami kirim sejauh layanan tersebut memungkinkan. Anggota tim juga dapat meminta supervisor menonaktifkan dan menghapus akunnya.`,
      "Pengguna yang datang ke form kami melalui Facebook atau Instagram juga dapat mencabut akses di pengaturan Facebook (Pengaturan & privasi → Pengaturan → Aplikasi dan situs web).",
    ] },
    { id: "anak", title: "Anak-anak", body: [
      "Aplikasi ini hanya untuk anggota tim kami. Form pendaftaran untuk program anak sebaiknya diisi oleh orang tua atau wali.",
    ] },
    { id: "perubahan", title: "Perubahan dan kontak", body: [
      "Kami akan memperbarui halaman ini bila penggunaan data oleh aplikasi berubah; tanggal di bagian atas menunjukkan versi terbaru.",
      `Pertanyaan tentang kebijakan ini: ${ORG}, melalui ${reach}.`,
    ] },
  ];
}

export default async function PrivacyPolicyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang: Lang = (await searchParams).lang === "en" ? "en" : "id";
  const list = sections(lang);
  const t = lang === "en"
    ? { title: "Privacy Policy", updated: `Effective ${EFFECTIVE.en}`, toc: "Contents", back: "About KPI Ads" }
    : { title: "Kebijakan Privasi", updated: `Berlaku sejak ${EFFECTIVE.id}`, toc: "Isi", back: "Tentang KPI Ads" };

  return (
    <div className="min-h-dvh bg-background" lang={lang}>
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="KPI Ads — Home"><Logo /></Link>
          <div className="flex items-center gap-1">
            <nav aria-label="Bahasa / Language" className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(["id", "en"] as const).map((l) => (
                <Link key={l} href={l === "id" ? "/privacy-policy" : "/privacy-policy?lang=en"} aria-current={lang === l ? "page" : undefined} className={cn("rounded-md px-2.5 py-1", lang === l ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                  {l === "id" ? "Indonesia" : "English"}
                </Link>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <p className="text-sm text-muted-foreground">{APP} · {ORG}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.updated} · {DOMAIN}</p>

        <nav aria-label={t.toc} className="mt-6 rounded-xl border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.toc}</p>
          <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm sm:grid-cols-2">
            {list.map((s) => <li key={s.id}><a href={`#${s.id}`} className="hover:underline">{s.title}</a></li>)}
          </ol>
        </nav>

        <div className="mt-8 grid gap-8">
          {list.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="text-lg font-semibold">{i + 1}. {s.title}</h2>
              <div className="mt-2 grid gap-3 text-[15px] leading-relaxed break-words text-foreground/90">
                {s.body.map((b, j) => typeof b === "string"
                  ? <p key={j}>{b}</p>
                  : "href" in b
                    ? <a key={j} href={b.href} className="w-fit break-words underline underline-offset-4">{b.label}</a>
                    : <ul key={j} className="grid list-disc gap-1.5 pl-5">{b.list.map((item, k) => <li key={k}>{item}</li>)}</ul>)}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm text-muted-foreground">
          <span>© 2026 {ORG}</span>
          <Link href="/" className="hover:text-foreground hover:underline">{t.back}</Link>
        </footer>
      </main>
    </div>
  );
}
