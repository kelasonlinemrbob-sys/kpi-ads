"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, LoaderIcon, PlusIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import type { Campaign } from "@/db/schema";
import { generateAdsReport } from "@/actions/ads-sync";
import { createProductFromReport } from "@/actions/campaigns";
import { saveReport } from "@/actions/reports";
import { PLATFORM_DOT, PLATFORM_LABEL } from "@/lib/labels";
import { advertiserReportWindows } from "@/lib/reporting";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Platform = Campaign["platform"];

export type AdvertiserCampaignOption = {
  id: number;
  name: string;
  product: string;
  platform: Platform;
  status: Campaign["status"];
  /** Linked to a Meta/Google campaign ID, so its numbers can be generated from the ads API. */
  linked: boolean;
};

export type CampaignBreakdown = {
  id: string;
  name: string;
  spent: number;
  impressions: number;
  clicks: number;
  leads: number;
};

export type AdvertiserReportItemValue = {
  id: number;
  campaignId: number;
  performanceDate: string;
  platform: Platform;
  spent: number;
  impressions: number;
  clicks: number;
  leads: number;
  campaigns: CampaignBreakdown[];
};

type FormRow = {
  key: string;
  campaignId: string;
  /** Performance date of the period the row belongs to. */
  period: string;
  platform: Platform;
  spent: string;
  impressions: string;
  clicks: string;
  leads: string;
  /** Filled by "Generate dari Ads" and not edited since. */
  fromApi?: boolean;
  /** Platform campaigns summed into this row by "Generate dari Ads"; cleared on manual edits. */
  campaigns?: CampaignBreakdown[];
};

const METRIC_FIELDS = ["spent", "impressions", "clicks", "leads"] as const;

const idNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const formatId = (value: number) => idNumber.format(Math.round(value));
const formatRp = (value: number) => `Rp ${formatId(value)}`;
/** Cost per result = spent ÷ lead; null when there are no leads. */
const costPerResult = (spent: number, leads: number) => (leads > 0 ? spent / leads : null);

function emptyRow(period: string, key: string, campaign?: AdvertiserCampaignOption): FormRow {
  return {
    key,
    campaignId: campaign ? String(campaign.id) : "",
    period,
    platform: campaign?.platform ?? "meta",
    spent: "",
    impressions: "",
    clicks: "",
    leads: "",
  };
}

const isBlank = (row: FormRow) => METRIC_FIELDS.every((field) => row[field] === "");
const isComplete = (row: FormRow) => Boolean(row.campaignId) && METRIC_FIELDS.every((field) => row[field] !== "");

export function AdvertiserReportForm({
  date,
  minDate,
  maxDate,
  initialPeriod,
  campaigns: initialCampaigns,
  existing,
  existingItems,
  dualRole = false,
}: {
  /** Member also holds another role: keep ?role= in the URL when switching dates. */
  dualRole?: boolean;
  date: string;
  minDate: string;
  maxDate: string;
  initialPeriod: string;
  campaigns: AdvertiserCampaignOption[];
  existing: { status: string; summary: string; reviewNote: string | null } | null;
  existingItems: AdvertiserReportItemValue[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReport, undefined);
  const [generating, startGenerating] = React.useTransition();
  const [issues, setIssues] = React.useState<{
    errors: { account: string; error: string }[];
    unmapped: { account: string; spent: number; campaigns: { name: string; spent: number }[] }[];
  } | null>(null);
  const nextKey = React.useRef(2);
  const periods = advertiserReportWindows(date);
  const [activePeriod, setActivePeriod] = React.useState(
    periods.some((period) => period.performanceDate === initialPeriod) ? initialPeriod : periods[0]!.performanceDate,
  );
  const active = periods.find((period) => period.performanceDate === activePeriod)!;
  const savedPeriods = new Set(existingItems.map((item) => item.performanceDate));
  const [campaigns, setCampaigns] = React.useState(initialCampaigns);
  const [newProductFor, setNewProductFor] = React.useState<string | null>(null);
  const linkedCount = campaigns.filter((campaign) => campaign.linked).length;

  const [rows, setRows] = React.useState<FormRow[]>(() =>
    periods.flatMap((period) => {
      const saved = existingItems.filter((item) => item.performanceDate === period.performanceDate);
      if (!saved.length) return [emptyRow(period.performanceDate, `new-${period.performanceDate}`, campaigns[0])];
      return saved.map((item) => ({
        key: `saved-${item.id}`,
        campaignId: String(item.campaignId),
        period: item.performanceDate,
        platform: item.platform,
        spent: String(Math.round(item.spent)),
        impressions: String(item.impressions),
        clicks: String(item.clicks),
        leads: String(item.leads),
        ...(item.campaigns.length ? { fromApi: true, campaigns: item.campaigns } : {}),
      }));
    }),
  );
  const activeRows = rows.filter((row) => row.period === activePeriod);

  const setRow = (key: string, patch: Partial<FormRow>) => {
    const touchesMetrics = METRIC_FIELDS.some((field) => field in patch);
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch, ...(touchesMetrics ? { fromApi: false, campaigns: undefined } : {}) } : row)),
    );
  };

  const addRow = () => {
    setRows((current) => {
      const used = new Set(current.filter((row) => row.period === activePeriod).map((row) => row.campaignId));
      // Next unused product, or an empty row where a new product can be created from the dropdown.
      const campaign = campaigns.find((option) => !used.has(String(option.id)));
      return [...current, emptyRow(activePeriod, `new-${nextKey.current++}`, campaign)];
    });
  };

  const removeRow = (key: string) => {
    if (activeRows.length <= 1) return;
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const generate = () => {
    const period = activePeriod;
    startGenerating(async () => {
      const result = await generateAdsReport(date, period);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setIssues({ errors: result.errors, unmapped: result.unmapped });
      setRows((current) => {
        const generated = new Map(result.rows.map((row) => [String(row.campaignId), row]));
        // Update rows that already exist for the product, drop untouched blank rows, append the rest.
        const updated = current.flatMap((row): FormRow[] => {
          if (row.period !== period) return [row];
          const hit = generated.get(row.campaignId);
          if (hit) {
            generated.delete(row.campaignId);
            return [{ ...row, platform: hit.platform, ...toStrings(hit), fromApi: true, campaigns: hit.campaigns }];
          }
          return isBlank(row) ? [] : [row];
        });
        const added = [...generated.values()].map((hit) => ({
          ...emptyRow(period, `new-${nextKey.current++}`),
          campaignId: String(hit.campaignId),
          platform: hit.platform,
          ...toStrings(hit),
          fromApi: true,
          campaigns: hit.campaigns,
        }));
        const next = [...updated, ...added];
        return next.some((row) => row.period === period)
          ? next
          : [...next, emptyRow(period, `new-${nextKey.current++}`, campaigns[0])];
      });
      if (result.rows.length) {
        toast.success(`${result.rows.length} product berhasil di-generate dari Ads (${formatDate(result.performanceDate, { day: "2-digit", month: "short" })}).`);
      }
      if (result.errors.length) toast.warning(`${result.errors.length} akun iklan gagal ditarik. Isi product terkait secara manual.`);
    });
  };

  // The active period is always submitted; another period only when every one of its rows is fully
  // filled in, so a half-edited hidden period never overwrites what is already saved.
  const otherPeriods = periods.filter((period) => period.performanceDate !== activePeriod).map((period) => {
    return rows.filter((row) => row.period === period.performanceDate);
  });
  const submittedRows = [...activeRows, ...otherPeriods.filter((list) => list.length && list.every(isComplete)).flat()];
  const payload = submittedRows.map(({ key: _key, fromApi: _fromApi, period, ...row }) => ({
    ...row,
    performanceDate: period,
    campaignId: Number(row.campaignId),
    spent: Number(row.spent),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    leads: Number(row.leads),
  }));

  const totals = activeRows.reduce(
    (total, row) => ({
      spent: total.spent + (Number(row.spent) || 0),
      impressions: total.impressions + (Number(row.impressions) || 0),
      clicks: total.clicks + (Number(row.clicks) || 0),
      leads: total.leads + (Number(row.leads) || 0),
    }),
    { spent: 0, impressions: 0, clicks: 0, leads: 0 },
  );

  const totalCpr = costPerResult(totals.spent, totals.leads);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (activeRows.some((row) => !row.campaignId)) {
          event.preventDefault();
          toast.error("Pilih product di setiap baris, atau hapus baris yang kosong.");
        }
      }}
      className="grid gap-5"
    >
      <input type="hidden" name="advertiserItems" value={JSON.stringify(payload)} />
      <input type="hidden" name="role" value="advertiser" />

      {/* Toolbar: tanggal · periode · generate */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          id="date"
          name="date"
          type="date"
          aria-label="Tanggal laporan"
          defaultValue={date}
          min={minDate}
          max={maxDate}
          onChange={(event) => event.target.value && router.replace(`/reports/new?date=${event.target.value}${dualRole ? "&role=advertiser" : ""}`)}
          className="sm:w-40"
          required
        />
        <div
          role="tablist"
          aria-label="Periode laporan"
          className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1"
        >
          {periods.map((period) => {
            const selected = period.performanceDate === activePeriod;
            return (
              <button
                key={period.performanceDate}
                type="button"
                role="tab"
                aria-selected={selected}
                title={`${period.title} · ${period.timeRange}`}
                onClick={() => setActivePeriod(period.performanceDate)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1 text-sm transition-colors sm:flex-none",
                  selected ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {period.label}
                <span className="text-xs text-muted-foreground">
                  {formatDate(period.performanceDate, { day: "numeric", month: "short" })}
                </span>
                {savedPeriods.has(period.performanceDate) && (
                  <CheckCircle2Icon className="size-3.5 text-success" aria-label="Tersimpan" />
                )}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          onClick={generate}
          disabled={generating || linkedCount === 0}
          title={linkedCount === 0 ? "Hubungkan product ke akun iklan & isi kode product di halaman Campaigns" : undefined}
        >
          {generating ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />} Generate dari Ads
        </Button>
      </div>

      <ReportTable
        window={active}
        rows={activeRows}
        campaigns={campaigns}
        locked={generating}
        onChange={setRow}
        onAdd={addRow}
        onCreateProduct={setNewProductFor}
        onRemove={removeRow}
        footer={
          <>
            <span className="text-sm font-medium lg:col-span-1">Total</span>
            <TotalCell label="Spent">{formatId(totals.spent)}</TotalCell>
            <TotalCell label="Impression">{formatId(totals.impressions)}</TotalCell>
            <TotalCell label="Click">{formatId(totals.clicks)}</TotalCell>
            <TotalCell label="Lead">{formatId(totals.leads)}</TotalCell>
            <TotalCell label="CPR">{totalCpr === null ? "—" : formatId(totalCpr)}</TotalCell>
          </>
        }
      />

      {issues && (issues.errors.length > 0 || issues.unmapped.length > 0) && (
        <div className="grid gap-2 text-sm text-muted-foreground">
          {issues.errors.map((item) => (
            <p key={item.account} className="flex gap-2">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <span className="font-medium text-foreground">{item.account}</span> gagal ditarik — {item.error}
              </span>
            </p>
          ))}
          {issues.unmapped.map((item) => (
            <details key={item.account} className="group">
              <summary className="flex cursor-pointer list-none gap-2">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  <span className="font-medium text-foreground">{formatRp(item.spent)}</span> dari {item.campaigns.length} campaign di{" "}
                  {item.account} belum terpetakan ke product — tambahkan kode product di nama campaign.{" "}
                  <span className="underline underline-offset-4 group-open:hidden">Lihat</span>
                </span>
              </summary>
              <ul className="mt-1 ml-6 grid gap-0.5 text-xs">
                {item.campaigns.map((campaign) => (
                  <li key={campaign.name} className="flex justify-between gap-4">
                    <span className="truncate">{campaign.name}</span>
                    <span className="tabular-nums">{formatRp(campaign.spent)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="summary">Catatan</Label>
        <Textarea
          id="summary"
          name="summary"
          rows={2}
          defaultValue={existing?.summary}
          placeholder="Optimasi, perubahan budget, kendala, atau insight penting…"
          minLength={5}
          required
        />
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">{state.error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {active.timeRange} · dapat diedit hingga 7 hari
          </p>
        )}
        <Button type="submit" className="sm:min-w-40" disabled={pending || generating}>
          {pending && <LoaderIcon className="animate-spin" />}
          {savedPeriods.has(activePeriod) ? "Perbarui laporan" : "Kirim laporan"}
        </Button>
      </div>
      <NewProductDialog
        open={newProductFor !== null}
        onOpenChange={(open) => !open && setNewProductFor(null)}
        onCreated={(campaign) => {
          setCampaigns((current) => [...current, campaign]);
          if (newProductFor) setRow(newProductFor, { campaignId: String(campaign.id), platform: campaign.platform });
          setNewProductFor(null);
          toast.success(`Product ${campaign.product} ditambahkan`);
        }}
      />
    </form>
  );
}

const NEW_PRODUCT = "__new__";

function NewProductDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (campaign: AdvertiserCampaignOption) => void;
}) {
  const [product, setProduct] = React.useState("");
  const [platform, setPlatform] = React.useState<Platform>("meta");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, startSaving] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setProduct("");
      setError(null);
    }
  }, [open]);

  // Not a nested <form>: this dialog renders inside the report form.
  const submit = () =>
    startSaving(async () => {
      const result = await createProductFromReport({ product, platform });
      if ("error" in result && result.error) setError(result.error);
      else if (result.ok) onCreated(result.campaign);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Product baru</DialogTitle>
          <DialogDescription>Product langsung aktif dan bisa dilengkapi nanti di halaman Campaigns.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new-product">Nama product</Label>
            <Input
              id="new-product"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Serum Brightening"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(value: Platform) => setPlatform(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PLATFORM_LABEL) as Platform[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {PLATFORM_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={submit} disabled={saving || product.trim().length < 2}>
            {saving && <LoaderIcon className="animate-spin" />} Tambah product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toStrings(metrics: { spent: number; impressions: number; clicks: number; leads: number }) {
  return {
    spent: String(metrics.spent),
    impressions: String(metrics.impressions),
    clicks: String(metrics.clicks),
    leads: String(metrics.leads),
  };
}

const ROW_GRID = "lg:grid-cols-[minmax(220px,1.8fr)_repeat(4,minmax(90px,1fr))_minmax(90px,1fr)_32px]";

function ReportTable({
  window,
  rows,
  campaigns,
  locked,
  onChange,
  onAdd,
  onCreateProduct,
  onRemove,
  footer,
}: {
  window: ReturnType<typeof advertiserReportWindows>[number];
  rows: FormRow[];
  campaigns: AdvertiserCampaignOption[];
  locked: boolean;
  onChange: (key: string, patch: Partial<FormRow>) => void;
  onAdd: () => void;
  onCreateProduct: (rowKey: string) => void;
  onRemove: (key: string) => void;
  footer: React.ReactNode;
}) {

  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-label={window.title}>
      <div className={cn("hidden gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid", ROW_GRID)}>
        <span>Product</span>
        <span className="text-right">Spent (Rp)</span>
        <span className="text-right">Impression</span>
        <span className="text-right">Click</span>
        <span className="text-right">Lead</span>
        <span className="text-right">CPR (Rp)</span>
        <span />
      </div>

      <div className="divide-y">
        {rows.map((row, index) => {
          const usedByOtherRows = new Set(
            rows.filter((other) => other.key !== row.key).map((other) => other.campaignId).filter(Boolean),
          );
          const productOptions = campaigns.filter(
            (campaign) => !usedByOtherRows.has(String(campaign.id)) || String(campaign.id) === row.campaignId,
          );
          const cpr = costPerResult(Number(row.spent) || 0, Number(row.leads) || 0);

          return (
            <div key={row.key} className={cn("grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-3 lg:items-center", ROW_GRID)}>
              <CompactField label="Product" className="col-span-2 sm:col-span-3 lg:col-span-1">
                <Select
                  value={row.campaignId || undefined}
                  onValueChange={(campaignId) => {
                    if (campaignId === NEW_PRODUCT) return onCreateProduct(row.key);
                    const campaign = campaigns.find((option) => String(option.id) === campaignId);
                    onChange(row.key, { campaignId, platform: campaign?.platform ?? row.platform });
                  }}
                  disabled={locked}
                >
                  <SelectTrigger
                    className="w-full"
                    title={row.fromApi ? `Total dari ${row.campaigns?.length ?? 0} campaign di Ads` : undefined}
                  >
                    <SelectValue placeholder="Pilih product" />
                    {row.fromApi && <SparklesIcon className="ml-auto size-3.5 text-info" />}
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((campaign) => (
                      <SelectItem key={campaign.id} value={String(campaign.id)}>
                        <span className={cn("mr-2 inline-block size-2 shrink-0 rounded-full", PLATFORM_DOT[campaign.platform])} />
                        {campaign.product}
                        <span className="text-muted-foreground"> · {PLATFORM_LABEL[campaign.platform]}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_PRODUCT} className="border-t text-muted-foreground">
                      <PlusIcon className="mr-2 inline size-3.5" />
                      Product baru…
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CompactField>

              <NumberField label="Spent (Rp)" value={row.spent} disabled={locked} onChange={(spent) => onChange(row.key, { spent })} />
              <NumberField label="Impression" value={row.impressions} disabled={locked} onChange={(impressions) => onChange(row.key, { impressions })} />
              <NumberField label="Click" value={row.clicks} disabled={locked} onChange={(clicks) => onChange(row.key, { clicks })} />
              <NumberField label="Lead" value={row.leads} disabled={locked} onChange={(leads) => onChange(row.key, { leads })} />
              <CompactField label="CPR (Rp)">
                <span className="flex h-8 items-center text-sm tabular-nums text-muted-foreground lg:justify-end" title="Spent ÷ Lead">
                  {cpr === null ? "—" : formatId(cpr)}
                </span>
              </CompactField>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="self-end justify-self-end text-muted-foreground hover:text-destructive lg:self-center"
                onClick={() => onRemove(row.key)}
                disabled={locked || rows.length <= 1}
                aria-label={`Hapus baris ${index + 1}`}
              >
                <Trash2Icon />
              </Button>
            </div>
          );
        })}
      </div>

      <div className={cn("grid grid-cols-2 items-center gap-3 border-t bg-muted/40 px-4 py-2.5 sm:grid-cols-3", ROW_GRID)}>
        {footer}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={locked}
        className="flex w-full items-center gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
      >
        <PlusIcon className="size-4" /> Tambah baris
        <span className="ml-auto text-xs">{rows.length} baris</span>
      </button>
    </div>
  );
}

function TotalCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-2 text-sm font-medium tabular-nums lg:justify-end">
      <span className="text-xs font-normal text-muted-foreground lg:hidden">{label}</span>
      {children}
    </span>
  );
}

function CompactField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <span className="text-xs text-muted-foreground lg:sr-only">{label}</span>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <CompactField label={label}>
      <Input
        aria-label={label}
        type="text"
        inputMode="numeric"
        placeholder="0"
        value={value === "" ? "" : formatId(Number(value))}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits);
        }}
        disabled={disabled}
        className="text-right tabular-nums"
        required
      />
    </CompactField>
  );
}
