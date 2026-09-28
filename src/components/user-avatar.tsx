import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-[oklch(0.93_0.03_250)] text-[oklch(0.4_0.1_250)]",
  "bg-[oklch(0.93_0.04_160)] text-[oklch(0.4_0.09_160)]",
  "bg-[oklch(0.93_0.04_60)] text-[oklch(0.45_0.1_60)]",
  "bg-[oklch(0.93_0.04_320)] text-[oklch(0.42_0.12_320)]",
  "bg-[oklch(0.93_0.03_200)] text-[oklch(0.4_0.08_200)]",
];

export function UserAvatar({ name, online, className }: { name: string; online?: boolean; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className="relative inline-flex">
      <Avatar className={cn("size-8 border", className)}>
        <AvatarFallback className={cn("text-xs font-semibold", tone)}>{initials(name)}</AvatarFallback>
      </Avatar>
      {online && <span className="absolute -bottom-0.5 left-0 size-2.5 rounded-full border-2 border-card bg-success" />}
    </span>
  );
}
