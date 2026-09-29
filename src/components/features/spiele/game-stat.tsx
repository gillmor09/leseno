/**
 * Shared compact stat tile for Spiele HUD rows (Score, Züge, …).
 */
export function GameStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white px-4 py-3 ring-1 ring-zinc-950/10">
      <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-zinc-950">{value}</p>
    </div>
  );
}
