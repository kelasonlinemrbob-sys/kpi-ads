"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { resetPassword } from "@/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const [show, setShow] = useState(false);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="token" value={token} />
    <div className="grid gap-2">
      <Label htmlFor="password">Password baru</Label>
      <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required />
      <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
    </div>
    <div className="grid gap-2">
      <Label htmlFor="confirm">Konfirmasi password baru</Label>
      <Input id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required />
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-primary" />Tampilkan password</label>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error} <Link href="/forgot-password" className="underline">Minta tautan baru</Link></p>}
    <Button type="submit" size="lg" disabled={pending}>{pending && <LoaderIcon className="animate-spin" />}Simpan password baru</Button>
    <p className="text-xs text-muted-foreground">Perangkat yang masih login akan dikeluarkan setelah password diganti.</p>
  </form>;
}
