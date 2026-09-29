import type { AdvertiserLevel, Role, Task } from "@/db/schema";
import { hasRole, memberRoles } from "@/lib/member-roles";

/**
 * Who may give tasks to whom, what kind of work each role gets, and who closes a task.
 * Shared by the server actions (enforcement) and the task dialog / board (what to offer).
 */

export type TaskPerson = { id: number; role: Role; advertiserLevel?: AdvertiserLevel | null; secondaryRole?: Role | null };

const isSenior = (p: TaskPerson) => p.role === "advertiser" && p.advertiserLevel === "senior";
const isJunior = (p: TaskPerson) => p.role === "advertiser" && p.advertiserLevel !== "senior";

/**
 * - Supervisor: anyone.
 * - Advertiser senior: themselves, junior advertisers (mentoring), web master & SEO (requests).
 * - Advertiser junior: themselves, web master & SEO (requests such as a landing page).
 * - Web master / SEO: themselves and each other.
 */
export function canAssign(actor: TaskPerson, assignee: TaskPerson) {
  if (actor.role === "supervisor" || actor.id === assignee.id) return true;
  // A dual-role member gives and receives work in either of their roles.
  return memberRoles(actor).some((actorRole) => memberRoles(assignee).some((assigneeRole) => roleMayAssign(actor, actorRole, assignee, assigneeRole)));
}

function roleMayAssign(actor: TaskPerson, actorRole: Role, assignee: TaskPerson, assigneeRole: Role) {
  if (assigneeRole === "supervisor") return false;
  if (assigneeRole === "webmaster" || assigneeRole === "seo") return true;
  // Advertiser work: only a senior advertiser to a junior (mentoring).
  return actorRole === "advertiser" && assigneeRole === "advertiser" && isSenior(actor) && isJunior(assignee);
}

/** One line for the dialog explaining the rule above to the current user. */
export function assignRuleHint(actor: TaskPerson) {
  if (actor.role === "supervisor") return "Supervisor bisa memberi tugas ke semua anggota.";
  if (isSenior(actor)) return "Kamu bisa memberi tugas ke diri sendiri, advertiser junior, web master dan SEO.";
  if (actor.role === "advertiser") return "Kamu bisa memberi tugas ke diri sendiri, web master dan SEO.";
  return "Kamu bisa memberi tugas ke diri sendiri, web master dan SEO.";
}

export type TaskCategory = {
  key: string;
  label: string;
  /** Roles of the assignee this kind of work belongs to; empty = everyone. */
  roles: Role[];
  seniorOnly?: boolean;
  /** Checklist put in the description when it is still empty. */
  template?: string;
};

export const TASK_CATEGORIES: TaskCategory[] = [
  {
    key: "campaign_setup",
    label: "Setup campaign",
    roles: ["advertiser"],
    template: "- [ ] Objective & struktur campaign\n- [ ] Audiens & placement\n- [ ] Budget & jadwal\n- [ ] Pixel / conversion event dicek\n- [ ] Kode product di nama campaign",
  },
  { key: "campaign_optimization", label: "Optimasi campaign", roles: ["advertiser"] },
  { key: "ads_research", label: "Riset audiens & kompetitor", roles: ["advertiser"] },
  {
    key: "creative_brief",
    label: "Brief creative / copy",
    roles: ["advertiser"],
    template: "- [ ] Angle & pesan utama\n- [ ] Format & ukuran\n- [ ] Copy / headline\n- [ ] Referensi\n- [ ] Deadline tayang",
  },
  { key: "ads_report", label: "Laporan & analisa", roles: ["advertiser"] },
  { key: "budget", label: "Budget & billing", roles: ["advertiser"] },
  {
    key: "mentoring",
    label: "Mentoring advertiser junior",
    roles: ["advertiser"],
    seniorOnly: true,
    template: "- [ ] Review setup & struktur campaign junior\n- [ ] Review angka & optimasi\n- [ ] Feedback tertulis\n- [ ] Tindak lanjut minggu depan",
  },
  {
    key: "landing_page",
    label: "Landing page baru",
    roles: ["webmaster"],
    template: "- [ ] Copy & aset dari advertiser\n- [ ] Desain & build\n- [ ] Pasang pixel / tag & event\n- [ ] Tes mobile & PageSpeed\n- [ ] Link final dikirim ke advertiser",
  },
  { key: "lp_revision", label: "Revisi landing page", roles: ["webmaster"] },
  {
    key: "tracking",
    label: "Tracking & pixel",
    roles: ["webmaster"],
    template: "- [ ] Event yang dibutuhkan\n- [ ] Pasang / perbaiki tag\n- [ ] Tes di Events Manager / Tag Assistant\n- [ ] Konfirmasi ke advertiser",
  },
  { key: "bug_fix", label: "Bug / perbaikan teknis", roles: ["webmaster"] },
  { key: "site_performance", label: "Speed & uptime", roles: ["webmaster"] },
  {
    key: "article",
    label: "Artikel / konten",
    roles: ["seo"],
    template: "- [ ] Keyword utama & turunan\n- [ ] Outline\n- [ ] Draft\n- [ ] On-page (title, meta, internal link)\n- [ ] Publish & submit index",
  },
  { key: "backlink", label: "Backlink", roles: ["seo"] },
  { key: "keyword_research", label: "Riset keyword", roles: ["seo"] },
  { key: "onpage_seo", label: "On-page & technical SEO", roles: ["seo"] },
  { key: "seo_report", label: "Laporan SEO", roles: ["seo"] },
  { key: "general", label: "Lainnya", roles: [] },
];

const CATEGORY_BY_KEY = new Map(TASK_CATEGORIES.map((c) => [c.key, c]));
export const categoryLabel = (key: string | null) => (key ? (CATEGORY_BY_KEY.get(key)?.label ?? key) : null);

/** Kinds of work that fit the assignee's role. */
export function categoriesFor(assignee: TaskPerson | undefined) {
  if (!assignee) return TASK_CATEGORIES.filter((c) => !c.roles.length);
  return TASK_CATEGORIES.filter((c) => !c.roles.length || (c.roles.some((r) => hasRole(assignee, r)) && (!c.seniorOnly || isSenior(assignee))));
}

export const categoryFits = (key: string, assignee: TaskPerson) => categoriesFor(assignee).some((c) => c.key === key);

/** The creator (or a supervisor) owns the task: edits it, approves it and deletes it. */
export const ownsTask = (actor: TaskPerson, task: { createdById: number }) => actor.role === "supervisor" || task.createdById === actor.id;

/**
 * Statuses the actor may move a task to. Someone doing a task for another person takes it up to
 * Review; the one who asked for it (or a supervisor) approves it to Done or sends it back.
 */
export function allowedStatuses(actor: TaskPerson, task: { assigneeId: number; createdById: number }): Task["status"][] {
  if (ownsTask(actor, task)) return ["todo", "in_progress", "review", "done"];
  if (task.assigneeId === actor.id) return ["todo", "in_progress", "review"];
  return [];
}
