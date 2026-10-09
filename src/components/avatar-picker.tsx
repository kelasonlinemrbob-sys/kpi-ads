"use client";

import { CheckIcon } from "lucide-react";
import { AVATAR_IDS } from "@/lib/avatar-ids";
import { UserAvatar } from "@/components/user-avatar";

export function AvatarPicker({ name, value, onChange, disabled }: { name: string; value: number | null; onChange: (value: number | null) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-0 rounded-xl border p-4">
    <legend className="px-1 text-sm font-medium">Foto profil</legend>
    <div className="mb-4 flex items-center gap-3"><UserAvatar name={name} avatarId={value} className="size-16" /><div><p className="text-sm font-medium">{value ? `Avatar ${value}` : "Gunakan inisial"}</p><p className="mt-1 text-xs text-muted-foreground">Pilih salah satu dari 48 avatar, lalu klik Simpan profil.</p></div></div>
    <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 overflow-y-auto p-1" role="group" aria-label="Koleksi avatar profil">
      {[null, ...AVATAR_IDS].map((id) => <label key={id ?? "initials"} className="relative cursor-pointer">
        <input className="peer sr-only" type="radio" name="avatarId" value={id ?? ""} checked={id === value} onChange={() => onChange(id)} aria-label={id ? `Avatar ${id}` : "Gunakan inisial"} />
        <span className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-2 transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-wait peer-disabled:opacity-60"><UserAvatar name={id ? `pilihan ${id}` : name} avatarId={id} className="size-11" /><span className="text-[10px] text-muted-foreground">{id ?? "Inisial"}</span></span>
        {id === value && <CheckIcon className="pointer-events-none absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden="true" />}
      </label>)}
    </div>
  </fieldset>;
}
