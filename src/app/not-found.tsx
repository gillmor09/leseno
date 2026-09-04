import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/features/landing/app-header";
import { LandingFooter } from "@/components/features/landing/landing-footer";

export const metadata: Metadata = {
  title: "Seite nicht gefunden — Leseno",
  description: "Diese Seite gibt es bei Leseno nicht.",
};

/**
 * Branded 404 with shared header/footer.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-lg text-center">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            404
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Diese Seite gibt’s hier nicht.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Vielleicht ist der Link veraltet — oder die Geschichte hat sich
            verlaufen. Zurück zur Startseite oder direkt eine neue Geschichte
            starten.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 sm:w-auto"
            >
              Zur Startseite
            </Link>
            <Link
              href="/kostenlos"
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-50 sm:w-auto"
            >
              Geschichte starten
            </Link>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
