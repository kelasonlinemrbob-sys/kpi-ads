import type { NextConfig } from "next";

// All "today"/month calculations use the team's calendar, not the host's.
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

const nextConfig: NextConfig = {
  // the floating dev badge sits on top of the sidebar's profile card
  devIndicators: false,
};

export default nextConfig;
