/**
 * Seed / offline fallback for Buch der Woche.
 * Live weeks live in `leseno.buch_der_woche_*` (see repository).
 */

/** Seeded first week — keep in sync with migration `20261003180000_buch_der_woche.sql`. */
export const BUCH_DER_WOCHE_SEED = {
  slug: "hausaufgaben",
  romanId: "1504aba8-85cc-44fb-8236-b8ff4f02a8dc",
  teaserHeadline: "Warum Hausaufgaben dein Gehirn trainieren",
  teaserLead:
    "Ein Dutzend Kurzgeschichten über Lernen, Motivation und den inneren Schweinehund — zum Mitfiebern und Verstehen.",
} as const;

/** Brand slogan on IG creatives and marketing. */
export const BUCH_DER_WOCHE_SLOGAN = "So spannend geht schlau";
