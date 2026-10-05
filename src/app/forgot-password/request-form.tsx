"use client";
import { useActionState } from "react";
import { LoaderIcon, MailIcon } from "lucide-react";
import { requestPasswordReset } from "@/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return <form action={action} className="grid gap-3">
    <div className="grid gap-2">
      <Label htmlFor="email">Email akun</Label>
      <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" maxLength={180} required />
    </div>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.ok && <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">{state.message}</p>}
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? <LoaderIcon className="animate-spin" /> : <MailIcon />} {pending ? "Memproses…" : "Kirim tautan reset"}
    </Button>
    <p className="text-xs text-muted-foreground">Tautan berlaku 15 menit dan hanya dapat digunakan sekali.</p>
  </form>;
}
