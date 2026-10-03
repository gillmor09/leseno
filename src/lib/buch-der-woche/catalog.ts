/**
 * Curated Clever-erzählt titles for the Instagram „Buch der Woche“ landing.
 * Only whitelisted `romanId`s are loadable publicly — never arbitrary UUIDs from the URL.
 */

export type BuchDerWocheMarketingArt = {
  /** Full-bleed hero / book-face art under `public/`. */
  hero: string;
  /** Optional cropped detail for secondary marketing moments. */
  detailA?: string;
  detailB?: string;
};

export type BuchDerWocheEntry = {
  /** URL slug, e.g. `hausaufgaben`. */
  slug: string;
  /** `leseno.roman_kontext.id` for this Clever title. */
  romanId: string;
  /** Optional teaser overrides when editorial copy is empty. */
  teaserHeadline?: string;
  teaserLead?: string;
  /**
   * Static marketing art (cover crops / Infografik-Ausschnitte).
   * Used when the roman has no `cover_image_data_url` yet — or as hero atmosphere.
   */
  marketingArt?: BuchDerWocheMarketingArt;
};

/**
 * Featured books that may appear on `/buch-der-woche/[slug]`.
 * Add a new entry when the Instagram week rotates.
 */
export const BUCH_DER_WOCHE_CATALOG: readonly BuchDerWocheEntry[] = [
  {
    slug: "hausaufgaben",
    romanId: "1504aba8-85cc-44fb-8236-b8ff4f02a8dc",
    teaserHeadline: "Warum Hausaufgaben dein Gehirn trainieren",
    teaserLead:
      "Zehn Kurzgeschichten über Lernen, Motivation und den inneren Schweinehund — zum Mitfiebern und Verstehen.",
    marketingArt: {
      hero: "/buch-der-woche/hausaufgaben/hero.webp",
      detailA: "/buch-der-woche/hausaufgaben/detail-a.webp",
      detailB: "/buch-der-woche/hausaufgaben/detail-b.webp",
    },
  },
] as const;

/** Stable Instagram link target: change this when the week rotates. */
export const BUCH_DER_WOCHE_CURRENT_SLUG = "hausaufgaben";

/** Resolve a catalog entry by slug. */
export function getBuchDerWocheEntry(
  slug: string,
): BuchDerWocheEntry | undefined {
  const key = slug.trim().toLowerCase();
  return BUCH_DER_WOCHE_CATALOG.find((entry) => entry.slug === key);
}

/** Current week entry (for `/buch-der-woche`). */
export function getCurrentBuchDerWoche(): BuchDerWocheEntry {
  const current = getBuchDerWocheEntry(BUCH_DER_WOCHE_CURRENT_SLUG);
  if (!current) {
    throw new Error(
      `Buch der Woche: unknown current slug "${BUCH_DER_WOCHE_CURRENT_SLUG}".`,
    );
  }
  return current;
}
