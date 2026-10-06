import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { SendIcon, TableIcon, ArrowRightIcon, ClipboardClockIcon, KeyRoundIcon, MessageCircleIcon, MegaphoneIcon, PaletteIcon, PlugIcon, UserIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { adAccounts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { roleSlots } from "@/lib/member-roles";
import { getGoogleConnectionStatus } from "@/lib/google-connection";
import { GoogleConnectGuide } from "@/components/google-connect-guide";
import { getSheetsStatus } from "@/lib/google-sheets";
import { GoogleSheetsCard } from "./google-sheets-card";
import { GoogleConnectionCard } from "./google-connection-card";
import { getMetaConnectionStatus } from "@/lib/meta-connection";
import { getReportRules } from "@/lib/report-rules";
import { can, ROLE_LABEL, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MetaStatusBadge } from "@/components/meta-status";
import { PageHeader } from "@/components/dashboard/panel";
import { getWhatsAppStatus } from "@/actions/whatsapp";
import { HashToTab } from "./hash-to-tab";
import { MetaConnectionCard } from "./meta-connection-card";
import { AppearanceSection, ProfileSection, ReportRulesSection, SecuritySection } from "./settings-sections";
import { getTelegramStatus } from "@/actions/telegram";
import { TelegramCard } from "./telegram-card";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Settings" };

type Tab = { key: string; label: string; icon: LucideIcon; description: string };

const formatDateTime = (d: Date | null) =>
  d ? d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; service?: string }> }) {
  const user = await requireUser(true);
  const { tab: requested, service } = await searchParams;
  const showIntegrations = can.editCampaigns(user.role);
  const supervisor = user.role === "supervisor";

  const tabs: Tab[] = [
    { key: "profil", label: "Profil", icon: UserIcon, description: "Nama, jabatan dan info akun." },
    { key: "keamanan", label: "Keamanan", icon: KeyRoundIcon, description: "Password dan sesi login." },
    { key: "tampilan", label: "Tampilan", icon: PaletteIcon, description: "Tema terang, gelap atau ikuti sistem." },
    ...(showIntegrations
      ? [
          {
            key: "integrasi",
            label: "Integrasi",
            icon: PlugIcon,
            description: can.runAds(user.role) ? "WhatsApp, Telegram, Google Sheets, serta koneksi Meta dan Google Ads." : "Koneksi Meta dan Google Ads untuk Generate & Sinkron dari Ads.",
          },
        ]
      : []),
    ...(supervisor
      ? [{ key: "aturan", label: "Aturan Laporan", icon: ClipboardClockIcon, description: "Jam batas laporan dan batas isi mundur." }]
      : []),
  ];
  const active = tabs.find((t) => t.key === requested) ?? tabs[0]!;

  return (
    <>
      <HashToTab />
      <PageHeader title="Pengaturan" description="Akun, keamanan, tampilan dan integrasi." />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:px-0">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/settings?tab=${t.key}`}
              aria-current={t.key === active.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                t.key === active.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </Link>
          ))}
        </nav>

        <section className="grid min-w-0 max-w-4xl content-start gap-3">
          <div>
            <h2 className="text-base font-semibold">{active.label}</h2>
            <p className="text-sm text-muted-foreground">{active.description}</p>
          </div>
          {active.key === "profil" && (
            <ProfileSection
              name={user.name}
              avatarId={user.avatarId}
              title={user.title}
              email={user.email}
              roles={supervisor ? ["Supervisor", "Operasional iklan"] : roleSlots(user).map((slot, i) =>
                i === 0
                  ? `${roleLabel(slot.role, user.advertiserLevel)}${slot.share < 100 ? ` · ${slot.share}%` : ""}`
                  : `${ROLE_LABEL[slot.role]} · ${slot.share}%`,
              )}
              facts={[
                { label: "Bergabung", value: user.createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Login terakhir", value: formatDateTime(user.lastLoginAt) },
                { label: "Status", value: user.isActive ? "Aktif" : "Nonaktif" },
              ]}
            />
          )}
          {active.key === "keamanan" && <SecuritySection />}
          {active.key === "tampilan" && <AppearanceSection />}
          {active.key === "integrasi" && <Integrations userId={user.id} userRole={user.role} requestedService={service} />}
          {active.key === "aturan" && <ReportRulesSection {...await getReportRules()} />}
        </section>
      </div>
    </>
  );
}

async function Integrations({ userId, userRole, requestedService }: { userId: number; userRole: import("@/db/schema").Role; requestedService?: string }) {
  const [metaStatus, metaAccounts, wa, googleStatus, googleAccounts, sheetsStatus, telegram] = await Promise.all([
    getMetaConnectionStatus(userId),
    db.select({ accountId: adAccounts.accountId }).from(adAccounts).where(and(eq(adAccounts.platform, "meta"), eq(adAccounts.createdById, userId))),
    can.runAds(userRole) ? getWhatsAppStatus() : Promise.resolve(null),
    getGoogleConnectionStatus(userId),
    db.select({ accountId: adAccounts.accountId }).from(adAccounts).where(and(eq(adAccounts.platform, "google"), eq(adAccounts.createdById, userId))),
    getSheetsStatus(),
    can.runAds(userRole) ? getTelegramStatus() : Promise.resolve(null),
  ]);
  const googleLabels = { none: "Belum terhubung", configured: "Belum dites", ok: "Tes berhasil", error: "Perlu diperiksa", disabled: "Dinonaktifkan" };
  const services = [
    ...(wa ? [{ key: "whatsapp", name: "WhatsApp", description: "Kirim ringkasan laporan ke grup tim.", icon: MessageCircleIcon, color: "bg-success/10 text-success", badge: <Badge variant={!wa.workerAlive ? "warning" : wa.status === "connected" ? "success" : "outline"}>{!wa.workerAlive ? "Layanan offline" : wa.status === "connected" ? "Terhubung" : wa.wantConnected ? "Menghubungkan" : "Belum terhubung"}</Badge>, detail: "Koneksi pribadi" }] : []),
    { key: "meta-ads", name: "Meta Ads", description: "Campaign, creative, dan metrik iklan.", icon: MegaphoneIcon, color: "bg-info/10 text-info", badge: <MetaStatusBadge status={metaStatus} />, detail: `${metaAccounts.length} akun iklan terdaftar` },
    { key: "google-ads", name: "Google Ads", description: "Campaign dan metrik akun Google.", icon: PlugIcon, color: "bg-warning/10 text-warning", badge: <Badge variant={googleStatus.state === "ok" ? "success" : googleStatus.state === "error" ? "warning" : "outline"}>{googleLabels[googleStatus.state]}</Badge>, detail: `${googleAccounts.length} akun iklan terdaftar` },
  ];
  services.push({ key: "google-sheets", name: "Google Sheets", description: "Laporan advertiser sehari penuh ke spreadsheet.", icon: TableIcon, color: "bg-success/10 text-success", badge: <Badge variant={sheetsStatus.error ? "warning" : sheetsStatus.enabled ? "success" : "outline"}>{sheetsStatus.error ? "Perlu diperiksa" : sheetsStatus.enabled ? "Otomatis aktif" : "Belum aktif / dijeda"}</Badge>, detail: `Bersama · ${sheetsStatus.eligible} baris sehari penuh` });
  if (telegram) services.push({ key: "telegram", name: "Telegram", description: "Kirim laporan ke grup melalui bot Telegram.", icon: SendIcon, color: "bg-info/10 text-info", badge: <Badge variant={!telegram.workerAlive ? "warning" : telegram.connected ? "success" : "outline"}>{!telegram.workerAlive ? "Layanan offline" : telegram.connected ? "Terhubung" : "Belum terhubung"}</Badge>, detail: "Integrasi bersama · Supervisor" });
  const selected = services.find((item) => item.key === requestedService) ?? services[0];
  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label="Pilih layanan integrasi" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
        {services.map((service) => (
          <Link key={service.key} href={`/settings?tab=integrasi&service=${service.key}`} scroll={false} aria-current={selected.key === service.key ? "page" : undefined}
            className={cn("group flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected.key === service.key && "border-primary bg-accent/40 ring-1 ring-primary")}>
            <div className="flex items-center justify-between gap-2"><span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", service.color)}><service.icon className="size-5" /></span><ArrowRightIcon className={cn("size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5", selected.key === service.key && "text-foreground")} /></div>
            <div><h3 className="font-semibold">{service.name}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{service.description}</p></div>
            <div className="mt-auto grid justify-items-start gap-2">{service.badge}<span className="text-xs text-muted-foreground">{service.detail}</span></div>
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div><h3 className="font-semibold">Kelola {selected.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{selected.key === "whatsapp" ? "Atur nomor, grup tujuan, dan pengiriman laporan pribadi Anda." : selected.key === "telegram" ? "Satu bot untuk laporan tim. Konfigurasi dikelola supervisor." : selected.key === "google-sheets" ? "Kirim laporan 24 jam. Konfigurasi dan sinkronisasi tim dikelola supervisor." : "Koneksi pribadi Anda. Kredensial ini digunakan untuk akun iklan yang Anda daftarkan."}</p></div>
        {selected.key !== "whatsapp" && selected.key !== "google-sheets" && selected.key !== "telegram" && <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline">Buka Campaigns <ArrowRightIcon className="size-3.5" /></Link>}
      </div>
      {selected.key === "whatsapp" && wa && <div id="whatsapp" className="min-w-0 scroll-mt-4"><WhatsAppCard initial={wa} /></div>}
      {selected.key === "telegram" && telegram && <TelegramCard initial={telegram} canManage={userRole === "supervisor"} />}
      {selected.key === "google-sheets" && <GoogleSheetsCard status={sheetsStatus} canManage={userRole === "supervisor"} />}
      {selected.key === "google-ads" && <div id="google-ads" className="min-w-0 scroll-mt-4"><GoogleConnectionCard status={googleStatus} canManage={can.runAds(userRole)} registeredAccountIds={googleAccounts.map((a) => a.accountId)} guide={<GoogleConnectGuide />} /></div>}
      {selected.key === "meta-ads" && <div id="meta-ads" className="min-w-0 scroll-mt-4"><MetaConnectionCard status={metaStatus} canManage={can.runAds(userRole)} canAddAccounts registeredAccountIds={metaAccounts.map((a) => a.accountId)} /></div>}
    </div>
  );
}
