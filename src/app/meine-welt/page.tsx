import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { MyWorldForm } from "@/components/features/world/my-world-form";
import { getCurrentUser } from "@/lib/auth/session";
import { EMPTY_USER_WORLD } from "@/lib/world/catalog";
import { loadMyWorld } from "@/lib/world/repository";

export const metadata: Metadata = {
  title: "Meine Welt — Leseno",
  description:
    "Verwalte deinen Namen, deine Freunde, Interessen und was du mal erleben möchtest.",
};

/**
 * Signed-in personal profile hub. Guests are sent to sign-in.
 */
export default async function MeineWeltPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/anmelden?next=/meine-welt");
  }

  let profile = EMPTY_USER_WORLD;
  let loadError: string | null = null;

  try {
    profile = await loadMyWorld();
  } catch (error) {
    console.error("[MeineWeltPage]", error);
    const detail =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    loadError = `Deine Welt konnte nicht geladen werden: ${detail}`;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex items-start justify-between gap-4">
            <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
              Für dich
            </p>
            {user.email ? (
              <p
                className="max-w-[55%] truncate text-right text-xs font-medium text-zinc-400 sm:text-sm"
                title={user.email}
              >
                {user.email}
              </p>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Meine Welt
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Hier pflegst du, wer du bist und was du dir wünschst — damit Leseno
            Geschichten schreiben kann, die wirklich zu dir passen.
          </p>

          {loadError ? (
            <p className="mt-8 rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
              {loadError}
            </p>
          ) : (
            <div className="mt-10">
              <MyWorldForm initialProfile={profile} />
            </div>
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
