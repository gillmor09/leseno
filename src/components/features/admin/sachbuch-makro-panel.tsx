"use client";

/**
 * Phase 3 — Flexible Makro: Buchteile mit Kapiteln (idea-fit).
 */

import { useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import {
  applyMakroToKapitelAction,
  generateSachbuchMakroAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { emptySachbuchMakro } from "@/lib/sachbuch/parse";
import type {
  SachbuchKontext,
  SachbuchMakroPart,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_TYP_LABELS,
  flattenMakroChapterPlans,
  makroPlannedKapitelCount,
  makroStagePathLabel,
} from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_KAPITEL_FROM_MAKRO,
  SACHBUCH_WAIT_MAKRO,
  sachbuchWaitAgent,
} from "@/lib/sachbuch/wait-presets";

export function SachbuchMakroPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const typ = book.makro.typ ?? "journey";
  const [parts, setParts] = useState<SachbuchMakroPart[]>(
    book.makro.parts ?? [],
  );
  const [pending, setPending] = useState(false);
  const [waitKind, setWaitKind] = useState<"makro" | "kapitel" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const uvpReady =
    Boolean(book.idee.unpopularOpinion.trim()) ||
    Boolean(book.idee.briefing.trim());
  const plannedCount = makroPlannedKapitelCount({
    ...book.makro,
    parts,
  });
  const hasMakroContent =
    book.makro.status !== "empty" ||
    parts.some((p) => p.chapters.length > 0) ||
    book.makro.stages.some(
      (s) => s.promise.trim() || s.notes.trim() || s.title.trim(),
    ) ||
    book.kapitel.length > 0;

  const makroSyncKey = `${book.id}\0${book.updatedAt}`;
  const [syncedMakroKey, setSyncedMakroKey] = useState(makroSyncKey);
  if (makroSyncKey !== syncedMakroKey) {
    setSyncedMakroKey(makroSyncKey);
    setParts(book.makro.parts ?? []);
  }

  function patchPart(partId: string, patch: Partial<SachbuchMakroPart>) {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
    );
  }

  function patchChapter(
    partId: string,
    chapterId: string,
    patch: Partial<SachbuchMakroPart["chapters"][number]>,
  ) {
    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== partId) return p;
        return {
          ...p,
          chapters: p.chapters.map((c) =>
            c.id === chapterId ? { ...c, ...patch } : c,
          ),
        };
      }),
    );
  }

  async function generate() {
    if (!canSave || pending) return;
    if (!uvpReady) {
      toast.error("Zuerst Idee/UVP in Phase 1 schärfen.");
      return;
    }
    setPending(true);
    setWaitKind("makro");
    try {
      const result = await generateSachbuchMakroAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "Makro erzeugen fehlgeschlagen.");
        return;
      }
      const next = result.data!.book;
      onBookUpdate(next);
      setParts(next.makro.parts ?? []);
      const n = makroPlannedKapitelCount(next.makro);
      toast.success(
        `Makro erzeugt: ${next.makro.parts.length} Teile, ${n} Kapitel.`,
      );
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function saveParts() {
    if (!canSave || pending) return;
    setPending(true);
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: {
        ...book.makro,
        parts,
        status:
          book.makro.status === "empty" ? "in_progress" : book.makro.status,
      },
      kapitel: book.kapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    onBookUpdate(result.data!.book);
    toast.success("Makro gespeichert.");
  }

  async function applyKapitel() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("kapitel");
    try {
      await saveSachbuchAction({
        id: book.id,
        title: book.title,
        stilbibel: book.stilbibel,
        zielgruppe: book.zielgruppe,
        agents: book.agents,
        idee: book.idee,
        evidenz: book.evidenz,
        makro: { ...book.makro, parts },
        kapitel: book.kapitel,
      });
      const result = await applyMakroToKapitelAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "Kapitel erzeugen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      toast.success(
        `Kapitelgerüst angelegt (${result.data!.book.kapitel.length} Kapitel).`,
      );
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function confirmClearMakro() {
    if (!canSave || pending) return;
    setPending(true);
    const makro = emptySachbuchMakro(typ, book.makro.bookTypeId);
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro,
      kapitel: [],
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setDeleteOpen(false);
    setParts([]);
    onBookUpdate(result.data!.book);
    toast.success("Makro und Kapitel gelöscht.");
  }

  const generateLabel = `${SACHBUCH_MAKRO_TYP_LABELS[typ]} erzeugen`;
  const showLegacyStages =
    parts.length === 0 &&
    book.makro.stages.some(
      (s) => s.promise.trim() || s.notes.trim() || s.title.trim(),
    );

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-zinc-600">
        Phase 3 · Buchart {SACHBUCH_MAKRO_TYP_LABELS[typ]}:{" "}
        {makroStagePathLabel(typ)}. Buchart in Grundlagen ändern.
      </p>
      {!uvpReady ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          UVP/Kernaussage aus Phase 1 fehlt noch.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave || pending || !uvpReady}
          onClick={() => void generate()}
          className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {generateLabel}
        </button>
        <button
          type="button"
          disabled={!canSave || pending || parts.length === 0}
          onClick={() => void saveParts()}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 disabled:opacity-50"
        >
          Teile speichern
        </button>
        <button
          type="button"
          disabled={
            !canSave ||
            pending ||
            book.makro.status === "empty" ||
            plannedCount === 0
          }
          onClick={() => void applyKapitel()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Kapitel aus Makro erzeugen
        </button>
        <button
          type="button"
          disabled={!canSave || pending || !hasMakroContent}
          onClick={() => setDeleteOpen(true)}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-orange-800 ring-1 ring-orange-200 disabled:opacity-50"
        >
          Makro löschen
        </button>
      </div>

      {parts.length > 0 ? (
        <div className="space-y-5">
          {parts.map((part, partIndex) => (
            <section
              key={part.id}
              className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10"
            >
              <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Buchteil {partIndex + 1}
              </p>
              <input
                value={part.title}
                disabled={!canSave || pending}
                onChange={(e) =>
                  patchPart(part.id, { title: e.target.value })
                }
                className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-extrabold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
              <textarea
                value={part.promise}
                disabled={!canSave || pending}
                onChange={(e) =>
                  patchPart(part.id, { promise: e.target.value })
                }
                rows={2}
                placeholder="Was dieser Teil für den Leser leistet"
                className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
              <div className="space-y-3 border-t border-zinc-100 pt-3">
                {part.chapters.map((ch, chIndex) => (
                  <div
                    key={ch.id}
                    className="space-y-2 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5"
                  >
                    <p className="text-[10px] font-extrabold tracking-wide text-zinc-400 uppercase">
                      Kapitel {chIndex + 1}
                    </p>
                    <input
                      value={ch.title}
                      disabled={!canSave || pending}
                      onChange={(e) =>
                        patchChapter(part.id, ch.id, {
                          title: e.target.value,
                        })
                      }
                      className="w-full rounded-xl bg-white px-3 py-2 text-sm font-extrabold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                    />
                    <textarea
                      value={ch.promise}
                      disabled={!canSave || pending}
                      onChange={(e) =>
                        patchChapter(part.id, ch.id, {
                          promise: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Leserversprechen dieses Kapitels"
                      className="w-full resize-y rounded-xl bg-white px-3 py-2 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                    />
                    <textarea
                      value={ch.notes}
                      disabled={!canSave || pending}
                      onChange={(e) =>
                        patchChapter(part.id, ch.id, {
                          notes: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Notizen / Argumentkerne"
                      className="w-full resize-y rounded-xl bg-white px-3 py-2 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : showLegacyStages ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Altes 5-Stage-Makro vorhanden. Bitte „{generateLabel}“ für flexible
          Buchteile neu erzeugen ({flattenMakroChapterPlans(book.makro).length}{" "}
          Legacy-Stages als Fallback).
        </p>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-950/5">
          Noch keine Buchteile. Makro erzeugen — Struktur folgt der Idee (nicht
          starr 5 Kapitel).
        </p>
      )}

      {book.makro.kapitelGenerated ? (
        <p className="text-sm font-semibold text-emerald-800">
          Kapitelgerüst vorhanden ({book.kapitel.length} Kapitel
          {plannedCount > 0 ? `, Plan: ${plannedCount}` : ""}) — weiter zu
          Schreiben.
        </p>
      ) : plannedCount > 0 ? (
        <p className="text-sm font-semibold text-zinc-600">
          Plan: {parts.length} Teile · {plannedCount} Kapitel — noch nicht als
          Kapitelgerüst erzeugt.
        </p>
      ) : null}

      <ConfirmDeleteDialog
        open={deleteOpen}
        title="Makro löschen?"
        description={`Buchteile/Stages werden zurückgesetzt. ${book.kapitel.length > 0 ? `Zusätzlich werden alle ${book.kapitel.length} Kapitel inkl. Context Graph und Abschnitte unwiderruflich gelöscht.` : "Noch keine Kapitel vorhanden."} Evidenz und Idee bleiben erhalten.`}
        confirmLabel="Makro löschen"
        pending={pending}
        onCancel={() => {
          if (!pending) setDeleteOpen(false);
        }}
        onConfirm={() => void confirmClearMakro()}
      />

      <SachbuchWaitDialog
        open={waitKind === "makro"}
        title={`${SACHBUCH_MAKRO_TYP_LABELS[typ]} wird erzeugt`}
        steps={SACHBUCH_WAIT_MAKRO}
        agentInfo={sachbuchWaitAgent("architect")}
      />
      <SachbuchWaitDialog
        open={waitKind === "kapitel"}
        title="Kapitelgerüst wird angelegt"
        steps={SACHBUCH_WAIT_KAPITEL_FROM_MAKRO}
        agentInfo={sachbuchWaitAgent("architect")}
      />
    </div>
  );
}
