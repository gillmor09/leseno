import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuchDerWocheLanding } from "@/components/features/buch-der-woche/buch-der-woche-landing";
import {
  BUCH_DER_WOCHE_CATALOG,
  getBuchDerWocheEntry,
} from "@/lib/buch-der-woche/catalog";
import { loadBuchDerWocheBook } from "@/lib/buch-der-woche/load-featured-book";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return BUCH_DER_WOCHE_CATALOG.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getBuchDerWocheEntry(slug);
  if (!entry) {
    return buildPageMetadata({
      title: "Buch der Woche",
      description: "Clever erzählt — Buch der Woche.",
      path: `/buch-der-woche/${slug}`,
      index: false,
    });
  }

  const book = await loadBuchDerWocheBook(entry.slug);
  const title = book
    ? `Buch der Woche: ${book.title}`
    : `Buch der Woche: ${entry.slug}`;
  const description =
    book?.einzeiler ||
    book?.klappentext?.slice(0, 150) ||
    "Clever erzählt — Wissen in Kurzgeschichten zum Online-Lesen.";

  return buildPageMetadata({
    title,
    description,
    path: `/buch-der-woche/${entry.slug}`,
  });
}

/**
 * Permalink for a curated Clever-erzählt week (e.g. `/buch-der-woche/hausaufgaben`).
 */
export default async function BuchDerWocheSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const book = await loadBuchDerWocheBook(slug);
  if (!book) notFound();
  return <BuchDerWocheLanding book={book} />;
}
