import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "Impressum — Leseno",
  description: "Angaben gemäß § 5 DDG / Impressum für Leseno.",
};

/**
 * Legal imprint (Impressum) required for German websites.
 */
export default function ImpressumPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Rechtliches
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Impressum
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Angaben gemäß § 5 DDG
          </p>

          <div className="mt-10 space-y-8 text-base leading-relaxed text-zinc-700">
            <div>
              <h2 className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
                Anbieter
              </h2>
              <p className="mt-2 font-semibold text-zinc-950">Bernd Krpec</p>
              <p className="mt-1">
                Wupperweg 14
                <br />
                Gebäude 44
                <br />
                46286 Dorsten
              </p>
            </div>

            <div>
              <h2 className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
                Kontakt
              </h2>
              <p className="mt-2">
                Telefon:{" "}
                <a
                  href="tel:+4915734344185"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  01573 4344185
                </a>
              </p>
              <p className="mt-1">
                E-Mail:{" "}
                <a
                  href="mailto:info@leseno.de"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  info@leseno.de
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
