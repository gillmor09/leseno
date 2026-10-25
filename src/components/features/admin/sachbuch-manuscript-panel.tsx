"use client";

/**
 * Phase 7 — Manuskript: Verkaufsreife-Score + Argon-Lektorat pro Kapitel.
 * Gesamt-Score = holistische Buch-Bewertung (nicht Kapitel-Mittelwert).
 * Improve-all: one API hop per chapter (like Abschnitte) — no giant Server Action.
 */

import { useState } from "react";
import { toast } from "sonner";
import { reopenSachbuchSchreibenAction } from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  requestImproveAllSachbuchManuscript,
  requestImproveSachbuchKapitel,
  requestScoreSachbuchBook,
} from "@/lib/sachbuch/improve-manuscript-client";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchManuscriptOverallSalesScore,
} from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_MANUSCRIPT_BOOK_SCORE,
  SACHBUCH_WAIT_MANUSCRIPT_IMPROVE,
  SACHBUCH_WAIT_MANUSCRIPT_IMPROVE_ALL,
  sachbuchModelLabel,
  sachbuchWaitAgentManuscript,
} from "@/lib/sachbuch/wait-presets";
import { SACHBUCH_MODEL_MANUSCRIPT } from "@/lib/sachbuch/agent-defaults";
import { cn } from "@/lib/utils";

type WaitKind = "book-score" | "improve" | "improve-all" | null;

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
  const [waitProgress, setWaitProgress] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  const selected =
    book.kapitel.find((k) => k.id === selectedId) ?? book.kapitel[0] ?? null;
  const body = selected ? sachbuchKapitelBodyText(selected) : "";
  const words = countSachbuchWords(body);
  const modelLabel = sachbuchModelLabel(SACHBUCH_MODEL_MANUSCRIPT);
  const overall = sachbuchManuscriptOverallSalesScore(book);
  const bookReview = book.idee.manuscriptReview;

  async function runBookScore() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("book-score");
    setWaitProgress(null);
    try {
      const result = await requestScoreSachbuchBook({ sachbuchId: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Buch-Score fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      const s = result.data.book.idee.manuscriptReview.salesScore;
      toast.success(
        s != null
          ? `Buch-Verkaufsreife: ${s}/10`
          : "Buch-Verkaufsreife bewertet.",
      );
    } finally {
      setWaitKind(null);
      setWaitProgress(null);
      setPending(false);
    }
  }

  async function runImprove(kapitelId: string) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("improve");
    setWaitProgress(null);
    try {
      const result = await requestImproveSachbuchKapitel({
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
      setWaitProgress(null);
      setPending(false);
    }
  }

  async function runImproveAll() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("improve-all");
    setWaitProgress("Starte Kapitel-Hops…");
    try {
      const result = await requestImproveAllSachbuchManuscript({
        book,
        onBookUpdate,
        onProgress: setWaitProgress,
      });
      if (result.data?.book) {
        onBookUpdate(result.data.book);
      }
      if (!result.success) {
        toast.error(result.error ?? "Gesamtverbesserung fehlgeschlagen.");
        return;
      }
      const n = result.data?.improvedCount ?? 0;
      toast.success(
        n > 0
          ? `${n} Kapitel lektoriert — Buch-Score aktualisiert.`
          : "Alles aktuell — Buch-Score aktualisiert.",
      );
    } finally {
      setWaitKind(null);
      setWaitProgress(null);
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

  const scoreLabel =
    overall.source === "book"
      ? "Gesamtwerk (Buch-Bewertung)"
      : overall.source === "chapters-mean"
        ? `Vorläufig: Mittelwert aus ${overall.scoredCount} von ${overall.chapterCount} Kapitel — bitte „Buch bewerten“`
        : "Noch keine Bewertung";

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
              onClick={() => void runBookScore()}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Buch bewerten
            </button>
            <button
              type="button"
              disabled={!canSave || pending || book.kapitel.length === 0}
              onClick={() => void runImproveAll()}
              title="Setzt Kapitel- und Buch-Change-Orders um; bei neuer Buch-Bewertung erneut"
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
            "space-y-3 rounded-2xl px-4 py-3 ring-1",
            overall.source === "book"
              ? "bg-emerald-50 text-emerald-950 ring-emerald-200/80"
              : overall.score != null
                ? "bg-amber-50 text-amber-950 ring-amber-200/80"
                : "bg-zinc-50 text-zinc-700 ring-zinc-950/5",
          )}
        >
          <div>
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Buch-Bewertung Verkaufsreife
            </p>
            {overall.source === "book" && overall.score != null ? (
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {overall.score}
                <span className="text-base font-bold text-zinc-600">/10</span>
              </p>
            ) : (
              <p className="mt-1 text-sm font-semibold">
                Noch keine Buch-Bewertung — „Buch bewerten“ starten.
              </p>
            )}
            <p className="mt-0.5 text-xs font-semibold text-zinc-600">
              {scoreLabel}
            </p>
          </div>

          {overall.source === "book" && bookReview.scoreSummary ? (
            <div>
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Gesamturteil
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-800">
                {bookReview.scoreSummary}
              </p>
            </div>
          ) : null}

          {overall.source === "book" && bookReview.strengths.length > 0 ? (
            <div>
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Stärken
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                {bookReview.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {overall.source === "book" && bookReview.gaps.length > 0 ? (
            <div>
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Lücken
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                {bookReview.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {overall.source === "book" && bookReview.changeOrders.length > 0 ? (
            <div>
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Change-Orders (Buch)
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                {bookReview.changeOrders.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
                    {improved ? "lektoriert" : "Rohentwurf"}
                    {score != null ? ` · intern ${score}/10` : ""}
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
                  {selected.manuscript.improvedText.trim()
                    ? " · Lektorat"
                    : " · Rohentwurf"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
        open={waitKind === "book-score"}
        title="Buch-Verkaufsreife wird bewertet"
        steps={SACHBUCH_WAIT_MANUSCRIPT_BOOK_SCORE}
        agentInfo={sachbuchWaitAgentManuscript()}
        footer="Fenster offen lassen — Argon liest das Gesamtwerk."
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
        progressLabel={waitProgress}
        agentInfo={sachbuchWaitAgentManuscript()}
        footer="Fenster offen lassen — ein Kapitel pro Hop (wie Abschnitte). Fortschritt bleibt bei Abbruch erhalten."
      />
    </div>
  );
}
