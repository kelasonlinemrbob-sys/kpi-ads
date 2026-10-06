"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Old links pointed at /settings#whatsapp or #meta-ads; those sections now live on the Integrasi tab. */
export function HashToTab() {
  const router = useRouter();
  const params = useSearchParams();
  React.useEffect(() => {
    const hash = window.location.hash;
    if ((hash === "#whatsapp" || hash === "#meta-ads" || hash === "#google-ads" || hash === "#telegram" || hash === "#google-sheets") && (params.get("tab") !== "integrasi" || params.get("service") !== hash.slice(1))) router.replace(`/settings?tab=integrasi&service=${hash.slice(1)}${hash}`, { scroll: false });
  }, [params, router]);
  return null;
}
