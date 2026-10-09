"use client";

/**
 * Kapitelgerüst panel: overview card + one card per chapter.
 * Structured JSON in `editorial.kapitelGeruestStructured`.
 * Clear cascades Szenenplot + Manuskript (confirm).
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { RomanKapitelGeruestStructured } from "@/lib/roman/szenenplot-structured";

function chipList(label: string, items: string[]) {
  if (!items.length) return null;
  return (
    <p className="text-xs font-semibold text-zinc-600">
      <span className="text-zinc-500">{label}: </span>
      {items.join(" · ")}
    </p>
  );
}

export function RomanKapitelGeruestPanel({
  hasExpose,
  value,
  structured,
  disabled,
  onClear,
  clearPending,
  staleBanner,
}: {
  hasExpose: boolean;
  /** Raw markdown — only used to detect content for Clear when structured is empty. */
  value?: string;
  structured?: RomanKapitelGeruestStructured | null;
  disabled?: boolean;
  /** Persist empty Gerüst + cascade clear Szenenplot/Manuskript/Graph. */
  onClear?: () => void | Promise<void>;
  clearPending?: boolean;
  staleBanner?: string | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = Boolean(disabled || clearPending);
  const hasContent =
    Boolean(value?.trim()) || Boolean(structured?.chapters.length);
  const chapters = structured?.chapters ?? [];

  async function confirmClear() {
    if (!onClear || clearPending) return;
    await onClear();
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-5">
      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Kapitelgerüst leeren?"
        description="Kapitelgerüst (Markdown + Struktur), Wissensgraph, Szenenplot, Manuskript und Export-Texte (Klappentext, Einzeiler, Keywords) werden gelöscht. Spec, Idee und Recherche bleiben. Fertig-Flags und Reifegrade für Gerüst/Plot/Manuskript/Export entfallen."
        confirmLabel="Kapitelgerüst leeren"
        pending={Boolean(clearPending)}
        onCancel={() => {
          if (!clearPending) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmClear()}
      />

      {!hasExpose ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für das Kapitelgerüst brauchst du zuerst einen Spec (Idee + Figuren /
          Welt / Exposé unter „Spec“).
        </p>
      ) : null}

      {staleBanner ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          {staleBanner}
        </p>
      ) : null}

      {chapters.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/10">
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kapitelgerüst · Übersicht
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-950">
              {chapters.length} Kapitel
              {structured?.centralArcs.length === 1
                ? " · 1 Spannungsbogen"
                : structured?.centralArcs.length
                  ? ` · ${structured.centralArcs.length} Spannungsbögen`
                  : ""}
              {structured?.modelLabel ? ` · ${structured.modelLabel}` : ""}
            </p>
            {structured && structured.centralArcs.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {structured.centralArcs.map((a, i) => (
                  <li
                    key={a.id}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/10"
                  >
                    <span className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                      {i === 0 ? "Hauptbogen" : `Nebenbogen ${i}`}
                    </span>
                    <p className="mt-0.5 text-zinc-950">{a.label}</p>
                    {a.parties.length ? (
                      <p className="text-xs font-semibold text-zinc-500">
                        {a.parties.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                      Setup Kap. {a.setupChapter} → Peak Kap. {a.peakChapter} →
                      Payoff Kap. {a.payoffChapter}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs font-semibold text-zinc-500">
              Nur Struktur: Kapitelrollen, Bögen, Props/Events. Einzelszenen
              folgen im Tab „Szenenplot“.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kapitel
            </p>
            {chapters.map((ch) => (
              <article
                key={ch.number}
                className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10"
              >
                <h3 className="text-sm font-extrabold text-zinc-950">
                  Kapitel {ch.number} — {ch.title}
                </h3>
                <p className="mt-1.5 text-sm font-semibold text-zinc-800">
                  {ch.kernsatz}
                </p>
                {ch.inhaltKurz && ch.inhaltKurz !== ch.kernsatz ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-600">
                    {ch.inhaltKurz}
                  </p>
                ) : null}
                <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                  {chipList("Props", ch.props)}
                  {chipList("Events", ch.events)}
                  {chipList("Führt ein", ch.introduces)}
                  {chipList("Löst / schließt", ch.resolves)}
                  {chipList("Offene Fäden", ch.openThreads)}
                  {ch.arcBeats.length > 0 ? (
                    <p className="text-xs font-semibold text-zinc-600">
                      <span className="text-zinc-500">Arc-Beats: </span>
                      {ch.arcBeats
                        .map(
                          (b) =>
                            `${b.arcId} (T${b.tension}): ${b.mustShow}`,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : hasExpose && !hasContent ? (
        <p className="text-sm font-semibold text-zinc-500">
          Noch kein Kapitelgerüst — oben „Erzeugen“ starten.
        </p>
      ) : null}

      {onClear ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="button"
            disabled={busy || !hasContent}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
            title="Kapitelgerüst leeren"
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">Kapitelgerüst leeren</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
