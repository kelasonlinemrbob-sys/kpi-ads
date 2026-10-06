"use client";
import { useActionState, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { acceptInvitationAction } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function InvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, undefined);
  const [show, setShow] = useState(false);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="token" value={token} />
    <div className="grid gap-2"><Label htmlFor="invite-password">Buat password</Label><Input id="invite-password" name="password" type={show ? "text" : "password"} minLength={8} maxLength={72} required autoComplete="new-password" /><p className="text-xs text-muted-foreground">Minimal 8 karakter. Password hanya Anda yang menentukan.</p></div>
    <div className="grid gap-2"><Label htmlFor="invite-confirm">Konfirmasi password</Label><Input id="invite-confirm" name="confirm" type={show ? "text" : "password"} minLength={8} maxLength={72} required autoComplete="new-password" /></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} className="accent-primary" />Tampilkan password</label>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending && <LoaderIcon className="animate-spin" />}Aktifkan akun &amp; bergabung</Button>
    <p className="text-xs text-muted-foreground">Setelah berhasil, login menggunakan email undangan dan password ini.</p>
  </form>;
}
