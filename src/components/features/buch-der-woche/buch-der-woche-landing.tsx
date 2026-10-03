/**
 * Marketing teaser + inline Clever-erzählt reader for Instagram „Buch der Woche“.
 */

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { ProtectedBookReader } from "@/components/features/buch-der-woche/protected-book-reader";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import type { BuchDerWocheBook } from "@/lib/buch-der-woche/load-featured-book";

/** Series badge in `public/` — keep path in sync with `clever-cover-logos.ts`. */
const CLEVER_BADGE_SRC = "/clever_erzählt_300.png";

type BuchDerWocheLandingProps = {
  book: BuchDerWocheBook;
};

function ageLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${min}–${max} Jahre`;
  if (min != null) return `ab ${min} Jahren`;
  if (max != null) return `bis ${max} Jahre`;
  return null;
}

/**
 * Full public landing: hero teaser, blurb, then protected inline book.
 */
export function BuchDerWocheLanding({ book }: BuchDerWocheLandingProps) {
  const age = ageLabel(book.zielAlterMin, book.zielAlterMax);
  const headline =
    book.entry.teaserHeadline?.trim() ||
    book.einzeiler ||
    `Diese Woche: ${book.title}`;
  const lead =
    book.entry.teaserLead?.trim() ||
    book.einzeiler ||
    "Kurzgeschichten mit Abenteuer und echtem Wissen — aus der Serie Clever erzählt.";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative min-h-[min(92vh,860px)] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(251,146,60,0.35),transparent_50%),radial-gradient(ellipse_at_90%_80%,rgba(250,204,21,0.22),transparent_45%),linear-gradient(165deg,#1c1917_0%,#292524_42%,#431407_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />

          <div className="relative mx-auto flex min-h-[min(92vh,860px)] max-w-6xl flex-col justify-end px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-20">
            <div className="max-w-2xl animate-[fadeUp_0.7s_ease-out_both]">
              <div className="flex items-center gap-3">
                <Image
                  src={CLEVER_BADGE_SRC}
                  alt="Clever erzählt"
                  width={72}
                  height={72}
                  className="size-14 rounded-2xl shadow-lg ring-1 ring-white/20 sm:size-16"
                  priority
                />
                <div>
                  <p className="text-sm font-extrabold tracking-[0.14em] text-amber-300 uppercase">
                    Clever erzählt
                  </p>
                  <p className="text-xs font-bold tracking-wide text-orange-200/90 uppercase">
                    Buch der Woche
                  </p>
                </div>
              </div>

              <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl">
                {book.title}
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-orange-50/90 sm:text-xl">
                {lead}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#buch"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-extrabold text-zinc-950 transition hover:bg-amber-300"
                >
                  <BookOpen className="size-4" aria-hidden />
                  Buch jetzt lesen
                </a>
                <Link
                  href="/kostenlos"
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/15"
                >
                  <Sparkles className="size-4" aria-hidden />
                  Eigene Geschichte starten
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative border-b border-zinc-950/5 bg-[#fff7ed]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
            <div className="animate-[fadeUp_0.8s_ease-out_0.1s_both]">
              <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
                Diese Woche im Fokus
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                {headline}
              </h2>
              {book.klappentext ? (
                <p className="mt-5 text-base leading-relaxed text-zinc-700 sm:text-lg">
                  {book.klappentext}
                </p>
              ) : null}
              <ul className="mt-6 flex flex-wrap gap-2 text-sm font-bold text-zinc-700">
                {age ? (
                  <li className="rounded-full bg-white px-3 py-1.5 ring-1 ring-zinc-950/10">
                    {age}
                  </li>
                ) : null}
                <li className="rounded-full bg-white px-3 py-1.5 ring-1 ring-zinc-950/10">
                  {book.chapterCount} Kurzgeschichten
                </li>
                <li className="rounded-full bg-white px-3 py-1.5 ring-1 ring-zinc-950/10">
                  Mit Abenteuer-Wissen
                </li>
              </ul>
            </div>

            <div
              aria-hidden
              className="relative mx-auto w-full max-w-sm animate-[fadeUp_0.9s_ease-out_0.2s_both]"
            >
              <div className="aspect-[3/4] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-orange-600 via-amber-500 to-yellow-400 p-1 shadow-2xl shadow-orange-900/20 ring-1 ring-orange-950/10">
                <div className="flex h-full flex-col items-center justify-between rounded-[1.55rem] bg-zinc-950/90 px-6 py-8 text-center">
                  {book.hasCover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- cover is a data URL from the roman pipeline
                    <img
                      src={book.coverImageDataUrl}
                      alt=""
                      className="h-full w-full rounded-[1.25rem] object-cover"
                      draggable={false}
                    />
                  ) : (
                    <>
                      <Image
                        src={CLEVER_BADGE_SRC}
                        alt=""
                        width={120}
                        height={120}
                        className="size-24 rounded-2xl"
                      />
                      <div>
                        <p className="text-xs font-extrabold tracking-[0.2em] text-amber-300 uppercase">
                          Clever erzählt
                        </p>
                        <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">
                          {book.title}
                        </p>
                        {book.einzeiler ? (
                          <p className="mt-3 text-sm font-semibold leading-snug text-orange-100/85">
                            {book.einzeiler}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-[11px] font-bold tracking-wide text-zinc-400 uppercase">
                        leseno · Buch der Woche
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="buch"
          className="scroll-mt-20 bg-zinc-100 px-4 py-12 sm:px-6 sm:py-16"
        >
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
                  Online lesen
                </p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
                  {book.title}
                </h2>
              </div>
              <p className="max-w-xs text-right text-xs font-semibold text-zinc-500">
                Nicht zum Download — einfach hier im Browser blättern.
              </p>
            </div>
            <ProtectedBookReader
              previewHtml={book.previewHtml}
              title={book.title}
            />
            <div className="mt-10 text-center">
              <p className="text-sm font-semibold text-zinc-600">
                Lust auf eigene Abenteuer mit Wissens-Häppchen?
              </p>
              <Link
                href="/kostenlos"
                className="mt-4 inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white hover:bg-orange-800"
              >
                Kostenlos ausprobieren
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
