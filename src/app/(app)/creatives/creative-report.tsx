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
import {
  CREATIVE_FORMAT_LABEL,
  creativeRates,
  fmt,
  formatPlayTime,
  sumCreatives,
} from "@/lib/creatives";
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
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 grid-cols-2 gap-3 @min-[660px]:grid-cols-3 @min-[1280px]:grid-cols-6">
        <Tile
          icon={ClapperboardIcon}
          label="Konten"
          value={fmt.num(posts.length)}
          hint={`${fmt.num(rows.length)} iklan · ${fmt.num(active)} aktif`}
        />
        <Tile
          icon={TrophyIcon}
          label="Winning"
          value={fmt.num(winning)}
          hint={
            posts.length
              ? `${fmt.pct((winning / posts.length) * 100)} dari konten`
              : "–"
          }
        />
        <Tile
          icon={CoinsIcon}
          label="Spend"
          value={fmt.rpCompact(total.spend)}
          hint={`CPM ${fmt.rp(rates.cpm)}`}
        />
        <Tile
          icon={EyeIcon}
          label="Impression"
          value={fmt.compact(total.impressions)}
          hint={`Jumlah reach iklan ${fmt.compact(total.reach)}`}
        />
        <Tile
          icon={MousePointerClickIcon}
          label="CTR"
          value={fmt.pct(rates.ctr)}
          hint={`${fmt.num(total.clicks)} klik link`}
        />
        <Tile
          icon={TargetIcon}
          label="CPL"
          value={fmt.rp(rates.cpl)}
          hint={`${fmt.num(total.leads)} lead`}
        />
      </div>

      <div className="grid min-w-0 gap-4 @min-[1080px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TopContents posts={posts} people={people} rank={rank} />
        <div className="grid min-w-0 content-start gap-4 @min-[700px]:grid-cols-2 @min-[1080px]:grid-cols-1">
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

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4 shrink-0" />
      </div>
      <p className="break-words text-xl leading-tight font-semibold tracking-tight tabular-nums @min-[480px]:text-2xl">
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

const RANK_LABEL = {
  impressions: "impression",
  ctr: "CTR",
  hook: "hook rate",
  cpl: "CPL termurah",
} as const;
/** Rates on a handful of impressions are noise; only rank contents that ran a bit. */
const MIN_IMPRESSIONS_FOR_RATES = 1_000;

function TopContents({
  posts,
  people,
  rank,
}: {
  posts: CreativePost[];
  people: Person[];
  rank: keyof typeof RANK_LABEL;
}) {
  const nameOf = (id: number | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? null) : null;
  const scored = posts
    .filter(
      (p) =>
        rank === "impressions" || p.impressions >= MIN_IMPRESSIONS_FOR_RATES,
    )
    .map((p) => ({ post: p, rates: creativeRates(sumCreatives([p])) }))
    .filter(({ post, rates }) =>
      rank === "hook"
        ? post.format === "video" && rates.hook !== null
        : rank === "cpl"
          ? rates.cpl !== null
          : true,
    )
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
    rank === "ctr"
      ? fmt.pct(r.ctr)
      : rank === "hook"
        ? fmt.pct(r.hook)
        : rank === "cpl"
          ? fmt.rp(r.cpl)
          : fmt.compact(p.impressions);

  return (
    <Panel
      title={`Konten terbaik · ${RANK_LABEL[rank]}`}
      icon={TrophyIcon}
      iconPosition="left"
      bodyClassName="@container/ranking"
    >
      <p className="border-b px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {rank === "impressions"
          ? "Enam konten dengan impression terbanyak sesuai filter."
          : "Peringkat hanya mencakup konten dengan minimal 1.000 impression."}
      </p>
      {scored.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Belum ada konten dengan data cukup.
        </p>
      ) : (
        <ol className="divide-y">
          {scored.map(({ post, rates }, i) => {
            const adName = post.ads[0]?.adName ?? "Konten tanpa nama";
            const supporting =
              rank === "impressions"
                ? [
                    { label: "CTR", value: fmt.pct(rates.ctr) },
                    { label: "CPL", value: fmt.rp(rates.cpl) },
                  ]
                : [
                    {
                      label: "Impression",
                      value: fmt.compact(post.impressions),
                    },
                    {
                      label: rank === "ctr" ? "CPL" : "CTR",
                      value:
                        rank === "ctr" ? fmt.rp(rates.cpl) : fmt.pct(rates.ctr),
                    },
                  ];
            return (
              <li
                key={post.key}
                className="grid min-w-0 items-center gap-3 px-3 py-3 @min-[580px]/ranking:grid-cols-[minmax(0,1fr)_230px] transition-colors hover:bg-muted/20 sm:px-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative shrink-0">
                    <Thumb
                      url={post.thumbnailUrl}
                      format={post.format}
                      className="size-14"
                    />
                    <span className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full border bg-card text-[10px] font-semibold tabular-nums">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm leading-snug font-medium"
                      title={adName}
                    >
                      {post.permalink ? (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 break-words hover:underline"
                        >
                          {adName}
                        </a>
                      ) : (
                        <span className="line-clamp-2 break-words">
                          {adName}
                        </span>
                      )}
                    </p>
                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      title={post.product ?? undefined}
                    >
                      {post.product ?? "Belum terpetakan"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{CREATIVE_FORMAT_LABEL[post.format]}</span>
                      {nameOf(post.creatorId) && (
                        <span>{nameOf(post.creatorId)}</span>
                      )}
                      {post.ads.length > 1 && (
                        <span>{post.ads.length} iklan</span>
                      )}
                      {post.label === "winning" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">
                          <TrophyIcon className="size-3" />
                          Winning
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2.5">
                  <div className="min-w-0 border-r pr-2">
                    <dt className="text-[10px] text-muted-foreground">
                      {rank === "cpl" ? "CPL" : RANK_LABEL[rank]}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm font-semibold tabular-nums">
                      {metric(post, rates)}
                    </dd>
                  </div>
                  {supporting.map((stat) => (
                    <div key={stat.label} className="min-w-0">
                      <dt className="text-[10px] text-muted-foreground">
                        {stat.label}
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-medium tabular-nums">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function Thumb({
  url,
  format,
  className,
}: {
  url: string | null;
  format: AdCreative["format"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
      {format === "video" && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-foreground/80 px-1 text-[9px] leading-3.5 text-background">
          ▶
        </span>
      )}
    </span>
  );
}

/** Video attention funnel: impressions → 3s views → ThruPlays, as shrinking bars. */
function VideoFunnel({ total }: { total: ReturnType<typeof sumCreatives> }) {
  const rates = creativeRates(total);
  const steps = [
    { label: "Impression video", value: total.videoImpressions, note: "" },
    {
      label: "Tonton 3 detik",
      value: total.videoViews,
      note: `Hook rate ${fmt.pct(rates.hook)}`,
    },
    {
      label: "ThruPlay",
      value: total.thruplays,
      note: `Hold rate ${fmt.pct(rates.hold)}`,
    },
  ];
  const max = Math.max(1, total.videoImpressions);
  return (
    <Panel
      title="Funnel video"
      icon={ZapIcon}
      iconPosition="left"
      bodyClassName="grid gap-3 p-4"
    >
      {total.videoImpressions === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Belum ada iklan video.
        </p>
      ) : (
        <>
          {steps.map((s) => (
            <div key={s.label} className="grid gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span>{s.label}</span>
                <span className="tabular-nums">
                  <span className="font-medium">{fmt.compact(s.value)}</span>
                  {s.note && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.note}
                    </span>
                  )}
                </span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground"
                  style={{
                    width: `${Math.min(100, Math.max(0, (s.value / max) * 100))}%`,
                  }}
                />
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Rata-rata ditonton{" "}
            {total.avgPlayTime === null
              ? "–"
              : `${formatPlayTime(total.avgPlayTime)} detik`}
            . Hook rate = 3 detik ÷ impression; hold rate = ThruPlay ÷ 3 detik.
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
    const inWeek = posts.filter(
      (p) =>
        p.adCreatedAt &&
        new Date(p.adCreatedAt) >= start &&
        new Date(p.adCreatedAt) < end,
    );
    return {
      start,
      total: inWeek.length,
      winning: inWeek.filter((p) => p.label === "winning").length,
    };
  });
  const max = Math.max(1, ...counts.map((c) => c.total));
  const label = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });

  return (
    <Panel
      title="Konten baru per minggu"
      icon={ClapperboardIcon}
      iconPosition="left"
      bodyClassName="p-4"
    >
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Tanggal pembuatan konten yang tampil pada periode dan filter ini.
      </p>
      <div className="flex h-28 items-end gap-2">
        {counts.map((c, i) => {
          const current = i === counts.length - 1;
          const text = `Minggu ${label(c.start)}: ${c.total} konten, ${c.winning} winning`;
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
              title={text}
              aria-label={text}
            >
              {(current || c.total === max) && c.total > 0 && (
                <span className="mb-0.5 text-[11px] font-medium tabular-nums">
                  {c.total}
                </span>
              )}
              <span
                className="block w-full max-w-6 rounded-t-[4px]"
                style={{
                  height: c.total ? `${(c.total / max) * 100}%` : 1,
                  backgroundColor: current
                    ? "var(--foreground)"
                    : "var(--bar-hit)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {counts.map((c, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 text-center text-[10px] text-muted-foreground",
              i === counts.length - 1 && "font-medium text-foreground",
            )}
          >
            {i % 2 === 1 || i === counts.length - 1 ? label(c.start) : ""}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Minggu ini {counts.at(-1)!.total} konten baru, {counts.at(-1)!.winning}{" "}
        winning.
      </p>
    </Panel>
  );
}

const th =
  "border-r last:border-r-0 whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const td = "border-r last:border-r-0 whitespace-nowrap px-3 py-3 text-sm";

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
        <span
          className="block h-full rounded-full bg-foreground"
          style={{ width: `${total ? (value / total) * 100 : 0}%` }}
        />
      </span>
      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
        {total ? fmt.pct((value / total) * 100) : "–"}
      </span>
    </span>
  );
}

function ByFormat({ posts }: { posts: CreativePost[] }) {
  const spend = posts.reduce((s, p) => s + p.spend, 0);
  const groups = (Object.keys(CREATIVE_FORMAT_LABEL) as AdCreative["format"][])
    .map((format) => ({
      format,
      posts: posts.filter((p) => p.format === format),
    }))
    .filter((g) => g.posts.length);
  return (
    <Panel
      title="Performa per format"
      icon={ImageIcon}
      iconPosition="left"
      bodyClassName="overflow-x-auto p-0"
    >
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
            <tr
              key={g.format}
              className="border-t even:bg-muted/20 hover:bg-muted/40"
            >
              <td className={cn(td, "font-medium")}>
                {CREATIVE_FORMAT_LABEL[g.format]}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {fmt.num(g.posts.length)}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {fmt.num(g.posts.filter((p) => p.label === "winning").length)}
              </td>
              <td className={td}>
                <Share
                  value={g.posts.reduce((s, p) => s + p.spend, 0)}
                  total={spend}
                />
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {fmt.compact(g.posts.reduce((s, p) => s + p.impressions, 0))}
              </td>
              <RateCells posts={g.posts} />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Creative team leaderboard: contents made (as creator) and edited, winners, and how their contents perform. */
function TeamBoard({
  posts,
  people,
}: {
  posts: CreativePost[];
  people: Person[];
}) {
  const ids = new Set(
    posts
      .flatMap((p) => [p.creatorId, p.editorId])
      .filter((id): id is number => id !== null),
  );
  const rows = [...ids]
    .map((id) => {
      const made = posts.filter((p) => p.creatorId === id);
      const edited = posts.filter(
        (p) => p.editorId === id && p.creatorId !== id,
      );
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
    <Panel
      title="Tim creative"
      icon={UsersIcon}
      iconPosition="left"
      bodyClassName="overflow-x-auto p-0"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Isi kolom Creator / Editor di tab Tabel atau Galeri untuk melihat
          performa tim.
        </p>
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
              <tr
                key={r.id}
                className="border-t even:bg-muted/20 hover:bg-muted/40"
              >
                <td className={cn(td, "font-medium")}>{r.name}</td>
                <td className={cn(td, "text-right tabular-nums")}>{r.made}</td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {r.edited}
                </td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {r.winning}
                </td>
                <td className={td}>
                  <Share value={r.winning} total={r.all.length} />
                </td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {fmt.compact(r.all.reduce((s, p) => s + p.impressions, 0))}
                </td>
                <RateCells posts={r.all} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {unassigned > 0 && rows.length > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {unassigned} konten belum punya creator / editor.
        </p>
      )}
    </Panel>
  );
}

function ByProduct({ posts }: { posts: CreativePost[] }) {
  const keys = [...new Set(posts.map((p) => p.product ?? ""))];
  const rows = keys
    .map((key) => {
      const list = posts.filter((p) => (p.product ?? "") === key);
      return {
        key,
        advertiser: list[0]?.advertiser?.name ?? null,
        list,
        spend: list.reduce((s, p) => s + p.spend, 0),
      };
    })
    .sort((a, b) => b.spend - a.spend);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  return (
    <Panel
      title="Per produk"
      icon={TargetIcon}
      iconPosition="left"
      bodyClassName="overflow-x-auto p-0"
    >
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
            <tr
              key={r.key}
              className="border-t even:bg-muted/20 hover:bg-muted/40"
            >
              <td className={td}>
                <span
                  className={cn(
                    "block font-medium",
                    !r.key && "font-normal text-muted-foreground",
                  )}
                >
                  {r.key || "Belum terpetakan"}
                </span>
                {r.advertiser && (
                  <span className="block text-xs text-muted-foreground">
                    {r.advertiser}
                  </span>
                )}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {r.list.length}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {r.list.filter((p) => p.status === "active").length}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>
                {r.list.filter((p) => p.label === "winning").length}
              </td>
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
