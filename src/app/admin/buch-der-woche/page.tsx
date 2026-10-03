import type { Metadata } from "next";
import { BuchDerWocheAdminForm } from "@/components/features/admin/buch-der-woche-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  getBuchDerWocheSettings,
  getCurrentBuchDerWocheEntry,
  listBuchDerWocheEntries,
} from "@/lib/buch-der-woche/repository";
import { listRomanKontexte } from "@/lib/roman/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Buch der Woche — Leseno Admin",
  description:
    "Clever-erzählt-Buch der Woche setzen und Instagram-Werbepost erzeugen.",
};

/**
 * Admin: weekly Clever feature + IG creative generation.
 */
export default async function BuchDerWocheAdminPage() {
  const canSave = hasServiceRoleConfig();

  let currentSlug: string | null = null;
  let liveSince: string | null = null;
  let entries: Awaited<ReturnType<typeof listBuchDerWocheEntries>> = [];
  let cleverRomans: Array<{
    id: string;
    title: string;
    hasCover: boolean;
    einzeiler: string;
    klappentext: string;
  }> = [];
  let currentEntry: Awaited<ReturnType<typeof getCurrentBuchDerWocheEntry>> =
    null;
  let loadError: string | null = null;

  try {
    const [settings, list, romans, current] = await Promise.all([
      getBuchDerWocheSettings(),
      listBuchDerWocheEntries(),
      listRomanKontexte(),
      getCurrentBuchDerWocheEntry(),
    ]);
    currentSlug = settings.currentSlug;
    liveSince = settings.currentSlug ? settings.updatedAt : null;
    entries = list;
    currentEntry = current;
    cleverRomans = romans
      .filter((r) => r.editorial.buchTyp === "clever_erzaehlt")
      .map((r) => ({
        id: r.id,
        title: r.title,
        hasCover: Boolean(r.hasCover),
        einzeiler: (r.editorial.einzeiler ?? "").trim(),
        klappentext: (r.editorial.klappentext ?? "").trim(),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Buch der Woche konnte nicht geladen werden.";
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
          <p className="text-xs font-extrabold tracking-[0.16em] text-orange-800 uppercase">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Buch der Woche
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-zinc-600">
            Clever-erzählt-Titel für die Instagram-Landing wählen, Teaser
            pflegen und Werbepost (Bild + Caption) erzeugen.
          </p>

          {loadError ? (
            <p className="mt-8 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 ring-1 ring-red-200">
              {loadError}
            </p>
          ) : (
            <div className="mt-8">
              <BuchDerWocheAdminForm
                canSave={canSave}
                currentSlug={currentSlug}
                liveSince={liveSince}
                entries={entries}
                cleverRomans={cleverRomans}
                currentEntry={currentEntry}
              />
            </div>
          )}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
