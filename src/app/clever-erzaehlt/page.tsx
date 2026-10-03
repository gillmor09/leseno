import type { Metadata } from "next";
import { CleverErzaehltLanding } from "@/components/features/clever-erzaehlt/clever-erzaehlt-landing";
import { CLEVER_ERZAEHLT_SLOGAN } from "@/lib/clever-erzaehlt/marketing";
import { loadCurrentBuchDerWocheBook } from "@/lib/buch-der-woche/load-featured-book";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: `Clever erzählt — ${CLEVER_ERZAEHLT_SLOGAN}`,
  description:
    "Clever erzählt — die Buchreihe mit Abenteuer-Kurzgeschichten und echtem Wissen. Von Klassikern bis zu unüblichen Themen. Auf Amazon.de und als Buch der Woche online.",
  path: "/clever-erzaehlt",
});

/**
 * Public marketing page for the Clever-erzählt book series.
 */
export default async function CleverErzaehltPage() {
  let week: {
    title: string;
    slug: string;
    lead: string;
    coverSrc: string | null;
  } | null = null;

  try {
    const book = await loadCurrentBuchDerWocheBook();
    if (book) {
      week = {
        title: book.title,
        slug: book.entry.slug,
        lead:
          book.entry.teaserLead?.trim() ||
          book.einzeiler ||
          "Kurzgeschichten mit Abenteuer und echtem Wissen.",
        coverSrc: book.coverDisplaySrc,
      };
    }
  } catch {
    week = null;
  }

  return <CleverErzaehltLanding week={week} />;
}
