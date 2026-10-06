"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LaptopIcon,
  LoaderIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { changePassword, saveReportRulesAction, signOutOtherSessions, updateProfile } from "@/actions/settings";
import type { FormState } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/dashboard/panel";
import { useTheme, type ThemeMode } from "@/components/theme-provider";
import { AvatarPicker } from "@/components/avatar-picker";
import { UserAvatar } from "@/components/user-avatar";

function useToast(state: FormState, onOk?: () => void) {
  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

/* ---------------------------------- Profil ---------------------------------- */

export function ProfileSection({
  name,
  avatarId,
  title,
  email,
  roles,
  facts,
}: {
  name: string;
  avatarId: number | null;
  title: string | null;
  email: string;
  /** e.g. ["Advertiser Junior 60%", "SEO Specialist 40%"] */
  roles: string[];
  facts: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const router = useRouter();
  const [selectedAvatar, setSelectedAvatar] = React.useState(avatarId);
  useToast(state, () => router.refresh());

  return (
    <div className="grid gap-3">
      <Panel title="Akun" icon={UserIcon} iconPosition="left">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <UserAvatar name={name} avatarId={avatarId} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <span key={role} className="rounded-md border px-2 py-0.5 text-xs">
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="border-r p-4 last:border-r-0">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Profil" bodyClassName="p-4">
        <form action={action} className="grid gap-4">
          <AvatarPicker name={name} value={selectedAvatar} onChange={setSelectedAvatar} disabled={pending} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="s-name">Nama lengkap</Label>
              <Input id="s-name" name="name" defaultValue={name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-title">Jabatan</Label>
              <Input id="s-title" name="title" defaultValue={title ?? ""} placeholder="mis. Meta Ads Specialist" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Email, role dan level diatur supervisor di Team → Members.</p>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={pending}>
            {pending && <LoaderIcon className="animate-spin" />} Simpan profil
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/* --------------------------------- Keamanan --------------------------------- */

const CHECKS: { label: string; test: (pw: string) => boolean }[] = [
  { label: "Minimal 8 karakter", test: (pw) => pw.length >= 8 },
  { label: "Huruf besar & kecil", test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: "Angka", test: (pw) => /\d/.test(pw) },
  { label: "Simbol", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];
/** Index = number of filled bars (1–5). */
const STRENGTH = ["", "Terlalu lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];

export function SecuritySection() {
  const router = useRouter();
  const [state, action, pending] = useActionState(changePassword, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [show, setShow] = React.useState(false);
  const [next, setNext] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");
  const [signingOut, startSignOut] = React.useTransition();
  useToast(state, () => {
    formRef.current?.reset();
    setNext("");
    setConfirmPw("");
  });

  const passed = CHECKS.filter((c) => c.test(next)).length;
  // Length matters most: under 8 characters is never more than "weak".
  const strength = next ? Math.max(1, next.length < 8 ? 1 : Math.min(5, passed + (next.length >= 12 ? 1 : 0))) : 0;
  const type = show ? "text" : "password";

  return (
    <div className="grid gap-3">
      <Panel
        title="Ganti password"
        icon={KeyRoundIcon}
        iconPosition="left"
        bodyClassName="p-4"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? <EyeOffIcon /> : <EyeIcon />} {show ? "Sembunyikan" : "Tampilkan"}
          </Button>
        }
      >
        <form ref={formRef} action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-current">Password saat ini</Label>
            <Input id="s-current" name="current" type={type} autoComplete="current-password" required className="sm:max-w-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="s-next">Password baru</Label>
              <Input
                id="s-next"
                name="next"
                type={type}
                autoComplete="new-password"
                minLength={8}
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-confirm">Ulangi password baru</Label>
              <Input
                id="s-confirm"
                name="confirm"
                type={type}
                autoComplete="new-password"
                required
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                aria-invalid={confirmPw.length > 0 && confirmPw !== next}
              />
            </div>
          </div>

          {next && (
            <div className="grid gap-2">
              <div className="flex items-center gap-3">
                <div className="grid flex-1 grid-cols-5 gap-1" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={cn("h-1 rounded-full", i < strength ? "bg-foreground" : "bg-muted")} />
                  ))}
                </div>
                <span className="w-24 text-right text-xs font-medium">{STRENGTH[strength]}</span>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {CHECKS.map((c) => {
                  const ok = c.test(next);
                  return (
                    <li key={c.label} className={cn("inline-flex items-center gap-1", ok ? "text-foreground" : "text-muted-foreground")}>
                      {ok ? <CheckIcon className="size-3" /> : <span className="size-3 text-center leading-3">·</span>}
                      {c.label}
                    </li>
                  );
                })}
                {confirmPw && (
                  <li className={cn("inline-flex items-center gap-1", confirmPw === next ? "text-foreground" : "text-destructive")}>
                    {confirmPw === next ? <CheckIcon className="size-3" /> : null}
                    {confirmPw === next ? "Konfirmasi cocok" : "Konfirmasi belum sama"}
                  </li>
                )}
              </ul>
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || next.length < 8 || confirmPw !== next}>
              {pending && <LoaderIcon className="animate-spin" />} Ganti password
            </Button>
            <span className="text-xs text-muted-foreground">Setelah diganti, semua perangkat lain otomatis keluar.</span>
          </div>
        </form>
      </Panel>

      <Panel title="Sesi login" icon={LaptopIcon} iconPosition="left" bodyClassName="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">Keluar dari semua perangkat lain</p>
          <p className="text-muted-foreground">
            Pakai ini kalau pernah login di komputer bersama atau HP yang hilang. Perangkat ini tetap masuk. Sesi login berlaku 7 hari.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={signingOut}
          onClick={() => {
            if (!window.confirm("Keluarkan akun ini dari semua perangkat lain?")) return;
            startSignOut(async () => {
              await signOutOtherSessions();
              toast.success("Perangkat lain sudah dikeluarkan");
              router.refresh();
            });
          }}
        >
          {signingOut ? <LoaderIcon className="animate-spin" /> : <LogOutIcon />} Keluarkan perangkat lain
        </Button>
      </Panel>
    </div>
  );
}

/* --------------------------------- Tampilan --------------------------------- */

const MODES: { value: ThemeMode; label: string; icon: typeof SunIcon; hint: string }[] = [
  { value: "light", label: "Terang", icon: SunIcon, hint: "Latar putih" },
  { value: "dark", label: "Gelap", icon: MoonIcon, hint: "Nyaman di malam hari" },
  { value: "system", label: "Ikuti sistem", icon: MonitorIcon, hint: "Sesuai pengaturan perangkat" },
];

export function AppearanceSection() {
  const { mode, setMode } = useTheme();
  return (
    <Panel title="Tema" bodyClassName="p-4">
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema">
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.value)}
              className={cn(
                "grid gap-3 rounded-xl border p-3 text-left transition-colors",
                active ? "border-foreground ring-1 ring-foreground" : "hover:bg-accent",
              )}
            >
              <ThemePreview mode={m.value} />
              <span className="flex items-center gap-2 text-sm font-medium">
                <m.icon className="size-4" /> {m.label}
                {active && <CheckIcon className="ml-auto size-4" />}
              </span>
              <span className="-mt-2 text-xs text-muted-foreground">{m.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Disimpan di perangkat ini.</p>
    </Panel>
  );
}

/** Tiny black & white mock of the app in that theme. */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const pane = (dark: boolean) => (
    <span className={cn("flex h-full flex-1 gap-1.5 p-2", dark ? "bg-neutral-900" : "bg-white")}>
      <span className={cn("w-1/4 rounded-sm", dark ? "bg-neutral-800" : "bg-neutral-100")} />
      <span className="grid flex-1 content-start gap-1">
        <span className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-neutral-200" : "bg-neutral-800")} />
        <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-neutral-600" : "bg-neutral-300")} />
        <span className={cn("mt-1 h-5 rounded-sm", dark ? "bg-neutral-800" : "bg-neutral-100")} />
      </span>
    </span>
  );
  return (
    <span className="flex h-20 overflow-hidden rounded-lg border">
      {mode === "system" ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === "dark")
      )}
    </span>
  );
}

/* ------------------------------ Aturan laporan ------------------------------ */

export function ReportRulesSection({ cutoff, backfillDays }: { cutoff: string; backfillDays: number }) {
  const [state, action, pending] = useActionState(saveReportRulesAction, undefined);
  const [time, setTime] = React.useState(cutoff);
  const [days, setDays] = React.useState(String(backfillDays));
  useToast(state);
  const label = time.replace(":", ".");

  return (
    <Panel title="Aturan laporan harian" icon={ClockIcon} iconPosition="left" bodyClassName="p-4">
      <form action={action} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="r-cutoff">Jam batas laporan advertiser (WIB)</Label>
            <Input id="r-cutoff" name="cutoff" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="w-36" />
            <p className="text-xs text-muted-foreground">
              Deadline kirim laporan Senin–Jumat dan akhir periode &ldquo;hari ini&rdquo; (00.00–{label}).
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="r-backfill">Batas isi / edit mundur</Label>
            <div className="flex items-center gap-2">
              <Input
                id="r-backfill"
                name="backfillDays"
                type="number"
                min={1}
                max={31}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">hari</span>
            </div>
            <p className="text-xs text-muted-foreground">Laporan yang lebih lama dari ini tidak bisa diisi atau diubah lagi.</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-xs text-muted-foreground">Yang akan dilihat tim</p>
          <p>
            Advertiser wajib mengirim laporan Senin–Jumat sebelum <span className="font-medium">{label} WIB</span> (hasil kemarin penuh +
            hari ini s/d {label}). Semua anggota bisa mengisi laporan yang terlewat sampai{" "}
            <span className="font-medium">{days || "–"} hari</span> ke belakang.
          </p>
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="justify-self-start" disabled={pending}>
          {pending && <LoaderIcon className="animate-spin" />} Simpan aturan
        </Button>
      </form>
    </Panel>
  );
}
