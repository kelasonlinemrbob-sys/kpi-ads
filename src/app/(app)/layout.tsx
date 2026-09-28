import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = await getNotifications(user);
  return (
    <Suspense>
      <AppShell user={{ id: user.id, name: user.name, email: user.email, role: user.role }} counts={counts}>
        {children}
      </AppShell>
    </Suspense>
  );
}
