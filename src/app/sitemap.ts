import type { MetadataRoute } from "next";
import { getMetadataBaseUrl } from "@/lib/seo";

/**
 * Public marketing + legal URLs for search engines.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getMetadataBaseUrl().origin;
  const now = new Date();

  const paths: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/kostenlos", changeFrequency: "weekly", priority: 0.9 },
    { path: "/preise", changeFrequency: "weekly", priority: 0.9 },
    { path: "/registrieren", changeFrequency: "monthly", priority: 0.7 },
    { path: "/anmelden", changeFrequency: "monthly", priority: 0.5 },
    { path: "/kontakt", changeFrequency: "monthly", priority: 0.5 },
    { path: "/impressum", changeFrequency: "yearly", priority: 0.2 },
    { path: "/datenschutz", changeFrequency: "yearly", priority: 0.2 },
    { path: "/agb", changeFrequency: "yearly", priority: 0.2 },
    { path: "/widerruf", changeFrequency: "yearly", priority: 0.2 },
  ];

  return paths.map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
