import { ClipboardListIcon, ExternalLinkIcon } from "lucide-react";
import type { WebmasterTaskSnapshot } from "@/db/schema";
import { WEBMASTER_STATUS_LABEL } from "@/lib/webmaster-constants";
import { categoryLabel } from "@/lib/task-rules";
import { PRIORITY_LABEL } from "@/lib/labels";
import { Panel } from "@/components/dashboard/panel";
import { WebmasterTaskSummary } from "@/components/webmaster-task-summary";

export function WebmasterReportDetail({ items }: { items: WebmasterTaskSnapshot[] }) {
  return <Panel title="Task Harian Webmaster" icon={ClipboardListIcon} bodyClassName="space-y-4 p-4">
    <WebmasterTaskSummary items={items} />
    <p className="text-xs text-muted-foreground">Status berikut adalah catatan saat laporan dikirim. Perubahan berikutnya di menu Tasks tidak mengubah riwayat laporan ini. KPI bulanan tetap mencakup seluruh task dalam cakupan bulan.</p>
    {items.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Tidak ada task yang dicatat pada laporan ini.</p>}
    {items.map((item, index) => <article key={`${item.taskId}-${index}`} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{index + 1}. {item.title}</h3>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{WEBMASTER_STATUS_LABEL[item.status]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Kategori" value={categoryLabel(item.category) ?? "Tanpa kategori"} />
        <Field label="Prioritas" value={PRIORITY_LABEL[item.priority]} />
        <Field label="Tenggat" value={item.dueDate ?? "—"} />
        <Field label="Durasi" value={item.minutesSpent ? `${item.minutesSpent} menit` : "Tidak dicatat"} />
      </dl>
      {item.note && <p className="whitespace-pre-line text-sm">{item.note}</p>}
      {item.resultUrl && /^https?:\/\//i.test(item.resultUrl) && <a href={item.resultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm underline underline-offset-2"><span className="truncate">Lihat hasil pekerjaan</span><ExternalLinkIcon className="size-3 shrink-0" /></a>}
    </article>)}
  </Panel>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}
