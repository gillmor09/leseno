"use client";

/**
 * Phase 3 — Makro stages for the book's Buchart (set in Grundlagen).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import {
  applyMakroToKapitelAction,
  generateSachbuchMakroAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { emptySachbuchMakro } from "@/lib/sachbuch/parse";
import type { SachbuchKontext, SachbuchMakroStage } from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_STAGE_LABELS,
  SACHBUCH_MAKRO_TYP_LABELS,
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
  const [stages, setStages] = useState(book.makro.stages);
  const [pending, setPending] = useState(false);
  const [waitKind, setWaitKind] = useState<"makro" | "kapitel" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const uvpReady =
    Boolean(book.idee.unpopularOpinion.trim()) ||
    Boolean(book.idee.briefing.trim());
  const hasMakroContent =
    book.makro.status !== "empty" ||
    book.makro.stages.some(
      (s) => s.promise.trim() || s.notes.trim() || s.title.trim(),
    ) ||
    book.kapitel.length > 0;

  useEffect(() => {
    setStages(book.makro.stages);
  }, [book.id, book.updatedAt]);

  function patchStage(key: string, patch: Partial<SachbuchMakroStage>) {
    setStages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
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
      onBookUpdate(result.data!.book);
      setStages(result.data!.book.makro.stages);
      toast.success(`${SACHBUCH_MAKRO_TYP_LABELS[typ]}-Makro erzeugt.`);
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function saveStages() {
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
        stages,
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
        makro: { ...book.makro, stages },
        kapitel: book.kapitel,
      });
      const result = await applyMakroToKapitelAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "Kapitel erzeugen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      toast.success("Kapitelgerüst aus Makro angelegt.");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function confirmClearMakro() {
    if (!canSave || pending) return;
    setPending(true);
    const makro = emptySachbuchMakro(typ);
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
    setStages(makro.stages);
    onBookUpdate(result.data!.book);
    toast.success("Makro und Kapitel gelöscht.");
  }

  const generateLabel = `${SACHBUCH_MAKRO_TYP_LABELS[typ]} erzeugen`;

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
          disabled={!canSave || pending}
          onClick={() => void saveStages()}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 disabled:opacity-50"
        >
          Stages speichern
        </button>
        <button
          type="button"
          disabled={!canSave || pending || book.makro.status === "empty"}
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

      <div className="space-y-4">
        {stages.map((stage) => (
          <section
            key={stage.key}
            className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10"
          >
            <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
              {SACHBUCH_MAKRO_STAGE_LABELS[stage.key]}
            </p>
            <input
              value={stage.title}
              disabled={!canSave || pending}
              onChange={(e) => patchStage(stage.key, { title: e.target.value })}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-extrabold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
            <textarea
              value={stage.promise}
              disabled={!canSave || pending}
              onChange={(e) =>
                patchStage(stage.key, { promise: e.target.value })
              }
              rows={2}
              placeholder={
                typ === "journey"
                  ? "Leserversprechen / Transformation"
                  : typ === "erzaehlung"
                    ? "Was der Leser hier miterlebt / mitnimmt"
                    : "Was der Leser hier versteht / mitnimmt"
              }
              className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
            <textarea
              value={stage.notes}
              disabled={!canSave || pending}
              onChange={(e) => patchStage(stage.key, { notes: e.target.value })}
              rows={3}
              placeholder="Notizen / Argumentkerne"
              className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
          </section>
        ))}
      </div>

      {book.makro.kapitelGenerated ? (
        <p className="text-sm font-semibold text-emerald-800">
          Kapitelgerüst vorhanden ({book.kapitel.length} Kapitel) — weiter zu
          Schreiben.
        </p>
      ) : null}

      <ConfirmDeleteDialog
        open={deleteOpen}
        title="Makro löschen?"
        description={`Stages werden zurückgesetzt. ${book.kapitel.length > 0 ? `Zusätzlich werden alle ${book.kapitel.length} Kapitel inkl. Context Graph und Abschnitte unwiderruflich gelöscht.` : "Noch keine Kapitel vorhanden."} Evidenz und Idee bleiben erhalten.`}
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
        agentInfo={sachbuchWaitAgent(book.agents, "architect")}
      />
      <SachbuchWaitDialog
        open={waitKind === "kapitel"}
        title="Kapitelgerüst wird angelegt"
        steps={SACHBUCH_WAIT_KAPITEL_FROM_MAKRO}
        agentInfo={sachbuchWaitAgent(book.agents, "architect")}
      />
    </div>
  );
}
