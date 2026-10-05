import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const resetDone = (await searchParams).reset === "success";
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-sidebar px-4 py-10">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <Logo />
        </div>
        <div className="hatched rounded-xl border p-1">
          <div className="px-4 pt-3 pb-3">
            <h1 className="text-lg font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to monitor your team&apos;s KPI.</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-xs">
            {resetDone && <p role="status" className="mb-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">Password berhasil diganti. Silakan login dengan password baru.</p>}
            <LoginForm />
          </div>
        </div>
        {(process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true") && <DemoAccounts />}
      </div>
    </main>
  );
}

function DemoAccounts() {
  const accounts = [
    ["Supervisor", "supervisor@kpi.local"],
    ["Advertiser", "rizky@kpi.local"],
    ["Web Master", "fajar@kpi.local"],
    ["SEO Specialist", "nadia@kpi.local"],
  ];
  return (
    <div className="mt-4 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">Demo accounts · password: password123</p>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {accounts.map(([role, email]) => (
          <li key={email}>
            <span className="text-foreground">{role}</span> — {email}
          </li>
        ))}
      </ul>
    </div>
  );
}
