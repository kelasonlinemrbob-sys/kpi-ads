"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { AdvertiserLevel, KpiMetric, Role } from "@/db/schema";
import { saveMember } from "@/actions/team";
import { useRouter } from "next/navigation";
import { MemberTargetFields } from "@/components/member-target-fields";
import { DEFAULT_SECONDARY_SHARE } from "@/lib/member-roles";
import { ADVERTISER_LEVEL_LABEL, ROLES, ROLE_LABEL } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type EditableMember = {
  id: number;
  name: string;
  avatarId?: number | null;
  email: string;
  role: Role;
  advertiserLevel: AdvertiserLevel | null;
  secondaryRole: Role | null;
  secondaryShare: number;
  title: string | null;
  csoPhone?: string | null;
  isActive: boolean;
  invitationPending: boolean;
  isSelf?: boolean;
  targets?: Record<number, number>;
};

export function MemberDialog({ member, onClose, metrics, period }: { member?: EditableMember; onClose?: () => void; metrics: KpiMetric[]; period: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(!!member);
  const [state, action, pending] = useActionState(saveMember, undefined);
  const [role, setRole] = React.useState<Role>(member?.role ?? "advertiser");
  const [secondRole, setSecondRole] = React.useState<string>(member?.secondaryRole ?? "none");
  const [secondShare, setSecondShare] = React.useState(member?.secondaryShare ?? DEFAULT_SECONDARY_SHARE);
  // The second role can't be the main role, a supervisor, or the advertiser role (ads features follow the main role).
  const secondOptions = ROLES.filter((r) => r !== "supervisor" && r !== "advertiser" && r !== "cso" && r !== role);
  const second = role !== "cso" && role !== "supervisor" && secondOptions.includes(secondRole as Role) ? (secondRole as Role) : null;
  const change = (o: boolean) => {
    setOpen(o);
    if (!o) onClose?.();
  };

  React.useEffect(() => {
    if (state?.ok) {
      if (state.warning) toast.warning(state.warning);
      else toast.success(state.message);
      change(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={change}>
      {!member && (
        <DialogTrigger asChild>
          <Button className="h-8">
            <UserPlusIcon /> Undang anggota
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Undang anggota"}</DialogTitle>
          <DialogDescription>
            {!member ? "Undangan dikirim lewat email dan berlaku 72 jam. Anggota membuat password sendiri sebelum dapat login." : member.invitationPending ? "Anggota belum bergabung. Mengubah email akan mengirim undangan baru dan membatalkan tautan lama." : "Kosongkan password untuk mempertahankan password saat ini."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {member && <input type="hidden" name="id" value={member.id} />}
          {member?.invitationPending && <input type="hidden" name="editingInvitation" value="on" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="m-name">Full name</Label>
              <Input id="m-name" name="name" defaultValue={member?.name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-email">Email</Label>
              <Input id="m-email" name="email" type="email" defaultValue={member?.email} required />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select name="role" value={role} onValueChange={(v) => setRole(v as Role)} disabled={member?.isSelf}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {member?.isSelf && <input type="hidden" name="role" value={member.role} />}
            </div>
            {role === "advertiser" && (
              <div className="grid gap-2">
                <Label>Level advertiser</Label>
                <Select name="advertiserLevel" defaultValue={member?.advertiserLevel ?? "junior"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ADVERTISER_LEVEL_LABEL) as AdvertiserLevel[]).map((level) => (
                      <SelectItem key={level} value={level}>
                        {ADVERTISER_LEVEL_LABEL[level]}
                        {level === "senior" && " — ikut penilaian kinerja"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {role !== "supervisor" && role !== "cso" && (
              <div className="grid gap-2">
                <Label>Role kedua (rangkap)</Label>
                <Select name="secondaryRole" value={second ?? "none"} onValueChange={setSecondRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ada</SelectItem>
                    {secondOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {second && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="m-share">Porsi skor KPI</Label>
                <div className="flex items-center gap-3">
                  <span className="w-40 text-sm">
                    {ROLE_LABEL[role]} <span className="font-medium tabular-nums">{100 - secondShare}%</span>
                  </span>
                  <input
                    id="m-share"
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={100 - secondShare}
                    onChange={(e) => setSecondShare(100 - Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer accent-foreground"
                    aria-label={`Porsi ${ROLE_LABEL[role]}`}
                  />
                  <span className="w-40 text-right text-sm">
                    {ROLE_LABEL[second]} <span className="font-medium tabular-nums">{secondShare}%</span>
                  </span>
                </div>
                <input type="hidden" name="secondaryShare" value={secondShare} />
                <p className="text-xs text-muted-foreground">
                  Skor KPI total = {100 - secondShare}% skor {ROLE_LABEL[role]} + {secondShare}% skor {ROLE_LABEL[second]}. Target default
                  (total bulanan) ikut diprorata sesuai porsi; target pribadi di bawah berlaku apa adanya.
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="m-title">Job title</Label>
              <Input id="m-title" name="title" placeholder="e.g. Meta Ads Specialist" defaultValue={member?.title ?? ""} />
            </div>
          </div>
          {member && !member.invitationPending && <div className="grid gap-2">
            <Label htmlFor="m-password">{member ? "New password" : "Password"}</Label>
            <Input id="m-password" name="password" type="password" minLength={8} autoComplete="new-password" required={!member} />
          </div>}
          {member && !member.invitationPending && (member.isSelf ? (
            <input type="hidden" name="isActive" value="on" />
          ) : (
            <Label className="font-normal">
              <Checkbox name="isActive" defaultChecked={member.isActive} value="on" /> Active — can sign in and appears in KPI
            </Label>
          ))}
          {role === "cso" && <div className="grid gap-2"><Label htmlFor="m-cso">Nomor WhatsApp CSO</Label><Input id="m-cso" name="csoPhone" defaultValue={member?.csoPhone ?? ""} placeholder="6281234567890" required /><p className="text-xs text-muted-foreground">Tujuan pengalihan customer dari form order.</p></div>}
          <MemberTargetFields key={`${role}-${second}-${secondShare}-${period}`} metrics={metrics} member={{ role, secondaryRole: second, secondaryShare: secondShare }} targets={member?.targets} period={period} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderIcon className="animate-spin" />}
              {member ? "Simpan perubahan" : "Kirim undangan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
