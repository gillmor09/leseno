"use client";

/**
 * Phase 2 — Google Search evidence map.
 */

import { useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import { runSachbuchEvidenzAction } from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { emptySachbuchEvidenz } from "@/lib/sachbuch/parse";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_EVIDENZ,
  sachbuchWaitAgent,
} from "@/lib/sachbuch/wait-presets";

type DeleteTarget =
  | { kind: "all" }
  | { kind: "claim"; id: string; label: string }
  | null;

export function SachbuchEvidenzPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const [pending, setPending] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const uvpReady =
    Boolean(book.idee.unpopularOpinion.trim()) ||
    Boolean(book.idee.briefing.trim());
  const hasEvidenz =
    book.evidenz.claims.length > 0 || book.evidenz.queries.length > 0;

  async function runResearch() {
    if (!canSave || pending) return;
    if (!uvpReady) {
      toast.error("Zuerst UVP in Phase 1 schärfen.");
      return;
    }
    setPending(true);
    setWaitOpen(true);
    try {
      const result = await runSachbuchEvidenzAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "Recherche fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      toast.success("Evidenz aktualisiert.");
    } finally {
      setWaitOpen(false);
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!canSave || pending || !deleteTarget) return;
    setPending(true);
    const evidenz =
      deleteTarget.kind === "all"
        ? emptySachbuchEvidenz()
        : {
            ...book.evidenz,
            claims: book.evidenz.claims.filter(
              (c) => c.id !== deleteTarget.id,
            ),
            status:
              book.evidenz.claims.length <= 1 ? "empty" : book.evidenz.status,
          };
    const result = await saveSachbuchAction({
      id: book.id,
      title: book.title,
      stilbibel: book.stilbibel,
      zielgruppe: book.zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz,
      makro: book.makro,
      kapitel: book.kapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setDeleteTarget(null);
    onBookUpdate(result.data!.book);
    toast.success(
      deleteTarget.kind === "all" ? "Evidenz gelöscht." : "Claim entfernt.",
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-zinc-600">
        Phase 2: Evidenz per Google Search (kein RAG). Claims und
        Gegenargumente kannst du danach bereinigen oder komplett neu starten.
      </p>
      {!uvpReady ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          UVP aus Phase 1 fehlt noch.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave || pending || !uvpReady}
          onClick={() => void runResearch()}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending && waitOpen ? "Recherche …" : "Recherche starten"}
        </button>
        <button
          type="button"
          disabled={!canSave || pending || !hasEvidenz}
          onClick={() => setDeleteTarget({ kind: "all" })}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-orange-800 ring-1 ring-orange-200 disabled:opacity-50"
        >
          Evidenz löschen
        </button>
      </div>

      {book.evidenz.queries.length > 0 ? (
        <p className="text-xs font-semibold text-zinc-500">
          Queries: {book.evidenz.queries.join(" · ")}
        </p>
      ) : null}

      {book.evidenz.claims.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
          Noch keine Claims.
        </p>
      ) : (
        <ul className="space-y-3">
          {book.evidenz.claims.map((c) => (
            <li
              key={c.id}
              className="space-y-2 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10"
            >
              <p className="text-sm font-extrabold text-zinc-950">{c.claim}</p>
              {c.evidence ? (
                <p className="text-sm font-semibold text-zinc-700">
                  Evidenz: {c.evidence}
                </p>
              ) : null}
              {c.counter ? (
                <p className="text-sm font-semibold text-orange-900">
                  Gegenargument: {c.counter}
                </p>
              ) : null}
              {c.sources.length > 0 ? (
                <ul className="space-y-1">
                  {c.sources.map((s) => (
                    <li key={s.uri}>
                      <a
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        {s.title || s.uri}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() =>
                  setDeleteTarget({
                    kind: "claim",
                    id: c.id,
                    label: c.claim.slice(0, 80),
                  })
                }
                className="text-xs font-bold text-orange-800 hover:underline disabled:opacity-50"
              >
                Claim entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === "all"
            ? "Evidenz löschen?"
            : "Claim entfernen?"
        }
        description={
          deleteTarget?.kind === "all"
            ? `Alle ${book.evidenz.claims.length} Claims, Queries und Quellen werden gelöscht. Du kannst danach die Recherche neu starten. Makro und Kapitel bleiben unberührt.`
            : deleteTarget?.kind === "claim"
              ? `Der Claim „${deleteTarget.label}${deleteTarget.label.length >= 80 ? "…" : ""}“ wird entfernt.`
              : ""
        }
        confirmLabel={deleteTarget?.kind === "all" ? "Alles löschen" : "Entfernen"}
        pending={pending}
        onCancel={() => {
          if (!pending) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />

      <SachbuchWaitDialog
        open={waitOpen}
        title="Evidenz-Recherche läuft"
        steps={SACHBUCH_WAIT_EVIDENZ}
        agentInfo={sachbuchWaitAgent(book.agents, "researcher")}
      />
    </div>
  );
}
