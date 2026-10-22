import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "Roman Rollen — Leseno Admin",
  description: "Fest verdrahtete Rollen für das neue Roman-Modul.",
};

/**
 * New Roman has no role admin — models are hardwired.
 * Clever roles remain under /admin/clever-erzaehlt/rollen.
 */
export default function RomanRollenPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-sm font-bold text-zinc-500">
            <Link href="/admin/roman" className="hover:underline">
              Roman
            </Link>
            {" · "}
            Rollen
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-zinc-950">
            Fest verdrahtet
          </h1>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Das neue Roman-Modul nutzt keine KI-Rollen-Verwaltung. Es gibt genau
            zwei Modelle:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm font-semibold text-zinc-800">
            <li>Autor — GPT-6 Luna (Schreiben, Szenen, Überarbeitung)</li>
            <li>
              Lektor — Claude Haiku 5.5 (Styleguide, Review, Wissensgraph)
            </li>
          </ul>
          <p className="mt-6 text-sm text-zinc-600">
            Clever-erzählt-Rollen weiterhin unter{" "}
            <Link
              href="/admin/clever-erzaehlt/rollen"
              className="font-bold text-orange-800 hover:underline"
            >
              /admin/clever-erzaehlt/rollen
            </Link>
            .
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
