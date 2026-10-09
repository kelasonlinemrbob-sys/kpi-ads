import type { WebmasterTaskSnapshot } from "@/db/schema";
import { TASK_CATEGORIES } from "@/lib/task-rules";

/** Webmaster report labels without the zod schema, for client components. */
export const WEBMASTER_CATEGORIES = TASK_CATEGORIES.filter((c) => !c.roles.length || c.roles.includes("webmaster"));
export const WEBMASTER_STATUS_LABEL = { todo: "Belum dikerjakan", in_progress: "Sedang dikerjakan", review: "Menunggu review", done: "Selesai (Done)" };

export function webmasterSummary(items: Pick<WebmasterTaskSnapshot, "status" | "minutesSpent">[]) {
  const done = items.filter((i) => i.status === "done").length;
  return { total: items.length, done, review: items.filter((i) => i.status === "review").length,
    inProgress: items.filter((i) => i.status === "in_progress").length,
    minutes: items.reduce((sum, i) => sum + i.minutesSpent, 0), completion: items.length ? done / items.length * 100 : null };
}
