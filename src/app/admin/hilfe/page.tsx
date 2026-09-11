import type { Metadata } from "next";
import { HelpAdminForm } from "@/components/features/admin/help-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listAllHelpTexts } from "@/lib/help/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Hilfe — Leseno Admin",
  description:
    "Hilfetexte für Meine Geschichte, Meine Welt, Buchclub und Bücherei.",
};

/**
 * Admin: Quill-editable help texts for member pages (page + card slots).
 */
export default async function HelpAdminPage() {
  let texts: Awaited<ReturnType<typeof listAllHelpTexts>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Hilfetexte konnten nicht geladen werden. Bitte Migration `20260911120000_help_texts.sql` ausführen.";

  try {
    texts = await listAllHelpTexts();
    canSave = hasServiceRoleConfig();
    if (!canSave) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    } else {
      readOnlyNotice = undefined;
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    } else {
      const message =
        error instanceof Error ? error.message : "Hilfetexte nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message}`;
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
            Hilfe
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Seiten- und Card-Hilfetexte für die Mitgliedsbereiche. Mit Quill
            formatieren — in der App erscheint ein Info-Icon, sobald Inhalt
            gespeichert ist.
          </p>
          <div className="mt-8">
            <HelpAdminForm
              initialTexts={texts}
              canSave={canSave}
              readOnlyNotice={canSave ? undefined : readOnlyNotice}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
