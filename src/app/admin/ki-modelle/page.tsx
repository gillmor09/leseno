import type { Metadata } from "next";
import { AiModelAdminForm } from "@/components/features/admin/ai-model-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FALLBACK_PROMPT_ADMIN_CATALOG } from "@/lib/prompts/catalog";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "KI-Modelle — Leseno Admin",
  description:
    "Verwaltung der KI-Modelle für Fakten-Recherche und Geschichtengenerierung.",
};

/**
 * Admin for reusable AI models referenced by prompt templates.
 * Keeping models separate makes provider/model swaps easier later.
 */
export default async function AiModelsAdminPage() {
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
            KI-Modelle
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Hier pflegst du die wiederverwendbaren Modelle für deinen
            zweistufigen Ablauf. Die Prompt-Seite referenziert diese Einträge
            später nur noch pro Stufe.
          </p>
          <div className="mt-10">
            <AiModelAdminForm models={catalog.models} canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
