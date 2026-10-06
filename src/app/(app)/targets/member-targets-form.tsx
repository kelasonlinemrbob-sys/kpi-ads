"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import type { KpiMetric } from "@/db/schema";
import type { RoleHolder } from "@/lib/member-roles";
import { saveMemberTargets } from "@/actions/team";
import { MemberTargetFields } from "@/components/member-target-fields";
import { Button } from "@/components/ui/button";

export function MemberTargetsForm({ member, metrics, targets, period }: { member: RoleHolder & { id: number; name: string }; metrics: KpiMetric[]; targets: Record<number, number>; period: string }) {
  const [state, action, pending] = useActionState(saveMemberTargets, undefined);
  const router = useRouter();
  useEffect(() => { if (state?.ok) { toast.success(state.message); router.refresh(); } }, [state, router]);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="userId" value={member.id} />
    <MemberTargetFields metrics={metrics} member={member} targets={targets} period={period} />
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.ok && <p role="status" className="text-sm text-success">{state.message}</p>}
    <div className="flex justify-end"><Button disabled={pending}>{pending ? <LoaderIcon className="animate-spin" /> : <SaveIcon />}Simpan target {member.name}</Button></div>
  </form>;
}
