"use client";

/**
 * Admin list for greenfield novels (`leseno.novels`).
 */

import Link from "next/link";
import type { NovelSummary } from "@/lib/novel/types";

export function RomanNovelList({
  novels,
  canSave,
  readOnlyNotice,
}: {
  novels: NovelSummary[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  return (
    <div className="space-y-4">
      {readOnlyNotice ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          {readOnlyNotice}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Link
          href="/admin/roman/neu"
          className={`inline-flex items-center rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 ${
            !canSave ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Neuer Roman
        </Link>
      </div>

      {novels.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-zinc-600 ring-1 ring-zinc-950/10">
          Noch keine Romane. Lege eine High-Concept-Idee an und starte den
          Zwei-Rollen-Orchestrator (Autor Luna · Lektor Haiku).
        </p>
      ) : (
        <ul className="space-y-3">
          {novels.map((n) => (
            <li key={n.id}>
              <Link
                href={`/admin/roman/${n.id}`}
                className="block rounded-2xl bg-white p-5 ring-1 ring-zinc-950/10 transition hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-zinc-950">
                    {n.title}
                  </h2>
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    {n.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                  {n.highConceptIdea || "Keine Idee hinterlegt."}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  {n.chapterCount} Kapitel ·{" "}
                  {n.orchestratorStatus.label || "Bereit"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
