import type { Metadata } from "next";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/kpi";
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
  const scope = sp.scope ?? (isSupervisor ? "all" : "mine");

  const where: SQL[] = [];
  if (scope === "mine") where.push(eq(tasks.assigneeId, user.id));
  else if (scope === "created") where.push(eq(tasks.createdById, user.id));
  else if (!isSupervisor) where.push(or(eq(tasks.assigneeId, user.id), eq(tasks.createdById, user.id))!);
  if (sp.assignee && isSupervisor && scope === "all") where.push(eq(tasks.assigneeId, Number(sp.assignee)));

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
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
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
  }));

  const scopeOptions = [
    ...(isSupervisor ? [{ value: "all", label: "All team tasks" }] : [{ value: "all", label: "All my tasks" }]),
    { value: "mine", label: "Assigned to me" },
    { value: "created", label: "Created by me" },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Assign work across advertisers, web masters and SEO, and track it to done."
        actions={
          <>
            <UrlSelect param="scope" label="Scope" value={scope} options={scopeOptions} />
            <TaskDialog
              people={people}
              campaigns={campaignOptions}
              defaultOpen={sp.new === "1"}
              defaultAssignee={sp.assignee ? Number(sp.assignee) : undefined}
            />
          </>
        }
      />
      <TaskBoard today={todayISO()} tasks={cards} currentUser={{ id: user.id, role: user.role }} people={people} campaigns={campaignOptions} />
    </>
  );
}
