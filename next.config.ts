import type { NextConfig } from "next";

// All "today"/month calculations use the team's calendar, not the host's.
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

const nextConfig: NextConfig = {
  // the floating dev badge sits on top of the sidebar's profile card
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    // Reuse a page already visited (or prefetched when the pointer rests on its menu link) for 30 seconds
    // instead of asking the server again on every click; Next's default is 0. Saving a form revalidates
    // its paths, so one's own changes still show at once. Both at 30 s bounds how old any view can be.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
