import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { loadReadingTypographyDefaults } from "@/lib/stories/reading-typography-repository";
import { TRIAL_MAX_STORIES_PER_IP_PER_DAY } from "@/lib/stories/trial-limits";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Kostenlos ausprobieren — eigene Geschichten ohne Konto",
  description:
    "leseno kostenlos ausprobieren: eine kurze eigene Geschichte ohne Konto — aus Spaß und Neugier, ohne Druck. In wenigen Minuten loslegen.",
  path: "/kostenlos",
});

/**
 * Public try-out composer (landing „Jetzt probieren“).
 * Limited grades/length, no images/TTS/PDF/fact-why, max 3 stories per IP/day.
 */
export default async function KostenlosPage() {
  const [lengthCatalog, typographyDefaults] = await Promise.all([
    loadStoryLengthCatalog(),
    loadReadingTypographyDefaults(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Kostenlos ausprobieren
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Eine Geschichte — ohne Konto, ohne Abo.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Probier leseno mit einer kurzen Geschichte. Ideal, um zu spüren, ob
            Lesen so Spaß macht. Im Testmodus: leichte Lesestufe, Textlänge bis
            mittel, ohne Bilder, Vorlesen, PDF und Warum-Fragen. Maximal{" "}
            {TRIAL_MAX_STORIES_PER_IP_PER_DAY} Geschichten pro Tag.
          </p>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-zinc-500">
            Danach mit Konto: Basis starten — Extra-Funktionen (Bücherei,
            Bilder, Silbenhilfe, Vorlesen) je nach Paket auf /preise.
          </p>
          <div className="mt-10">
            <FreeStoryForm
              lengthCatalog={lengthCatalog}
              typographyDefaults={typographyDefaults}
              trialMode
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
