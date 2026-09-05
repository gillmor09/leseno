import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Preise — Leseno",
  description:
    "Plus, Pro und Ultimate: die Leseno-Pakete für mehr Geschichten, Familie und Lesefortschritt.",
};

const packages = [
  {
    id: "plus",
    name: "Plus",
    tagline: "Mehr Lesen für den Alltag",
    blurb: "Ideal, wenn Leseno regelmäßig mit dabei sein soll — für ein Kind oder die ersten Familien-Profile.",
    priceEuro: 5,
    featured: false,
    tone: "light" as const,
    features: [
      "10 Geschichten frei",
      "Auswahl nach Thema, Art der Geschichte und Länge der Geschichte",
      "Meine Welt für eine Person",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Für die ganze Lesefamilie",
    blurb: "Mehr Raum für mehrere Kinder, stärkere Begleitung und mehr Geschichten — wenn Leseno zum festen Ritual wird.",
    priceEuro: 10,
    featured: true,
    tone: "dark" as const,
    features: [
      "20 Geschichten frei",
      "Meine Welt für beliebig viele Personen",
      "Bilder in den Geschichten",
      "Warum-Fragen zum Eintauchen in Themen",
    ],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    tagline: "Maximum Lesespaß & Wissen",
    blurb: "Das volle Paket: maximale Freiheit, maximale Begleitung — für Familien, die Leseno intensiv nutzen.",
    priceEuro: 15,
    featured: false,
    tone: "light" as const,
    features: [
      "30 Geschichten frei",
      "Silbenmethode für Erstleser",
      "Vorlesefunktion mit Markierung",
      "Noch tieferes Eintauchen durch Hintergrundwissen",
    ],
  },
] as const;

/**
 * Marketing prices overview: Plus / Pro / Ultimate (prepared for later checkout).
 */
export default function PreisePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Preise
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Wähl das Paket, das zu euch passt.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Von Plus über Pro bis Ultimate: mehr Geschichten, mehr Familie, mehr
            Begleitung — unter einem Konto. Monatlich kündbar. Buchung folgt in
            Kürze.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {packages.map((pkg) => {
              const dark = pkg.tone === "dark";
              return (
                <article
                  key={pkg.id}
                  className={cn(
                    "flex flex-col rounded-[1.75rem] p-8 shadow-xl",
                    dark
                      ? "bg-zinc-800 text-white"
                      : "bg-white text-zinc-950 ring-1 ring-zinc-950/10",
                    pkg.featured && "lg:-translate-y-1 lg:ring-2 lg:ring-yellow-400",
                  )}
                >
                  <p
                    className={cn(
                      "text-sm font-extrabold tracking-wide uppercase",
                      dark ? "text-yellow-400" : "text-orange-700",
                    )}
                  >
                    {pkg.name}
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
                    {pkg.tagline}
                  </h2>
                  <p
                    className={cn(
                      "mt-2 text-sm leading-relaxed",
                      dark ? "text-zinc-300" : "text-zinc-600",
                    )}
                  >
                    {pkg.blurb}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {pkg.features.map((feature) => (
                      <li
                        key={feature}
                        className={cn(
                          "flex gap-2 text-sm leading-relaxed",
                          dark ? "text-zinc-200" : "text-zinc-700",
                        )}
                      >
                        <Check
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            dark ? "text-yellow-400" : "text-orange-700",
                          )}
                          aria-hidden
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <p className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold tracking-tight">
                        {pkg.priceEuro}&nbsp;€
                      </span>
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          dark ? "text-zinc-400" : "text-zinc-500",
                        )}
                      >
                        / Monat
                      </span>
                    </p>
                    <p
                      className={cn(
                        "mt-4 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold",
                        dark
                          ? "bg-yellow-400 text-zinc-950"
                          : "bg-zinc-800 text-white",
                      )}
                    >
                      Bald buchbar
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="mt-10 text-center text-sm font-semibold text-zinc-500">
            Noch unsicher?{" "}
            <a
              href="/kostenlos"
              className="text-orange-700 underline-offset-2 hover:underline"
            >
              Kostenlos ausprobieren
            </a>{" "}
            oder mit{" "}
            <a
              href="/registrieren"
              className="text-orange-700 underline-offset-2 hover:underline"
            >
              Basis starten
            </a>
            .
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
