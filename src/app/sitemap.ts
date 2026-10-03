import type { MetadataRoute } from "next";
import { listBuchDerWocheEntries } from "@/lib/buch-der-woche/repository";
import { getMetadataBaseUrl } from "@/lib/seo";

/**
 * Public marketing + legal URLs for search engines.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getMetadataBaseUrl().origin;
  const now = new Date();

  const paths: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/kostenlos", changeFrequency: "weekly", priority: 0.9 },
    { path: "/clever-erzaehlt", changeFrequency: "weekly", priority: 0.8 },
    { path: "/buch-der-woche", changeFrequency: "weekly", priority: 0.8 },
    { path: "/preise", changeFrequency: "weekly", priority: 0.9 },
    { path: "/registrieren", changeFrequency: "monthly", priority: 0.7 },
    { path: "/anmelden", changeFrequency: "monthly", priority: 0.5 },
    { path: "/kontakt", changeFrequency: "monthly", priority: 0.5 },
    { path: "/impressum", changeFrequency: "yearly", priority: 0.2 },
    { path: "/datenschutz", changeFrequency: "yearly", priority: 0.2 },
    { path: "/agb", changeFrequency: "yearly", priority: 0.2 },
    { path: "/widerruf", changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const weeks = await listBuchDerWocheEntries();
    for (const week of weeks) {
      paths.push({
        path: `/buch-der-woche/${week.slug}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    paths.push({
      path: "/buch-der-woche/hausaufgaben",
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return paths.map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
