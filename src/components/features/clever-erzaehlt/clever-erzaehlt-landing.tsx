/**
 * Public marketing landing for the Clever-erzählt book series:
 * idea, slogan, Amazon availability, link to Buch der Woche.
 */

import Image from "next/image";
import Link from "next/link";
import { BookOpen, ExternalLink, Sparkles } from "lucide-react";
import { BuchCoverFace } from "@/components/features/buch-der-woche/buch-cover-face";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  CLEVER_ERZAEHLT_AMAZON_SEARCH_URL,
  CLEVER_ERZAEHLT_SLOGAN,
  CLEVER_ERZAEHLT_TOPIC_CLASSICS,
  CLEVER_ERZAEHLT_TOPIC_UNUSUAL,
} from "@/lib/clever-erzaehlt/marketing";

/** Series badge in `public/` — keep in sync with `clever-cover-logos.ts`. */
const CLEVER_BADGE_SRC = "/clever_erzählt_300.png";

export type CleverErzaehltLandingWeek = {
  title: string;
  slug: string;
  lead: string;
  coverSrc: string | null;
};

type CleverErzaehltLandingProps = {
  week: CleverErzaehltLandingWeek | null;
};

/**
 * Full public series page — marketing-led, not an admin catalog.
 */
export function CleverErzaehltLanding({ week }: CleverErzaehltLandingProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative min-h-[min(92vh,860px)] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_12%,rgba(251,146,60,0.42),transparent_52%),radial-gradient(ellipse_at_88%_70%,rgba(234,88,12,0.22),transparent_45%),linear-gradient(165deg,#1c1917_0%,#431407_55%,#0c0a09_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:22px_22px]"
          />

          <div className="relative mx-auto flex min-h-[min(92vh,860px)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl animate-[cleverFadeUp_0.7s_ease-out_both]">
              <Image
                src={CLEVER_BADGE_SRC}
                alt="Clever erzählt"
                width={300}
                height={180}
                className="h-16 w-auto drop-shadow-lg sm:h-20"
                priority
              />
              <p className="mt-6 text-sm font-extrabold tracking-[0.16em] text-amber-300 uppercase">
                Die Buchreihe von leseno
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl">
                {CLEVER_ERZAEHLT_SLOGAN}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-orange-50/90 sm:text-xl">
                Clever erzählt ist eine wachsende Buchreihe: jedes Buch ein
                Thema, jede Geschichte ein Abenteuer mit echtem Wissen — von
                Klassikern bis zu Themen, die sonst selten in Kinderbüchern
                vorkommen.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/buch-der-woche"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-extrabold text-zinc-950 transition hover:bg-amber-300"
                >
                  <BookOpen className="size-4" aria-hidden />
                  Buch der Woche lesen
                </Link>
                <a
                  href="#idee"
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/15"
                >
                  Die Idee
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          id="idee"
          className="scroll-mt-20 border-b border-zinc-950/5 bg-[#fff7ed]"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18 lg:py-20">
            <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
              Die Buchreihe
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
              Band für Band ein neues Thema
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-700 sm:text-lg">
              Clever erzählt ist keine einzelne Geschichte, sondern eine
              Buchreihe: jedes Buch steht für ein Thema und versammelt kurze
              Abenteuer dazu. Spannung und geprüftes Wissen gehören zusammen —
              ohne Lehrbuch-Ton.{" "}
              <span className="font-extrabold text-zinc-950">
                {CLEVER_ERZAEHLT_SLOGAN}
              </span>
              .
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 sm:text-lg">
              Neben Klassikern wie Dinosaurier oder Weltall wagt die Reihe auch
              Ungewöhnliches: Alltag, Schule, Körper, Technik und Themen, die in
              Kinderbüchern oft fehlen — immer erzählt als Abenteuer zum
              Mitfiebern.
            </p>

            <ul className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                {
                  title: "Eine Reihe, viele Bände",
                  body: "Jedes Buch ein Thema — die Sammlung wächst, zum Sammeln und Wiederkommen.",
                },
                {
                  title: "Kurz & spannend",
                  body: "Abenteuer-Kurzgeschichten zum Vorlesen oder Selbstlesen, mit klarer Neugier.",
                },
                {
                  title: "Auch unübliche Themen",
                  body: "Nicht nur Dinos und Weltall — auch Hausaufgaben, Gefühle, Geld oder digitale Welt.",
                },
              ].map((item) => (
                <li key={item.title}>
                  <p className="text-lg font-extrabold text-zinc-950">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-600">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-12 space-y-6">
              <div>
                <p className="text-xs font-extrabold tracking-[0.14em] text-zinc-500 uppercase">
                  Bekannte Themen
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CLEVER_ERZAEHLT_TOPIC_CLASSICS.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-extrabold tracking-[0.14em] text-orange-800 uppercase">
                  Und ungewöhnlich
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CLEVER_ERZAEHLT_TOPIC_UNUSUAL.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-orange-100 px-3 py-1.5 text-sm font-bold text-orange-950 ring-1 ring-orange-200/80"
                    >
                      {topic}
                    </span>
                  ))}
                  <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                    und weitere Bände
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-zinc-100">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:py-20">
            <div className="animate-[cleverFadeUp_0.8s_ease-out_both]">
              <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
                Aus der Buchreihe
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                Das Buch der Woche
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-700 sm:text-lg">
                {week ? (
                  <>
                    Gerade online aus der Reihe:{" "}
                    <span className="font-extrabold text-zinc-950">
                      {week.title}
                    </span>
                    . {week.lead} Reinlesen geht direkt auf der Landing — ohne
                    Download.
                  </>
                ) : (
                  <>
                    Jede Woche stellen wir einen Band aus der Clever-erzählt-Reihe
                    zum Online-Lesen vor — mit Teaser, Cover und kompletter
                    Geschichte.
                  </>
                )}
              </p>
              <Link
                href={week ? `/buch-der-woche/${week.slug}` : "/buch-der-woche"}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white hover:bg-orange-800"
              >
                <BookOpen className="size-4" aria-hidden />
                {week ? `${week.title} öffnen` : "Zum Buch der Woche"}
              </Link>
            </div>

            {week?.coverSrc ? (
              <div className="relative mx-auto w-full max-w-[260px] animate-[cleverCoverIn_0.9s_ease-out_both] lg:max-w-[300px]">
                <div
                  aria-hidden
                  className="absolute -inset-8 rounded-full bg-amber-400/25 blur-3xl"
                />
                <div className="relative mx-auto aspect-[3/4.4] w-[82%] origin-bottom animate-[cleverCoverFloat_5s_ease-in-out_infinite] [transform:perspective(1200px)_rotateY(-14deg)_rotateX(3deg)_rotateZ(1deg)]">
                  <div className="absolute inset-y-2 -left-2 w-3 rounded-l-sm bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-700 shadow-inner" />
                  <div className="relative h-full overflow-hidden rounded-r-md rounded-l-sm bg-zinc-900 shadow-[0_28px_60px_-12px_rgba(0,0,0,0.45)] ring-1 ring-zinc-950/20">
                    <BuchCoverFace
                      src={week.coverSrc}
                      alt={`Cover: ${week.title}`}
                      objectPosition="center 20%"
                      sizes="(max-width: 1024px) 70vw, 300px"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative mx-auto flex aspect-[4/3] w-full max-w-md items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-200 via-amber-100 to-orange-50 ring-1 ring-orange-200/80">
                <Image
                  src={CLEVER_BADGE_SRC}
                  alt=""
                  width={300}
                  height={180}
                  className="h-20 w-auto opacity-90"
                />
              </div>
            )}
          </div>
        </section>

        <section id="amazon" className="scroll-mt-20 bg-zinc-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18 lg:py-20">
            <p className="text-xs font-extrabold tracking-[0.16em] text-amber-300 uppercase">
              Die Reihe zum Mitnehmen
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Auf Amazon.de erhältlich — oder bald
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              Die Bände der Buchreihe Clever erzählt erscheinen bei Amazon.de —
              Klassiker und unübliche Themen. Einzelne Titel sind schon
              erhältlich, weitere folgen, während die Reihe wächst.
            </p>
            <a
              href={CLEVER_ERZAEHLT_AMAZON_SEARCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-extrabold text-zinc-950 transition hover:bg-amber-300"
            >
              Auf Amazon.de ansehen
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>
        </section>

        <section className="bg-[#fff7ed]">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-16">
            <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
              {CLEVER_ERZAEHLT_SLOGAN}
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
              Lust auf eigene Abenteuer?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-zinc-600 sm:text-base">
              Mit leseno entstehen persönliche Kindergeschichten — passend zur
              Lesestufe, aus Spaß und Neugier.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/kostenlos"
                className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white hover:bg-orange-800"
              >
                <Sparkles className="size-4" aria-hidden />
                Kostenlos starten
              </Link>
              <Link
                href="/buch-der-woche"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
              >
                Buch der Woche
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
      <style>{`
        @keyframes cleverFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cleverCoverIn {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cleverCoverFloat {
          0%, 100% { transform: perspective(1200px) rotateY(-14deg) rotateX(3deg) rotateZ(1deg) translateY(0); }
          50% { transform: perspective(1200px) rotateY(-12deg) rotateX(2deg) rotateZ(0.5deg) translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
