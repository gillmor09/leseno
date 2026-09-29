"use client";

/**
 * Client-only Memory loader — avoids SSR/client shuffle hydration mismatch.
 */

import dynamic from "next/dynamic";

const MemoryGame = dynamic(
  () =>
    import("@/components/features/spiele/memory-game").then(
      (m) => m.MemoryGame,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.75rem] bg-sky-50 px-4 py-16 text-center text-sm font-bold text-sky-900 ring-1 ring-sky-200">
        Memory wird geladen…
      </div>
    ),
  },
);

export function MemoryGameLoader() {
  return <MemoryGame />;
}
