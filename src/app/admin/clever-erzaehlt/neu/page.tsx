import type { Metadata } from "next";
import { CleverErzaehltCreateForm } from "@/components/features/admin/clever-erzaehlt-create-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Neues Clever-erzählt-Buch — Leseno Admin",
};

/**
 * Create Clever-erzählt book: name, age+story length, theme (Top 20 or custom).
 */
export default async function CleverErzaehltAdminNewPage() {
  const canSave = hasServiceRoleConfig();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Neues Clever-erzählt-Buch
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-600">
            Name, Altersgruppe mit Geschichtenlänge und Thema — speichern.
          </p>
          <div className="mt-8">
            <CleverErzaehltCreateForm canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
