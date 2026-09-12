import type { Metadata } from "next";
import { RomanAdminList } from "@/components/features/admin/roman-admin-list";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listRomanKontexte } from "@/lib/roman/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Roman-Pipeline — Leseno Admin",
  description: "Manuskript → Szenen-Roadmap → iterative KI-Szenen.",
};

/**
 * Admin index for the internal novel writing pipeline.
 */
export default async function RomanAdminPage() {
  let romane: Awaited<ReturnType<typeof listRomanKontexte>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Romane konnten nicht geladen werden. Bitte Migration `20260911160000_roman_pipeline.sql` ausführen.";

  try {
    romane = await listRomanKontexte();
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
        error instanceof Error ? error.message : "Roman-Pipeline nicht verfügbar.";
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
            Roman-Pipeline
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Internes Werkzeug: Manuskript analysieren, Szenen-Roadmap in
            Supabase speichern, dann Szene für Szene mit Autor, Lektor und
            Testleser (Gemini) ausarbeiten. Nicht Teil der öffentlichen
            Kinder-App.
          </p>
          <div className="mt-8">
            <RomanAdminList
              initialRomane={romane}
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
