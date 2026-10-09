"use client";

import * as React from "react";
import Link from "next/link";

/** Long enough to skip links the pointer only passes over on its way elsewhere. */
const INTENT_MS = 70;

/**
 * A link that fetches its whole page as soon as the user shows intent (pointer rests on it, keyboard
 * focus, or touch), so the page is already on its way when the click lands. Until then it behaves like
 * a normal link (only the loading shell is prefetched). The current page is never refetched.
 */
export function IntentLink({ current, ...props }: React.ComponentProps<typeof Link> & { current?: boolean }) {
  const [intent, setIntent] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  React.useEffect(() => cancel, []);
  const arm = (delay: number) => {
    if (intent || current || timer.current) return;
    timer.current = setTimeout(() => setIntent(true), delay);
  };
  return (
    <Link
      {...props}
      prefetch={intent && !current ? true : null}
      onPointerEnter={(e) => {
        props.onPointerEnter?.(e);
        if (e.pointerType === "mouse") arm(INTENT_MS);
      }}
      onPointerLeave={(e) => {
        props.onPointerLeave?.(e);
        cancel();
      }}
      onFocus={(e) => {
        props.onFocus?.(e);
        arm(0);
      }}
      onTouchStart={(e) => {
        props.onTouchStart?.(e);
        arm(0);
      }}
    />
  );
}
