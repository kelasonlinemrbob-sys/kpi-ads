"use client";

import * as React from "react";
import { ClipboardListIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { WebmasterTaskSnapshot } from "@/db/schema";
import { WEBMASTER_CATEGORIES, WEBMASTER_STATUS_LABEL } from "@/lib/webmaster-constants";
import type { WebmasterItemInput, WebmasterTaskOption } from "@/lib/webmaster-report";
import { categoryLabel } from "@/lib/task-rules";
import { PRIORITY_LABEL } from "@/lib/labels";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WebmasterTaskSummary } from "@/components/webmaster-task-summary";

type Row = WebmasterItemInput & { key: string };
const selectClass = "h-9 w-full rounded-md border bg-card px-2 text-sm disabled:opacity-50";
const fromTask = (task: WebmasterTaskOption): Row => ({ key: `task-${task.id}`, taskId: task.id, title: task.title,
  category: task.category ?? "", priority: task.priority, dueDate: task.dueDate ?? "", status: task.status,
  sourceStatus: task.status, note: "", resultUrl: "", minutesSpent: 0 });

export function WebmasterTasksEditor({ options, snapshots, locked, historical }: {
  options: WebmasterTaskOption[]; snapshots: WebmasterTaskSnapshot[]; locked: boolean; historical: boolean;
}) {
  const nextId = React.useRef(0);
  const [rows, setRows] = React.useState<Row[]>(() => snapshots.map((snapshot) => {
    const live = options.find((t) => t.id === snapshot.taskId);
    return { ...snapshot, key: `task-${snapshot.taskId}`, category: snapshot.category ?? "", dueDate: snapshot.dueDate ?? "",
      status: !historical && live ? live.status : snapshot.status, sourceStatus: live?.status };
  }));
  const [chosen, setChosen] = React.useState("");
  const available = options.filter((t) => !rows.some((r) => r.taskId === t.id));
  const update = (key: string, patch: Partial<Row>) => setRows((old) => old.map((r) => r.key === key ? { ...r, ...patch } : r));
  const addTask = () => {
    const task = available.find((t) => t.id === Number(chosen));
    if (task) setRows((old) => [...old, fromTask(task)]);
    setChosen("");
  };
  const addNew = () => setRows((old) => [...old, { key: `new-${nextId.current++}`, taskId: null,
    clientKey: crypto.randomUUID(),
    title: "", category: "general", status: "todo", priority: "medium", dueDate: "", note: "", resultUrl: "", minutesSpent: 0 }]);

  return <Panel title="Task Harian Webmaster" icon={ClipboardListIcon} bodyClassName="space-y-4 p-4">
    <input type="hidden" name="webmasterItems" value={JSON.stringify(rows.map(({ key: _key, ...row }) => row))} />
    <WebmasterTaskSummary items={rows} />
    <p className="text-xs leading-relaxed text-muted-foreground">
      {historical ? "Status pada laporan lampau disimpan sebagai riwayat dan tidak mengubah status terbaru di Tasks." : "Status disimpan ke menu Tasks saat laporan dikirim. Task dari pemberi tugas lain harus melalui Review sebelum Done."}
      {" "}Task baru dibuat untuk diri sendiri. Menghapus baris hanya mengeluarkannya dari laporan; task tetap ada di Tasks.
      {" "}KPI bulanan menghitung seluruh task dalam cakupan bulan, termasuk task yang tidak dicantumkan di laporan ini.
    </p>
    {!locked && <div className="flex flex-wrap gap-2">
      <select aria-label="Pilih task yang ditugaskan" className={`${selectClass} min-w-0 flex-1 sm:min-w-56`} value={chosen} onChange={(e) => setChosen(e.target.value)}>
        <option value="">Pilih task dari Tasks…</option>
        {available.map((t) => <option key={t.id} value={t.id}>{t.title} · {WEBMASTER_STATUS_LABEL[t.status]}</option>)}
      </select>
      <Button type="button" variant="outline" onClick={addTask} disabled={!chosen}><PlusIcon />Tambahkan</Button>
      <Button type="button" variant="outline" onClick={() => setRows((old) => [...old, ...available.filter((t) => t.status !== "done").map(fromTask)])} disabled={!available.some((t) => t.status !== "done")}>Muat task aktif</Button>
      <Button type="button" onClick={addNew}><PlusIcon />Task baru</Button>
    </div>}
    {rows.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Belum ada task dicatat. Tambahkan task yang dikerjakan; jika tidak ada, jelaskan pada ringkasan aktivitas.</p>}
    {rows.map((row, index) => {
      const live = options.find((t) => t.id === row.taskId);
      const statuses = row.taskId === null ? Object.keys(WEBMASTER_STATUS_LABEL) as Row["status"][] : [...new Set([...(live?.allowedStatuses ?? []), row.status])];
      const prefix = `wm-${row.key}`;
      const metadata = historical ? row : live ?? row;
      return <fieldset key={row.key} className="space-y-3 rounded-lg border p-4" disabled={locked}>
        <legend className="px-1 text-sm font-medium">Task {index + 1}{row.taskId === null ? " · baru" : ""}</legend>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {row.taskId === null ? <><Label htmlFor={`${prefix}-title`}>Nama task</Label><Input id={`${prefix}-title`} className="mt-2" value={row.title} onChange={(e) => update(row.key, { title: e.target.value })} required minLength={3} maxLength={200} placeholder="Contoh: perbaiki tracking checkout" /></> : <><p className="text-sm font-medium">{metadata.title}</p><p className="mt-1 text-xs text-muted-foreground">{categoryLabel(metadata.category) ?? "Tanpa kategori"} · {PRIORITY_LABEL[metadata.priority]} · Tenggat: {metadata.dueDate || "—"}</p>{!live && <p className="mt-1 text-xs text-muted-foreground">Task tidak lagi tersedia; riwayat tetap tersimpan.</p>}</>}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Keluarkan task ${index + 1} dari laporan`} onClick={() => setRows((old) => old.filter((r) => r.key !== row.key))}><Trash2Icon /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor={`${prefix}-status`}>Status pengerjaan</Label><select id={`${prefix}-status`} className={selectClass} value={row.status} onChange={(e) => update(row.key, { status: e.target.value as Row["status"] })} disabled={locked || row.taskId !== null && !live}>{statuses.map((s) => <option key={s} value={s}>{WEBMASTER_STATUS_LABEL[s]}</option>)}</select></div>
          <div className="grid gap-2"><Label htmlFor={`${prefix}-minutes`}>Durasi (menit, opsional)</Label><Input id={`${prefix}-minutes`} type="number" min={0} max={1440} step={1} value={row.minutesSpent || ""} onChange={(e) => update(row.key, { minutesSpent: e.target.value === "" ? 0 : Number(e.target.value) })} placeholder="0" /></div>
          {row.taskId === null && <>
            <div className="grid gap-2"><Label htmlFor={`${prefix}-category`}>Kategori</Label><select id={`${prefix}-category`} className={selectClass} value={row.category} onChange={(e) => update(row.key, { category: e.target.value })}>{WEBMASTER_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
            <div className="grid gap-2"><Label htmlFor={`${prefix}-priority`}>Prioritas</Label><select id={`${prefix}-priority`} className={selectClass} value={row.priority} onChange={(e) => update(row.key, { priority: e.target.value as Row["priority"] })}>{Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="grid gap-2"><Label htmlFor={`${prefix}-due`}>Tenggat (opsional)</Label><Input id={`${prefix}-due`} type="date" value={row.dueDate} onChange={(e) => update(row.key, { dueDate: e.target.value })} /></div>
          </>}
        </div>
        <div className="grid gap-2"><Label htmlFor={`${prefix}-note`}>Pekerjaan / kendala pada task ini</Label><Textarea id={`${prefix}-note`} value={row.note} onChange={(e) => update(row.key, { note: e.target.value })} rows={2} maxLength={2000} placeholder="Apa yang dikerjakan, hasil, dan kendala hari ini…" /></div>
        <div className="grid gap-2"><Label htmlFor={`${prefix}-url`}>Tautan hasil (opsional)</Label><Input id={`${prefix}-url`} type="url" value={row.resultUrl} onChange={(e) => update(row.key, { resultUrl: e.target.value })} maxLength={2000} placeholder="https://…" /></div>
      </fieldset>;
    })}
  </Panel>;
}
