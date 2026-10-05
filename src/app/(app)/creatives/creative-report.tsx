import {
  ClapperboardIcon,
  CoinsIcon,
  EyeIcon,
  ImageIcon,
  MousePointerClickIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { AdCreative } from "@/db/schema";
import { CREATIVE_FORMAT_LABEL, creativeRates, fmt, formatPlayTime, sumCreatives } from "@/lib/creatives";
import type { CreativePost, CreativeRow } from "@/lib/creatives-data";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/dashboard/panel";

type Person = { id: number; name: string; creative: boolean };

/** "Ringkasan": the creative report — headline numbers, best contents, output per week, format, team and product. */
export function CreativeReport({
  rows,
  posts,
  people,
  rank,
}: {
  rows: CreativeRow[];
  posts: CreativePost[];
  people: Person[];
  rank: "impressions" | "ctr" | "hook" | "cpl";
}) {
  const total = sumCreatives(rows);
  const rates = creativeRates(total);
  const winning = posts.filter((p) => p.label === "winning").length;
  const active = posts.filter((p) => p.status === "active").length;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Tile icon={ClapperboardIcon} label="Konten" value={fmt.num(posts.length)} hint={`${fmt.num(rows.length)} iklan · ${fmt.num(active)} aktif`} />
        <Tile icon={TrophyIcon} label="Winning" value={fmt.num(winning)} hint={posts.length ? `${fmt.pct((winning / posts.length) * 100)} dari konten` : "–"} />
        <Tile icon={CoinsIcon} label="Spend" value={fmt.rpCompact(total.spend)} hint={`CPM ${fmt.rp(rates.cpm)}`} />
        <Tile icon={EyeIcon} label="Impression" value={fmt.compact(total.impressions)} hint={`Jumlah reach iklan ${fmt.compact(total.reach)}`} />
        <Tile icon={MousePointerClickIcon} label="CTR" value={fmt.pct(rates.ctr)} hint={`${fmt.num(total.clicks)} klik link`} />
        <Tile icon={TargetIcon} label="CPL" value={fmt.rp(rates.cpl)} hint={`${fmt.num(total.leads)} lead`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TopContents posts={posts} people={people} rank={rank} />
        <div className="grid content-start gap-3">
          <VideoFunnel total={total} />
          <WeeklyOutput posts={posts} />
        </div>
      </div>

      <ByFormat posts={posts} />
      <TeamBoard posts={posts} people={people} />
      <ByProduct posts={posts} />
    </div>
  );
}

function Tile({ icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <Panel title={label} icon={icon}>
      <div className="px-4 py-3">
        <p className="text-2xl leading-tight font-semibold tracking-tight">{value}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </Panel>
  );
}

const RANK_LABEL = { impressions: "impression", ctr: "CTR", hook: "hook rate", cpl: "CPL termurah" } as const;
/** Rates on a handful of impressions are noise; only rank contents that ran a bit. */
const MIN_IMPRESSIONS_FOR_RATES = 1_000;

function TopContents({ posts, people, rank }: { posts: CreativePost[]; people: Person[]; rank: keyof typeof RANK_LABEL }) {
  const nameOf = (id: number | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
  const scored = posts
    .filter((p) => rank === "impressions" || p.impressions >= MIN_IMPRESSIONS_FOR_RATES)
    .map((p) => ({ post: p, rates: creativeRates(sumCreatives([p])) }))
    .filter(({ post, rates }) => (rank === "hook" ? post.format === "video" && rates.hook !== null : rank === "cpl" ? rates.cpl !== null : true))
    .sort((a, b) =>
      rank === "ctr"
        ? (b.rates.ctr ?? 0) - (a.rates.ctr ?? 0)
        : rank === "hook"
          ? (b.rates.hook ?? 0) - (a.rates.hook ?? 0)
          : rank === "cpl"
            ? a.rates.cpl! - b.rates.cpl!
            : b.post.impressions - a.post.impressions,
    )
    .slice(0, 6);
  const metric = (p: CreativePost, r: ReturnType<typeof creativeRates>) =>
    rank === "ctr" ? fmt.pct(r.ctr) : rank === "hook" ? fmt.pct(r.hook) : rank === "cpl" ? fmt.rp(r.cpl) : fmt.compact(p.impressions);

  return (
    <Panel title={`Konten terbaik · ${RANK_LABEL[rank]}`} icon={TrophyIcon} iconPosition="left">
      {scored.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada konten dengan data cukup.</p>
      ) : (
        <ol className="divide-y">
          {scored.map(({ post, rates }, i) => (
            <li key={post.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-4 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <Thumb url={post.thumbnailUrl} format={post.format} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {post.permalink ? (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="truncate hover:underline">
                      {post.product ?? post.ads[0]!.adName}
                    </a>
                  ) : (
                    <span className="truncate">{post.product ?? post.ads[0]!.adName}</span>
                  )}
                  {post.label === "winning" && <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] text-background">Winning</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {CREATIVE_FORMAT_LABEL[post.format]} · {post.adType}
                  {nameOf(post.creatorId) && ` · ${nameOf(post.creatorId)}`}
                  {post.ads.length > 1 && ` · ${post.ads.length} iklan`}
                </p>
              </div>
              <div className="hidden gap-4 text-right text-xs text-muted-foreground tabular-nums sm:flex">
                <span>
                  <span className="block text-foreground">{fmt.compact(post.impressions)}</span>impr
                </span>
                <span>
                  <span className="block text-foreground">{fmt.pct(rates.ctr)}</span>CTR
                </span>
                <span>
                  <span className="block text-foreground">{fmt.rp(rates.cpl)}</span>CPL
                </span>
              </div>
              <span className="w-20 text-right text-base font-semibold tabular-nums">{metric(post, rates)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function Thumb({ url, format, className }: { url: string | null; format: AdCreative["format"]; className?: string }) {
  return (
    <span className={cn("relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
      {format === "video" && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-foreground/80 px-1 text-[9px] leading-3.5 text-background">▶</span>
      )}
    </span>
  );
}

/** Video attention funnel: impressions → 3s views → ThruPlays, as shrinking bars. */
function VideoFunnel({ total }: { total: ReturnType<typeof sumCreatives> }) {
  const rates = creativeRates(total);
  const steps = [
    { label: "Impression video", value: total.videoImpressions, note: "" },
    { label: "Tonton 3 detik", value: total.videoViews, note: `Hook rate ${fmt.pct(rates.hook)}` },
    { label: "ThruPlay", value: total.thruplays, note: `Hold rate ${fmt.pct(rates.hold)}` },
  ];
  const max = Math.max(1, total.videoImpressions);
  return (
    <Panel title="Funnel video" icon={ZapIcon} iconPosition="left" bodyClassName="grid gap-3 p-4">
      {total.videoImpressions === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Belum ada iklan video.</p>
      ) : (
        <>
          {steps.map((s) => (
            <div key={s.label} className="grid gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.label}</span>
                <span className="tabular-nums">
                  <span className="font-medium">{fmt.compact(s.value)}</span>
                  {s.note && <span className="ml-2 text-xs text-muted-foreground">{s.note}</span>}
                </span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.max(1, (s.value / max) * 100)}%` }} />
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Rata-rata ditonton {total.avgPlayTime === null ? "–" : `${formatPlayTime(total.avgPlayTime)} detik`}. Hook rate = 3 detik ÷
            impression; hold rate = ThruPlay ÷ 3 detik.
          </p>
        </>
      )}
    </Panel>
  );
}

/** New contents per week (by the first ad's creation date), last 8 weeks; the current week in ink. */
function WeeklyOutput({ posts }: { posts: CreativePost[] }) {
  const monday = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const thisWeek = monday(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (7 - i) * 7);
    return start;
  });
  const counts = weeks.map((start) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const inWeek = posts.filter((p) => p.adCreatedAt && new Date(p.adCreatedAt) >= start && new Date(p.adCreatedAt) < end);
    return { start, total: inWeek.length, winning: inWeek.filter((p) => p.label === "winning").length };
  });
  const max = Math.max(1, ...counts.map((c) => c.total));
  const label = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });

  return (
    <Panel title="Konten baru per minggu" icon={ClapperboardIcon} iconPosition="left" bodyClassName="p-4">
      <div className="flex h-28 items-end gap-2">
        {counts.map((c, i) => {
          const current = i === counts.length - 1;
          const text = `Minggu ${label(c.start)}: ${c.total} konten, ${c.winning} winning`;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end" title={text} aria-label={text}>
              {(current || c.total === max) && c.total > 0 && <span className="mb-0.5 text-[11px] font-medium tabular-nums">{c.total}</span>}
              <span
                className="block w-full max-w-6 rounded-t-[4px]"
                style={{ height: c.total ? `${(c.total / max) * 100}%` : 1, backgroundColor: current ? "var(--foreground)" : "var(--bar-hit)" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {counts.map((c, i) => (
          <span key={i} className={cn("flex-1 text-center text-[10px] text-muted-foreground", i === counts.length - 1 && "font-medium text-foreground")}>
            {i % 2 === 1 || i === counts.length - 1 ? label(c.start) : ""}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Minggu ini {counts.at(-1)!.total} konten baru, {counts.at(-1)!.winning} winning.
      </p>
    </Panel>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const td = "px-3 py-2 text-sm";

function RateCells({ posts }: { posts: CreativePost[] }) {
  const r = creativeRates(sumCreatives(posts));
  return (
    <>
      <td className={cn(td, "text-right tabular-nums")}>{fmt.pct(r.ctr)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{fmt.pct(r.hook)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{fmt.pct(r.hold)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{fmt.rp(r.cpl)}</td>
    </>
  );
}

const rateHeads = (
  <>
    <th className={cn(th, "text-right")}>CTR</th>
    <th className={cn(th, "text-right")}>Hook</th>
    <th className={cn(th, "text-right")}>Hold</th>
    <th className={cn(th, "text-right")}>CPL</th>
  </>
);

/** Share bar: a hairline-thin meter of this row's share of the column total. */
function Share({ value, total }: { value: number; total: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </span>
      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{total ? fmt.pct((value / total) * 100) : "–"}</span>
    </span>
  );
}

function ByFormat({ posts }: { posts: CreativePost[] }) {
  const spend = posts.reduce((s, p) => s + p.spend, 0);
  const groups = (Object.keys(CREATIVE_FORMAT_LABEL) as AdCreative["format"][])
    .map((format) => ({ format, posts: posts.filter((p) => p.format === format) }))
    .filter((g) => g.posts.length);
  return (
    <Panel title="Performa per format" icon={ImageIcon} iconPosition="left" bodyClassName="overflow-x-auto p-0">
      <table className="w-full min-w-[760px]">
        <thead className="bg-muted/60">
          <tr>
            <th className={th}>Format</th>
            <th className={cn(th, "text-right")}>Konten</th>
            <th className={cn(th, "text-right")}>Winning</th>
            <th className={th}>Porsi spend</th>
            <th className={cn(th, "text-right")}>Impression</th>
            {rateHeads}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.format} className="border-t">
              <td className={cn(td, "font-medium")}>{CREATIVE_FORMAT_LABEL[g.format]}</td>
              <td className={cn(td, "text-right tabular-nums")}>{fmt.num(g.posts.length)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{fmt.num(g.posts.filter((p) => p.label === "winning").length)}</td>
              <td className={td}>
                <Share value={g.posts.reduce((s, p) => s + p.spend, 0)} total={spend} />
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{fmt.compact(g.posts.reduce((s, p) => s + p.impressions, 0))}</td>
              <RateCells posts={g.posts} />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Creative team leaderboard: contents made (as creator) and edited, winners, and how their contents perform. */
function TeamBoard({ posts, people }: { posts: CreativePost[]; people: Person[] }) {
  const ids = new Set(posts.flatMap((p) => [p.creatorId, p.editorId]).filter((id): id is number => id !== null));
  const rows = [...ids]
    .map((id) => {
      const made = posts.filter((p) => p.creatorId === id);
      const edited = posts.filter((p) => p.editorId === id && p.creatorId !== id);
      const all = [...made, ...edited];
      return {
        id,
        name: people.find((p) => p.id === id)?.name ?? `#${id}`,
        made: made.length,
        edited: edited.length,
        winning: all.filter((p) => p.label === "winning").length,
        all,
      };
    })
    .sort((a, b) => b.winning - a.winning || b.all.length - a.all.length);
  const unassigned = posts.filter((p) => !p.creatorId && !p.editorId).length;

  return (
    <Panel title="Tim creative" icon={UsersIcon} iconPosition="left" bodyClassName="overflow-x-auto p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Isi kolom Creator / Editor di tab Tabel atau Galeri untuk melihat performa tim.</p>
      ) : (
        <table className="w-full min-w-[820px]">
          <thead className="bg-muted/60">
            <tr>
              <th className={th}>Anggota</th>
              <th className={cn(th, "text-right")}>Dibuat</th>
              <th className={cn(th, "text-right")}>Diedit</th>
              <th className={cn(th, "text-right")}>Winning</th>
              <th className={th}>Win rate</th>
              <th className={cn(th, "text-right")}>Impression</th>
              {rateHeads}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className={cn(td, "font-medium")}>{r.name}</td>
                <td className={cn(td, "text-right tabular-nums")}>{r.made}</td>
                <td className={cn(td, "text-right tabular-nums")}>{r.edited}</td>
                <td className={cn(td, "text-right tabular-nums")}>{r.winning}</td>
                <td className={td}>
                  <Share value={r.winning} total={r.all.length} />
                </td>
                <td className={cn(td, "text-right tabular-nums")}>{fmt.compact(r.all.reduce((s, p) => s + p.impressions, 0))}</td>
                <RateCells posts={r.all} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {unassigned > 0 && rows.length > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">{unassigned} konten belum punya creator / editor.</p>
      )}
    </Panel>
  );
}

function ByProduct({ posts }: { posts: CreativePost[] }) {
  const keys = [...new Set(posts.map((p) => p.product ?? ""))];
  const rows = keys
    .map((key) => {
      const list = posts.filter((p) => (p.product ?? "") === key);
      return { key, advertiser: list[0]?.advertiser?.name ?? null, list, spend: list.reduce((s, p) => s + p.spend, 0) };
    })
    .sort((a, b) => b.spend - a.spend);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  return (
    <Panel title="Per produk" icon={TargetIcon} iconPosition="left" bodyClassName="overflow-x-auto p-0">
      <table className="w-full min-w-[820px]">
        <thead className="bg-muted/60">
          <tr>
            <th className={th}>Produk</th>
            <th className={cn(th, "text-right")}>Konten</th>
            <th className={cn(th, "text-right")}>Aktif</th>
            <th className={cn(th, "text-right")}>Winning</th>
            <th className={th}>Porsi spend</th>
            {rateHeads}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className={td}>
                <span className={cn("block font-medium", !r.key && "font-normal text-muted-foreground")}>{r.key || "Belum terpetakan"}</span>
                {r.advertiser && <span className="block text-xs text-muted-foreground">{r.advertiser}</span>}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{r.list.length}</td>
              <td className={cn(td, "text-right tabular-nums")}>{r.list.filter((p) => p.status === "active").length}</td>
              <td className={cn(td, "text-right tabular-nums")}>{r.list.filter((p) => p.label === "winning").length}</td>
              <td className={td}>
                <Share value={r.spend} total={spend} />
              </td>
              <RateCells posts={r.list} />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

