import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { BauweltGame } from "@/components/features/spiele/bauwelt-game";
import { SpieleSubnav } from "@/components/features/spiele/spiele-subnav";

export const metadata: Metadata = {
  title: "Bauwelt",
  description:
    "Blockbauen für Kinder: fünf Bau-Missionen nachbauen — solo ab ca. 8 Jahren.",
  robots: { index: false, follow: false },
};

/**
 * Public mini-game: Minecraft-style 2D build missions (Bauwelt).
 */
export default function BauweltSpielPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <SpieleSubnav current="Bauwelt" />
          <BauweltGame />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
