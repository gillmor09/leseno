import type { Metadata } from "next";
import { PromosAdminForm } from "@/components/features/admin/promos-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listPromosForAdmin } from "@/lib/promo/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";
import { hasStripeSecretConfig } from "@/lib/stripe/config";

export const metadata: Metadata = {
  title: "Promo-Codes — Leseno Admin",
  description:
    "Promo-Codes für günstigere oder kostenlose Plus/Familie/Komplett-Zeiträume.",
};

/**
 * Admin for Stripe-synced promo codes (registration link + Checkout discount).
 */
export default async function PromosAdminPage() {
  let promos: Awaited<ReturnType<typeof listPromosForAdmin>> = [];
  const hasServiceRole = hasServiceRoleConfig();
  const hasStripe = hasStripeSecretConfig();
  let canSave = false;
  let readOnlyNotice =
    "Vorschau: Migration `20260907100000_promos.sql` ausführen und Service-Role setzen.";

  try {
    promos = await listPromosForAdmin();
    canSave = hasServiceRole && hasStripe;
    if (!hasServiceRole) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt in der App.";
    } else if (!hasStripe) {
      readOnlyNotice =
        "Vorschau: `STRIPE_SECRET_KEY` fehlt — Anlegen sync’t nach Stripe.";
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Promos nicht ladbar.";
    readOnlyNotice = `Vorschau: ${message} Bitte Migration \`20260907100000_promos.sql\` ausführen.`;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Promo-Codes
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Codes und personalisierte Links für Plus, Familie und Komplett —
            günstiger oder gratis für einen definierten Zeitraum. Rabatte laufen
            über Stripe; Leseno speichert Regeln und Einlösungen.
          </p>
          <div className="mt-10">
            <PromosAdminForm
              promos={promos}
              canSave={canSave}
              readOnlyNotice={readOnlyNotice}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
