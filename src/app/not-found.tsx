import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold tracking-tight">404</p>
      <p className="text-muted-foreground">This page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
