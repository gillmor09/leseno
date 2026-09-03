import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { LandingHeader } from "@/components/features/landing/landing-header";
import { StoryLengthAdminForm } from "@/components/features/admin/story-length-admin-form";
import { loadStoryLengthCatalogForAdmin } from "@/lib/stories/length-repository";

export const metadata: Metadata = {
  title: "Textlängen — Leseno Admin",
  description: "Wortspannen für die Textlängen-Stufen nach Altersgruppe.",
};

/**
 * Admin for story-length word bands. Reachable via the header cog.
 * Session lock can wrap this route once auth exists.
 */
export default async function StoryLengthAdminPage() {
  let catalog;
  let loadError: string | null = null;

  try {
    catalog = await loadStoryLengthCatalogForAdmin();
    if (catalog.limits.length === 0) {
      loadError =
        "Noch keine Werte in der Datenbank. Bitte die Migration story_length_limits ausführen.";
    }
  } catch {
    loadError =
      "Die Textlängen konnten nicht geladen werden. Läuft Supabase, und ist die Migration da?";
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <LandingHeader />
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
            Geschichten-Seite. Zwei Altersgruppen, fünf Stufen.
          </p>
          <div className="mt-10">
            {loadError ? (
              <p className="rounded-[1.75rem] bg-white p-6 text-sm font-semibold text-zinc-700 shadow-xl ring-1 ring-zinc-950/10">
                {loadError}
              </p>
            ) : catalog ? (
              <StoryLengthAdminForm catalog={catalog} />
            ) : null}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
