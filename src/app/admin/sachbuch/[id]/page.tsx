import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SachbuchAdminWorkspace } from "@/components/features/admin/sachbuch-admin-workspace";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { getSachbuchKontext } from "@/lib/sachbuch/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const book = await getSachbuchKontext(id);
    return {
      title: book ? `${book.title} — Sachbuch` : "Sachbuch — Leseno Admin",
    };
  } catch {
    return { title: "Sachbuch — Leseno Admin" };
  }
}

/** Idea interview can take a while. */
export const maxDuration = 1800;

/**
 * Sachbuch detail — greenfield: Idee zuerst, Pipeline folgt.
 */
export default async function SachbuchAdminDetailPage({ params }: PageProps) {
  const { id } = await params;
  const canSave = hasServiceRoleConfig();

  let book: Awaited<ReturnType<typeof getSachbuchKontext>> = null;
  try {
    book = await getSachbuchKontext(id);
  } catch {
    book = null;
  }
  if (!book) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin · Sachbuch
          </p>
          <div className="mt-6">
            <SachbuchAdminWorkspace initialBook={book} canSave={canSave} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
