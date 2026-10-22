import type { Metadata } from "next";
import { RomanNovelList } from "@/components/features/admin/roman-novel-list";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listNovels } from "@/lib/novel/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Roman — Leseno Admin",
  description:
    "Greenfield Roman: Zwei-Rollen-Orchestrator (Autor Luna · Lektor Haiku).",
};

/**
 * Admin index for the greenfield novel module (`leseno.novels`).
 * Clever erzählt remains on `/admin/clever-erzaehlt` (legacy roman_kontext).
 */
export default async function RomanAdminPage() {
  let novels: Awaited<ReturnType<typeof listNovels>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Romane konnten nicht geladen werden. Bitte Migration `20261016120000_leseno_novels_blueprint.sql` ausführen.";

  try {
    novels = await listNovels();
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
        error instanceof Error ? error.message : "Roman-Modul nicht verfügbar.";
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
            Roman
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Vollautomatisch von der Idee zum Manuskript. Autor (GPT-6 Luna)
            schreibt, Lektor (Claude Haiku 5.5) prüft Styleguide, Logik und
            Wissensgraph — asynchron im Hintergrund.
          </p>
          <div className="mt-8">
            <RomanNovelList
              novels={novels}
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
