import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RomanNovelDashboard } from "@/components/features/admin/roman-novel-dashboard";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { getNovelBundle } from "@/lib/novel/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Roman — Leseno Admin",
  description: "Roman-Dashboard: Manuskript, Styleguide, Welt, Lektorat.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RomanNovelDetailPage({ params }: PageProps) {
  const { id } = await params;
  let bundle: Awaited<ReturnType<typeof getNovelBundle>> = null;
  try {
    bundle = await getNovelBundle(id);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <RomanNovelDashboard
            initialBundle={bundle}
            canSave={hasServiceRoleConfig()}
          />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
