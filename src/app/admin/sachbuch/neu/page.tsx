import type { Metadata } from "next";
import Link from "next/link";
import { SachbuchCreateForm } from "@/components/features/admin/sachbuch-create-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Neues Sachbuch — Leseno Admin",
  description: "Idee fertig einfügen oder im Interview erarbeiten.",
};

/**
 * Create Sachbuch — same idea start as greenfield Roman.
 */
export default async function SachbuchAdminNewPage() {
  const canSave = hasServiceRoleConfig();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-sm font-bold text-zinc-500">
            <Link href="/admin/sachbuch" className="hover:underline">
              Sachbuch
            </Link>
            {" · "}
            Neu
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950">
            Neues Sachbuch
          </h1>
          <p className="mt-3 text-base text-zinc-600">
            Start ist die Idee — entweder fertig einfügen oder im Dialog
            erarbeiten. Die Pipeline bauen wir danach neu.
          </p>
          <div className="mt-8">
            <SachbuchCreateForm canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
