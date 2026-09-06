import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { storyPathForRole } from "@/lib/users/catalog";
import { getCurrentUser } from "@/lib/auth/session";
import { hasStripeCheckoutConfig } from "@/lib/stripe/config";

export const metadata: Metadata = {
  title: "Zahlung erfolgreich — Leseno",
  description: "Dein Kauf oder Abo ist eingegangen.",
};

/**
 * Post-Checkout landing. Entitlements are applied by the Stripe webhook;
 * catch-up reconciles paid invoices if the first webhook was delayed.
 */
export default async function PreiseErfolgPage({
  searchParams,
}: {
  searchParams: Promise<{ credits?: string }>;
}) {
  const params = await searchParams;
  const isCredits = params.credits === "1";
  const user = await getCurrentUser();
  const role =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role
      : "basis";
  const storyHref = storyPathForRole(role);

  if (user?.id && !isCredits && hasStripeCheckoutConfig()) {
    try {
      const { reconcileSubscriptionCreditGrants } = await import(
        "@/lib/stripe/credit-grants"
      );
      await reconcileSubscriptionCreditGrants(user.id);
    } catch (error) {
      console.warn("[preise/erfolg] credit catch-up", error);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-xl px-4 py-14 sm:px-6">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Fertig
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            {isCredits ? "Credits sind unterwegs." : "Willkommen im Paket."}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            {isCredits
              ? "Die Gutschrift erscheint in wenigen Sekunden auf deinem Konto (Stripe-Webhook). Danach kannst du weiter Geschichten erzeugen. Credits verfallen bei leseno nicht."
              : "Dein Abo wird freigeschaltet. Die Paket-Credits für diesen Monat werden mit der bezahlten Rechnung gutgeschrieben — und bleiben, bis du sie nutzt. Kurz warten und Seite neu laden, falls die Rolle noch nicht passt."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={storyHref}
              className="inline-flex rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Zur Geschichte
            </Link>
            <Link
              href="/preise"
              className="inline-flex rounded-full bg-zinc-800 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900"
            >
              Zurück zu Preise
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
