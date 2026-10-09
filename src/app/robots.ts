import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/login", "/forgot-password", "/reset-password", "/accept-invitation", "/f/"],
    },
    sitemap: "https://ads.lkbimrbob.com/sitemap.xml",
  };
}
