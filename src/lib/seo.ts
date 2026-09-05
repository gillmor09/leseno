/**
 * Shared SEO defaults for marketing pages (title/description/Open Graph).
 */

import type { Metadata } from "next";

export const SITE_NAME = "Leseno";

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
        return new URL("https://leseno.de");
      }
      return url;
    } catch {
      // fall through
    }
  }
  return new URL("https://leseno.de");
}

export const DEFAULT_OG_IMAGE = "/landing/hero-lesen.webp";

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
          alt: "Grundschulkind liest eine Leseno-Geschichte",
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
    url: "https://leseno.de",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "de-DE",
    description:
      "Eigene Geschichten für Grundschulkinder: Lesen üben, Wissen staunen — altersgerecht. Kostenlos mit Basis starten.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Basis kostenlos starten; Plus, Pro und Ultimate optional.",
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
      name: "Grundschulkinder (ca. 5–10 Jahre)",
    },
  };
}
