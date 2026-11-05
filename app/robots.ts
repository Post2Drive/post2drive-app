import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/pricing", "/terms", "/privacy", "/cookies"],
        disallow: [
          "/dashboard",
          "/jobs",
          "/payments",
          "/vehicles",
          "/requirements",
          "/settings",
          "/notifications",
          "/admin",
          "/api",
          "/verification",
          "/verify-email",
          "/profile",
        ],
      },
    ],
    sitemap: "https://post2drive.com/sitemap.xml",
  };
}
