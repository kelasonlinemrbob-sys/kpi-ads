import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="relative flex min-h-dvh items-center justify-center bg-sidebar px-4 py-10">
    <ThemeToggle className="absolute top-4 right-4" />
    <div className="w-full max-w-md">
      <div className="mb-5 flex justify-center"><Logo /></div>
      <div className="hatched rounded-xl border p-1">
        <div className="px-4 pt-3 pb-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-xs">{children}</div>
      </div>
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Kembali ke login</Link></p>
    </div>
  </main>;
}
