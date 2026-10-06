import {
  AwardIcon,
  BookOpenIcon,
  ClapperboardIcon,
  ClipboardListIcon,
  GaugeIcon,
  LayoutGridIcon,
  ListTodoIcon,
  MegaphoneIcon,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";
import { can } from "@/lib/roles";

export type NavChild = { title: string; href: string; badge?: number };
export type NavItem = { title: string; href: string; icon: LucideIcon; badge?: number; children?: NavChild[] };
export type NavSection = { label: string; items: NavItem[] };

export type NavCounts = { pendingReviews: number; openTasks: number; revisions: number };

export function buildNav(role: Role, counts: NavCounts, seniorAdvertiser = false): NavSection[] {
  if (role === "cso") return [{ label: "Form & Leads", items: [{ title: "Lead Saya", href: "/leads", icon: UsersIcon }] }, { label: "Akun", items: [{ title: "Pengaturan", href: "/settings", icon: SettingsIcon }] }];
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

  if (can.runAds(role)) main.push({ title: "Form Order", href: "/forms", icon: ClipboardListIcon }, { title: "Leads", href: "/leads", icon: UsersIcon });
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
    section("Form & Leads",["/forms","/leads"]),
    {label:"Tim & Kinerja",items:[...section("",["/team","/appraisals"]).items,{title:"KPI Scorecard",href:"/scorecard",icon:GaugeIcon},{title:"Leaderboard",href:"/leaderboard",icon:TrophyIcon}]},
    {label:"Bantuan",items:[{title:"Panduan KPI",href:"/guide",icon:BookOpenIcon},{title:"Pengaturan",href:"/settings",icon:SettingsIcon}]},
  ].filter(section=>section.items.length>0);

}

const TITLES: [prefix: string, section: string, page: string][] = [
  ["/forms/new", "Form & Leads", "Buat form"],
  ["/forms/", "Form & Leads", "Kelola form"],
  ["/forms", "Form & Leads", "Form Order"],
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
