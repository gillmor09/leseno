import type { Metadata } from "next";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { EscapeGameLoader } from "@/components/features/spiele/escape-game-loader";
import { SpieleSubnav } from "@/components/features/spiele/spiele-subnav";

export const metadata: Metadata = {
  title: "Bibliothek-Escape",
  description:
    "Kindgerechtes Escape-Rätsel: Suchsel, Reihenfolge, Code und Geheimwort — solo ab ca. 8 Jahren.",
  robots: { index: false, follow: false },
};

/**
 * Public mini-game: escape-room style puzzle trail (client-only shuffle).
 */
export default function EscapeSpielPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <SpieleSubnav current="Bibliothek-Escape" />
          <EscapeGameLoader />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
