import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "./request-form";

export const metadata: Metadata = { title: "Lupa password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ForgotPasswordPage() {
  return <AuthCard title="Lupa password?" description="Masukkan email akun KPI Ads Anda. Kami akan mengirim tautan untuk membuat password baru.">
    <ForgotPasswordForm />
  </AuthCard>;
}
