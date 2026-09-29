import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MemoryGameLoader } from "@/components/features/spiele/memory-game-loader";
import { SpieleSubnav } from "@/components/features/spiele/spiele-subnav";

export const metadata: Metadata = {
  title: "Tier-Memory",
  description:
    "Kindgerechtes Memory: Tierpaare finden, Gedächtnis trainieren, solo spielen.",
  robots: { index: false, follow: false },
};

/**
 * Public mini-game: classic Memory with animal pairs (client-only shuffle).
 */
export default function MemorySpielPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <SpieleSubnav current="Tier-Memory" />
          <MemoryGameLoader />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
