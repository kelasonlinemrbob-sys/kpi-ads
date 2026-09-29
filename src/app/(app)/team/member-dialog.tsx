"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { AdvertiserLevel, Role } from "@/db/schema";
import { saveMember } from "@/actions/team";
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
  email: string;
  role: Role;
  advertiserLevel: AdvertiserLevel | null;
  title: string | null;
  isActive: boolean;
  isSelf?: boolean;
};

export function MemberDialog({ member, onClose }: { member?: EditableMember; onClose?: () => void }) {
  const [open, setOpen] = React.useState(!!member);
  const [state, action, pending] = useActionState(saveMember, undefined);
  const [role, setRole] = React.useState<Role>(member?.role ?? "advertiser");
  const change = (o: boolean) => {
    setOpen(o);
    if (!o) onClose?.();
  };

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      change(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={change}>
      {!member && (
        <DialogTrigger asChild>
          <Button className="h-8">
            <UserPlusIcon /> Add member
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add team member"}</DialogTitle>
          <DialogDescription>
            {member ? "Leave the password empty to keep the current one." : "They can sign in right away with this email and password."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {member && <input type="hidden" name="id" value={member.id} />}
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
            <div className="grid gap-2">
              <Label htmlFor="m-title">Job title</Label>
              <Input id="m-title" name="title" placeholder="e.g. Meta Ads Specialist" defaultValue={member?.title ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="m-password">{member ? "New password" : "Password"}</Label>
            <Input id="m-password" name="password" type="password" minLength={8} autoComplete="new-password" required={!member} />
          </div>
          {member?.isSelf ? (
            <input type="hidden" name="isActive" value="on" />
          ) : (
            <Label className="font-normal">
              <Checkbox name="isActive" defaultChecked={member?.isActive ?? true} value="on" /> Active — can sign in and appears in KPI
            </Label>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderIcon className="animate-spin" />}
              {member ? "Save changes" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
