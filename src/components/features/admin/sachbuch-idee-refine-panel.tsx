"use client";

/**
 * Agentic Idee-Verfeinerung (Gemini 4 Argon ↔ Argon) + HITL Freigabe.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  approveSachbuchIdeeRefineAction,
  rejectSachbuchIdeeRefineAction,
  reopenSachbuchIdeeRefineAction,
  runSachbuchIdeeRefineAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { isSachbuchIdeaApproved } from "@/lib/sachbuch/guide";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import {
  SACHBUCH_IDEE_REFINE_PASS_SCORE,
  SACHBUCH_MODEL_IDEE_DRAFTER,
} from "@/lib/sachbuch/agent-defaults";
import {
  sachbuchModelLabel,
  sachbuchWaitAgentIdeeRefine,
  sachbuchWaitIdeeRefineSteps,
} from "@/lib/sachbuch/wait-presets";
import { cn } from "@/lib/utils";

const IDEE_REFINE_MODEL_LABEL = sachbuchModelLabel(SACHBUCH_MODEL_IDEE_DRAFTER);
const IDEE_REFINE_WAIT_STEPS = sachbuchWaitIdeeRefineSteps();

export function SachbuchIdeeRefinePanel({
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
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const awaiting = book.idee.refineStatus === "awaiting_approval";
  const approved =
    isSachbuchIdeaApproved(book) || book.idee.refineStatus === "approved";
  const hasDownstream =
    Boolean(book.makro.bookTypeId?.trim()) ||
    book.evidenz.claims.length > 0 ||
    book.evidenz.queries.length > 0 ||
    book.makro.status !== "empty" ||
    book.kapitel.length > 0;
  /** Show reopen when freigegeben or leftover pipeline after Idee. */
  const showReopen = approved || hasDownstream;
  const hasLog = book.idee.refineLog.length > 0;
  const dossierBriefing =
    book.idee.refinedBriefing.trim() || book.idee.briefing.trim();
  const dossierOpinion =
    book.idee.refinedOpinion.trim() || book.idee.unpopularOpinion.trim();

  async function runRefine() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitOpen(true);
    try {
      const result = await runSachbuchIdeeRefineAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Verfeinerung fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Verfeinerung bereit — bitte freigeben.");
    } finally {
      setWaitOpen(false);
      setPending(false);
    }
  }

  async function approve() {
    if (!canSave || pending) return;
    setPending(true);
    try {
      const result = await approveSachbuchIdeeRefineAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Freigabe fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Idee freigegeben — weiter zum Buchtyp.");
    } finally {
      setPending(false);
    }
  }

  async function resetRefine() {
    if (!canSave || pending) return;
    setPending(true);
    try {
      const result = await rejectSachbuchIdeeRefineAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Zurücksetzen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Verfeinerung zurückgesetzt.");
    } finally {
      setPending(false);
    }
  }

  async function confirmReopenRefine() {
    if (!canSave || pending) return;
    setPending(true);
    try {
      const result = await reopenSachbuchIdeeRefineAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Öffnen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      setReopenConfirmOpen(false);
      toast.success(
        "Verfeinerung offen — Buchtyp, Evidenz, Makro und Kapitel zurückgesetzt.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
      <div>
        <h2 className="text-lg font-extrabold text-zinc-950">
          Idee verfeinern ({IDEE_REFINE_MODEL_LABEL})
        </h2>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Bis zu drei Runden: {IDEE_REFINE_MODEL_LABEL} setzt Change-Orders um
          und bewertet mit Rubrik und Vor-Runden-Vergleich. Agenten-Pass ab
          Score {SACHBUCH_IDEE_REFINE_PASS_SCORE}/10 — danach deine Freigabe.
        </p>
      </div>

      <div className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/5">
        <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Rohkonzept (Auszug)
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-800">
          {book.idee.unpopularOpinion.trim() || "—"}
        </p>
        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-600">
          {book.idee.briefing.trim().slice(0, 800) || "—"}
          {book.idee.briefing.trim().length > 800 ? "…" : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {showReopen ? (
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => setReopenConfirmOpen(true)}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            Verfeinerung wieder öffnen
          </button>
        ) : null}
        {!approved ? (
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void runRefine()}
            className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {pending && waitOpen ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {hasLog ? "Nochmal verfeinern" : "Verfeinerung starten"}
          </button>
        ) : null}
        {awaiting ? (
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void approve()}
            className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Idee freigeben
          </button>
        ) : null}
        {hasLog && !approved ? (
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void resetRefine()}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 disabled:opacity-50"
          >
            Log zurücksetzen
          </button>
        ) : null}
      </div>

      {hasLog ? (
        <div className="space-y-2">
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Agenten-Runden
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {book.idee.refineLog.map((r, i) => (
              <li
                key={`${r.round}-${r.role}-${i}`}
                className={cn(
                  "rounded-2xl px-3 py-2 text-xs ring-1",
                  r.role === "haiku"
                    ? "bg-sky-50/80 ring-sky-200/70"
                    : "bg-violet-50/80 ring-violet-200/70",
                )}
              >
                <p className="font-extrabold text-zinc-900">
                  Runde {r.round} ·{" "}
                  {r.role === "haiku"
                    ? `${IDEE_REFINE_MODEL_LABEL} Entwurf`
                    : `${IDEE_REFINE_MODEL_LABEL} Kritik`}
                  {r.passed === true
                    ? " · bestanden"
                    : r.passed === false
                      ? " · Nacharbeit"
                      : ""}
                </p>
                <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] text-zinc-700">
                  {r.content.slice(0, 2_000)}
                  {r.content.length > 2_000 ? "…" : ""}
                </pre>
                {r.changeOrders.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-zinc-600">
                    {r.changeOrders.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {approved ? (
        <p className="text-xs font-semibold text-zinc-500">
          Wieder öffnen setzt Buchtyp, Evidenz, Makro und alle Kapitel hart
          zurück. Das freigegebene Konzept bleibt Basis für den nächsten Lauf.
        </p>
      ) : null}

      {(awaiting || approved) && dossierBriefing ? (
        <div className="space-y-2 rounded-2xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-200/70">
          <p className="text-xs font-extrabold tracking-wide text-emerald-900 uppercase">
            {approved ? "Freigegebenes Dossier" : "Vorschlag zur Freigabe"}
          </p>
          <p className="text-sm font-extrabold text-emerald-950">
            {dossierOpinion || "—"}
          </p>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-emerald-900/90">
            {dossierBriefing}
          </pre>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={reopenConfirmOpen}
        title="Verfeinerung wieder öffnen?"
        description="Freigabe wird zurückgenommen. Buchtyp, Evidenz, Makro und alle Kapitel/Abschnitte werden unwiderruflich gelöscht. Das aktuelle Ideen-Konzept bleibt als Basis erhalten."
        confirmLabel="Zurücksetzen und öffnen"
        pending={pending}
        onCancel={() => {
          if (!pending) setReopenConfirmOpen(false);
        }}
        onConfirm={() => void confirmReopenRefine()}
      />
      <SachbuchWaitDialog
        open={waitOpen}
        title="Idee wird verfeinert"
        steps={IDEE_REFINE_WAIT_STEPS}
        agentInfo={sachbuchWaitAgentIdeeRefine()}
      />
    </section>
  );
}
