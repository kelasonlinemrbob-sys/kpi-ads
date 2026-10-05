"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Old links pointed at /settings#whatsapp or #meta-ads; those sections now live on the Integrasi tab. */
export function HashToTab() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const hash = window.location.hash;
    if (!params.get("tab") && (hash === "#whatsapp" || hash === "#meta-ads" || hash === "#google-ads")) router.replace(`/settings?tab=integrasi${hash}`);
  }, [params, router]);
  return null;
}
