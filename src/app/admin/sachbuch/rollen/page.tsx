import type { Metadata } from "next";
import Link from "next/link";
import { RomanPipelineAufgabenPanel } from "@/components/features/admin/roman-pipeline-aufgaben-panel";
import { RomanRolesPanel } from "@/components/features/admin/roman-roles-panel";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  getRomanAdminModule,
  type RomanAdminModuleId,
} from "@/lib/roman/admin-module";
import {
  FALLBACK_PIPELINE_AUFGABEN,
  filterAufgabenForAdminModule,
  loadPipelineAufgaben,
} from "@/lib/roman/pipeline/tasks";
import {
  FALLBACK_ROMAN_KI_ROLLEN,
  filterRollenForAdminModule,
  listRomanRoleModelOptions,
  loadRomanKiRollen,
} from "@/lib/roman/roles";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "KI-Rollen — Sachbuch — Leseno Admin",
  description:
    "System-Prompts, Modelle und Pipeline-Aufgaben für die Sachbuch-Pipeline.",
};

const MODULE_ID: RomanAdminModuleId = "sachbuch";

/**
 * Module-level KI roles (shared DB; linked from Sachbuch admin).
 */
export default async function SachbuchRollenPage() {
  const adminModule = getRomanAdminModule(MODULE_ID);
  const canSave = hasServiceRoleConfig();
  let rollen = FALLBACK_ROMAN_KI_ROLLEN;
  let aufgaben = FALLBACK_PIPELINE_AUFGABEN;
  let notice: string | undefined;

  try {
    const all = await loadRomanKiRollen({ mergeFallback: true });
    rollen = filterRollenForAdminModule(all, MODULE_ID);
  } catch (error) {
    notice =
      error instanceof Error
        ? `Rollen aus Fallback: ${error.message}`
        : "Rollen aus Fallback (Migration fehlt?).";
  }

  try {
    const all = await loadPipelineAufgaben({ mergeFallback: true });
    aufgaben = filterAufgabenForAdminModule(all, MODULE_ID);
  } catch {
    /* keep fallback */
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin · {adminModule.label}
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                KI-Rollen
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-600">
                System-Prompts, Modelle und Aufgaben-Zuordnung für die
                vertikale {adminModule.label}-Pipeline.
              </p>
            </div>
            <Link
              href={adminModule.basePath}
              className="text-sm font-bold text-orange-800 hover:underline"
            >
              ← Alle {adminModule.itemLabelPlural}
            </Link>
          </div>
          {notice ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              {notice}
            </p>
          ) : null}
          <div className="mt-8 space-y-10">
            <RomanPipelineAufgabenPanel
              initialAufgaben={aufgaben}
              rollen={rollen}
              canSave={canSave}
            />
            <RomanRolesPanel
              initialRollen={rollen}
              modelOptions={listRomanRoleModelOptions()}
              canSave={canSave}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
