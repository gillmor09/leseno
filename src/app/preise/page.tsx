import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  isFeaturedPackage,
  PackageCompareTable,
  packageCardClassName,
  packageCardTone,
} from "@/components/features/pricing/package-compare-table";
import {
  CreditsCheckoutButton,
  ManageSubscriptionButton,
  MembershipCheckoutButton,
} from "@/components/features/pricing/pricing-checkout-buttons";
import { getCurrentUser } from "@/lib/auth/session";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";
import { buildPageMetadata } from "@/lib/seo";
import {
  marketingBlurbForPackage,
  marketingBulletsForPackage,
  marketingTaglineForPackage,
} from "@/lib/users/package-marketing";
import { loadMembershipPackages } from "@/lib/users/package-repository";
import type { PaidMembershipPackageId } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildPageMetadata({
  title: "Preise: Plus, Pro & Ultimate im Vergleich",
  description:
    "Leseno-Pakete für Grundschulkinder im Vergleich: Credits, Meine Bücherei, Meine Welt, Bilder, Warum, Silbenhilfe und Vorlesen. Monatlich kündbar — oder kostenlos starten.",
  path: "/preise",
});

/**
 * Marketing prices from `membership_packages` + Stripe Checkout.
 */
export default async function PreisePage() {
  const checkoutEnabled = hasStripeCheckoutConfig();
  const user = await getCurrentUser();
  const isSignedIn = Boolean(user);
  const allPackages = await loadMembershipPackages();
  const paidPackages = allPackages.filter(
    (pkg): pkg is typeof pkg & { id: PaidMembershipPackageId } =>
      pkg.id === "plus" || pkg.id === "pro" || pkg.id === "ultimate",
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Preise
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Pakete für Grundschulkinder, die gerne lesen.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Plus für Credits, Bücherei und PDF, Pro für Familie und Bilder,
            Ultimate für Silbenhilfe und Vorlesen. Monatlich kündbar. Zahlung
            per Karte oder PayPal.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {paidPackages.map((pkg) => {
              const dark = packageCardTone(pkg.id) === "dark";
              const featured = isFeaturedPackage(pkg.id);
              const bullets = marketingBulletsForPackage(pkg);
              return (
                <article
                  key={pkg.id}
                  className={packageCardClassName({ dark, featured })}
                >
                  <p
                    className={cn(
                      "text-sm font-extrabold tracking-wide uppercase",
                      dark ? "text-yellow-400" : "text-orange-700",
                    )}
                  >
                    {pkg.label}
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
                    {marketingTaglineForPackage(pkg)}
                  </h2>
                  <p
                    className={cn(
                      "mt-2 text-sm leading-relaxed",
                      dark ? "text-zinc-300" : "text-zinc-600",
                    )}
                  >
                    {marketingBlurbForPackage(pkg)}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {bullets.map((feature) => (
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
                        {pkg.priceEur}&nbsp;€
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

          <PackageCompareTable packages={allPackages} />

          <article className="mt-6 rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10 sm:p-10">
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Credits
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950">
              Extra-Geschichten flexibel nachladen
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Wenn das Kontingent nicht reicht: Credits nachladen und genau so
              viele Geschichten erzeugen, wie ihr braucht — ohne Paketwechsel.
              Pro und Ultimate bringen von Haus aus oft keine Credits mit;
              dann reicht ein Nachkauf.
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
            {isSignedIn ? (
              <CreditsCheckoutButton enabled={checkoutEnabled} />
            ) : null}
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
              *Sehr kurz 10, kurz 20, mittel 30, lang 40, sehr lang 50 Credits
              pro Geschichte. 300 Credits reichen z. B. für bis zu 30 sehr
              kurze oder 10 mittlere Geschichten.
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
