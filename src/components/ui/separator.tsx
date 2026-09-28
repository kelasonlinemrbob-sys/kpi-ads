import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({ className, dashed, ...props }: React.ComponentProps<"div"> & { dashed?: boolean }) {
  return (
    <div
      role="separator"
      className={cn(dashed ? "dashed-divider w-full" : "h-px w-full bg-border", className)}
      {...props}
    />
  );
}

export { Separator };
