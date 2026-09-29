import type { Metadata } from "next";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/kpi";
import { MEMBER_ROLES, ROLE_LABEL, isSeniorAdvertiser } from "@/lib/roles";
import { canAssign, TASK_CATEGORIES } from "@/lib/task-rules";
import { PageHeader } from "@/components/dashboard/panel";
import { UrlSelect } from "@/components/dashboard/url-select";
import { TaskBoard, type TaskCard } from "./task-board";
import { TaskDialog } from "./task-dialog";

export const metadata: Metadata = { title: "Tasks" };

const creator = alias(users, "creator");

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isSupervisor = user.role === "supervisor";
  const senior = isSeniorAdvertiser(user);
  const scopes = ["all", "mine", "created", "review", ...(senior ? ["juniors"] : [])];
  const scope = sp.scope && scopes.includes(sp.scope) ? sp.scope : isSupervisor ? "all" : "mine";
  const roleFilter = isSupervisor && sp.role && (MEMBER_ROLES as string[]).includes(sp.role) ? (sp.role as (typeof MEMBER_ROLES)[number]) : null;
  const category = sp.category && TASK_CATEGORIES.some((c) => c.key === sp.category) ? sp.category : null;

  const where: SQL[] = [];
  if (scope === "mine") where.push(eq(tasks.assigneeId, user.id));
  else if (scope === "created") where.push(eq(tasks.createdById, user.id));
  // Waiting for my approval: a supervisor approves anything, others what they asked for.
  else if (scope === "review") where.push(eq(tasks.status, "review"), ...(isSupervisor ? [] : [eq(tasks.createdById, user.id)]));
  // Senior advertisers keep an eye on the juniors they mentor.
  else if (scope === "juniors") where.push(eq(users.role, "advertiser"), or(isNull(users.advertiserLevel), eq(users.advertiserLevel, "junior"))!);
  else if (!isSupervisor) where.push(or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id))!);
  if (sp.assignee && isSupervisor && scope === "all") where.push(eq(tasks.assigneeId, Number(sp.assignee)));
  if (roleFilter) where.push(eq(users.role, roleFilter));
  if (category) where.push(eq(tasks.category, category));

  const [rows, people, campaignOptions] = await Promise.all([
    db
      .select({
        task: tasks,
        assigneeName: users.name,
        creatorName: creator.name,
        campaignName: campaigns.name,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.assigneeId))
      .innerJoin(creator, eq(creator.id, tasks.createdById))
      .leftJoin(campaigns, eq(campaigns.id, tasks.campaignId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(tasks.dueDate), asc(tasks.id)),
    db
      .select({ id: users.id, name: users.name, role: users.role, advertiserLevel: users.advertiserLevel })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(ne(campaigns.status, "ended")).orderBy(asc(campaigns.name)),
  ]);

  const cards: TaskCard[] = rows.map((r) => ({
    id: r.task.id,
    title: r.task.title,
    description: r.task.description,
    status: r.task.status,
    priority: r.task.priority,
    dueDate: r.task.dueDate,
    assigneeId: r.task.assigneeId,
    assigneeName: r.assigneeName,
    createdById: r.task.createdById,
    creatorName: r.creatorName,
    campaignId: r.task.campaignId,
    campaignName: r.campaignName,
    category: r.task.category,
  }));
  const assignable = people.map((p) => ({ ...p, assignable: canAssign(user, p) }));
  // Categories of the roles this user works with (their own and the ones they can give tasks to).
  const roles = new Set(assignable.filter((p) => p.assignable).map((p) => p.role).concat(user.role));
  const categoryOptions = TASK_CATEGORIES.filter((c) => !c.roles.length || c.roles.some((r) => roles.has(r)));

  const scopeOptions = [
    ...(isSupervisor ? [{ value: "all", label: "All team tasks" }] : [{ value: "all", label: "All my tasks" }]),
    { value: "mine", label: "Assigned to me" },
    { value: "created", label: "Created by me" },
    { value: "review", label: "Menunggu review saya" },
    ...(senior ? [{ value: "juniors", label: "Tim advertiser junior" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description={
          isSupervisor
            ? "Assign work across advertisers, web masters and SEO, and track it to done."
            : "Tugas untukmu dan permintaan yang kamu buat. Tugas dari orang lain selesai setelah disetujui di Review."
        }
        actions={
          <>
            <UrlSelect param="scope" label="Scope" value={scope} options={scopeOptions} />
            {isSupervisor && (
              <UrlSelect
                param="role"
                label="Role"
                value={roleFilter ?? "all"}
                options={[{ value: "all", label: "All roles" }, ...MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))]}
              />
            )}
            <UrlSelect
              param="category"
              label="Kategori"
              value={category ?? "all"}
              options={[{ value: "all", label: "Semua kategori" }, ...categoryOptions.map((c) => ({ value: c.key, label: c.label }))]}
            />
            <TaskDialog
              currentUser={{ id: user.id, role: user.role, advertiserLevel: user.advertiserLevel }}
              people={assignable}
              campaigns={campaignOptions}
              defaultOpen={sp.new === "1"}
              defaultAssignee={sp.assignee ? Number(sp.assignee) : undefined}
            />
          </>
        }
      />
      <TaskBoard
        today={todayISO()}
        tasks={cards}
        currentUser={{ id: user.id, role: user.role, advertiserLevel: user.advertiserLevel }}
        people={assignable}
        campaigns={campaignOptions}
      />
    </>
  );
}
