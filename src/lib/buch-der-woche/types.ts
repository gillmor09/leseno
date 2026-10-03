/**
 * Buch der Woche — DB entry + settings shapes.
 */

export type BuchDerWocheEntry = {
  slug: string;
  romanId: string;
  teaserHeadline: string;
  teaserLead: string;
  igImageDataUrl: string;
  igCaption: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BuchDerWocheSettings = {
  currentSlug: string | null;
  updatedAt: string | null;
};

export type BuchDerWocheUpsertInput = {
  slug: string;
  romanId: string;
  teaserHeadline: string;
  teaserLead: string;
  /** Pass null to leave existing IG image unchanged. */
  igImageDataUrl?: string | null;
  /** Pass null to leave existing caption unchanged. */
  igCaption?: string | null;
  setPublished?: boolean;
};
