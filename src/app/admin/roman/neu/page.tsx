import type { Metadata } from "next";
import Link from "next/link";
import { RomanNovelCreateForm } from "@/components/features/admin/roman-novel-create-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Neuer Roman — Leseno Admin",
  description: "High-Concept-Idee für den Zwei-Rollen-Orchestrator.",
};

export default function RomanNovelCreatePage() {
  const canSave = hasServiceRoleConfig();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-sm font-bold text-zinc-500">
            <Link href="/admin/roman" className="hover:underline">
              Roman
            </Link>
            {" · "}
            Neu
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950">
            Neuer Roman
          </h1>
          <p className="mt-3 text-base text-zinc-600">
            Beschreibe die Idee — Styleguide, Welt und Kapitel entstehen danach
            automatisch.
          </p>
          <div className="mt-8">
            <RomanNovelCreateForm canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
