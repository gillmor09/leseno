"use client";

/**
 * Phases 4–5: Context Graph + Abschnitte (Critic/Style per Abschnitt).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import {
  generateNextAbschnittAction,
  generateSachbuchContextGraphAction,
  replyAbschnittCheckpointAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchAbschnittRevisionDialog } from "@/components/features/admin/sachbuch-abschnitt-revision-dialog";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  recommendedMinAbschnitte,
  SACHBUCH_ABSCHNITT_WORDS_MAX,
  SACHBUCH_ABSCHNITT_WORDS_MIN,
  SACHBUCH_ABSCHNITT_WORDS_TARGET,
  SACHBUCH_BOOK_WORDS_TARGET,
  SACHBUCH_KAPITEL_WORDS_TARGET,
} from "@/lib/sachbuch/agent-defaults";
import {
  concatAbschnitteText,
  countKapitelAbschnitteWords,
  countSachbuchWords,
  emptyContextGraph,
} from "@/lib/sachbuch/parse";
import type {
  SachbuchAbschnittRevision,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_ABSCHNITT,
  SACHBUCH_WAIT_CHECKPOINT_REVISE,
  SACHBUCH_WAIT_GRAPH,
  sachbuchWaitAgent,
} from "@/lib/sachbuch/wait-presets";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

type WaitKind = "graph" | "abschnitt" | "revise" | null;

export function SachbuchSchreibenPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    book.kapitel[0]?.id ?? null,
  );
  const selected =
    book.kapitel.find((k) => k.id === selectedId) ?? book.kapitel[0] ?? null;
  const [pending, setPending] = useState(false);
  const [waitKind, setWaitKind] = useState<WaitKind>(null);
  const [checkpointReply, setCheckpointReply] = useState("");
  const [readerKnowledge, setReaderKnowledge] = useState(
    selected?.contextGraph.readerKnowledge ?? "",
  );
  const [terms, setTerms] = useState(
    selected?.contextGraph.establishedTerms.join(", ") ?? "",
  );
  const [claims, setClaims] = useState(
    selected?.contextGraph.claimsToProve.join("\n") ?? "",
  );
  const [finalTextDraft, setFinalTextDraft] = useState(
    selected?.finalText ?? "",
  );
  const [abschnittDraft, setAbschnittDraft] = useState("");
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);
  const [focusedAbschnittId, setFocusedAbschnittId] = useState<string | null>(
    null,
  );
  const [deleteAbschnittId, setDeleteAbschnittId] = useState<string | null>(
    null,
  );
  const [clearGraphOpen, setClearGraphOpen] = useState(false);
  const [revisionView, setRevisionView] = useState<{
    abschnittLabel: string;
    revision: SachbuchAbschnittRevision;
  } | null>(null);
  const lastAutoFocusedCheckpointRef = useRef<string | null>(null);
  const ergebnisTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const graphReaderRef = useRef<HTMLTextAreaElement | null>(null);
  const graphTermsRef = useRef<HTMLTextAreaElement | null>(null);
  const graphClaimsRef = useRef<HTMLTextAreaElement | null>(null);
  const [graphOpen, setGraphOpen] = useState(() => {
    const g = selected?.contextGraph;
    if (!g) return true;
    return !(
      g.claimsToProve.length > 0 ||
      g.readerKnowledge.trim() ||
      g.establishedTerms.length > 0
    );
  });

  useLayoutEffect(() => {
    lastAutoFocusedCheckpointRef.current = null;
  }, [selected?.id]);

  const selectedSyncKey = selected
    ? [
        selected.id,
        selected.finalText ?? "",
        selected.contextGraph.readerKnowledge,
        selected.contextGraph.establishedTerms.join("\0"),
        selected.contextGraph.claimsToProve.join("\0"),
      ].join("\n")
    : "";
  const [syncedSelectedKey, setSyncedSelectedKey] = useState(selectedSyncKey);
  if (selectedSyncKey !== syncedSelectedKey) {
    const prevSelectedId = syncedSelectedKey.split("\n")[0] ?? "";
    setSyncedSelectedKey(selectedSyncKey);
    if ((selected?.id ?? "") !== prevSelectedId) {
      setCheckpointReply("");
      setFocusedAbschnittId(null);
    }
    if (selected) {
      setReaderKnowledge(selected.contextGraph.readerKnowledge);
      setTerms(selected.contextGraph.establishedTerms.join(", "));
      setClaims(selected.contextGraph.claimsToProve.join("\n"));
      setFinalTextDraft(selected.finalText ?? "");
      const g = selected.contextGraph;
      const hasContent =
        g.claimsToProve.length > 0 ||
        Boolean(g.readerKnowledge.trim()) ||
        g.establishedTerms.length > 0;
      setGraphOpen(!hasContent);
    } else {
      setGraphOpen(true);
    }
  }

  const openCheckpoint = selected?.abschnitte.find(
    (a) => a.status === "checkpoint",
  );
  /** Explicit selection only — null means all Abschnitte collapsed. */
  const currentAbschnitt =
    focusedAbschnittId &&
    selected?.abschnitte.some((a) => a.id === focusedAbschnittId)
      ? (selected.abschnitte.find((a) => a.id === focusedAbschnittId) ?? null)
      : null;

  const abschnittSyncKey = `${currentAbschnitt?.id ?? ""}\0${currentAbschnitt?.draftText ?? ""}`;
  const [syncedAbschnittKey, setSyncedAbschnittKey] =
    useState(abschnittSyncKey);
  if (abschnittSyncKey !== syncedAbschnittKey) {
    setSyncedAbschnittKey(abschnittSyncKey);
    setAbschnittDraft(currentAbschnitt?.draftText ?? "");
  }

  useEffect(() => {
    if (!chapterPanelOpen) return;
    return lockBodyScroll();
  }, [chapterPanelOpen]);

  useEffect(() => {
    if (!chapterPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChapterPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapterPanelOpen]);

  const doneAbschnitte =
    selected?.abschnitte.filter(
      (a) => a.status === "accepted" || a.status === "revised",
    ).length ?? 0;
  const minAbschnitte = recommendedMinAbschnitte(
    selected?.contextGraph.claimsToProve.length ?? 0,
  );
  const selectedKapitelWords = selected
    ? countKapitelAbschnitteWords(selected.abschnitte)
    : 0;
  const bookWords = book.kapitel.reduce(
    (sum, k) => sum + countKapitelAbschnitteWords(k.abschnitte),
    0,
  );
  const ergebnisWords = countSachbuchWords(abschnittDraft);

  /** Auto-open only when a *new* checkpoint is created — never force-reopen after user collapse. */
  useEffect(() => {
    if (!openCheckpoint) return;
    if (lastAutoFocusedCheckpointRef.current === openCheckpoint.id) return;
    const checkpointId = openCheckpoint.id;
    queueMicrotask(() => {
      lastAutoFocusedCheckpointRef.current = checkpointId;
      setFocusedAbschnittId(checkpointId);
    });
  }, [openCheckpoint]);

  /** Grow Ergebnis textarea so the full section is visible without inner scroll. */
  useEffect(() => {
    const el = ergebnisTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
  }, [abschnittDraft, currentAbschnitt?.id]);

  /** Context-Graph fields: always show full content, no inner scroll. */
  useEffect(() => {
    if (!graphOpen) return;
    for (const el of [
      graphReaderRef.current,
      graphTermsRef.current,
      graphClaimsRef.current,
    ]) {
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 48)}px`;
    }
  }, [graphOpen, readerKnowledge, terms, claims]);

  if (!book.makro.kapitelGenerated || book.kapitel.length === 0) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
        Zuerst in Phase 3 die Journey erzeugen und „Kapitel aus Journey
        erzeugen“ klicken.
      </p>
    );
  }

  async function saveGraph() {
    if (!canSave || pending || !selected) return;
    setPending(true);
    const nextKapitel = book.kapitel.map((k) =>
      k.id === selected.id
        ? {
            ...k,
            contextGraph: {
              ...k.contextGraph,
              readerKnowledge,
              establishedTerms: terms
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              claimsToProve: claims
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean),
            },
            status: "graph" as const,
            updatedAt: new Date().toISOString(),
          }
        : k,
    );
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: nextKapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onBookUpdate(result.data!.book);
    setGraphOpen(false);
    toast.success("Context Graph gespeichert.");
  }

  async function confirmClearGraph() {
    if (!canSave || pending || !selected) return;
    setPending(true);
    const nextKapitel = book.kapitel.map((k) =>
      k.id === selected.id
        ? {
            ...k,
            contextGraph: emptyContextGraph(),
            updatedAt: new Date().toISOString(),
          }
        : k,
    );
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: nextKapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setClearGraphOpen(false);
    setReaderKnowledge("");
    setTerms("");
    setClaims("");
    setGraphOpen(true);
    onBookUpdate(result.data!.book);
    toast.success("Context Graph gelöscht.");
  }

  const deleteTarget = deleteAbschnittId
    ? (selected?.abschnitte.find((a) => a.id === deleteAbschnittId) ?? null)
    : null;

  async function confirmDeleteAbschnitt() {
    if (!canSave || pending || !selected || !deleteTarget) return;
    setPending(true);
    const abschnitte = selected.abschnitte
      .filter((a) => a.id !== deleteTarget.id)
      .map((a, index) => ({ ...a, order: index }));
    const nextKapitel = book.kapitel.map((k) =>
      k.id === selected.id
        ? {
            ...k,
            abschnitte,
            finalText: concatAbschnitteText(abschnitte),
            updatedAt: new Date().toISOString(),
          }
        : k,
    );
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: nextKapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    if (focusedAbschnittId === deleteTarget.id) {
      setFocusedAbschnittId(null);
    }
    if (lastAutoFocusedCheckpointRef.current === deleteTarget.id) {
      lastAutoFocusedCheckpointRef.current = null;
    }
    setCheckpointReply("");
    setDeleteAbschnittId(null);
    onBookUpdate(result.data!.book);
    toast.success(`Abschnitt ${deleteTarget.order + 1} gelöscht.`);
  }

  async function saveCurrentAbschnitt() {
    if (!canSave || pending || !selected || !currentAbschnitt) return;
    setPending(true);
    const abschnitte = selected.abschnitte.map((a) =>
      a.id === currentAbschnitt.id ? { ...a, draftText: abschnittDraft } : a,
    );
    const nextKapitel = book.kapitel.map((k) =>
      k.id === selected.id
        ? {
            ...k,
            abschnitte,
            finalText: concatAbschnitteText(abschnitte),
            updatedAt: new Date().toISOString(),
          }
        : k,
    );
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: nextKapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onBookUpdate(result.data!.book);
    toast.success(`Abschnitt ${currentAbschnitt.order + 1} gespeichert.`);
  }

  async function saveChapterText() {
    if (!canSave || pending || !selected) return;
    setPending(true);
    const nextKapitel = book.kapitel.map((k) =>
      k.id === selected.id
        ? {
            ...k,
            finalText: finalTextDraft,
            updatedAt: new Date().toISOString(),
          }
        : k,
    );
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: book.makro,
      kapitel: nextKapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onBookUpdate(result.data!.book);
    toast.success("Gesamtkapitel gespeichert.");
  }

  async function genGraph() {
    if (!canSave || pending || !selected) return;
    setPending(true);
    setWaitKind("graph");
    try {
      const result = await generateSachbuchContextGraphAction({
        sachbuchId: book.id,
        kapitelId: selected.id,
      });
      if (!result.success) {
        toast.error(result.error ?? "Graph erzeugen fehlgeschlagen.");
        return;
      }
    onBookUpdate(result.data!.book);
    setGraphOpen(false);
    toast.success("Context Graph erzeugt.");
  } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function nextAbschnitt() {
    if (!canSave || pending || !selected) return;
    if (selected.contextGraph.claimsToProve.length === 0) {
      toast.message("Hinweis: Context Graph hat noch keine Claims.");
    }
    setPending(true);
    setWaitKind("abschnitt");
    try {
      const result = await generateNextAbschnittAction({
        sachbuchId: book.id,
        kapitelId: selected.id,
      });
      if (!result.success) {
        toast.error(result.error ?? "Abschnitt erzeugen fehlgeschlagen.");
        return;
      }
      const nextBook = result.data!.book;
      onBookUpdate(nextBook);
      const kapitel =
        nextBook.kapitel.find((k) => k.id === selected.id) ?? null;
      const newest = kapitel?.abschnitte[kapitel.abschnitte.length - 1];
      if (newest) setFocusedAbschnittId(newest.id);
      toast.success("Abschnitt fertig (Checkpoint + Critic + Style).");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function replyCheckpoint() {
    if (!canSave || pending || !selected || !openCheckpoint) return;
    if (!checkpointReply.trim()) {
      toast.error("Antwort zum Checkpoint eingeben.");
      return;
    }
    setPending(true);
    setWaitKind("revise");
    try {
      const result = await replyAbschnittCheckpointAction({
        sachbuchId: book.id,
        kapitelId: selected.id,
        abschnittId: openCheckpoint.id,
        reply: checkpointReply,
        revise: true,
      });
      if (!result.success) {
        toast.error(result.error ?? "Checkpoint fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      setCheckpointReply("");
      toast.success("Abschnitt überarbeitet.");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-zinc-600">
        Phase 4–5: Context Graph + Abschnitte (
        {SACHBUCH_ABSCHNITT_WORDS_MIN}–{SACHBUCH_ABSCHNITT_WORDS_MAX} Wörter).
        Zielvolumen: ca.{" "}
        {SACHBUCH_KAPITEL_WORDS_TARGET.toLocaleString("de-DE")} Wörter/Kapitel,
        ca. {SACHBUCH_BOOK_WORDS_TARGET.toLocaleString("de-DE")} Wörter/Buch.
        Pro Abschnitt automatisch: Checkpoint (Recherche) → Critic → Style.
      </p>

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="space-y-2">
          <p className="rounded-2xl bg-zinc-100 px-3 py-2 text-[10px] font-extrabold tracking-wide text-zinc-600 uppercase">
            Buch · {bookWords.toLocaleString("de-DE")} /{" "}
            {SACHBUCH_BOOK_WORDS_TARGET.toLocaleString("de-DE")} Wörter
          </p>
          <ul className="space-y-2">
            {book.kapitel.map((k) => {
              const kapWords = countKapitelAbschnitteWords(k.abschnitte);
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(k.id)}
                    className={cn(
                      "w-full rounded-2xl px-3 py-2.5 text-left text-sm font-bold",
                      selected?.id === k.id
                        ? "bg-zinc-900 text-white"
                        : "bg-white text-zinc-800 ring-1 ring-zinc-950/10",
                    )}
                  >
                    <span className="line-clamp-2">{k.title}</span>
                    <span className="mt-1 block text-[10px] font-extrabold uppercase opacity-70">
                      {k.abschnitte.length} Abschnitte
                      {kapWords > 0
                        ? ` · ${kapWords.toLocaleString("de-DE")} Wörter`
                        : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {selected ? (
          <div className="space-y-5 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">
                {selected.title}
              </h3>
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                Kapitel · {selectedKapitelWords.toLocaleString("de-DE")} /{" "}
                {SACHBUCH_KAPITEL_WORDS_TARGET.toLocaleString("de-DE")} Wörter
                {" · "}
                Buch · {bookWords.toLocaleString("de-DE")} /{" "}
                {SACHBUCH_BOOK_WORDS_TARGET.toLocaleString("de-DE")} Wörter
              </p>
            </div>

            <section className="space-y-3">
              <details
                open={graphOpen}
                onToggle={(e) => setGraphOpen(e.currentTarget.open)}
                className="group"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <h4 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Phase 4 — Context Graph
                    {selected.contextGraph.claimsToProve.length > 0 ? (
                      <span className="ml-1.5 font-semibold normal-case text-zinc-400">
                        · {selected.contextGraph.claimsToProve.length} Claims
                      </span>
                    ) : null}
                  </h4>
                  <span className="shrink-0 text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                    {graphOpen ? "Zuklappen" : "Aufklappen"}
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canSave || pending}
                      onClick={() => void genGraph()}
                      className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Graph erzeugen
                    </button>
                    <button
                      type="button"
                      disabled={!canSave || pending}
                      onClick={() => void saveGraph()}
                      className="rounded-full bg-white px-4 py-2 text-xs font-bold ring-1 ring-zinc-950/10 disabled:opacity-50"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canSave ||
                        pending ||
                        !(
                          selected.contextGraph.claimsToProve.length > 0 ||
                          selected.contextGraph.readerKnowledge.trim() ||
                          selected.contextGraph.establishedTerms.length > 0
                        )
                      }
                      onClick={() => setClearGraphOpen(true)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-bold text-orange-800 ring-1 ring-orange-200 disabled:opacity-50"
                    >
                      Graph löschen
                    </button>
                  </div>
                  <textarea
                    ref={graphReaderRef}
                    value={readerKnowledge}
                    disabled={!canSave || pending}
                    onChange={(e) => setReaderKnowledge(e.target.value)}
                    rows={1}
                    placeholder="Leser-Wissensstand"
                    className="w-full resize-none overflow-hidden rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                  />
                  <textarea
                    ref={graphTermsRef}
                    value={terms}
                    disabled={!canSave || pending}
                    onChange={(e) => setTerms(e.target.value)}
                    rows={1}
                    placeholder="Etablierte Begriffe (Komma)"
                    className="w-full resize-none overflow-hidden rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                  />
                  <textarea
                    ref={graphClaimsRef}
                    value={claims}
                    disabled={!canSave || pending}
                    onChange={(e) => setClaims(e.target.value)}
                    rows={1}
                    placeholder="Claims (eine Zeile = eine Behauptung)"
                    className="w-full resize-none overflow-hidden rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                  />
                </div>
              </details>
            </section>

            <section className="space-y-3 border-t border-zinc-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Phase 5 — Abschnitte
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {doneAbschnitte >= minAbschnitte &&
                    selectedKapitelWords >= SACHBUCH_KAPITEL_WORDS_TARGET
                      ? `Volumen-Empfehlung erreicht (${doneAbschnitte} Abschnitte, ${selectedKapitelWords.toLocaleString("de-DE")} Wörter) — weitere Abschnitte jederzeit möglich.`
                      : `Empfehlung: mind. ${minAbschnitte} Abschnitte à ${SACHBUCH_ABSCHNITT_WORDS_MIN}–${SACHBUCH_ABSCHNITT_WORDS_MAX} Wörter (Ø ~${SACHBUCH_ABSCHNITT_WORDS_TARGET}) → ca. ${SACHBUCH_KAPITEL_WORDS_TARGET.toLocaleString("de-DE")} Wörter/Kapitel. Aktuell ${doneAbschnitte}/${minAbschnitte} Abschnitte · ${selectedKapitelWords.toLocaleString("de-DE")} Wörter. Kein Maximum.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={selected.abschnitte.length === 0}
                    onClick={() => {
                      if (!selected.finalText.trim()) {
                        setFinalTextDraft(
                          concatAbschnitteText(selected.abschnitte),
                        );
                      }
                      setChapterPanelOpen(true);
                    }}
                    className="rounded-full bg-white px-4 py-2 text-xs font-bold ring-1 ring-zinc-950/10 disabled:opacity-50"
                  >
                    Gesamtkapitel anzeigen
                  </button>
                  {focusedAbschnittId ? (
                    <button
                      type="button"
                      onClick={() => setFocusedAbschnittId(null)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-bold ring-1 ring-zinc-950/10"
                    >
                      Alle zuklappen
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canSave || pending || Boolean(openCheckpoint)}
                    onClick={() => void nextAbschnitt()}
                    className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Nächsten Abschnitt erzeugen
                  </button>
                </div>
              </div>

              {selected.abschnitte.map((a) => {
                const isFocused = currentAbschnitt?.id === a.id;
                const wordCount = countSachbuchWords(a.draftText);
                const header = (
                  <p className="text-[10px] font-extrabold uppercase text-zinc-500">
                    Abschnitt {a.order + 1} · {a.status}
                    <span className="ml-1.5 font-semibold normal-case text-zinc-400">
                      · {wordCount.toLocaleString("de-DE")} Wörter
                    </span>
                    {isFocused ? (
                      <span className="ml-1.5 font-semibold normal-case text-emerald-700">
                        · in Ergebnis
                      </span>
                    ) : null}
                  </p>
                );

                return (
                  <details
                    key={a.id}
                    open={isFocused}
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm font-semibold",
                      a.status === "checkpoint"
                        ? "bg-amber-50 ring-1 ring-amber-200"
                        : "bg-gray-50 ring-1 ring-zinc-950/5",
                    )}
                  >
                    <summary
                      className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                      onClick={(e) => {
                        e.preventDefault();
                        setFocusedAbschnittId(isFocused ? null : a.id);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {header}
                        <div className="flex shrink-0 items-center gap-1">
                          {canSave ? (
                            <button
                              type="button"
                              disabled={pending}
                              title={`Abschnitt ${a.order + 1} löschen`}
                              aria-label={`Abschnitt ${a.order + 1} löschen`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteAbschnittId(a.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide text-orange-800 uppercase hover:bg-orange-50 disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              Löschen
                            </button>
                          ) : null}
                          <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                            {isFocused ? "Zuklappen" : "Aufklappen"}
                          </span>
                        </div>
                      </div>
                        {a.revisions?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.revisions.map((rev) => (
                            <button
                              key={rev.id}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setRevisionView({
                                  abschnittLabel: `Abschnitt ${a.order + 1}`,
                                  revision: rev,
                                });
                              }}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase",
                                rev.kind === "checkpoint"
                                  ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300/80"
                                  : rev.kind === "critic"
                                    ? "bg-orange-100 text-orange-950 ring-1 ring-orange-300/80"
                                    : "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300/80",
                              )}
                            >
                              {rev.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </summary>
                    {isFocused && a.status === "checkpoint" ? (
                      <div className="mt-2 space-y-2 border-t border-zinc-200/80 pt-2 text-zinc-800">
                        <p className="text-xs font-semibold text-amber-900">
                          Legacy-Checkpoint — bitte manuell überarbeiten.
                        </p>
                        <textarea
                          value={checkpointReply}
                          disabled={!canSave || pending}
                          onChange={(e) => setCheckpointReply(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          rows={3}
                          placeholder="Anweisung an die KI … z. B. Beispiel nennen oder „keine Ahnung, such im Internet“"
                          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                        />
                        <button
                          type="button"
                          disabled={!canSave || pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            void replyCheckpoint();
                          }}
                          className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Überarbeiten
                        </button>
                      </div>
                    ) : null}
                  </details>
                );
              })}
            </section>

            <section className="space-y-3 border-t border-zinc-100 pt-4">
              {currentAbschnitt ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-extrabold tracking-wide text-emerald-800 uppercase">
                        Ergebnis / Output
                      </p>
                      <h5 className="text-sm font-extrabold text-zinc-950">
                        Abschnitt {currentAbschnitt.order + 1}
                        <span className="ml-2 text-xs font-semibold text-zinc-500">
                          · {ergebnisWords.toLocaleString("de-DE")} Wörter
                        </span>
                      </h5>
                      <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                        Text des gewählten Abschnitts — Aufklappen oben wechselt
                        den Fokus.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={
                        !canSave ||
                        pending ||
                        !abschnittDraft.trim() ||
                        abschnittDraft === currentAbschnitt.draftText
                      }
                      onClick={() => void saveCurrentAbschnitt()}
                      className="rounded-full bg-white px-4 py-2 text-xs font-bold ring-1 ring-zinc-950/10 disabled:opacity-50"
                    >
                      Abschnitt speichern
                    </button>
                  </div>
                  <textarea
                    ref={ergebnisTextareaRef}
                    value={abschnittDraft}
                    disabled={!canSave || pending}
                    onChange={(e) => setAbschnittDraft(e.target.value)}
                    rows={3}
                    aria-label={`Abschnitt ${currentAbschnitt.order + 1}`}
                    className="w-full overflow-hidden rounded-2xl bg-emerald-50/50 px-4 py-3 text-sm font-semibold leading-relaxed text-zinc-950 outline-none ring-1 ring-emerald-200/80 focus:bg-white focus:ring-2 focus:ring-emerald-700 disabled:opacity-60"
                  />
                </div>
              ) : (
                <p className="text-xs font-semibold text-zinc-400">
                  {selected.abschnitte.length === 0
                    ? "Noch kein Abschnitt — zuerst erzeugen."
                    : "Kein Abschnitt aufgeklappt — oben einen wählen."}
                </p>
              )}
            </section>
          </div>
        ) : null}
      </div>

      {chapterPanelOpen && selected
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex justify-end bg-zinc-950/40"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sachbuch-chapter-panel-title"
              onClick={() => setChapterPanelOpen(false)}
            >
              <div
                className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl ring-1 ring-zinc-950/10 sm:max-w-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                      Gesamtkapitel
                    </p>
                    <h2
                      id="sachbuch-chapter-panel-title"
                      className="text-base font-extrabold text-zinc-950"
                    >
                      {selected.title}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">
                      {countSachbuchWords(finalTextDraft).toLocaleString(
                        "de-DE",
                      )}{" "}
                      Wörter
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChapterPanelOpen(false)}
                    className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    aria-label="Panel schließen"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-hidden p-5">
                  <textarea
                    value={finalTextDraft}
                    disabled={!canSave || pending}
                    onChange={(e) => setFinalTextDraft(e.target.value)}
                    className="min-h-0 flex-1 resize-none rounded-2xl bg-gray-50 px-4 py-3 text-sm font-semibold leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={
                      !canSave ||
                      pending ||
                      !finalTextDraft.trim() ||
                      finalTextDraft === (selected.finalText ?? "")
                    }
                    onClick={() => void saveChapterText()}
                    className="self-end rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Gesamtkapitel speichern
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <SachbuchAbschnittRevisionDialog
        revision={revisionView?.revision ?? null}
        abschnittLabel={revisionView?.abschnittLabel ?? ""}
        onClose={() => setRevisionView(null)}
      />

      <ConfirmDeleteDialog
        open={clearGraphOpen}
        title="Context Graph löschen?"
        description={
          selected
            ? `Für „${selected.title}“ werden Leserwissen, Begriffe und alle ${selected.contextGraph.claimsToProve.length} Claims gelöscht. Abschnitte bleiben erhalten — du kannst den Graph neu erzeugen.`
            : ""
        }
        confirmLabel="Graph löschen"
        pending={pending}
        onCancel={() => {
          if (!pending) setClearGraphOpen(false);
        }}
        onConfirm={() => void confirmClearGraph()}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget
            ? `Abschnitt ${deleteTarget.order + 1} löschen?`
            : "Abschnitt löschen?"
        }
        description={
          deleteTarget
            ? `Abschnitt ${deleteTarget.order + 1} (${deleteTarget.status}) wird unwiderruflich entfernt. Die übrigen Abschnitte werden neu nummeriert, der zusammengesetzte Kapiteltext wird aktualisiert.`
            : ""
        }
        confirmLabel="Löschen"
        pending={pending}
        onCancel={() => {
          if (!pending) setDeleteAbschnittId(null);
        }}
        onConfirm={() => void confirmDeleteAbschnitt()}
      />

      <SachbuchWaitDialog
        open={waitKind === "graph"}
        title="Context Graph wird erzeugt"
        steps={SACHBUCH_WAIT_GRAPH}
        agentInfo={sachbuchWaitAgent(book.agents, "architect")}
      />
      <SachbuchWaitDialog
        open={waitKind === "abschnitt"}
        title="Abschnitt wird erzeugt & verbessert"
        steps={SACHBUCH_WAIT_ABSCHNITT}
        agentInfo={sachbuchWaitAgent(book.agents, "writer")}
      />
      <SachbuchWaitDialog
        open={waitKind === "revise"}
        title="Abschnitt wird überarbeitet"
        steps={SACHBUCH_WAIT_CHECKPOINT_REVISE}
        agentInfo={sachbuchWaitAgent(book.agents, "writer")}
      />
    </div>
  );
}
