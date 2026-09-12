import type { Metadata } from "next";
import { RomanAdminWorkspace } from "@/components/features/admin/roman-admin-workspace";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  listRomanSchreibModels,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Neuer Roman — Leseno Admin",
};

/** Long Gemini roadmap call. */
export const maxDuration = 300;

/**
 * Create a new roman (Phase 0 entry).
 */
export default async function RomanAdminNewPage() {
  const canSave = hasServiceRoleConfig();
  const [schreibModels, defaultModel] = await Promise.all([
    listRomanSchreibModels(),
    resolveRomanTextModel(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Neuer Roman
          </h1>
          <div className="mt-8">
            <RomanAdminWorkspace
              initialRoman={null}
              initialSzenen={[]}
              canSave={canSave}
              isNew
              schreibModels={schreibModels.map((m) => ({
                id: m.id,
                label: m.label,
                modelSlug: m.modelSlug,
              }))}
              defaultSchreibModelId={defaultModel.id}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
