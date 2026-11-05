import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SachbuchAdminWorkspace } from "@/components/features/admin/sachbuch-admin-workspace";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { slimSachbuchKontextForAdminPage } from "@/lib/sachbuch/parse";
import { getSachbuchKontextAdminShell } from "@/lib/sachbuch/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kuerzen?: string }>;
};

/** Avoid a second multi-MB fetch just for the tab title. */
export const metadata: Metadata = {
  title: "Sachbuch — Leseno Admin",
};

/** Idea interview can take a while. */
export const maxDuration = 1800;

/**
 * Sachbuch detail — greenfield: Idee zuerst, Pipeline folgt.
 * Initial props use the shell RPC (no prose / no image pixels).
 */
export default async function SachbuchAdminDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { kuerzen } = await searchParams;
  const canSave = hasServiceRoleConfig();

  let book: Awaited<ReturnType<typeof getSachbuchKontextAdminShell>> = null;
  try {
    book = await getSachbuchKontextAdminShell(id);
  } catch {
    book = null;
  }
  if (!book) notFound();

  // Defense in depth if shell RPC is not migrated yet (full get + strip).
  const initialBook = slimSachbuchKontextForAdminPage(book);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin · Sachbuch
          </p>
          <div className="mt-6">
            <SachbuchAdminWorkspace
              initialBook={initialBook}
              canSave={canSave}
              startCompact={kuerzen === "1"}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
