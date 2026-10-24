"use client";

/**
 * Phase 7 — Manuskript: Verkaufsreife-Score + Argon-Lektorat pro Kapitel.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  improveAllSachbuchManuscriptAction,
  improveSachbuchKapitelManuscriptAction,
  reopenSachbuchSchreibenAction,
  scoreSachbuchKapitelManuscriptAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchManuscriptOverallSalesScore,
} from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_MANUSCRIPT_IMPROVE,
  SACHBUCH_WAIT_MANUSCRIPT_IMPROVE_ALL,
  SACHBUCH_WAIT_MANUSCRIPT_SCORE,
  sachbuchModelLabel,
  sachbuchWaitAgentManuscript,
} from "@/lib/sachbuch/wait-presets";
import { SACHBUCH_MODEL_MANUSCRIPT } from "@/lib/sachbuch/agent-defaults";
import { cn } from "@/lib/utils";

type WaitKind = "score" | "improve" | "improve-all" | null;

export function SachbuchManuscriptPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const [selectedId, setSelectedId] = useState(book.kapitel[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [waitKind, setWaitKind] = useState<WaitKind>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  const selected =
    book.kapitel.find((k) => k.id === selectedId) ?? book.kapitel[0] ?? null;
  const body = selected ? sachbuchKapitelBodyText(selected) : "";
  const words = countSachbuchWords(body);
  const modelLabel = sachbuchModelLabel(SACHBUCH_MODEL_MANUSCRIPT);
  const overall = sachbuchManuscriptOverallSalesScore(book);

  async function runScore(kapitelId: string) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("score");
    try {
      const result = await scoreSachbuchKapitelManuscriptAction({
        sachbuchId: book.id,
        kapitelId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Score fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Verkaufsreife bewertet.");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function runImprove(kapitelId: string) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("improve");
    try {
      const result = await improveSachbuchKapitelManuscriptAction({
        sachbuchId: book.id,
        kapitelId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Verbesserung fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Kapitel lektoriert.");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function runImproveAll() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("improve-all");
    try {
      const result = await improveAllSachbuchManuscriptAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Gesamtverbesserung fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Gesamtes Manuskript lektoriert (Argon).");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function confirmReopen() {
    if (!canSave || pending) return;
    setPending(true);
    try {
      const result = await reopenSachbuchSchreibenAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Wieder öffnen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      setReopenOpen(false);
      toast.success("Schreiben wieder geöffnet — Manuskript-Scores gelöscht.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">
              Manuskript-Lektorat
            </h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              Rohentwurf ist fixiert. {modelLabel} bewertet Verkaufsreife und
              überarbeitet Kapitel (ohne Artikel-Schlacht, weniger Wiederholung).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || pending || book.kapitel.length === 0}
              onClick={() => void runImproveAll()}
              className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              Alle Kapitel verbessern
            </button>
            <button
              type="button"
              disabled={!canSave || pending}
              onClick={() => setReopenOpen(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
            >
              Schreiben wieder öffnen
            </button>
          </div>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 ring-1",
            overall.average != null
              ? "bg-emerald-50 text-emerald-950 ring-emerald-200/80"
              : "bg-zinc-50 text-zinc-700 ring-zinc-950/5",
          )}
        >
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Gesamt-Score Verkaufsreife
          </p>
          {overall.average != null ? (
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {overall.average.toLocaleString("de-DE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              })}
              <span className="text-base font-bold text-zinc-600">/10</span>
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold">
              Noch keine Kapitel bewertet.
            </p>
          )}
          <p className="mt-0.5 text-xs font-semibold text-zinc-600">
            Mittelwert aus {overall.scoredCount} von {overall.chapterCount}{" "}
            Kapitel
            {overall.scoredCount < overall.chapterCount && overall.scoredCount > 0
              ? " (unbewertete zählen nicht mit)"
              : ""}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ul className="space-y-2">
          {book.kapitel.map((k, i) => {
            const score = k.manuscript.salesScore;
            const improved = Boolean(k.manuscript.improvedText.trim());
            return (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(k.id)}
                  className={cn(
                    "w-full rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition",
                    selected?.id === k.id
                      ? "bg-orange-50 text-zinc-950 ring-orange-200"
                      : "bg-white text-zinc-800 ring-zinc-950/10 hover:bg-zinc-50",
                  )}
                >
                  <span className="block font-extrabold">
                    {i + 1}. {k.title || "Kapitel"}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {score != null ? `${score}/10` : "noch kein Score"}
                    {improved ? " · lektoriert" : " · Rohentwurf"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected ? (
          <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-zinc-950">
                  {selected.title}
                </h3>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {words.toLocaleString("de-DE")} Wörter
                  {selected.manuscript.salesScore != null
                    ? ` · Verkaufsreife ${selected.manuscript.salesScore}/10`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => void runScore(selected.id)}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  Score
                </button>
                <button
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => void runImprove(selected.id)}
                  className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  Verbessern
                </button>
              </div>
            </div>

            {selected.manuscript.scoreSummary ? (
              <div className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/5">
                <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Bewertung
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-800">
                  {selected.manuscript.scoreSummary}
                </p>
                {selected.manuscript.gaps.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-zinc-600">
                    {selected.manuscript.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                {selected.manuscript.improvedText.trim()
                  ? "Lektorat-Text"
                  : "Rohentwurf (fixiert)"}
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-950/5">
                {body || "—"}
              </div>
            </div>
          </section>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Keine Kapitel.
          </p>
        )}
      </div>

      <ConfirmDeleteDialog
        open={reopenOpen}
        title="Schreiben wieder öffnen?"
        description="Manuskript-Scores und Lektorat-Texte werden gelöscht. Abschnitte bleiben erhalten und sind wieder editierbar."
        confirmLabel="Wieder öffnen"
        pending={pending}
        onCancel={() => {
          if (!pending) setReopenOpen(false);
        }}
        onConfirm={() => void confirmReopen()}
      />

      <SachbuchWaitDialog
        open={waitKind === "score"}
        title="Verkaufsreife wird bewertet"
        steps={SACHBUCH_WAIT_MANUSCRIPT_SCORE}
        agentInfo={sachbuchWaitAgentManuscript()}
      />
      <SachbuchWaitDialog
        open={waitKind === "improve"}
        title="Kapitel wird lektoriert"
        steps={SACHBUCH_WAIT_MANUSCRIPT_IMPROVE}
        agentInfo={sachbuchWaitAgentManuscript()}
      />
      <SachbuchWaitDialog
        open={waitKind === "improve-all"}
        title="Manuskript wird lektoriert"
        steps={SACHBUCH_WAIT_MANUSCRIPT_IMPROVE_ALL}
        agentInfo={sachbuchWaitAgentManuscript()}
        footer="Fenster offen lassen — alle Kapitel nacheinander (kann sehr lange dauern)."
      />
    </div>
  );
}
