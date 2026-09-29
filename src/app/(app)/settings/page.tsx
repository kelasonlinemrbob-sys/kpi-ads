import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ClipboardClockIcon, KeyRoundIcon, PaletteIcon, PlugIcon, UserIcon, type LucideIcon } from "lucide-react";
import { db } from "@/db";
import { adAccounts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { roleSlots } from "@/lib/member-roles";
import { getMetaConnectionStatus } from "@/lib/meta-connection";
import { getReportRules } from "@/lib/report-rules";
import { can, ROLE_LABEL, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/panel";
import { getWhatsAppStatus } from "@/actions/whatsapp";
import { HashToTab } from "./hash-to-tab";
import { MetaConnectionCard } from "./meta-connection-card";
import { AppearanceSection, ProfileSection, ReportRulesSection, SecuritySection } from "./settings-sections";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Settings" };

type Tab = { key: string; label: string; icon: LucideIcon; description: string };

const formatDateTime = (d: Date | null) =>
  d ? d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab: requested } = await searchParams;
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
            description: user.role === "advertiser" ? "WhatsApp laporan dan koneksi Meta Ads." : "Koneksi Meta Ads untuk Generate & Sinkron dari Ads.",
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
              title={user.title}
              email={user.email}
              roles={roleSlots(user).map((slot, i) =>
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
          {active.key === "integrasi" && <Integrations userRole={user.role} />}
          {active.key === "aturan" && <ReportRulesSection {...await getReportRules()} />}
        </section>
      </div>
    </>
  );
}

async function Integrations({ userRole }: { userRole: string }) {
  const [metaStatus, metaAccounts, wa] = await Promise.all([
    getMetaConnectionStatus(),
    db.select({ accountId: adAccounts.accountId }).from(adAccounts).where(eq(adAccounts.platform, "meta")),
    userRole === "advertiser" ? getWhatsAppStatus() : Promise.resolve(null),
  ]);
  return (
    <>
      {wa && (
        <div id="whatsapp" className="scroll-mt-4">
          <WhatsAppCard initial={wa} />
        </div>
      )}
      <div id="meta-ads" className="scroll-mt-4">
        <MetaConnectionCard
          status={metaStatus}
          canManage={userRole === "supervisor"}
          canAddAccounts
          registeredAccountIds={metaAccounts.map((a) => a.accountId)}
        />
      </div>
    </>
  );
}
