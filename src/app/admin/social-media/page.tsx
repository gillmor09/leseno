import type { Metadata } from "next";
import { SocialMediaAdminForm } from "@/components/features/admin/social-media-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Social Media — Leseno Admin",
  description:
    "Monatsplanung für Instagram: CRAFT-Texte (Gemini) und FLUX.2-Bilder.",
};

/**
 * Admin Social Media calendar: global CRAFT + Instagram day posts.
 */
export default function SocialMediaAdminPage() {
  const canSave = hasServiceRoleConfig();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Social Media
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Jeder Tag greift einen Winkel aus der{" "}
            <a
              href="/motivation"
              className="font-semibold text-orange-700 underline-offset-2 hover:underline"
            >
              Motivations-Seite
            </a>{" "}
            auf — knackig, mit Humor. Role/Format/Action und Bild-Stil steuern
            Stimme und Look; Bilder sollen lebendige Situationen zeigen.
          </p>
          <div className="mt-10">
            <SocialMediaAdminForm canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
