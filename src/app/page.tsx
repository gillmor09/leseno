import type { Metadata } from "next";
import { LandingPage } from "@/components/features/landing/landing-page";
import { buildPageMetadata, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Eigene Geschichten aus Spaß und Neugier",
  description:
    "Eigene Geschichten, die Kinder freiwillig lesen wollen — aus Lust und Neugier, ohne Druck und ohne Schulgefühl. Silbenhilfe, Vorlesen und Bilder in den Paketen. Kostenlos mit Basis starten.",
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
