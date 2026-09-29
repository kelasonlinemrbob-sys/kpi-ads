"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import type { Campaign } from "@/db/schema";
import { saveCampaign } from "@/actions/campaigns";
import { CAMPAIGN_STATUS_LABEL, PLATFORM_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CampaignRow = Omit<Campaign, "createdAt" | "updatedAt"> & { ownerName: string };

export type AdAccountOption = { id: number; platform: Campaign["platform"]; name: string; accountId: string };

export function CampaignDialog({
  campaign,
  advertisers,
  adAccounts,
  open: controlledOpen,
  onOpenChange,
}: {
  campaign?: CampaignRow;
  advertisers: { id: number; name: string }[] | null;
  adAccounts: AdAccountOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [state, action, pending] = useActionState(saveCampaign, undefined);
  const [platform, setPlatform] = React.useState<Campaign["platform"]>(campaign?.platform ?? "meta");
  const platformAccounts = adAccounts.filter((account) => account.platform === platform);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!campaign && (
        <DialogTrigger asChild>
          <Button className="h-8">
            <PlusIcon /> New campaign
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>Campaign details are visible to the whole team.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          {campaign && <input type="hidden" name="id" value={campaign.id} />}
          <div className="grid gap-2">
            <Label htmlFor="c-name">Campaign name</Label>
            <Input id="c-name" name="name" defaultValue={campaign?.name} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform">
              <Select name="platform" value={platform} onValueChange={(value: Campaign["platform"]) => setPlatform(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={campaign?.status ?? "active"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CAMPAIGN_STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Objective" htmlFor="c-objective">
              <Input id="c-objective" name="objective" placeholder="Sales, Leads, Traffic…" defaultValue={campaign?.objective ?? ""} />
            </Field>
            <Field label="Product" htmlFor="c-product">
              <Input id="c-product" name="product" defaultValue={campaign?.product ?? ""} />
            </Field>
            <Field label="Daily budget (Rp)" htmlFor="c-budget">
              <Input id="c-budget" name="dailyBudget" type="number" min={0} step={1000} defaultValue={campaign?.dailyBudget ?? ""} required />
            </Field>
            {advertisers && (
              <Field label="Owner">
                <Select name="ownerId" defaultValue={campaign ? String(campaign.ownerId) : advertisers[0] ? String(advertisers[0].id) : undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose advertiser" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Start date" htmlFor="c-start">
              <Input id="c-start" name="startDate" type="date" defaultValue={campaign?.startDate ?? ""} />
            </Field>
            <Field label="End date" htmlFor="c-end">
              <Input id="c-end" name="endDate" type="date" defaultValue={campaign?.endDate ?? ""} />
            </Field>
          </div>
          {(platform === "meta" || platform === "google") && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Untuk generate laporan otomatis: semua campaign di akun iklan yang namanya mengandung kode product
                (mis. <span className="font-medium text-foreground">[SERUM] Retargeting 30D</span>) dijumlahkan ke product ini.
              </p>
              <Field label="Akun iklan">
                <Select
                  key={platform}
                  name="adAccountId"
                  defaultValue={
                    campaign?.adAccountId && platformAccounts.some((a) => a.id === campaign.adAccountId)
                      ? String(campaign.adAccountId)
                      : "none"
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak terhubung</SelectItem>
                    {platformAccounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name} · {account.accountId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Kode product" htmlFor="c-keyword">
                <Input
                  id="c-keyword"
                  name="matchKeyword"
                  placeholder="SERUM"
                  className="uppercase"
                  defaultValue={campaign?.matchKeyword ?? ""}
                />
              </Field>
            </div>
          )}
          <Field label="Landing page URL" htmlFor="c-lp">
            <Input id="c-lp" name="landingPageUrl" type="url" placeholder="https://" defaultValue={campaign?.landingPageUrl ?? ""} />
          </Field>
          <Field label="Notes" htmlFor="c-notes">
            <Textarea id="c-notes" name="notes" rows={2} defaultValue={campaign?.notes ?? ""} />
          </Field>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderIcon className="animate-spin" />}
              {campaign ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
