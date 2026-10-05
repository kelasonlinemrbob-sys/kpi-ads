import { z } from "zod";
import type { Task, WebmasterTaskSnapshot } from "@/db/schema";
import { TASK_CATEGORIES, allowedStatuses, type TaskPerson } from "@/lib/task-rules";
import { parseISODate, toISODate } from "@/lib/utils";

export const WEBMASTER_CATEGORIES = TASK_CATEGORIES.filter((c) => !c.roles.length || c.roles.includes("webmaster"));
export const WEBMASTER_STATUS_LABEL = { todo: "Belum dikerjakan", in_progress: "Sedang dikerjakan", review: "Menunggu review", done: "Selesai (Done)" };
const status = z.enum(["todo", "in_progress", "review", "done"]);
const validDate = z.string().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && toISODate(parseISODate(v)) === v, "Tanggal tenggat tidak valid.");
export const webmasterItemsSchema = z.array(z.object({
  taskId: z.number().int().positive().nullable(),
  clientKey: z.string().uuid().optional(),
  sourceStatus: status.optional(),
  title: z.string().trim().max(200),
  category: z.string().max(40),
  status,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  dueDate: validDate,
  note: z.string().trim().max(2000),
  resultUrl: z.string().trim().max(2000).refine((v) => {
    if (!v) return true;
    try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; }
  }, "Tautan hasil harus berupa URL http atau https."),
  minutesSpent: z.number().int().min(0).max(1440),
}).superRefine((row, ctx) => {
  if (row.taskId !== null) return;
  if (!row.clientKey) ctx.addIssue({ code: "custom", message: "Identitas task baru tidak valid. Muat ulang laporan." });
  if (row.title.length < 3) ctx.addIssue({ code: "custom", message: "Nama task baru minimal 3 karakter." });
  if (!WEBMASTER_CATEGORIES.some((c) => c.key === row.category)) ctx.addIssue({ code: "custom", message: "Pilih kategori task Webmaster." });
})).max(100, "Maksimal 100 task dalam satu laporan.").superRefine((items, ctx) => {
  const ids = items.flatMap((item) => item.taskId === null ? [] : [item.taskId]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Task yang sama tidak boleh dilaporkan dua kali." });
  const keys = items.flatMap((item) => item.clientKey ? [item.clientKey] : []);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Task baru terduplikasi dalam laporan." });
  if (items.reduce((sum, item) => sum + item.minutesSpent, 0) > 1440) ctx.addIssue({ code: "custom", message: "Total durasi harian tidak boleh melebihi 24 jam." });
});

export type WebmasterItemInput = z.infer<typeof webmasterItemsSchema>[number];
export type WebmasterTaskOption = Pick<Task, "id" | "title" | "category" | "priority" | "status" | "dueDate"> & { allowedStatuses: Task["status"][] };

/** Even a historical report cannot grant its author approval rights. */
export function webmasterStatusError(actor: TaskPerson, task: Pick<Task, "assigneeId" | "createdById" | "status">, row: WebmasterItemInput, syncLive: boolean) {
  if (task.assigneeId !== actor.id) return "Task ini bukan milik anggota yang melaporkan.";
  if (row.status !== task.status && !allowedStatuses(actor, task).includes(row.status)) return "Gunakan status Menunggu review; Done harus disetujui pemberi tugas atau supervisor.";
  if (syncLive && row.status !== task.status && row.sourceStatus !== task.status) return "Status task telah berubah. Muat ulang laporan sebelum menyimpan.";
  return null;
}

export function webmasterSummary(items: Pick<WebmasterTaskSnapshot, "status" | "minutesSpent">[]) {
  const done = items.filter((i) => i.status === "done").length;
  return { total: items.length, done, review: items.filter((i) => i.status === "review").length,
    inProgress: items.filter((i) => i.status === "in_progress").length,
    minutes: items.reduce((sum, i) => sum + i.minutesSpent, 0), completion: items.length ? done / items.length * 100 : null };
}
