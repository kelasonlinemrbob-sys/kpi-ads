"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRoundIcon, LoaderIcon, MoonIcon, PaletteIcon, SunIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { changePassword, updateProfile } from "@/actions/settings";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";
import { useTheme } from "@/components/theme-provider";

function useToast(state: FormState, onOk?: () => void) {
  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function SettingsForms({ name, title, email, role }: { name: string; title: string | null; email: string; role: string }) {
  const [profile, profileAction, profilePending] = useActionState(updateProfile, undefined);
  const [pw, pwAction, pwPending] = useActionState(changePassword, undefined);
  const pwForm = React.useRef<HTMLFormElement>(null);
  const { dark, toggle } = useTheme();
  useToast(profile);
  useToast(pw, () => pwForm.current?.reset());

  return (
    <div className="grid max-w-5xl gap-3 lg:grid-cols-2">
      <Panel title="Profile" icon={UserIcon} bodyClassName="p-4">
        <form action={profileAction} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Full name</Label>
            <Input id="s-name" name="name" defaultValue={name} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-title">Job title</Label>
            <Input id="s-title" name="title" defaultValue={title ?? ""} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={email} disabled readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Input value={role} disabled readOnly />
            </div>
          </div>
          {profile?.error && <p className="text-sm text-destructive">{profile.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={profilePending}>
            {profilePending && <LoaderIcon className="animate-spin" />} Save profile
          </Button>
        </form>
      </Panel>

      <Panel title="Password" icon={KeyRoundIcon} bodyClassName="p-4">
        <form ref={pwForm} action={pwAction} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="s-current">Current password</Label>
            <Input id="s-current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="s-next">New password</Label>
              <Input id="s-next" name="next" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-confirm">Confirm</Label>
              <Input id="s-confirm" name="confirm" type="password" autoComplete="new-password" required />
            </div>
          </div>
          {pw?.error && <p className="text-sm text-destructive">{pw.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={pwPending}>
            {pwPending && <LoaderIcon className="animate-spin" />} Change password
          </Button>
        </form>
      </Panel>

      <Panel title="Appearance" icon={PaletteIcon} bodyClassName="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">{dark ? "Dark mode" : "Light mode"}</p>
          <p className="text-sm text-muted-foreground">Saved on this device.</p>
        </div>
        <Button variant="outline" onClick={toggle}>
          {dark ? <SunIcon /> : <MoonIcon />} Switch to {dark ? "light" : "dark"}
        </Button>
      </Panel>
    </div>
  );
}
