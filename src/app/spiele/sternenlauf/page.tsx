import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { SternenlaufGameLoader } from "@/components/features/spiele/sternenlauf-game-loader";
import { SpieleSubnav } from "@/components/features/spiele/spiele-subnav";

export const metadata: Metadata = {
  title: "Sternenlauf",
  description:
    "Geschicklichkeits-Parcours mit Phaser: springen, Sterne sammeln, Hindernisse meiden — solo ab ca. 8 Jahren.",
  robots: { index: false, follow: false },
};

/**
 * Public mini-game: Phaser skill runner (Sternenlauf).
 */
export default function SternenlaufSpielPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <SpieleSubnav current="Sternenlauf" />
          <SternenlaufGameLoader />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
