"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { priorityEnum, taskStatusEnum, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
import { allowedStatuses, canAssign, categoryFits, ownsTask } from "@/lib/task-rules";
import type { FormState } from "./auth";

const taskSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(3, "Title is too short").max(200),
  description: z.string().trim().max(4000).optional(),
  assigneeId: z.coerce.number({ error: "Choose an assignee" }).int().positive("Choose an assignee"),
  priority: z.enum(priorityEnum.enumValues),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  campaignId: z.coerce.number().int().positive().optional(),
  category: z.string().max(40).optional(),
});

export async function saveTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => !(v === "" || v === "none")).map(([k, v]) => [k, v]),
  );
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;

  const [assignee] = await db
    .select({ id: users.id, name: users.name, role: users.role, advertiserLevel: users.advertiserLevel, secondaryRole: users.secondaryRole, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, data.assigneeId));
  if (!assignee?.isActive) return { error: "Assignee not found." };
  if (data.category && !categoryFits(data.category, assignee)) return { error: "Kategori tugas tidak sesuai dengan role penerima." };

  if (id) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return { error: "Task not found." };
    if (!ownsTask(user, task)) return { error: "Only the creator or a supervisor can edit this task." };
    // Keeping the current assignee is always fine; handing it to someone new follows the role rules.
    if (task.assigneeId !== assignee.id && !canAssign(user, assignee)) return { error: `Kamu tidak bisa memberi tugas ke ${assignee.name}.` };
    await db
      .update(tasks)
      .set({
        ...data,
        description: data.description ?? null,
        dueDate: data.dueDate ?? null,
        campaignId: data.campaignId ?? null,
        category: data.category ?? null,
      })
      .where(eq(tasks.id, id));
  } else {
    if (!canAssign(user, assignee)) return { error: `Kamu tidak bisa memberi tugas ke ${assignee.name}.` };
    await db.insert(tasks).values({ ...data, createdById: user.id });
    await logActivity({
      actorId: user.id,
      subjectUserId: assignee.id,
      type: "task_created",
      title: data.priority === "urgent" ? "Urgent Task" : "Task Assigned",
      description: `${user.name} → ${assignee.name}: ${data.title}`,
      href: "/tasks",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Task updated" : "Task created" };
}

export async function setTaskStatus(id: number, status: (typeof taskStatusEnum.enumValues)[number]) {
  const user = await requireUser();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return { error: "Task not found" };
  if (task.status === status) return { ok: true };
  if (!allowedStatuses(user, task).includes(status)) {
    return {
      error:
        status === "done" && task.assigneeId === user.id
          ? "Pindahkan ke Review — pemberi tugas atau supervisor yang menyetujui jadi Done."
          : "Not allowed",
    };
  }
  await db
    .update(tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(tasks.id, id));
  const sentBack = task.status === "review" && (status === "in_progress" || status === "todo") && task.assigneeId !== user.id;
  if (status === "done" || status === "review" || sentBack) {
    await logActivity({
      actorId: user.id,
      // Review goes to whoever asked for the task; approval / changes go back to the assignee.
      subjectUserId: status === "review" ? task.createdById : task.assigneeId,
      type: "task_updated",
      title: status === "done" ? "Task Completed" : status === "review" ? "Task Ready for Review" : "Task Needs Changes",
      description: task.title,
      href: status === "review" ? "/tasks?scope=review" : "/tasks",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTask(id: number) {
  const user = await requireUser();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return { error: "Task not found" };
  if (!ownsTask(user, task)) return { error: "Not allowed" };
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}
