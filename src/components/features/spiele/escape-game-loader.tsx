"use client";

/**
 * Client-only Escape loader — avoids SSR/client shuffle hydration mismatch.
 */

import dynamic from "next/dynamic";

const EscapeGame = dynamic(
  () =>
    import("@/components/features/spiele/escape-game").then(
      (m) => m.EscapeGame,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.75rem] bg-amber-50 px-4 py-16 text-center text-sm font-bold text-amber-900 ring-1 ring-amber-200">
        Escape wird geladen…
      </div>
    ),
  },
);

export function EscapeGameLoader() {
  return <EscapeGame />;
}
