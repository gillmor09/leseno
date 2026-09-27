import type { Metadata } from "next";
import { SachbuchAdminList } from "@/components/features/admin/sachbuch-admin-list";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listSachbuchKontexte } from "@/lib/sachbuch/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Sachbuch — Leseno Admin",
  description:
    "Sachbuch-Modul: Agenten-Matrix, Interview, Abschnitte mit Checkpoint/Critic/Style.",
};

/**
 * Sachbuch admin index (greenfield module).
 */
export default async function SachbuchAdminPage() {
  let books: Awaited<ReturnType<typeof listSachbuchKontexte>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Sachbücher konnten nicht geladen werden. Bitte Migration `20260925150000_sachbuch_kontext.sql` ausführen.";

  try {
    books = await listSachbuchKontexte();
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
        error instanceof Error
          ? error.message
          : "Sachbuch-Modul nicht verfügbar.";
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
            Sachbuch
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Eigenes Modul: Agenten pro Buch, sokratisches Interview (Text /
            Deepgram) und Abschnitte mit Checkpoint, Critic und Style.
          </p>
          <div className="mt-8">
            <SachbuchAdminList
              initialBooks={books}
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
