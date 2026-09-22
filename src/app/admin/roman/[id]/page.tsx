import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RomanAdminWorkspace } from "@/components/features/admin/roman-admin-workspace";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  adminModuleForBuchTyp,
  getRomanAdminModule,
  type RomanAdminModuleId,
} from "@/lib/roman/admin-module";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { ensureRomanModuleBuchTyp } from "@/lib/roman/ensure-module-buch-typ";
import { getRomanKontext } from "@/lib/roman/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

const MODULE_ID: RomanAdminModuleId = "roman";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const roman = await getRomanKontext(id);
    return {
      title: roman ? `${roman.title} — Roman` : "Roman — Leseno Admin",
    };
  } catch {
    return { title: "Roman — Leseno Admin" };
  }
}

/** Coach + Redakteur + Szenenplot-Kapitel können lange brauchen. */
export const maxDuration = 800;

/**
 * Roman detail: Belletristik pipeline (buchTyp fixed).
 */
export default async function RomanAdminDetailPage({ params }: PageProps) {
  const { id } = await params;
  const canSave = hasServiceRoleConfig();
  const adminModule = getRomanAdminModule(MODULE_ID);

  let roman: Awaited<ReturnType<typeof getRomanKontext>> = null;
  try {
    roman = await getRomanKontext(id);
    if (!roman) notFound();
  } catch {
    notFound();
  }

  const currentTyp =
    (roman!.editorial ?? emptyRomanEditorial()).buchTyp ?? "unbekannt";
  const owner = adminModuleForBuchTyp(currentTyp);
  if (owner !== MODULE_ID) {
    redirect(`${getRomanAdminModule(owner).basePath}/${id}`);
  }

  if (canSave) {
    try {
      roman = await ensureRomanModuleBuchTyp(roman!, adminModule.buchTyp);
    } catch {
      /* keep loaded roman; workspace still forces typ on save */
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            {roman!.title}
          </h1>
          <div className="mt-8">
            <RomanAdminWorkspace
              initialRoman={roman!}
              canSave={canSave}
              moduleId={MODULE_ID}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
