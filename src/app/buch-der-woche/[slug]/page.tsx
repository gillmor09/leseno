import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuchDerWocheLanding } from "@/components/features/buch-der-woche/buch-der-woche-landing";
import { loadBuchDerWocheBook } from "@/lib/buch-der-woche/load-featured-book";
import { listBuchDerWocheEntries } from "@/lib/buch-der-woche/repository";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  try {
    const entries = await listBuchDerWocheEntries();
    return entries.map((entry) => ({ slug: entry.slug }));
  } catch {
    return [{ slug: "hausaufgaben" }];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await loadBuchDerWocheBook(slug);
  if (!book) {
    return buildPageMetadata({
      title: "Buch der Woche",
      description: "Clever erzählt — Buch der Woche.",
      path: `/buch-der-woche/${slug}`,
      index: false,
    });
  }

  const description =
    book.entry.teaserLead ||
    book.einzeiler ||
    book.klappentext?.slice(0, 150) ||
    "Clever erzählt — Wissen in Kurzgeschichten zum Online-Lesen.";

  return buildPageMetadata({
    title: `Buch der Woche: ${book.title}`,
    description,
    path: `/buch-der-woche/${book.entry.slug}`,
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
