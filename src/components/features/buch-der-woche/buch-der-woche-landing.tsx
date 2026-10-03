/**
 * Marketing teaser + inline Clever-erzählt reader for Instagram „Buch der Woche“.
 * Cover / Infografik-Art leads the hero (full-bleed + 3D book face).
 */

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { BuchCoverFace } from "@/components/features/buch-der-woche/buch-cover-face";
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
 * Full public landing: cover-led hero, blurb, then protected inline book.
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
  const coverSrc = book.coverDisplaySrc;
  const backdropSrc = book.heroBackdropSrc;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative min-h-[min(94vh,900px)] overflow-hidden">
          {backdropSrc ? (
            <div aria-hidden className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-0 scale-105">
                <BuchCoverFace
                  src={backdropSrc}
                  alt=""
                  objectPosition="center 28%"
                  priority
                  sizes="100vw"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/35" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-zinc-950/40" />
            </div>
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(251,146,60,0.35),transparent_50%),linear-gradient(165deg,#1c1917_0%,#431407_100%)]"
            />
          )}

          <div className="relative mx-auto grid min-h-[min(94vh,900px)] max-w-6xl items-center gap-8 px-4 py-16 sm:gap-10 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div className="order-2 animate-[fadeUp_0.7s_ease-out_both] lg:order-1">
              <div className="flex items-center gap-3">
                <Image
                  src={CLEVER_BADGE_SRC}
                  alt="Clever erzählt"
                  width={300}
                  height={180}
                  className="h-12 w-auto shadow-lg sm:h-14"
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

              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:mt-6 sm:text-6xl md:text-7xl">
                {book.title}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-orange-50/90 sm:text-xl">
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

            {coverSrc ? (
              <div className="relative order-1 mx-auto w-full max-w-[240px] animate-[coverIn_0.9s_ease-out_both] sm:max-w-[300px] lg:order-2 lg:max-w-none lg:justify-self-end">
                <div
                  aria-hidden
                  className="absolute -inset-8 rounded-full bg-amber-400/20 blur-3xl"
                />
                <div className="relative mx-auto aspect-[3/4.4] w-[82%] origin-bottom animate-[coverFloat_5s_ease-in-out_infinite] [transform:perspective(1200px)_rotateY(-18deg)_rotateX(4deg)_rotateZ(2deg)] sm:w-[76%] lg:w-[78%]">
                  <div className="absolute inset-y-2 -left-2 w-3 rounded-l-sm bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-700 shadow-inner" />
                  <div className="relative h-full overflow-hidden rounded-r-md rounded-l-sm bg-zinc-900 shadow-[0_28px_60px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/15">
                    <BuchCoverFace
                      src={coverSrc}
                      alt={`Cover: ${book.title}`}
                      objectPosition="center 20%"
                      priority
                      sizes="(max-width: 1024px) 70vw, 340px"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/15"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="relative overflow-hidden border-b border-zinc-950/5 bg-[#fff7ed]">
          {book.detailASrc ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 top-8 hidden h-56 w-44 overflow-hidden rounded-2xl opacity-30 shadow-xl ring-1 ring-zinc-950/10 sm:block lg:right-8 lg:opacity-40"
            >
              <BuchCoverFace
                src={book.detailASrc}
                alt=""
                objectPosition="center 35%"
                sizes="180px"
              />
            </div>
          ) : null}
          {book.detailBSrc ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 bottom-6 hidden h-44 w-36 overflow-hidden rounded-2xl opacity-25 shadow-lg ring-1 ring-zinc-950/10 md:block"
            >
              <BuchCoverFace
                src={book.detailBSrc}
                alt=""
                objectPosition="center 60%"
                sizes="150px"
              />
            </div>
          ) : null}

          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
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
              <a
                href="#buch"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
              >
                <BookOpen className="size-4" aria-hidden />
                Reinlesen
              </a>
            </div>

            {coverSrc ? (
              <div className="relative mx-auto w-full max-w-sm animate-[fadeUp_0.9s_ease-out_0.2s_both]">
                <div className="relative mx-auto aspect-[3/4] w-[85%] overflow-hidden rounded-sm bg-zinc-900 shadow-2xl shadow-orange-900/25 ring-1 ring-zinc-950/15 [transform:perspective(900px)_rotateY(-8deg)]">
                  <BuchCoverFace
                    src={coverSrc}
                    alt={`Cover: ${book.title}`}
                    objectPosition="center 18%"
                    sizes="(max-width: 1024px) 70vw, 360px"
                  />
                </div>
                {book.detailASrc && book.detailBSrc ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-zinc-950/10">
                      <BuchCoverFace
                        src={book.detailASrc}
                        alt=""
                        objectPosition="center 40%"
                        sizes="200px"
                      />
                    </div>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-zinc-950/10">
                      <BuchCoverFace
                        src={book.detailBSrc}
                        alt=""
                        objectPosition="center 55%"
                        sizes="200px"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section
          id="buch"
          className="scroll-mt-20 bg-zinc-100 px-4 py-12 sm:px-6 sm:py-16"
        >
          <div className="mx-auto max-w-4xl">
            <div className="mb-6">
              <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
                Online lesen
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
                {book.title}
              </h2>
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
        @keyframes coverIn {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes coverFloat {
          0%, 100% { transform: perspective(1200px) rotateY(-18deg) rotateX(4deg) rotateZ(2deg) translateY(0); }
          50% { transform: perspective(1200px) rotateY(-16deg) rotateX(3deg) rotateZ(1deg) translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
