"use client";

import * as React from "react";
import { useActionState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { AdvertiserLevel, Role } from "@/db/schema";
import { saveTask } from "@/actions/tasks";
import { PRIORITY_LABEL } from "@/lib/labels";
import { roleLabel } from "@/lib/roles";
import { assignRuleHint, categoriesFor, type TaskPerson } from "@/lib/task-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TaskCard } from "./task-board";

export type Person = { id: number; name: string; role: Role; advertiserLevel: AdvertiserLevel | null; assignable: boolean };

export function TaskDialog({
  currentUser,
  people,
  campaigns,
  task,
  defaultOpen,
  defaultAssignee,
  onClose,
}: {
  currentUser: TaskPerson;
  people: Person[];
  campaigns: { id: number; name: string }[];
  task?: TaskCard;
  defaultOpen?: boolean;
  defaultAssignee?: number;
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(!!defaultOpen || !!task);
  const [state, action, pending] = useActionState(saveTask, undefined);
  const initialAssignee = task?.assigneeId ?? (defaultAssignee && people.some((p) => p.id === defaultAssignee && p.assignable) ? defaultAssignee : undefined);
  const [assigneeId, setAssigneeId] = React.useState(initialAssignee ? String(initialAssignee) : "");
  const [category, setCategory] = React.useState(task?.category ?? "none");
  const [description, setDescription] = React.useState(task?.description ?? "");

  // Role rules decide who can be picked; the current assignee of an existing task always stays listed.
  const options = people.filter((p) => p.assignable || p.id === task?.assigneeId);
  const assignee = people.find((p) => String(p.id) === assigneeId);
  const categories = categoriesFor(assignee);

  const pickAssignee = (value: string) => {
    setAssigneeId(value);
    const next = people.find((p) => String(p.id) === value);
    if (category !== "none" && !categoriesFor(next).some((c) => c.key === category)) setCategory("none");
  };
  const pickCategory = (value: string) => {
    setCategory(value);
    const template = categories.find((c) => c.key === value)?.template;
    if (template && !description.trim()) setDescription(template);
  };

  const change = (o: boolean) => {
    setOpen(o);
    if (!o) {
      onClose?.();
      if (defaultOpen) router.replace(pathname); // drop ?new=1
    }
  };

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      change(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={change}>
      {!task && (
        <DialogTrigger asChild>
          <Button className="h-8">
            <PlusIcon /> New task
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>The assignee gets it on their board and in Latest Updates.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {task && <input type="hidden" name="id" value={task.id} />}
          <div className="grid gap-2">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" name="title" defaultValue={task?.title} placeholder="e.g. Build landing page for promo" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Assignee</Label>
              <Select name="assigneeId" value={assigneeId} onValueChange={pickAssignee} required>
                <SelectTrigger>
                  <SelectValue placeholder="Choose member" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.id === currentUser.id ? `${p.name} (saya)` : p.name} · {roleLabel(p.role, p.advertiserLevel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Select name="category" value={category} onValueChange={pickCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa kategori</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">{assignRuleHint(currentUser)}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              name="description"
              rows={description.includes("\n") ? 6 : 3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pilih kategori untuk memakai checklist bawaan."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select name="priority" defaultValue={task?.priority ?? "medium"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-due">Due date</Label>
              <Input id="t-due" name="dueDate" type="date" defaultValue={task?.dueDate ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Related campaign</Label>
              <Select name="campaignId" defaultValue={task?.campaignId ? String(task.campaignId) : "none"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderIcon className="animate-spin" />}
              {task ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
