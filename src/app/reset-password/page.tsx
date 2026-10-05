import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { resetTokenIsUsable } from "@/lib/password-reset";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const usable = await resetTokenIsUsable(db, token);
  return <AuthCard title="Reset password" description={usable ? "Buat password baru untuk akun Anda. Setelah berhasil, silakan login kembali." : "Tautan tidak valid, sudah dipakai, atau sudah kedaluwarsa."}>
    {usable ? <ResetPasswordForm token={token} /> : <Button asChild className="w-full"><Link href="/forgot-password">Minta tautan baru</Link></Button>}
  </AuthCard>;
}
