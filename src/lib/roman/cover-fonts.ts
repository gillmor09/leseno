/**
 * Cover display fonts — free of the product UI Nunito lock.
 * Typographer picks a family oriented at German/international bestsellers
 * in the book's genre (shelf impact + marketing).
 */

export type CoverFontFamilyId =
  | "literary"
  | "impact"
  | "commercial"
  | "modern"
  | "friendly";

export type CoverFontFiles = {
  primary: string;
  secondary: string;
  eyebrow: string;
};

/** Vendored OFL TTFs under `src/assets/fonts`. */
export const COVER_FONT_FAMILIES: Record<
  CoverFontFamilyId,
  {
    label: string;
    /** When to prefer this look (for planner + genre heuristic). */
    useFor: string;
    files: CoverFontFiles;
  }
> = {
  literary: {
    label: "Playfair Display",
    useFor:
      "literarische Belletristik, Gesellschaftsroman, Satire, Feuilleton-Bestseller — elegante Display-Serife",
    files: {
      primary: "PlayfairDisplay-Variable.ttf",
      secondary: "PlayfairDisplay-Variable.ttf",
      eyebrow: "PlayfairDisplay-Variable.ttf",
    },
  },
  impact: {
    label: "Oswald",
    useFor:
      "Thriller, Krimi, Spannung, politische Dramen — schmale Impact-Sans wie Bestseller-Blockbuster",
    files: {
      primary: "Oswald-Bold.ttf",
      secondary: "Oswald-SemiBold.ttf",
      eyebrow: "Oswald-SemiBold.ttf",
    },
  },
  commercial: {
    label: "Montserrat",
    useFor:
      "Contemporary commercial fiction, Status/Karriere, Broad-Audience Hits — starke geometrische Sans",
    files: {
      primary: "Montserrat-Black.ttf",
      secondary: "Montserrat-Bold.ttf",
      eyebrow: "Montserrat-Bold.ttf",
    },
  },
  modern: {
    label: "Sora",
    useFor:
      "modernes YA, tech-nah, klare Contemporary Covers — frische geometrische Sans",
    files: {
      primary: "Sora-ExtraBold.ttf",
      secondary: "Sora-Bold.ttf",
      eyebrow: "Sora-SemiBold.ttf",
    },
  },
  friendly: {
    label: "Nunito",
    useFor:
      "Kinderbuch / warmes YA — gerundete Sans (nur wenn das Genre es wirklich verlangt)",
    files: {
      primary: "Nunito-ExtraBold.ttf",
      secondary: "Nunito-Bold.ttf",
      eyebrow: "Nunito-Bold.ttf",
    },
  },
};

export const COVER_FONT_FAMILY_IDS = Object.keys(
  COVER_FONT_FAMILIES,
) as CoverFontFamilyId[];

/** Heuristic when the typographer omits / invents a family. */
export function coverFontFamilyForGenre(
  genre: string,
  alterLabel = "",
): CoverFontFamilyId {
  const g = `${genre} ${alterLabel}`.toLowerCase();
  if (
    /thriller|krimi|crime|suspense|spannung|horror|agent|politisch/.test(g)
  ) {
    return "impact";
  }
  if (
    /kinder|bilderbuch|clever|erstleser|8–10|8-10|10–12|10-12|vorschule/.test(
      g,
    )
  ) {
    return "friendly";
  }
  if (/ya|jugend|young.?adult|fantasy|abenteuer/.test(g)) {
    return "modern";
  }
  if (
    /satire|gesellschaft|literar|belletristik|roman|feuilleton|gegenwart|wirtschaft|bank|karriere|status/.test(
      g,
    )
  ) {
    // Satire / contemporary DE bestsellers: often bold grotesque OR literary serif.
    // Prefer commercial punch for shelf; literary when clearly "literarisch".
    if (/literar|feuilleton|poetisch/.test(g)) return "literary";
    return "commercial";
  }
  if (/romance|liebe|feel.?good|womens?.fiction/.test(g)) {
    return "literary";
  }
  return "commercial";
}

export function parseCoverFontFamily(
  value: unknown,
  fallback: CoverFontFamilyId,
): CoverFontFamilyId {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if ((COVER_FONT_FAMILY_IDS as string[]).includes(s)) {
    return s as CoverFontFamilyId;
  }
  // Aliases the model might invent
  if (/playfair|serif|literar|baskerville|garamond/.test(s)) return "literary";
  if (/oswald|impact|condensed|thriller|block/.test(s)) return "impact";
  if (/montserrat|grotesk|commercial|helvetica|impact.?sans/.test(s)) {
    return "commercial";
  }
  if (/sora|geometric|modern|tech/.test(s)) return "modern";
  if (/nunito|rounded|friendly|kids|kinder/.test(s)) return "friendly";
  return fallback;
}

/** Short catalog for the typographer system prompt. */
export function coverFontCatalogForPrompt(): string {
  return COVER_FONT_FAMILY_IDS.map((id) => {
    const f = COVER_FONT_FAMILIES[id];
    return `- "${id}" (${f.label}): ${f.useFor}`;
  }).join("\n");
}
