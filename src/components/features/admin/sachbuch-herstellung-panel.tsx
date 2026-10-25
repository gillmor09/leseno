"use client";

/**
 * Phase 8 — Herstellung: Haiku setzt Unterkapitel + Layout-Kästen vor dem Export.
 */

import { useState } from "react";
import { toast } from "sonner";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { SACHBUCH_MODEL_HERSTELLUNG } from "@/lib/sachbuch/agent-defaults";
import {
  requestHerstellenAllSachbuchKapitel,
  requestHerstellenSachbuchKapitel,
} from "@/lib/sachbuch/herstellen-client";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchKapitelHasHerstellung,
} from "@/lib/sachbuch/parse";
import { stripSachbuchLayoutMarkup } from "@/lib/sachbuch/herstellung-markup";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_HERSTELLUNG,
  SACHBUCH_WAIT_HERSTELLUNG_ALL,
  sachbuchModelLabel,
  sachbuchWaitAgentHerstellung,
} from "@/lib/sachbuch/wait-presets";
import { cn } from "@/lib/utils";

type WaitKind = "one" | "all" | null;

export function SachbuchHerstellungPanel({
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

  const selected =
    book.kapitel.find((k) => k.id === selectedId) ?? book.kapitel[0] ?? null;
  const hasH = selected ? sachbuchKapitelHasHerstellung(selected) : false;
  const preview = selected
    ? hasH
      ? selected.manuscript.herstellungText
      : sachbuchKapitelBodyText(selected)
    : "";
  const words = countSachbuchWords(
    hasH ? stripSachbuchLayoutMarkup(preview) : preview,
  );
  const modelLabel = sachbuchModelLabel(SACHBUCH_MODEL_HERSTELLUNG);
  const review = book.idee.herstellungReview;
  const doneCount = book.kapitel.filter(sachbuchKapitelHasHerstellung).length;

  async function runOne(kapitelId: string, refreshBook: boolean) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("one");
    setWaitProgress(null);
    try {
      const result = await requestHerstellenSachbuchKapitel({
        sachbuchId: book.id,
        kapitelId,
        refreshBook,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Herstellung fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Kapitel hergestellt.");
    } finally {
      setWaitKind(null);
      setWaitProgress(null);
      setPending(false);
    }
  }

  async function runAll(force: boolean) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("all");
    setWaitProgress("Starte Kapitel-Hops…");
    try {
      const result = await requestHerstellenAllSachbuchKapitel({
        book,
        force,
        onBookUpdate,
        onProgress: setWaitProgress,
      });
      if (result.data?.book) onBookUpdate(result.data.book);
      if (!result.success) {
        toast.error(result.error ?? "Herstellung abgebrochen.");
        return;
      }
      toast.success(
        force
          ? "Alle Kapitel neu hergestellt."
          : "Offene Kapitel hergestellt.",
      );
    } finally {
      setWaitKind(null);
      setWaitProgress(null);
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">Herstellung</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              {modelLabel} prüft Unterkapitel und setzt Layout-Marker (One-Pager,
              Merksatz, Infobox, Schaubild) für PDF/ePub — ohne die lektorierte
              Prosa umzuschreiben.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || pending || book.kapitel.length === 0}
              onClick={() => void runAll(false)}
              className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              Offene Kapitel herstellen
            </button>
            <button
              type="button"
              disabled={!canSave || pending || book.kapitel.length === 0}
              onClick={() => void runAll(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
            >
              Alle neu herstellen
            </button>
          </div>
        </div>

        <div
          className={cn(
            "space-y-2 rounded-2xl px-4 py-3 ring-1",
            doneCount === book.kapitel.length && book.kapitel.length > 0
              ? "bg-emerald-50 text-emerald-950 ring-emerald-200/80"
              : "bg-zinc-50 text-zinc-800 ring-zinc-950/5",
          )}
        >
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Status
          </p>
          <p className="text-sm font-semibold">
            {doneCount} von {book.kapitel.length} Kapiteln hergestellt
          </p>
          {review.summary ? (
            <p className="text-sm font-semibold text-zinc-700">{review.summary}</p>
          ) : null}
          {review.decisions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-700">
              {review.decisions.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ul className="space-y-2">
          {book.kapitel.map((k, i) => {
            const ready = sachbuchKapitelHasHerstellung(k);
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
                    {ready ? "hergestellt" : "offen"}
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
                  {hasH ? " · mit Layout-Markern" : " · Lektorat (noch ohne Herstellung)"}
                </p>
              </div>
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() =>
                  void runOne(selected.id, true)
                }
                className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {hasH ? "Neu herstellen" : "Herstellen"}
              </button>
            </div>

            {hasH && selected.manuscript.herstellungNotes.length > 0 ? (
              <ul className="list-disc space-y-1 rounded-2xl bg-zinc-50 px-4 py-3 pl-8 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/5">
                {selected.manuscript.herstellungNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            <div>
              <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                {hasH ? "Herstellungstext" : "Vorlage (Lektorat)"}
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-950/5">
                {preview || "—"}
              </div>
            </div>
          </section>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Keine Kapitel.
          </p>
        )}
      </div>

      <SachbuchWaitDialog
        open={waitKind === "one"}
        title="Kapitel wird hergestellt"
        steps={SACHBUCH_WAIT_HERSTELLUNG}
        agentInfo={sachbuchWaitAgentHerstellung()}
      />
      <SachbuchWaitDialog
        open={waitKind === "all"}
        title="Herstellung läuft"
        steps={SACHBUCH_WAIT_HERSTELLUNG_ALL}
        progressLabel={waitProgress}
        agentInfo={sachbuchWaitAgentHerstellung()}
        footer="Fenster offen lassen — ein Kapitel pro Hop."
      />
    </div>
  );
}
