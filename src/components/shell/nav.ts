import {
  BookOpenIcon,
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

export function buildNav(role: Role, counts: NavCounts): NavSection[] {
  const main: NavItem[] = [{ title: "Overview", href: "/dashboard", icon: LayoutGridIcon }];

  main.push({
    title: "Daily Reports",
    href: "/reports",
    icon: ClipboardListIcon,
    children: can.reviewReports(role)
      ? [
          { title: "All Reports", href: "/reports" },
          { title: "Pending Review", href: "/reports?status=submitted", badge: counts.pendingReviews },
          { title: "Needs Revision", href: "/reports?status=revision" },
        ]
      : [
          { title: "Submit Report", href: "/reports/new" },
          { title: "My Reports", href: "/reports" },
          // Advertiser reports are recorded without review; their notes get their own page instead.
          role === "advertiser"
            ? { title: "Catatan Harian", href: "/reports/notes" }
            : { title: "Needs Revision", href: "/reports?status=revision", badge: counts.revisions },
        ],
  });

  if (can.viewCampaigns(role)) main.push({ title: "Campaigns", href: "/campaigns", icon: MegaphoneIcon });
  main.push({ title: "Tasks", href: "/tasks", icon: ListTodoIcon, badge: counts.openTasks || undefined });

  if (can.manageTeam(role)) {
    main.push({
      title: "Team",
      href: "/team",
      icon: UsersIcon,
      children: [
        { title: "Members", href: "/team" },
        { title: "KPI Targets", href: "/targets" },
      ],
    });
  }

  return [
    { label: "Main Navigation", items: main },
    {
      label: "Analytics & Insights",
      items: [
        { title: "KPI Scorecard", href: "/scorecard", icon: GaugeIcon },
        { title: "Leaderboard", href: "/leaderboard", icon: TrophyIcon },
      ],
    },
    {
      label: "Support",
      items: [
        { title: "KPI Guide", href: "/guide", icon: BookOpenIcon },
        { title: "Settings", href: "/settings", icon: SettingsIcon },
      ],
    },
  ];
}

const TITLES: [prefix: string, section: string, page: string][] = [
  ["/dashboard", "Overview", "Dashboard"],
  ["/reports/new", "Daily Reports", "Submit Report"],
  ["/reports/notes", "Daily Reports", "Catatan Harian"],
  ["/reports/day", "Daily Reports", "Laporan Harian"],
  ["/reports/", "Daily Reports", "Report Detail"],
  ["/reports", "Daily Reports", "Reports"],
  ["/campaigns", "Campaigns", "All Campaigns"],
  ["/tasks", "Tasks", "Task Board"],
  ["/team", "Team", "Members"],
  ["/targets", "Team", "KPI Targets"],
  ["/scorecard", "Analytics", "KPI Scorecard"],
  ["/leaderboard", "Analytics", "Leaderboard"],
  ["/guide", "Support", "KPI Guide"],
  ["/settings", "Support", "Settings"],
];

export function breadcrumbFor(pathname: string) {
  const hit = TITLES.find(([p]) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
  return hit ? { section: hit[1], page: hit[2] } : { section: "Overview", page: "Dashboard" };
}
