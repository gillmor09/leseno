import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";

export const metadata: Metadata = {
  title: "Kostenlos ausprobieren — Leseno",
  description:
    "Probier Leseno ohne Konto: Thema wählen, Geschichte lesen — mit Bildern und echtem Wissen.",
};

/**
 * Public try-out composer (landing „Jetzt probieren“).
 * Membership entry after signup stays at `/basis` (and paket routes).
 */
export default async function KostenlosPage() {
  const lengthCatalog = await loadStoryLengthCatalog();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Kostenlos ausprobieren
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Wähl dein Thema. Lies deine Geschichte.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Kein Konto nötig. Stell Schulstufe und Textlänge ein — als Komödie,
            Detektivgeschichte oder Motivationsgeschichte.
          </p>
          <div className="mt-10">
            <FreeStoryForm lengthCatalog={lengthCatalog} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
