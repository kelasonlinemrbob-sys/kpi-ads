import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { PageHeader } from "@/components/dashboard/panel";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password and appearance." />
      <SettingsForms name={user.name} title={user.title} email={user.email} role={ROLE_LABEL[user.role]} />
    </>
  );
}
