import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { ReadingTypographyAdminForm } from "@/components/features/admin/reading-typography-admin-form";
import { FALLBACK_READING_TYPOGRAPHY_DEFAULTS } from "@/lib/stories/reading-typography-defaults";
import { loadReadingTypographyDefaultsForAdmin } from "@/lib/stories/reading-typography-repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Schrifteinstellung — Leseno Admin",
  description:
    "Standard-Schrifteinstellungen pro Schulstufe für Card und Lesemodus.",
};

/**
 * Admin for per-stage reading typography defaults.
 */
export default async function ReadingTypographyAdminPage() {
  let catalog = FALLBACK_READING_TYPOGRAPHY_DEFAULTS;
  let canSave = false;
  const hasServiceRole = hasServiceRoleConfig();
  let readOnlyNotice =
    "Vorschau: Schrifteinstellungen konnten evtl. nicht geladen werden. Bitte die Migration `reading_typography_defaults` ausführen.";

  try {
    catalog = await loadReadingTypographyDefaultsForAdmin();
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
          : "Die Schrifteinstellungen sind noch nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message} Bitte auch die Migration \`20260906110000_reading_typography_defaults.sql\` ausführen.`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Schrifteinstellung
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Pro Schulstufe die Standardwerte für Schriftgröße, -stärke, Abstände
            und Spaltenbreite. Sie gelten in der Geschichten-Card und als
            Start-/Zurücksetzen-Werte im Lesemodus.
          </p>
          <div className="mt-10">
            <ReadingTypographyAdminForm
              catalog={catalog}
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
