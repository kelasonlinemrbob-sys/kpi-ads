"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckIcon, LoaderIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { reviewReport } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReviewForm({ reportId, status }: { reportId: number; status: string }) {
  const [state, action, pending] = useActionState(reviewReport, undefined);
  const [decision, setDecision] = React.useState<string>("");

  React.useEffect(() => {
    if (state?.ok) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="reportId" value={reportId} />
      <Textarea name="note" rows={3} placeholder="Feedback for the member (required for revision)" />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="revision" variant="outline" disabled={pending} onClick={() => setDecision("revision")}>
          {pending && decision === "revision" ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />}
          Revision
        </Button>
        <Button type="submit" name="decision" value="approved" disabled={pending || status === "approved"} onClick={() => setDecision("approved")}>
          {pending && decision === "approved" ? <LoaderIcon className="animate-spin" /> : <CheckIcon />}
          Approve
        </Button>
      </div>
    </form>
  );
}
