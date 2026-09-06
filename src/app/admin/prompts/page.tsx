import type { Metadata } from "next";
import { PromptAdminForm } from "@/components/features/admin/prompt-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FALLBACK_PROMPT_ADMIN_CATALOG } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Prompts — Leseno Admin",
  description:
    "Prompt-Stufen für Fakten-Recherche und Geschichtengenerierung.",
};

/**
 * Admin for the two-step story pipeline: facts first, final story second.
 * The route keeps prompt assembly editable before runtime generation exists.
 */
export default async function PromptAdminPage() {
  let catalog = FALLBACK_PROMPT_ADMIN_CATALOG;
  let canSave = false;

  try {
    catalog = await loadPromptAdminCatalog();
    canSave = hasServiceRoleConfig();
  } catch {}

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Prompts
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Erst Fakten holen, dann daraus die Geschichte schreiben. Hier
            pflegst du die Prompt-Templates, die Modellzuordnung pro Stufe und
            die Platzhalter für den späteren Zusammenbau.
          </p>
          <div className="mt-10">
            <PromptAdminForm
              prompts={catalog.prompts}
              models={catalog.models}
              canSave={canSave}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
