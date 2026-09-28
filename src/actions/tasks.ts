"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { priorityEnum, taskStatusEnum, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data";
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
});

export async function saveTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => !(v === "" || v === "none")).map(([k, v]) => [k, v]),
  );
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;

  const [assignee] = await db.select({ id: users.id, name: users.name, isActive: users.isActive }).from(users).where(eq(users.id, data.assigneeId));
  if (!assignee?.isActive) return { error: "Assignee not found." };

  if (id) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return { error: "Task not found." };
    if (user.role !== "supervisor" && task.createdById !== user.id) return { error: "Only the creator or a supervisor can edit this task." };
    await db
      .update(tasks)
      .set({ ...data, description: data.description ?? null, dueDate: data.dueDate ?? null, campaignId: data.campaignId ?? null })
      .where(eq(tasks.id, id));
  } else {
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
  if (user.role !== "supervisor" && task.assigneeId !== user.id && task.createdById !== user.id) return { error: "Not allowed" };
  await db
    .update(tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(tasks.id, id));
  if (status === "done" || status === "review") {
    await logActivity({
      actorId: user.id,
      subjectUserId: task.createdById,
      type: "task_updated",
      title: status === "done" ? "Task Completed" : "Task Ready for Review",
      description: task.title,
      href: "/tasks",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTask(id: number) {
  const user = await requireUser();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return { error: "Task not found" };
  if (user.role !== "supervisor" && task.createdById !== user.id) return { error: "Not allowed" };
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}
