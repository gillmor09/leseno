import Link from "next/link";

/**
 * Compact breadcrumb back to the Spiele hub (used on individual game pages).
 */
export function SpieleSubnav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Spiele"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-zinc-500"
    >
      <Link
        href="/spiele"
        className="text-zinc-700 underline-offset-2 hover:text-zinc-950 hover:underline"
      >
        Spiele
      </Link>
      <span aria-hidden>/</span>
      <span className="font-extrabold text-zinc-950">{current}</span>
    </nav>
  );
}
