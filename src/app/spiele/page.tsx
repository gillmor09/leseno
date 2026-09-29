import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { SPIELE_GAMES } from "@/lib/spiele/catalog";

export const metadata: Metadata = {
  title: "Spiele",
  description:
    "Kindgerechte Leseno-Spiele: Memory, Escape, Bauwelt und Sternenlauf — solo zum Mitspielen.",
  robots: { index: false, follow: false },
};

/**
 * Games hub: Memory, Escape, Bauwelt, Sternenlauf under /spiele.
 * Card copy lives in `src/lib/spiele/catalog.ts`.
 */
export default function SpieleIndexPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
            Zum Mitspielen
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Spiele
          </h1>
          <p className="mt-3 max-w-xl text-sm font-semibold text-zinc-600">
            Kurze Solo-Spiele für Kinder — Gedächtnis, Escape, Bauen und Geschick.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {SPIELE_GAMES.map((game) => (
              <li key={game.href}>
                <Link
                  href={game.href}
                  className={`block h-full rounded-[1.75rem] p-5 ring-1 transition ${game.accent}`}
                >
                  <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                    {game.eyebrow}
                  </p>
                  <h2
                    className={`mt-1 text-xl font-extrabold tracking-tight ${game.titleColor}`}
                  >
                    {game.title}
                  </h2>
                  <p className="mt-2 text-sm font-semibold text-zinc-600">
                    {game.blurb}
                  </p>
                  <p className="mt-4 text-xs font-extrabold tracking-wide text-zinc-800 uppercase">
                    Spielen →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
