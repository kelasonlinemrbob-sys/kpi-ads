import {
  AwardIcon,
  BookOpenIcon,
  ClapperboardIcon,
  ClipboardListIcon,
  GaugeIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  ListTodoIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  SettingsIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TelescopeIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";
import { can, canViewSeo } from "@/lib/roles";

export type NavChild = { title: string; href: string; badge?: number };
/** `exact`: active only on that path without a tab/status/view (so /seo isn't lit on /seo?tab=ai). */
export type NavItem = { title: string; href: string; icon: LucideIcon; badge?: number; children?: NavChild[]; exact?: boolean };
/** `defaultOpen`: expanded until the member closes it; `tag`: a small label next to the section name. */
export type NavSection = { label: string; items: NavItem[]; defaultOpen?: boolean; tag?: string };

export type NavCounts = { pendingReviews: number; openTasks: number; revisions: number };

export function buildNav(role: Role, counts: NavCounts, seniorAdvertiser = false, secondaryRole: Role | null = null): NavSection[] {
  if (role === "cso") return [{ label: "Form & Leads", items: [{ title: "Lead Saya", href: "/leads", icon: UsersIcon, exact: true }, { title: "Template WA", href: "/leads/templates", icon: MessageSquareIcon }] }, { label: "Akun", items: [{ title: "Pengaturan", href: "/settings", icon: SettingsIcon }] }];
  // Creative works only in the Creative page (RESTRICTED_HOME).
  if (role === "creative") return [{ label: "Creative", items: [{ title: "Creative", href: "/creatives", icon: ClapperboardIcon }] }, { label: "Akun", items: [{ title: "Pengaturan", href: "/settings", icon: SettingsIcon }] }];
  const main: NavItem[] = [{ title: "Dashboard", href: "/dashboard", icon: LayoutGridIcon,
    ...(role === "supervisor" ? { children: [
      { title: "Dashboard Tim", href: "/dashboard" },
      { title: "Iklan Saya", href: "/dashboard?view=ads" },
    ] } : {}),
  }];

  main.push({
    title: "Laporan Harian",
    href: "/reports",
    icon: ClipboardListIcon,
    children: can.reviewReports(role)
      ? [
          { title: "Buat laporan", href: "/reports/new" },
          { title: "Laporan Iklan Saya", href: "/reports?view=mine" },
          { title: "Catatan Harian", href: "/reports/notes" },
          { title: "Semua laporan", href: "/reports" },
          { title: "Menunggu review", href: "/reports?status=submitted", badge: counts.pendingReviews },
          { title: "Perlu revisi", href: "/reports?status=revision" },
        ]
      : [
          { title: "Buat laporan", href: "/reports/new" },
          { title: "Laporan saya", href: "/reports" },
          // Advertiser reports are recorded without review; their notes get their own page instead.
          role === "advertiser"
            ? { title: "Catatan Harian", href: "/reports/notes" }
            : { title: "Perlu revisi", href: "/reports?status=revision", badge: counts.revisions },
        ],
  });

  if (can.runAds(role)) main.push({ title: "Form Order", href: "/forms", icon: ClipboardListIcon }, { title: "Leads", href: "/leads", icon: UsersIcon, exact: true }, { title: "Template WA", href: "/leads/templates", icon: MessageSquareIcon });
  if (can.viewCampaigns(role)) main.push({ title: "Campaigns", href: "/campaigns", icon: MegaphoneIcon });
  if (can.viewCreatives(role)) main.push({ title: "Creative", href: "/creatives", icon: ClapperboardIcon });
  main.push({ title: "Tugas", href: "/tasks", icon: ListTodoIcon, badge: counts.openTasks || undefined });

  if (can.manageTeam(role)) {
    main.push({
      title: "Tim",
      href: "/team",
      icon: UsersIcon,
      children: [
        { title: "Anggota", href: "/team" },
        { title: "Target KPI", href: "/targets" },
      ],
    });
  }

  // Performance appraisal: supervisors fill it in, senior advertisers read their own.
  if (can.manageAppraisals(role) || seniorAdvertiser) {
    main.push({ title: "Penilaian Kinerja", href: "/appraisals", icon: AwardIcon });
  }

  const section=(label:string,paths:string[]):NavSection=>({label,items:paths.flatMap(path=>main.filter(item=>item.href===path))});
  return [
    section("Utama",["/dashboard","/reports","/tasks"]),
    section("Iklan & Konten",["/campaigns","/creatives"]),
    seoSection(role, secondaryRole),
    section("Form & Leads",["/forms","/leads","/leads/templates"]),
    {label:"Tim & Kinerja",items:[...section("",["/team","/appraisals"]).items,{title:"KPI Scorecard",href:"/scorecard",icon:GaugeIcon},{title:"Leaderboard",href:"/leaderboard",icon:TrophyIcon}]},
    {label:"Bantuan",items:[{title:"Panduan KPI",href:"/guide",icon:BookOpenIcon},{title:"Pengaturan",href:"/settings",icon:SettingsIcon}]},
  ].filter(section=>section.items.length>0);

}

/**
 * SEO for supervisors, SEO specialists and web masters, including Advertiser + SEO (SEO as the second KPI):
 * each item opens a tab of Performa SEO. Open by default for members scored on SEO.
 */
function seoSection(role: Role, secondaryRole: Role | null): NavSection {
  if (!canViewSeo({ role, secondaryRole })) return { label: "SEO", items: [] };
  const secondKpi = role !== "seo" && secondaryRole === "seo";
  return {
    label: "SEO",
    defaultOpen: role === "seo" || secondKpi,
    tag: secondKpi ? "KPI kedua" : undefined,
    items: [
      { title: "Performa SEO", href: "/seo", icon: SearchIcon, exact: true },
      { title: "Kata kunci & halaman", href: "/seo?tab=queries", icon: KeyRoundIcon },
      { title: "Peluang", href: "/seo?tab=opportunities", icon: TargetIcon },
      { title: "Riset kata kunci", href: "/seo?tab=research", icon: TelescopeIcon },
      { title: "Analisa AI SEO", href: "/seo?tab=ai", icon: SparklesIcon },
      role === "supervisor"
        ? { title: "Koneksi Search Console", href: "/settings?tab=integrasi&service=search-console", icon: GlobeIcon }
        : { title: "Website saya", href: "/settings?tab=integrasi&service=search-console", icon: GlobeIcon },
    ],
  };
}

const TITLES: [prefix: string, section: string, page: string][] = [
  ["/seo", "SEO", "Performa SEO"],
  ["/forms/new", "Form & Leads", "Buat form"],
  ["/forms/", "Form & Leads", "Kelola form"],
  ["/forms", "Form & Leads", "Form Order"],
  ["/leads/templates", "Form & Leads", "Template WA"],
  ["/leads/", "Form & Leads", "Detail lead"],
  ["/leads", "Form & Leads", "Leads"],
  ["/dashboard", "Overview", "Dashboard"],
  ["/reports/new", "Daily Reports", "Submit Report"],
  ["/reports/notes", "Daily Reports", "Catatan Harian"],
  ["/reports/day", "Daily Reports", "Laporan Harian"],
  ["/reports/", "Daily Reports", "Report Detail"],
  ["/reports", "Daily Reports", "Reports"],
  ["/campaigns", "Campaigns", "All Campaigns"],
  ["/creatives", "Creative", "Konten Iklan"],
  ["/tasks", "Tasks", "Task Board"],
  ["/team", "Team", "Members"],
  ["/targets", "Team", "KPI Targets"],
  ["/appraisals/", "Penilaian Kinerja", "Borang Penilaian"],
  ["/appraisals", "Penilaian Kinerja", "Daftar Penilaian"],
  ["/scorecard", "Analytics", "KPI Scorecard"],
  ["/leaderboard", "Analytics", "Leaderboard"],
  ["/guide", "Support", "KPI Guide"],
  ["/settings", "Support", "Settings"],
];

export function breadcrumbFor(pathname: string) {
  const hit = TITLES.find(([p]) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
  return hit ? { section: hit[1], page: hit[2] } : { section: "Overview", page: "Dashboard" };
}
