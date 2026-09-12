import type { Metadata } from "next";
import { LandingPage } from "@/components/features/landing/landing-page";
import {
  buildPageMetadata,
  DEFAULT_META_DESCRIPTION,
  homeJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Eigene Abenteuer-Geschichten zum Eintauchen",
  description: DEFAULT_META_DESCRIPTION,
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
