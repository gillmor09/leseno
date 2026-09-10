import type { Metadata } from "next";
import { LandingPage } from "@/components/features/landing/landing-page";
import { buildPageMetadata, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Eigene Kindergeschichten aus Spaß und Neugier",
  description:
    "Eigene Kindergeschichten, die Kinder freiwillig lesen wollen — passende Lesestufe, Lust statt Druck, Staunen ohne Schulgefühl. Kostenlos mit Basis starten oder ohne Konto ausprobieren.",
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
