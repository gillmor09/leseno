import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { StoryLengthAdminForm } from "@/components/features/admin/story-length-admin-form";
import { loadStoryLengthCatalogForAdmin } from "@/lib/stories/length-repository";
import { FALLBACK_STORY_LENGTH_CATALOG } from "@/lib/stories/length";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Textlängen — Leseno Admin",
  description: "Wortspannen für die Textlängen-Stufen nach Schulstufen-Gruppe.",
};

/**
 * Admin for story-length word bands. Guarded by admin layout.
 */
export default async function StoryLengthAdminPage() {
  let catalog = FALLBACK_STORY_LENGTH_CATALOG;
  let canSave = false;
  const hasServiceRole = hasServiceRoleConfig();
  let readOnlyNotice =
    "Vorschau: Die Textlängen konnten evtl. nicht geladen werden. Bitte die Migration `story_length_limits` ausführen.";

  try {
    catalog = await loadStoryLengthCatalogForAdmin();
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
        error instanceof Error ? error.message : "Die neuen Textlängen-Daten sind noch nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message} Bitte auch die Migration \`20260903184500_story_length_fact_count.sql\` ausführen.`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Textlängen
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Diese Spannen steuern den Schieberegler auf der kostenlosen
            Geschichten-Seite. Zwei Schulstufen-Gruppen, fünf Stufen.
          </p>
          <div className="mt-10">
            <StoryLengthAdminForm
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
