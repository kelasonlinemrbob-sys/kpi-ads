"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  EllipsisIcon,
  EyeIcon,
  MegaphoneIcon,
  PencilIcon,
  RotateCcwIcon,
  TagIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/db/schema";
import { deleteTask, setTaskStatus } from "@/actions/tasks";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { allowedStatuses, categoryLabel, ownsTask, type TaskPerson } from "@/lib/task-rules";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { TaskDialog, type Person } from "./task-dialog";

export type TaskCard = {
  id: number;
  title: string;
  description: string | null;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string | null;
  assigneeId: number;
  assigneeName: string;
  createdById: number;
  creatorName: string;
  campaignId: number | null;
  campaignName: string | null;
  category: string | null;
};

const COLUMNS: { status: Task["status"]; icon: typeof CircleIcon; tone: string }[] = [
  { status: "todo", icon: CircleIcon, tone: "text-muted-foreground" },
  { status: "in_progress", icon: CircleDotIcon, tone: "text-info" },
  { status: "review", icon: EyeIcon, tone: "text-warning" },
  { status: "done", icon: CircleCheckIcon, tone: "text-success" },
];

const PRIORITY_META: Record<Task["priority"], { icon: typeof SignalLowIcon; tone: string }> = {
  low: { icon: SignalLowIcon, tone: "text-muted-foreground" },
  medium: { icon: SignalMediumIcon, tone: "text-warning" },
  high: { icon: SignalHighIcon, tone: "text-[oklch(0.65_0.19_45)]" },
  urgent: { icon: TriangleAlertIcon, tone: "text-destructive" },
};

export function TaskBoard({
  tasks,
  currentUser,
  people,
  campaigns,
  today,
}: {
  today: string;
  tasks: TaskCard[];
  currentUser: TaskPerson;
  people: Person[];
  campaigns: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<TaskCard | null>(null);
  const [optimistic, setOptimistic] = React.useOptimistic(tasks, (state, update: { id: number; status: Task["status"] }) =>
    state.map((t) => (t.id === update.id ? { ...t, status: update.status } : t)),
  );
  const [, startTransition] = React.useTransition();

  const move = (t: TaskCard, status: Task["status"]) =>
    startTransition(async () => {
      setOptimistic({ id: t.id, status });
      const res = await setTaskStatus(t.id, status);
      if (res.error) toast.error(res.error);
      else toast.success(`Moved to ${TASK_STATUS_LABEL[status]}`);
      router.refresh();
    });

  const canEdit = (t: TaskCard) => ownsTask(currentUser, t);
  const canMove = (t: TaskCard) => allowedStatuses(currentUser, t).length > 0;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = optimistic.filter((t) => t.status === col.status);
          return (
            <section key={col.status} className="hatched flex min-w-0 flex-col rounded-xl border p-1">
              <header className="flex min-h-8 items-center gap-2 px-2 pt-0.5 pb-1">
                <col.icon className={cn("size-4", col.tone)} />
                <h2 className="text-[13px] font-medium">{TASK_STATUS_LABEL[col.status]}</h2>
                <span className="rounded-md bg-card px-1.5 text-xs text-muted-foreground tabular-nums ring-1 ring-border">{items.length}</span>
              </header>
              <div className="grid min-h-20 content-start gap-1">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed bg-card/60 px-3 py-5 text-center text-xs text-muted-foreground">No tasks</p>
                )}
                {items.map((t) => {
                  const p = PRIORITY_META[t.priority];
                  const overdue = t.dueDate && t.status !== "done" && t.dueDate < today;
                  const nextStatus = COLUMNS[COLUMNS.findIndex((c) => c.status === t.status) + 1]?.status;
                  const delegated = t.assigneeId !== t.createdById;
                  // Someone else's work waiting for this user's approval.
                  const approving = t.status === "review" && delegated && canEdit(t);
                  const waiting = t.status === "review" && !canEdit(t) && t.assigneeId === currentUser.id;
                  return (
                    <article key={t.id} className="rounded-lg border bg-card p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={cn("text-[13px] leading-snug font-medium", t.status === "done" && "text-muted-foreground line-through")}>
                          {t.title}
                        </h3>
                        {canMove(t) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1.5 size-7" aria-label="Task actions">
                                <EllipsisIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Move to</DropdownMenuLabel>
                              {COLUMNS.filter((c) => c.status !== t.status && allowedStatuses(currentUser, t).includes(c.status)).map((c) => (
                                <DropdownMenuItem key={c.status} onSelect={() => move(t, c.status)}>
                                  <c.icon className={c.tone} /> {TASK_STATUS_LABEL[c.status]}
                                </DropdownMenuItem>
                              ))}
                              {canEdit(t) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setEditing(t)}>
                                    <PencilIcon /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={async () => {
                                      if (!confirm(`Delete “${t.title}”?`)) return;
                                      const res = await deleteTask(t.id);
                                      if (res.error) toast.error(res.error);
                                      else toast.success("Task deleted");
                                      router.refresh();
                                    }}
                                  >
                                    <Trash2Icon className="text-destructive" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {delegated && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t.creatorName} → {t.assigneeName}
                        </p>
                      )}
                      {t.description && <p className="mt-1 line-clamp-2 text-[13px] whitespace-pre-line text-muted-foreground">{t.description}</p>}
                      {t.category && (
                        <p className="mt-1.5 mr-1 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <TagIcon className="size-3 shrink-0" />
                          <span className="truncate">{categoryLabel(t.category)}</span>
                        </p>
                      )}
                      {t.campaignName && (
                        <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <MegaphoneIcon className="size-3 shrink-0" />
                          <span className="truncate">{t.campaignName}</span>
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2.5 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <p.icon className={cn("size-3.5", p.tone)} />
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                        {t.dueDate && (
                          <span className={cn("inline-flex items-center gap-1", overdue ? "text-destructive" : "text-muted-foreground")}>
                            <CalendarIcon className="size-3.5" />
                            {overdue ? "Overdue · " : ""}
                            {formatDate(t.dueDate, { day: "2-digit", month: "short" })}
                          </span>
                        )}
                        <span className="ml-auto" title={`Assigned to ${t.assigneeName} by ${t.creatorName}`}>
                          <UserAvatar name={t.assigneeName} className="size-5 text-[9px]" />
                        </span>
                      </div>
                      {approving ? (
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => move(t, "in_progress")}
                            className="flex items-center justify-center gap-1.5 rounded-md border py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <RotateCcwIcon className="size-3" /> Minta revisi
                          </button>
                          <button
                            type="button"
                            onClick={() => move(t, "done")}
                            className="flex items-center justify-center gap-1.5 rounded-md border border-success/40 bg-success/10 py-1 text-xs font-medium text-success transition-colors hover:bg-success/15"
                          >
                            <CircleCheckIcon className="size-3" /> Setujui
                          </button>
                        </div>
                      ) : waiting ? (
                        <p className="mt-2 rounded-md bg-muted py-1 text-center text-xs text-muted-foreground">Menunggu persetujuan {t.creatorName}</p>
                      ) : canMove(t) && nextStatus && allowedStatuses(currentUser, t).includes(nextStatus) && (
                        <button
                          type="button"
                          onClick={() => move(t, nextStatus)}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
                        >
                          {TASK_STATUS_LABEL[nextStatus]} <ArrowRightIcon className="size-3" />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {editing && (
        <TaskDialog
          key={editing.id}
          currentUser={currentUser}
          task={editing}
          people={people}
          campaigns={campaigns}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
