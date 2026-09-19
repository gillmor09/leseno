import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RomanAdminWorkspace } from "@/components/features/admin/roman-admin-workspace";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { getRomanKontext } from "@/lib/roman/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const roman = await getRomanKontext(id);
    return {
      title: roman
        ? `${roman.title} — Buch`
        : "Buch — Leseno Admin",
    };
  } catch {
    return { title: "Buch — Leseno Admin" };
  }
}

/** Coach + Redakteur + Szenenplot-Kapitel können lange brauchen. */
export const maxDuration = 800;

/**
 * Book detail: Typ + Idee Q&A; later tabs placeholders.
 */
export default async function RomanAdminDetailPage({ params }: PageProps) {
  const { id } = await params;
  const canSave = hasServiceRoleConfig();

  let roman: Awaited<ReturnType<typeof getRomanKontext>> = null;
  try {
    roman = await getRomanKontext(id);
    if (!roman) notFound();
  } catch {
    notFound();
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
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
