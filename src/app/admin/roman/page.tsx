import type { Metadata } from "next";
import Link from "next/link";
import { RomanAdminList } from "@/components/features/admin/roman-admin-list";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { listRomanKontexte } from "@/lib/roman/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Buch — Leseno Admin",
  description: "Buchprojekte und KI-Rollen der Buch-Pipeline.",
};

/**
 * Admin index for the internal book writing pipeline.
 */
export default async function RomanAdminPage() {
  let romane: Awaited<ReturnType<typeof listRomanKontexte>> = [];
  let canSave = false;
  let readOnlyNotice: string | undefined =
    "Vorschau: Bücher konnten nicht geladen werden. Bitte Migration `20260911160000_roman_pipeline.sql` ausführen.";

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
        error instanceof Error ? error.message : "Buch-Modul nicht verfügbar.";
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
            Buch
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Internes Werkzeug für Buchprojekte. Pipeline wird neu aufgebaut —
            KI-Rollen und Prompts verwaltest du hier im Modul.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/roman/rollen"
              className="text-sm font-bold text-orange-800 hover:underline"
            >
              KI-Rollen verwalten
            </Link>
          </div>
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
