import type { Metadata } from "next";
import { LandingPage } from "@/components/features/landing/landing-page";
import { buildPageMetadata, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Lesen üben mit eigenen Geschichten für Grundschulkinder",
  description:
    "Leseno hilft Grundschulkindern beim Lesen: eigene Geschichten wählen, lesen üben und Wissen staunen. Silbenhilfe, Vorlesen und Bilder in den passenden Paketen. Kostenlos starten.",
  path: "/",
});

/**
 * Marketing home with SEO metadata + JSON-LD for search engines.
 */
export default function Home() {
  const jsonLd = homeJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
