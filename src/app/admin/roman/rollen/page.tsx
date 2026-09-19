import type { Metadata } from "next";
import Link from "next/link";
import { RomanPipelineAufgabenPanel } from "@/components/features/admin/roman-pipeline-aufgaben-panel";
import { RomanRolesPanel } from "@/components/features/admin/roman-roles-panel";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  FALLBACK_PIPELINE_AUFGABEN,
  loadPipelineAufgaben,
} from "@/lib/roman/pipeline/tasks";
import {
  FALLBACK_ROMAN_KI_ROLLEN,
  listRomanRoleModelOptions,
  loadRomanKiRollen,
} from "@/lib/roman/roles";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "KI-Rollen — Buch — Leseno Admin",
  description:
    "System-Prompts, Modelle und Pipeline-Aufgaben für die Buch-Pipeline.",
};

/**
 * Module-level book KI roles (not tied to a single book instance).
 */
export default async function RomanRollenPage() {
  const canSave = hasServiceRoleConfig();
  let rollen = FALLBACK_ROMAN_KI_ROLLEN;
  let aufgaben = FALLBACK_PIPELINE_AUFGABEN;
  let notice: string | undefined;

  try {
    rollen = await loadRomanKiRollen({ mergeFallback: true });
  } catch (error) {
    notice =
      error instanceof Error
        ? `Rollen aus Fallback: ${error.message}`
        : "Rollen aus Fallback (Migration fehlt?).";
  }

  try {
    aufgaben = await loadPipelineAufgaben({ mergeFallback: true });
  } catch {
    /* keep fallback */
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin · Buch
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                KI-Rollen
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-600">
                System-Prompts, Modelle und Aufgaben-Zuordnung für die
                vertikale Buch-Pipeline.
              </p>
            </div>
            <Link
              href="/admin/roman"
              className="text-sm font-bold text-orange-800 hover:underline"
            >
              ← Alle Bücher
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
