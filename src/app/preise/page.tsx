import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  CreditsCheckoutButton,
  ManageSubscriptionButton,
  MembershipCheckoutButton,
} from "@/components/features/pricing/pricing-checkout-buttons";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Preise — Leseno",
  description:
    "Plus, Pro und Ultimate: die Leseno-Pakete für mehr Geschichten, Familie und Lesefortschritt.",
};

const packages = [
  {
    id: "plus" as const,
    name: "Plus",
    tagline: "Mehr Lesen für den Alltag",
    blurb:
      "Ideal, wenn Leseno regelmäßig mit dabei sein soll — für ein Kind oder die ersten Familien-Profile.",
    priceEuro: 5,
    featured: false,
    tone: "light" as const,
    features: [
      "inkl. 500 Credits (für bis zu 50 Geschichten)",
      "Auswahl nach Thema, Art der Geschichte und Länge der Geschichte",
      "Meine Welt für eine Person",
      "Export als PDF zum Offline-Lesen",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    tagline: "Für die ganze Lesefamilie",
    blurb:
      "Mehr Raum für mehrere Kinder, stärkere Begleitung und mehr Geschichten — wenn Leseno zum festen Ritual wird.",
    priceEuro: 10,
    featured: true,
    tone: "dark" as const,
    features: [
      "Meine Welt für beliebig viele Personen",
      "Bilder in den Geschichten",
      "Warum-Fragen zum Eintauchen in Themen",
    ],
  },
  {
    id: "ultimate" as const,
    name: "Ultimate",
    tagline: "Maximum Lesespaß & Wissen",
    blurb:
      "Das volle Paket: maximale Freiheit, maximale Begleitung — für Familien, die Leseno intensiv nutzen.",
    priceEuro: 15,
    featured: false,
    tone: "light" as const,
    features: [
      "Silbenmethode für Erstleser",
      "Vorlesefunktion mit Markierung",
      "Noch tieferes Eintauchen durch Hintergrundwissen",
    ],
  },
];

/**
 * Marketing prices + Stripe Checkout (card / PayPal when configured).
 */
export default function PreisePage() {
  const checkoutEnabled = hasStripeCheckoutConfig();

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
            Begleitung — unter einem Konto. Monatlich kündbar. Zahlung per Karte
            oder PayPal.
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
                    pkg.featured &&
                      "lg:-translate-y-1 lg:ring-2 lg:ring-yellow-400",
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
                    <MembershipCheckoutButton
                      packageId={pkg.id}
                      dark={dark}
                      enabled={checkoutEnabled}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <article className="mt-6 rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10 sm:p-10">
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Credits
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950">
              Geschichten flexibel hinzubuchen
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Wenn das Monatskontingent mal nicht reicht: Credits nachladen und
              genau so viele Geschichten erzeugen, wie ihr gerade braucht —
              ohne Paketwechsel, ohne Wartezeit bis zum nächsten Monat.
            </p>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950">
                  5&nbsp;€
                </span>
                <span className="text-sm font-semibold text-zinc-500">
                  für 300 Credits*
                </span>
              </p>
            </div>
            <CreditsCheckoutButton enabled={checkoutEnabled} />
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
              *1 sehr kurze Geschichte kostet 10 Credits, kurz 20 Credits,
              mittel 30 Credits, lang 40 Credits und sehr lang 50 Credits.
            </p>
            <p className="mt-2 max-w-3xl text-sm font-extrabold leading-relaxed text-zinc-950">
              So kannst du bis zu 30 Geschichten zusätzlich lesen!
            </p>
          </article>

          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <ManageSubscriptionButton enabled={checkoutEnabled} />
            <p className="text-sm font-semibold text-zinc-500">
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
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
