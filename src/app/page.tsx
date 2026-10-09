import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, FileSpreadsheet, Search, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { absolute: "KPI Ads — Performa iklan, SEO, dan KPI tim" },
  description: "KPI Ads adalah aplikasi Mr.BOB Kampung Inggris untuk memantau performa iklan Meta dan Google Ads, Google Search Console, serta laporan dan KPI tim.",
  alternates: { canonical: "https://ads.lkbimrbob.com" },
  robots: { index: true, follow: true },
};

const features = [
  { icon: BarChart3, title: "Performa iklan", description: "Pantau campaign Meta dan Google Ads, biaya, klik, lead, konversi, dan ROAS untuk mengevaluasi hasil iklan yang dikelola tim." },
  { icon: Search, title: "Performa SEO", description: "Lihat klik, impression, kata kunci, halaman, dan posisi website dari Google Search Console. Riset volume pencarian melalui Google Keyword Planner." },
  { icon: FileSpreadsheet, title: "Laporan dan KPI tim", description: "Susun laporan harian, pantau target dan hasil kerja, serta sinkronkan laporan ke Google Sheets yang ditentukan supervisor." },
];

export default function Home() {
  return (
    <div lang="id" className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="KPI Ads — Beranda"><Logo /></Link>
          <nav aria-label="Navigasi utama" className="flex items-center gap-3 text-sm sm:gap-5">
            <Link href="/privacy-policy" className="text-muted-foreground hover:text-foreground hover:underline">Privasi</Link>
            <ThemeToggle />
            <Link href="/login" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Masuk</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="py-14 sm:py-20" aria-labelledby="app-name">
          <p className="text-sm font-medium text-muted-foreground">Mr.BOB Kampung Inggris · LKBI Mr.BOB</p>
          <h1 id="app-name" className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">KPI Ads</h1>
          <p className="mt-5 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl">Performa iklan, SEO, dan KPI tim dalam satu tempat.</p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            KPI Ads adalah aplikasi internal Mr.BOB Kampung Inggris untuk tim advertiser,
            web master, SEO, creative, dan customer service. Aplikasi ini membantu tim
            memantau hasil pemasaran, mengelola lead, menyusun laporan harian, dan
            mengevaluasi pencapaian target.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/login" className="btn-primary-gradient inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-primary-foreground">
              Masuk ke KPI Ads <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/privacy-policy" className="text-sm font-medium underline underline-offset-4">Kebijakan Privasi / Privacy Policy</Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Akses ruang kerja diberikan kepada anggota tim oleh administrator.</p>
        </section>

        <section aria-label="Fitur KPI Ads" className="grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-xl border bg-card p-6">
              <Icon className="size-6 text-primary" aria-hidden />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="google-heading" className="my-10 rounded-xl border bg-muted/30 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden />
            <h2 id="google-heading" className="text-xl font-semibold">Koneksi Google dan penggunaan data</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm leading-relaxed text-muted-foreground">
            <p>Supervisor mengatur koneksi Google dengan izin pemilik akun. KPI Ads membaca akun dan metrik Google Ads, data riset kata kunci, serta performa website Search Console. Integrasi Google Sheets membaca struktur dan baris laporan untuk menulis atau memperbarui laporan pada spreadsheet yang dipilih.</p>
            <p>Data digunakan untuk dashboard, pelaporan, dan evaluasi pemasaran internal. Saat anggota tim menjalankan Analisa AI, metrik iklan atau data SEO yang relevan dikirim ke layanan AI Kie.ai untuk menghasilkan rekomendasi. Detail akses, penyimpanan, pembagian, pencabutan izin, dan penghapusan data dijelaskan dalam kebijakan privasi.</p>
            <p>Koneksi Google bersifat opsional. Akun aplikasi menggunakan email dan kata sandi yang diatur melalui undangan tim; halaman informasi ini dapat dibaca tanpa masuk.</p>
            <Link href="/privacy-policy#google" className="w-fit font-medium text-foreground underline underline-offset-4">Baca kebijakan data Google</Link>
          </div>
        </section>

        <section lang="en" aria-labelledby="about-english" className="mb-12 max-w-3xl">
          <h2 id="about-english" className="text-lg font-semibold">About KPI Ads</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">KPI Ads is the internal marketing performance and team reporting application of Mr.BOB Kampung Inggris (LKBI Mr.BOB). It brings together Meta and Google Ads reporting, Google Search Console performance, keyword research, leads, and team KPIs. Authorized team members can sync reports to a selected Google Sheet and request AI-assisted marketing analysis.</p>
          <Link href="/privacy-policy?lang=en" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">Read the Privacy Policy in English</Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© 2026 KPI Ads · Mr.BOB Kampung Inggris</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy-policy" className="hover:text-foreground hover:underline">Kebijakan Privasi</Link>
            <Link href="/privacy-policy#perubahan" className="hover:text-foreground hover:underline">Kontak &amp; penghapusan data</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
