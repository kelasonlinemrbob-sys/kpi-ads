import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { PageHeader } from "@/components/dashboard/panel";
import { getWhatsAppStatus } from "@/actions/whatsapp";
import { SettingsForms } from "./settings-forms";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Settings" description={user.role === "advertiser" ? "WhatsApp laporan, profil, password dan tampilan." : "Your profile, password and appearance."} />
      {user.role === "advertiser" && (
        <div id="whatsapp" className="mb-4 scroll-mt-4">
          <WhatsAppCard initial={await getWhatsAppStatus()} />
        </div>
      )}
      <SettingsForms name={user.name} title={user.title} email={user.email} role={ROLE_LABEL[user.role]} />
    </>
  );
}
