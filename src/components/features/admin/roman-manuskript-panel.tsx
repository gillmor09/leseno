"use client";

/**
 * Manuskript panel: prose editor + Speichern / Leeren (with confirm).
 * Vertical pipeline owns KI generation.
 */

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { countWords, formatWordCount } from "@/lib/roman/editorial";
import {
  manuskriptChaptersUnderMin,
  manuskriptWordsPerChapter,
} from "@/lib/roman/manuskript-contracts";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";
const textareaClass = `${inputClass} min-h-[18rem]`;

export function RomanManuskriptPanel({
  hasSzenenplot,
  value,
  onChange,
  canSave,
  disabled,
  savePending,
  onSave,
  onClear,
  clearPending,
  zielWortzahl = null,
}: {
  hasSzenenplot: boolean;
  value: string;
  onChange: (next: string) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
  /** Persist empty Manuskript (+ related continuity/feedback). */
  onClear?: () => void | Promise<void>;
  clearPending?: boolean;
  /** Book target from Basics — shown next to live count. */
  zielWortzahl?: number | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = Boolean(disabled || savePending || clearPending);
  const hasText = value.trim().length > 0;
  const words = countWords(value);
  const ziel =
    zielWortzahl != null && zielWortzahl > 0 ? zielWortzahl : null;
  const chapterCount = useMemo(
    () => Math.max(parsePlotChapters(value).length, 1),
    [value],
  );
  const { min: chapterMin } = manuskriptWordsPerChapter(ziel, chapterCount);
  const underMin = useMemo(
    () => (value.trim() ? manuskriptChaptersUnderMin(value, chapterMin) : []),
    [value, chapterMin],
  );
  const delta = ziel != null ? words - ziel : null;
  const deltaLabel =
    delta == null
      ? null
      : delta === 0
        ? "Ziel erreicht"
        : delta < 0
          ? `${formatWordCount(Math.abs(delta))} unter Ziel`
          : `${formatWordCount(delta)} über Ziel`;
  const pctOfZiel =
    ziel != null && ziel > 0 ? Math.round((words / ziel) * 100) : null;

  async function confirmClear() {
    if (!onClear || clearPending) return;
    await onClear();
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-5">
      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Manuskript leeren?"
        description="Die gesamte Prosa wird gelöscht. Continuity-Speicher, offenes Manuskript-Feedback und offene Manuskript-Analysen werden mitgelöscht. Das Kapitelgerüst bleibt erhalten."
        confirmLabel="Manuskript leeren"
        pending={Boolean(clearPending)}
        onCancel={() => {
          if (!clearPending) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmClear()}
      />

      {!hasSzenenplot ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für das Manuskript brauchst du zuerst ein Kapitelgerüst mit Kapiteln
          („## Kapitel N — Titel“ unter „Kapitelgerüst“).
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Manuskript · Prosa
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canSave || busy}
          rows={22}
          className={textareaClass}
          placeholder={
            "Kapitel 1 — Kurztitel\n\nHier entsteht die Kapitelprosa …\n\n\n\nKapitel 2 — Kurztitel\n\n…"
          }
        />
        <p className="mt-1.5 text-xs font-semibold text-zinc-500">
          {formatWordCount(words)} Wörter
          {ziel != null ? (
            <>
              {" "}
              · Ziel {formatWordCount(ziel)}
              {pctOfZiel != null ? ` (${pctOfZiel}%)` : null}
              {deltaLabel ? (
                <span
                  className={
                    delta != null && delta < 0
                      ? " text-amber-800"
                      : " text-emerald-800"
                  }
                >
                  {" "}
                  ({deltaLabel})
                </span>
              ) : null}
            </>
          ) : null}
          {underMin.length > 0 ? (
            <span className="text-amber-800">
              {" "}
              · unter Kap.-Min ({formatWordCount(chapterMin)}):{" "}
              {underMin.join(", ")}
            </span>
          ) : null}
        </p>
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={onSave}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {savePending ? "Speichern …" : "Manuskript speichern"}
        </button>
        {onClear ? (
          <button
            type="button"
            disabled={!canSave || busy || !hasText}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
            title="Manuskript leeren"
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">Manuskript leeren</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
