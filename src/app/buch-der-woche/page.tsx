import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuchDerWocheLanding } from "@/components/features/buch-der-woche/buch-der-woche-landing";
import { getCurrentBuchDerWoche } from "@/lib/buch-der-woche/catalog";
import { loadBuchDerWocheBook } from "@/lib/buch-der-woche/load-featured-book";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const current = getCurrentBuchDerWoche();
  const book = await loadBuchDerWocheBook(current.slug);
  const title = book
    ? `Buch der Woche: ${book.title}`
    : "Buch der Woche — Clever erzählt";
  const description =
    book?.einzeiler ||
    book?.klappentext?.slice(0, 150) ||
    "Jede Woche ein Clever-erzählt-Buch zum Online-Lesen — Wissen in Kurzgeschichten.";

  return buildPageMetadata({
    title,
    description,
    path: "/buch-der-woche",
  });
}

/**
 * Instagram landing: current Clever-erzählt „Buch der Woche“ with inline reader.
 */
export default async function BuchDerWochePage() {
  const current = getCurrentBuchDerWoche();
  const book = await loadBuchDerWocheBook(current.slug);
  if (!book) notFound();
  return <BuchDerWocheLanding book={book} />;
}
