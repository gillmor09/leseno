/**
 * Shared SEO defaults for marketing pages (title/description/Open Graph).
 */

import type { Metadata } from "next";

export const SITE_NAME = "Leseno";

/** Production apex origin (no www) — keep in sync with `proxy.ts` redirects. */
export const CANONICAL_SITE_ORIGIN = "https://leseno.de";

/** Production canonical origin (override with NEXT_PUBLIC_SITE_URL). */
export function getMetadataBaseUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured.replace(/\/$/, ""));
      if (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.port === "3000" ||
        url.port === "3001"
      ) {
        return new URL(CANONICAL_SITE_ORIGIN);
      }
      // Always prefer apex host for canonical URLs.
      if (url.hostname === "www.leseno.de" || url.hostname === "leseno.de") {
        return new URL(CANONICAL_SITE_ORIGIN);
      }
      return url;
    } catch {
      // fall through
    }
  }
  return new URL(CANONICAL_SITE_ORIGIN);
}

export const DEFAULT_OG_IMAGE = "/landing/hero-lesen.webp";

/** Home / default description — keep ≤ ~150 chars for SERP pixel limits. */
export const DEFAULT_META_DESCRIPTION =
  "Mit leseno eigene Kindergeschichten und Abenteuer erstellen und eintauchen — passend zur Lesestufe, aus Spaß und Neugier. Kostenlos mit Basis starten.";

type PageSeoInput = {
  /** Page title; root layout appends „ — Leseno“ via template. */
  title: string;
  description: string;
  path?: string;
  /** When false, omit from search indexes (default true). */
  index?: boolean;
};

/**
 * Builds Next.js Metadata with Open Graph + Twitter for a public page.
 */
export function buildPageMetadata(input: PageSeoInput): Metadata {
  const path = input.path ?? "/";
  const index = input.index !== false;
  const fullTitle = `${input.title} — ${SITE_NAME}`;

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      locale: "de_DE",
      siteName: SITE_NAME,
      title: fullTitle,
      description: input.description,
      url: path,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1536,
          height: 1024,
          alt: "Kind liest eine Geschichte am Fenster",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: input.description,
      images: [DEFAULT_OG_IMAGE],
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

/** JSON-LD WebApplication snippet for the marketing home. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: CANONICAL_SITE_ORIGIN,
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Web",
    inLanguage: "de-DE",
    description: DEFAULT_META_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Basis kostenlos starten; Plus, Familie und Komplett optional.",
    },
    audience: {
      "@type": "PeopleAudience",
      suggestedMinAge: 5,
      suggestedMaxAge: 10,
      name: "Kinder und Familien",
    },
  };
}
