"use client";

/**
 * Manuskript panel: one chapter at a time (selection above) + Speichern / Leeren.
 * Book-wide word count stays visible. Clever: Infografik + Abenteuer-Wissen.
 */

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { stripErzaehlerWrappers } from "@/lib/roman/clever-geschichte";
import { CleverInfografikCard } from "@/components/features/admin/clever-infografik-card";
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
  onRestoreChapter,
  restorePending,
  zielWortzahl = null,
  mode = "roman",
  focusChapter = null,
  /** Full book markdown — totals / Kap.-Min when editing one chapter. */
  bookMarkdown = null,
  abenteuerWissenFakten = null,
  romanId = null,
  infografik = null,
  onInfografikComplete,
  /** Override clear-confirm copy (e.g. Roman tab vs Manuskript draft). */
  clearDialog = null,
  restoreDialog = null,
}: {
  hasSzenenplot: boolean;
  /** Body of the focused chapter only (no heading). */
  value: string;
  onChange: (next: string) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
  /** Clever: clear focus chapter. Roman: clear whole Manuskript (+ export). */
  onClear?: () => void | Promise<void>;
  clearPending?: boolean;
  /** Roman tab: replace focus chapter body from Manuskript + clear fertig. */
  onRestoreChapter?: () => void | Promise<void>;
  restorePending?: boolean;
  zielWortzahl?: number | null;
  mode?: "roman" | "clever";
  /** Required for editing — only this chapter is shown. */
  focusChapter?: { number: number; title: string } | null;
  bookMarkdown?: string | null;
  abenteuerWissenFakten?: string[] | null;
  romanId?: string | null;
  infografik?: {
    dataUrl: string | null;
    prompt?: string;
    modelLabel?: string;
    generatedAt?: string | null;
  } | null;
  onInfografikComplete?: (result: {
    roman: import("@/lib/roman/types").RomanKontext;
    unterthemen: import("@/lib/roman/clever-unterthemen").CleverUnterthemen;
  }) => void;
  clearDialog?: {
    title: string;
    description: string;
    confirmLabel: string;
  } | null;
  restoreDialog?: {
    title: string;
    description: string;
    confirmLabel: string;
  } | null;
}) {
  const isClever = mode === "clever";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const busy = Boolean(
    disabled || savePending || clearPending || restorePending,
  );
  const proseValue = isClever ? stripErzaehlerWrappers(value) : value;
  const hasText = proseValue.trim().length > 0;
  const chapterWords = countWords(proseValue);
  const bookText = (bookMarkdown ?? "").trim();
  const totalWords = bookText ? countWords(bookText) : chapterWords;
  const ziel =
    zielWortzahl != null && zielWortzahl > 0 ? zielWortzahl : null;
  const chapterCount = useMemo(
    () => Math.max(parsePlotChapters(bookText || value).length, 1),
    [bookText, value],
  );
  const { min: chapterMin } = manuskriptWordsPerChapter(ziel, chapterCount);
  const underMin = useMemo(
    () =>
      !isClever && bookText
        ? manuskriptChaptersUnderMin(bookText, chapterMin)
        : [],
    [bookText, chapterMin, isClever],
  );
  const delta = !isClever && ziel != null ? totalWords - ziel : null;
  const deltaLabel =
    delta == null
      ? null
      : delta === 0
        ? "Ziel erreicht"
        : delta < 0
          ? `${formatWordCount(Math.abs(delta))} unter Ziel`
          : `${formatWordCount(delta)} über Ziel`;
  const pctOfZiel =
    !isClever && ziel != null && ziel > 0
      ? Math.round((totalWords / ziel) * 100)
      : null;
  const wissenItems = useMemo(
    () =>
      (abenteuerWissenFakten ?? [])
        .map((f) => f.trim())
        .filter((f) => f.length >= 3),
    [abenteuerWissenFakten],
  );

  async function confirmClear() {
    if (!onClear || clearPending) return;
    await onClear();
    setConfirmOpen(false);
  }

  async function confirmRestore() {
    if (!onRestoreChapter || restorePending) return;
    await onRestoreChapter();
    setRestoreConfirmOpen(false);
  }

  const focusLabel = focusChapter
    ? isClever
      ? `Geschichte ${focusChapter.number}${
          focusChapter.title ? ` — ${focusChapter.title}` : ""
        }`
      : `Kapitel ${focusChapter.number}${
          focusChapter.title ? ` — ${focusChapter.title}` : ""
        }`
    : null;

  return (
    <div className="space-y-5">
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={
          clearDialog?.title ??
          (isClever
            ? focusLabel
              ? `„${focusLabel}“ leeren?`
              : "Geschichte leeren?"
            : "Manuskript leeren?")
        }
        description={
          clearDialog?.description ??
          (isClever
            ? "Nur der Text dieser Kurzgeschichte wird gelöscht. Andere Geschichten bleiben erhalten. Unterthemen und Fakten (Abenteuer-Wissen) bleiben."
            : "Die gesamte Prosa wird gelöscht. Continuity-Speicher, Manuskript-Feedback/-Analysen sowie Export-Texte (Klappentext, Einzeiler, Keywords) werden mitgelöscht. Kapitelgerüst und Szenenplot bleiben erhalten.")
        }
        confirmLabel={
          clearDialog?.confirmLabel ??
          (isClever ? "Geschichte leeren" : "Manuskript leeren")
        }
        pending={Boolean(clearPending)}
        onCancel={() => {
          if (!clearPending) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmClear()}
      />

      {onRestoreChapter ? (
        <ConfirmDeleteDialog
          open={restoreConfirmOpen}
          title={
            restoreDialog?.title ??
            (focusLabel
              ? `„${focusLabel}“ aus Manuskript wiederherstellen?`
              : "Kapitel aus Manuskript wiederherstellen?")
          }
          description={
            restoreDialog?.description ??
            "Der aktuelle Roman-Text dieses Kapitels wird durch den Manuskript-Text ersetzt. Das Fertig-Flag für dieses Kapitel wird gelöscht, damit Verbessern es erneut bearbeiten kann. Andere Kapitel bleiben unverändert."
          }
          confirmLabel={
            restoreDialog?.confirmLabel ?? "Aus Manuskript wiederherstellen"
          }
          pending={Boolean(restorePending)}
          onCancel={() => {
            if (!restorePending) setRestoreConfirmOpen(false);
          }}
          onConfirm={() => void confirmRestore()}
        />
      ) : null}

      {!hasSzenenplot ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          {isClever
            ? "Zuerst Unterthemen erzeugen (Tab „Unterthemen“) — jede Kurzgeschichte braucht ein Unterthema."
            : "Für das Manuskript brauchst du zuerst einen Szenenplot (Tab „Szenenplot“) mit Kapitelköpfen."}
        </p>
      ) : null}

      {!focusChapter ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Oben ein Kapitel wählen — im Feld erscheint nur dieses Kapitel.
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          {isClever
            ? focusLabel
              ? `Prosa · ${focusLabel}`
              : "Prosa · Kurzgeschichte"
            : focusLabel
              ? `Prosa · ${focusLabel}`
              : "Prosa · Kapitel"}
        </span>
        <textarea
          value={proseValue}
          onChange={(e) =>
            onChange(
              isClever ? stripErzaehlerWrappers(e.target.value) : e.target.value,
            )
          }
          disabled={!canSave || busy || !focusChapter}
          rows={22}
          className={textareaClass}
          placeholder={
            isClever
              ? "Hier steht nur die Abenteuer-Prosa …\n\nSpannendes Abenteuer mit erlebten Fakten — ohne Faktliste im Text."
              : "Nur dieses Kapitel — Fließtext ohne „Kapitel N — …“-Überschrift …"
          }
        />
        <p className="mt-1.5 text-xs font-semibold text-zinc-500">
          {focusChapter ? (
            <>
              Kapitel {formatWordCount(chapterWords)} Wörter
              {!isClever ? (
                <>
                  {" "}
                  · Buch gesamt {formatWordCount(totalWords)}
                </>
              ) : null}
            </>
          ) : (
            <>{formatWordCount(chapterWords)} Wörter</>
          )}
          {isClever ? (
            <span className="text-zinc-400"> · nur Prosa im Feld</span>
          ) : null}
          {!isClever && ziel != null ? (
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

      {isClever &&
      romanId &&
      focusChapter &&
      onInfografikComplete &&
      wissenItems.length > 0 ? (
        <CleverInfografikCard
          romanId={romanId}
          kapitelNummer={focusChapter.number}
          dataUrl={infografik?.dataUrl ?? null}
          modelLabel={infografik?.modelLabel}
          generatedAt={infografik?.generatedAt}
          canSave={canSave}
          disabled={busy}
          onComplete={onInfografikComplete}
        />
      ) : null}

      {isClever && wissenItems.length > 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-4 ring-1 ring-amber-200/80">
          <p className="text-xs font-extrabold tracking-wide text-amber-900 uppercase">
            Abenteuer-Wissen
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-800/80">
            Was du aus diesem Abenteuer mitnimmst — Export: Geschichte →
            Infografik → diese Liste
          </p>
          <ol className="mt-3 space-y-2">
            {wissenItems.map((item, i) => (
              <li
                key={`${i}-${item.slice(0, 24)}`}
                className="flex gap-3 text-sm font-semibold text-zinc-800"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-700 text-xs font-extrabold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-snug">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          disabled={!canSave || busy || !focusChapter}
          onClick={onSave}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {savePending
            ? "Speichern …"
            : isClever
              ? "Geschichte speichern"
              : "Kapitel speichern"}
        </button>
        {onRestoreChapter ? (
          <button
            type="button"
            disabled={!canSave || busy || !focusChapter}
            onClick={() => setRestoreConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-50 disabled:opacity-50"
            title="Kapitel aus Manuskript wiederherstellen"
          >
            <RotateCcw className="size-4 shrink-0" aria-hidden />
            Aus Manuskript
          </button>
        ) : null}
        {onClear ? (
          <button
            type="button"
            disabled={
              !canSave ||
              busy ||
              (isClever ? !hasText : !bookText && !hasText)
            }
            onClick={() => setConfirmOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
            title={isClever ? "Geschichte leeren" : "Manuskript leeren"}
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">
              {isClever ? "Geschichte leeren" : "Manuskript leeren"}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
