import { toISODate } from "@/lib/utils";

type TaskSnapshot = { assigneeId: number; status: string; dueDate: string | null; createdAt: Date; completedAt: Date | null };

/** Includes overdue backlog and tasks without a due date; excludes work due in future months. */
export function taskCompletionAt(tasks: TaskSnapshot[], start: string, end: string, asOf: string) {
  const applicable = tasks.filter((task) => {
    const completed = task.status === "done" && task.completedAt ? toISODate(task.completedAt) : null;
    return toISODate(task.createdAt) <= asOf && (!task.dueDate || task.dueDate <= end) && (!completed || completed >= start);
  });
  if (!applicable.length) return null;
  const done = applicable.filter((task) => task.status === "done" && task.completedAt && toISODate(task.completedAt) <= asOf).length;
  return done / applicable.length * 100;
}
