import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMetaConnectionStatus } from "@/lib/meta-connection";
import { can, ROLE_LABEL } from "@/lib/roles";
import { PageHeader } from "@/components/dashboard/panel";
import { getWhatsAppStatus } from "@/actions/whatsapp";
import { MetaConnectionCard } from "./meta-connection-card";
import { SettingsForms } from "./settings-forms";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const showMeta = can.editCampaigns(user.role);
  const [metaStatus, metaAccounts] = showMeta
    ? await Promise.all([
        getMetaConnectionStatus(),
        db.select({ accountId: adAccounts.accountId }).from(adAccounts).where(eq(adAccounts.platform, "meta")),
      ])
    : [null, []];
  return (
    <>
      <PageHeader
        title="Settings"
        description={
          user.role === "supervisor"
            ? "Koneksi Meta Ads, profil, password dan tampilan."
            : user.role === "advertiser"
              ? "WhatsApp laporan, koneksi Meta Ads, profil, password dan tampilan."
              : "Your profile, password and appearance."
        }
      />
      {user.role === "advertiser" && (
        <div id="whatsapp" className="mb-4 scroll-mt-4">
          <WhatsAppCard initial={await getWhatsAppStatus()} />
        </div>
      )}
      {metaStatus && (
        <div id="meta-ads" className="mb-4 max-w-5xl scroll-mt-4">
          <MetaConnectionCard
            status={metaStatus}
            canManage={user.role === "supervisor"}
            canAddAccounts={can.editCampaigns(user.role)}
            registeredAccountIds={metaAccounts.map((a) => a.accountId)}
          />
        </div>
      )}
      <SettingsForms name={user.name} title={user.title} email={user.email} role={ROLE_LABEL[user.role]} />
    </>
  );
}
