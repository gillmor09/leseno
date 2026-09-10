import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { StoryExamplesPinboard } from "@/components/features/stories/story-examples-pinboard";
import { buildPageMetadata } from "@/lib/seo";
import { loadPublicStoryPinboard } from "@/lib/stories/public-samples";

export const metadata: Metadata = buildPageMetadata({
  title: "Beispielgeschichten",
  description:
    "Ausschnitte und Wissens-Häppchen aus öffentlich geteilten leseno-Geschichten — wie Post-its auf einer Pinnwand.",
  path: "/beispiele",
});

/** Refresh the random pinboard periodically (ISR). */
export const revalidate = 300;

/**
 * Public marketing page: random Öffentlich book-club stories as a pinboard collage.
 */
export default async function BeispielePage() {
  const pins = await loadPublicStoryPinboard(12);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(234,88,12,0.12),_transparent_55%),linear-gradient(180deg,#fff7ed_0%,#f4f4f5_50%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                  Einblicke
                </p>
                <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
                  Beispielgeschichten
                </h1>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-zinc-700">
                  Zufällige Ausschnitte und Wissens-Momente aus Geschichten, die
                  Mitglieder im Buchclub als{" "}
                  <strong className="font-extrabold">Öffentlich</strong> geteilt
                  haben — wie Post-its auf einer Pinnwand.
                </p>
                <p className="mt-3 max-w-xl text-sm font-semibold text-zinc-500">
                  Keine vollständigen Geschichten, sondern Appetitmacher. Die
                  Auswahl wechselt von Zeit zu Zeit.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/kostenlos"
                    className="inline-flex rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
                  >
                    Selbst ausprobieren
                  </Link>
                  <Link
                    href="/registrieren"
                    className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
                  >
                    Kostenlos starten
                  </Link>
                </div>
              </div>
              <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
                <Image
                  src="/landing/beispiele-pinwand.webp"
                  alt="Pinnwand mit bunten Notizzetteln und kleinen Geschichten-Motiven — Eye-Catcher für Beispielgeschichten"
                  width={1536}
                  height={864}
                  className="h-auto w-full"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              </div>
            </div>

            <div className="mt-14">
              <StoryExamplesPinboard pins={pins} />
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
