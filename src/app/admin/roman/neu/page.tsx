import type { Metadata } from "next";
import { RomanCreateForm } from "@/components/features/admin/roman-create-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Neues Buch — Leseno Admin",
};

/**
 * Create a new book shell (title only); pipeline steps come later.
 */
export default async function RomanAdminNewPage() {
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
            Neues Buch
          </h1>
          <div className="mt-8">
            <RomanCreateForm canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
