import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { usableInvitation } from "@/lib/member-invitations";
import { ROLE_LABEL } from "@/lib/roles";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { InvitationForm } from "./invitation-form";
export const metadata: Metadata = { title: "Bergabung ke KPI Ads", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const member = await usableInvitation(db, token);
  return <AuthCard title={member ? `Selamat datang, ${member.name}` : "Undangan tidak tersedia"} description={member ? "Buat password Anda sendiri untuk mengaktifkan akun KPI Ads." : "Tautan tidak valid, sudah digunakan, dibatalkan, atau kedaluwarsa. Minta supervisor mengirim undangan baru."}>
    {member ? <><div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm"><p className="break-all font-medium">{member.email}</p><p className="mt-1 text-xs text-muted-foreground">{ROLE_LABEL[member.role]} · Role dan target KPI dikelola supervisor.</p></div><InvitationForm token={token} /></> : <Button asChild className="w-full"><Link href="/login">Kembali ke login</Link></Button>}
  </AuthCard>;
}
