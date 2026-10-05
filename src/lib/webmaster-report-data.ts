import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activities, tasks, type WebmasterTaskSnapshot } from "@/db/schema";
import { allowedStatuses, ownsTask, type TaskPerson } from "@/lib/task-rules";
import { parseISODate, toISODate } from "@/lib/utils";
import { todayISO } from "@/lib/kpi";
import { webmasterStatusError, type WebmasterItemInput, type WebmasterTaskOption } from "@/lib/webmaster-report";

export class WebmasterReportError extends Error {}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getWebmasterTaskOptions(actor: TaskPerson, date: string): Promise<WebmasterTaskOption[]> {
  const assigned = await db.select().from(tasks).where(eq(tasks.assigneeId, actor.id)).orderBy(asc(tasks.dueDate), asc(tasks.id));
  return assigned.filter((task) => toISODate(task.createdAt) <= date).map((task) => ({
    id: task.id, title: task.title, category: task.category, priority: task.priority, status: task.status, dueDate: task.dueDate,
    allowedStatuses: allowedStatuses(actor, task),
  }));
}

/** All task mutations and the report snapshot share the caller's transaction. */
export async function saveWebmasterTaskItems(tx: Transaction, actor: TaskPerson, date: string, items: WebmasterItemInput[], previous: WebmasterTaskSnapshot[]) {
  // A retry of a submitted new row reuses the task already created for this report.
  items = items.map((item) => ({ ...item, taskId: item.taskId ?? previous.find((p) => item.clientKey && p.clientKey === item.clientKey)?.taskId ?? null }));
  const linkedIds = items.flatMap((item) => item.taskId === null ? [] : [item.taskId]);
  if (new Set(linkedIds).size !== linkedIds.length) throw new WebmasterReportError("Task yang sama tidak boleh dilaporkan dua kali.");
  const ids = items.flatMap((item) => item.taskId === null ? [] : [item.taskId]);
  const assigned = ids.length ? await tx.select().from(tasks).where(inArray(tasks.id, ids)).orderBy(asc(tasks.id)).for("update") : [];
  const snapshots: WebmasterTaskSnapshot[] = [];
  for (const item of items) {
    let task = assigned.find((t) => t.id === item.taskId);
    const archived = previous.find((p) => p.taskId === item.taskId);
    if (item.taskId !== null && (!task || task.assigneeId !== actor.id)) {
      if (!archived || item.status !== archived.status) throw new WebmasterReportError("Task tidak lagi tersedia. Status riwayat tidak dapat diubah.");
      snapshots.push({ ...archived, note: item.note, resultUrl: item.resultUrl, minutesSpent: item.minutesSpent });
      continue;
    }
    if (task) {
      if (toISODate(task.createdAt) > date) throw new WebmasterReportError("Task belum dibuat pada tanggal laporan.");
      const unchangedHistoricalStatus = date < todayISO() && archived?.status === item.status;
      if (!unchangedHistoricalStatus && date < todayISO() && item.status === "done" && !ownsTask(actor, task) &&
        (!task.completedAt || toISODate(task.completedAt) > date)) throw new WebmasterReportError("Task belum disetujui Done pada tanggal laporan. Gunakan Menunggu review.");
      const error = unchangedHistoricalStatus ? null : webmasterStatusError(actor, task, item, date === todayISO());
      if (error) throw new WebmasterReportError(error);
      if (date === todayISO() && task.status !== item.status) {
        await tx.update(tasks).set({ status: item.status, completedAt: item.status === "done" ? new Date() : null }).where(eq(tasks.id, task.id));
        await tx.insert(activities).values({ actorId: actor.id, subjectUserId: item.status === "review" ? task.createdById : task.assigneeId,
          type: "task_updated", title: item.status === "done" ? "Task Completed" : item.status === "review" ? "Task Ready for Review" : "Task Updated",
          description: task.title, href: item.status === "review" ? "/tasks?scope=review" : "/tasks" });
      }
    } else {
      const recordedAt = date === todayISO() ? new Date() : parseISODate(date);
      [task] = await tx.insert(tasks).values({ title: item.title, category: item.category, priority: item.priority,
        status: item.status, dueDate: item.dueDate || null, description: item.note || null,
        assigneeId: actor.id, createdById: actor.id, createdAt: recordedAt,
        completedAt: item.status === "done" ? recordedAt : null }).returning();
      await tx.insert(activities).values({ actorId: actor.id, subjectUserId: actor.id, type: "task_created", title: "Task Harian Ditambahkan",
        description: item.title, href: "/tasks" });
    }
    const metadata = date < todayISO() && archived ? archived : task!;
    snapshots.push({ taskId: task!.id, clientKey: item.clientKey, title: metadata.title, category: metadata.category, priority: metadata.priority, dueDate: metadata.dueDate,
      status: item.status, note: item.note, resultUrl: item.resultUrl, minutesSpent: item.minutesSpent });
  }
  return snapshots;
}
