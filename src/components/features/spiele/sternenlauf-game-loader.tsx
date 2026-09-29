"use client";

/**
 * Client-only loader for Sternenlauf — keeps Phaser out of Server Component graphs.
 */

import dynamic from "next/dynamic";

const SternenlaufGame = dynamic(
  () =>
    import("@/components/features/spiele/sternenlauf-game").then(
      (m) => m.SternenlaufGame,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.75rem] bg-orange-50 px-4 py-16 text-center text-sm font-bold text-orange-900 ring-1 ring-orange-200">
        Sternenlauf wird geladen…
      </div>
    ),
  },
);

export function SternenlaufGameLoader() {
  return <SternenlaufGame />;
}
