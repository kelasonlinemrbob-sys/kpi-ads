"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { syncAdCampaigns } from "@/actions/ad-accounts";
import { Button } from "@/components/ui/button";

export function SyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const sync = () =>
    startTransition(async () => {
      const res = await syncAdCampaigns();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.ok) {
        if (res.synced) toast.success(`${res.synced} campaign disinkron dari Ads`);
        for (const failure of res.failed) toast.error(`${failure.account}: ${failure.error}`);
      }
      router.refresh();
    });

  return (
    <Button
      variant="outline"
      className="h-8"
      onClick={sync}
      disabled={pending || disabled}
      title={disabled ? "Tambahkan akun iklan terlebih dahulu" : undefined}
    >
      {pending ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Sinkron dari Ads
    </Button>
  );
}
