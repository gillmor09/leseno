"use client";

/**
 * Phase 8 — Herstellung: Haiku setzt Unterkapitel + Layout-Kästen vor dem Export.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SachbuchHerstellungPreview } from "@/components/features/admin/sachbuch-herstellung-preview";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { SACHBUCH_MODEL_HERSTELLUNG } from "@/lib/sachbuch/agent-defaults";
import {
  requestHerstellenAllSachbuchKapitel,
  requestHerstellenSachbuchKapitel,
} from "@/lib/sachbuch/herstellen-client";
import { sachbuchFiguresFromList } from "@/lib/sachbuch/figures";
import {
  countSachbuchWords,
  mergeSachbuchProseFromPrevious,
  sachbuchKapitelBodyText,
  sachbuchKapitelHasHerstellung,
  sachbuchKapitelInfografikSlotCount,
  sachbuchKapitelInfografiken,
} from "@/lib/sachbuch/parse";
import {
  isSachbuchDerivedEdition,
  isSachbuchTeaser,
} from "@/lib/sachbuch/guide";
import { stripSachbuchLayoutMarkup } from "@/lib/sachbuch/herstellung-markup";
import type { SachbuchKapitel, SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_HERSTELLUNG,
  SACHBUCH_WAIT_HERSTELLUNG_ALL,
  SACHBUCH_WAIT_INFOGRAFIKEN,
  sachbuchModelLabel,
  sachbuchWaitAgentHerstellung,
  sachbuchWaitAgentInfografik,
} from "@/lib/sachbuch/wait-presets";
import { cn } from "@/lib/utils";

type WaitKind = "one" | "all" | "infografik" | null;

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
  const [bodyLoading, setBodyLoading] = useState(false);
  const [waitKind, setWaitKind] = useState<WaitKind>(null);
  const [waitProgress, setWaitProgress] = useState<string | null>(null);
  const [showMarkers, setShowMarkers] = useState(false);

  const bookRef = useRef(book);
  bookRef.current = book;

  const shortEdition = isSachbuchDerivedEdition(book);
  const teaser = isSachbuchTeaser(book);
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
  const selectedFigures =
    !shortEdition && selected
      ? sachbuchFiguresFromList(sachbuchKapitelInfografiken(selected))
      : [];
  const modelLabel = sachbuchModelLabel(SACHBUCH_MODEL_HERSTELLUNG);
  const review = book.idee.herstellungReview;
  const doneCount = book.kapitel.filter(sachbuchKapitelHasHerstellung).length;
  const infoCount = shortEdition
    ? 0
    : book.kapitel.reduce(
        (n, k) => n + sachbuchKapitelInfografikSlotCount(k),
        0,
      );

  /** Slim hop payloads strip other chapters — keep prior prose in workspace state. */
  function applyBookUpdate(next: SachbuchKontext) {
    onBookUpdate(mergeSachbuchProseFromPrevious(book, next));
  }

  /**
   * Admin page strips herstellungText / figure pixels — reload the selected
   * chapter so Vorschau matches export.
   */
  useEffect(() => {
    if (!selectedId) return;
    const kap = bookRef.current.kapitel.find((k) => k.id === selectedId);
    if (!kap) return;
    const hasText =
      kap.manuscript.herstellungText.trim().length >= 200 ||
      sachbuchKapitelBodyText(kap).trim().length >= 200;
    const needsPixels =
      !isSachbuchDerivedEdition(bookRef.current) &&
      sachbuchKapitelInfografikSlotCount(kap) > 0 &&
      sachbuchKapitelInfografiken(kap).length === 0;
    if (hasText && !needsPixels) {
      setBodyLoading(false);
      return;
    }

    let cancelled = false;
    setBodyLoading(true);
    const bookId = bookRef.current.id;
    const kapitelId = selectedId;
    void (async () => {
      try {
        const res = await fetch("/api/admin/sachbuch/kapitel-body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sachbuchId: bookId, kapitelId }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          kapitel?: SachbuchKapitel;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.success || !json.kapitel) {
          toast.error(json.error ?? "Kapiteltext laden fehlgeschlagen.");
          return;
        }
        const loaded = json.kapitel;
        const current = bookRef.current;
        onBookUpdate({
          ...current,
          kapitel: current.kapitel.map((k) =>
            k.id === kapitelId ? loaded : k,
          ),
        });
      } catch {
        if (!cancelled) {
          toast.error("Kapiteltext laden fehlgeschlagen.");
        }
      } finally {
        if (!cancelled) setBodyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, onBookUpdate]);

  async function runInfografiken(force: boolean) {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("infografik");
    setWaitProgress(null);
    try {
      const res = await fetch("/api/admin/sachbuch/infografiken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sachbuchId: book.id, force }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        book?: SachbuchKontext;
        error?: string;
      };
      if (!res.ok || !json.success || !json.book) {
        toast.error(json.error ?? "Infografiken fehlgeschlagen.");
        return;
      }
      applyBookUpdate(json.book);
      toast.success("Infografiken gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Infografiken fehlgeschlagen.",
      );
    } finally {
      setWaitKind(null);
      setWaitProgress(null);
      setPending(false);
    }
  }

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
      applyBookUpdate(result.data.book);
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
        onBookUpdate: applyBookUpdate,
        onProgress: setWaitProgress,
      });
      if (result.data?.book) applyBookUpdate(result.data.book);
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
              {teaser
                ? `${modelLabel} setzt höchstens einen Merksatz. Teaser ist text-only — Appetit für Newsletter/Broschüre/Web.`
                : shortEdition
                  ? `${modelLabel} setzt sparsame Kästen (Merksatz/Infobox). Kompakt ist text-only — keine Infografiken; Vertiefung steht im Hauptband.`
                  : `${modelLabel} plant Unterkapitel und Kästen. Die Marker im Text sind die Satz-Anweisung; PDF/ePub und die Vorschau unten setzen sie in echte Zwischenüberschriften und Infoboxen um.`}
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
            {!shortEdition ? (
              <button
                type="button"
                disabled={!canSave || pending || book.kapitel.length === 0}
                onClick={() => void runInfografiken(infoCount > 0)}
                title="Gemini 3 Pro Image — Abbildungen laut Manuskript-Captions"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {infoCount > 0
                  ? "Infografiken neu erzeugen"
                  : "Infografiken erzeugen"}
              </button>
            ) : null}
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
            {infoCount > 0
              ? ` · ${infoCount} Infografik${infoCount === 1 ? "" : "en"}`
              : ""}
          </p>
          {review.summary ? (
            <p className="text-sm font-semibold text-zinc-700">{review.summary}</p>
          ) : null}
              {review.decisions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-700">
              {review.decisions.map((d, i) => (
                <li key={`dec-${i}`}>{d}</li>
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
                    {!shortEdition
                      ? (() => {
                          const n = sachbuchKapitelInfografikSlotCount(k);
                          if (n === 0) return "";
                          return n === 1
                            ? " · Infografik"
                            : ` · ${n} Infografiken`;
                        })()
                      : ""}
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
                {selected.manuscript.herstellungNotes.map((n, i) => (
                  <li key={`note-${i}`}>{n}</li>
                ))}
              </ul>
            ) : null}

            {hasH ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Vorschau (wie Export)
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowMarkers((v) => !v)}
                    className="text-xs font-bold text-orange-800 underline-offset-2 hover:underline"
                  >
                    {showMarkers ? "Marker ausblenden" : "Marker-Rohtext zeigen"}
                  </button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10">
                  {bodyLoading && preview.trim().length < 200 ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Kapiteltext wird geladen…
                    </p>
                  ) : (
                    <SachbuchHerstellungPreview
                      text={preview}
                      figures={selectedFigures}
                    />
                  )}
                </div>
                {showMarkers ? (
                  <div>
                    <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                      Marker-Rohtext (für PDF/ePub-Parser)
                    </p>
                    <div className="max-h-[30vh] overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 ring-1 ring-zinc-950/5">
                      {preview}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Vorlage (Lektorat)
                </p>
                <div className="max-h-[50vh] overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-950/5">
                  {bodyLoading && !preview.trim() ? (
                    <span className="inline-flex items-center gap-2 font-semibold text-zinc-500">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Kapiteltext wird geladen…
                    </span>
                  ) : (
                    preview || "—"
                  )}
                </div>
              </div>
            )}
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
      <SachbuchWaitDialog
        open={waitKind === "infografik"}
        title="Infografiken werden erzeugt"
        steps={SACHBUCH_WAIT_INFOGRAFIKEN}
        agentInfo={sachbuchWaitAgentInfografik()}
        footer="Fenster offen lassen — Gemini Pro Image braucht pro Diagramm etwas Zeit."
      />
    </div>
  );
}
