import type { Metadata } from "next";
import { PackagesAdminForm } from "@/components/features/admin/packages-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FALLBACK_MEMBERSHIP_PACKAGES } from "@/lib/users/packages";
import { loadMembershipPackagesForAdmin } from "@/lib/users/package-repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Pakete — Leseno Admin",
  description:
    "Bezeichnung, Preis, Credits und Funktionen der Mitgliedschaftspakete.",
};

/**
 * Admin for membership packages (Basis / Plus / Pro / Ultimate).
 * Guarded by admin layout.
 */
export default async function PackagesAdminPage() {
  let packages = FALLBACK_MEMBERSHIP_PACKAGES;
  let canSave = false;
  const hasServiceRole = hasServiceRoleConfig();
  let readOnlyNotice =
    "Vorschau: Die Pakete konnten evtl. nicht geladen werden. Bitte die Migration `membership_packages` ausführen.";

  try {
    packages = await loadMembershipPackagesForAdmin();
    canSave = hasServiceRole;
    if (!hasServiceRole) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` ist in der laufenden App nicht verfügbar. Bitte `.env.local` prüfen und den Dev-Server neu starten.";
    }
  } catch (error) {
    if (!hasServiceRole) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` ist in der laufenden App nicht verfügbar. Bitte `.env.local` prüfen und den Dev-Server neu starten.";
    } else {
      const message =
        error instanceof Error
          ? error.message
          : "Die Paket-Daten sind noch nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message} Bitte die Migration \`20260905150000_membership_packages.sql\` ausführen.`;
    }
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
            Pakete
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Bezeichnung, Monatspreis, enthaltene Credits und die freigeschalteten
            Funktionen pro Paket. IDs bleiben fest (Buchungen / Rollen).
          </p>
          <div className="mt-10">
            <PackagesAdminForm
              packages={packages}
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
