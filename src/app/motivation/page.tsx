import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  anglesByTheme,
  LESENO_READING_MANIFESTO,
  MOTIVATION_THEME_LABELS,
  type MotivationTheme,
} from "@/lib/social/motivation";
import { VS_CHAT_POSITIONS } from "@/lib/social/vs-chat-positioning";

export const metadata: Metadata = {
  title: "Motivation — Warum Lesen mit Spaß zählt | Leseno",
  description:
    "Lesen formt Entwicklung, Spaß ist der Zugang, schulisches Lesen allein reicht nicht — die Haltung hinter leseno.",
};

const THEME_ORDER: MotivationTheme[] = [
  "entwicklung",
  "spass",
  "schule",
  "familie",
  "neugier",
  "alltag",
];

/**
 * Public motivation / background page — manifesto, vs-chat positioning archive,
 * and reading-joy angles (same bank as social generation).
 */
export default function MotivationPage() {
  const grouped = anglesByTheme();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(234,88,12,0.12),_transparent_55%),linear-gradient(180deg,#fff7ed_0%,#f4f4f5_45%)]"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
              Hintergrund
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
              Motivation
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-700">
              Warum leseno auf Spaß am Lesen setzt — und warum Pflicht allein
              oft nicht trägt.
            </p>

            <div className="mt-10 space-y-5 rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
              {LESENO_READING_MANIFESTO.split("\n").map((line) => (
                <p
                  key={line.slice(0, 40)}
                  className="text-base leading-relaxed text-zinc-800 sm:text-lg"
                >
                  {line}
                </p>
              ))}
            </div>

            <section id="vs-chat" className="mt-14 scroll-mt-24">
              <h2 className="text-xl font-extrabold text-zinc-950">
                Warum leseno — und nicht nur ein Chatfenster
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Zehn Argumente gegen „kann man doch kostenlos tippen“. Sechs
                davon stehen auf der{" "}
                <Link
                  href="/#anders"
                  className="font-bold text-orange-800 underline-offset-2 hover:underline"
                >
                  Landingpage
                </Link>
                ; alle zehn bleiben hier archiviert — mit knackigen Insights und
                Bild-Hinweisen für spätere Social Posts.
              </p>
              <ul className="mt-4 space-y-3">
                {VS_CHAT_POSITIONS.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl bg-white px-5 py-4 shadow-md ring-1 ring-zinc-950/10"
                  >
                    <p className="font-extrabold text-zinc-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      {item.insight}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <p className="mt-12 text-sm font-semibold text-zinc-600">
              Daraus und aus der Lesehaltung entstehen viele einzelne
              Blickwinkel — Social Posts greifen jeweils{" "}
              <span className="font-extrabold text-zinc-950">einen</span> davon
              knackig auf.
            </p>

            <div className="mt-8 space-y-10">
              {THEME_ORDER.map((theme) => (
                <section key={theme}>
                  <h2 className="text-xl font-extrabold text-zinc-950">
                    {MOTIVATION_THEME_LABELS[theme]}
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {grouped[theme].map((angle) => (
                      <li
                        key={angle.id}
                        className="rounded-2xl bg-white px-5 py-4 shadow-md ring-1 ring-zinc-950/10"
                      >
                        <p className="font-extrabold text-zinc-950">
                          {angle.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                          {angle.insight}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <p className="mt-12 text-center text-sm text-zinc-600">
              Lust, das auszuprobieren?{" "}
              <Link
                href="/kostenlos"
                className="font-bold text-orange-700 underline-offset-2 hover:underline"
              >
                Kostenlos starten
              </Link>
            </p>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
