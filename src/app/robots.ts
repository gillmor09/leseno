import type { MetadataRoute } from "next";
import { getMetadataBaseUrl } from "@/lib/seo";

/**
 * Allows public marketing pages; blocks admin and auth internals.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getMetadataBaseUrl().origin;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/hooks/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
