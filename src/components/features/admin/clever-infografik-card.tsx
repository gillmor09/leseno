"use client";

/**
 * Clever Geschichten: generate / preview / clear chapter Abenteuer-Wissen infographic.
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  cleverInfografikClearKapitelAction,
  cleverInfografikGenerateKapitelAction,
} from "@/app/actions/clever-unterthemen";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { CleverUnterthemen } from "@/lib/roman/clever-unterthemen";
import type { RomanKontext } from "@/lib/roman/types";

export function CleverInfografikCard({
  romanId,
  kapitelNummer,
  dataUrl,
  modelLabel,
  generatedAt,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  kapitelNummer: number;
  dataUrl: string | null;
  modelLabel?: string;
  generatedAt?: string | null;
  canSave: boolean;
  disabled?: boolean;
  onComplete: (result: {
    roman: RomanKontext;
    unterthemen: CleverUnterthemen;
  }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const busy = Boolean(disabled || pending || clearPending);

  async function runGenerate() {
    if (!canSave || busy) return;
    setPending(true);
    try {
      const result = await cleverInfografikGenerateKapitelAction({
        romanId,
        kapitelNummer,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Infografik fehlgeschlagen.");
        return;
      }
      onComplete({
        roman: result.data.roman,
        unterthemen: result.data.unterthemen,
      });
      toast.success(`Infografik zu Geschichte ${kapitelNummer} gespeichert.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Infografik fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  }

  async function runClear() {
    if (!canSave || clearPending) return;
    setClearPending(true);
    try {
      const result = await cleverInfografikClearKapitelAction({
        romanId,
        kapitelNummer,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      onComplete(result.data);
      setClearOpen(false);
      toast.success("Infografik gelöscht.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
      );
    } finally {
      setClearPending(false);
    }
  }

  return (
    <div className="rounded-2xl bg-sky-50 px-5 py-4 ring-1 ring-sky-200/80">
      <RomanSceneWaitDialog
        open={pending}
        variant="clever-infografik"
        progressLabel="Prompt → Infografik …"
      />
      <ConfirmDeleteDialog
        open={clearOpen}
        title="Infografik löschen?"
        description={`Die Infografik zu Geschichte ${kapitelNummer} wird entfernt. Abenteuer-Wissen und Prosa bleiben.`}
        confirmLabel="Infografik löschen"
        pending={clearPending}
        onCancel={() => {
          if (!clearPending) setClearOpen(false);
        }}
        onConfirm={() => void runClear()}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-sky-900 uppercase">
            Infografik
          </p>
          <p className="mt-1 text-xs font-semibold text-sky-800/80">
            Ganzseitig 1200×1920 zur Geschichte — kurze deutsche Labels, lesbare
            Schrift. Nur Kapitel-Geschichte — kein Abenteuer-Wissen, keine Extra-Themen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runGenerate()}
            className="rounded-full bg-sky-800 px-4 py-2 text-xs font-bold text-white hover:bg-sky-900 disabled:opacity-50"
          >
            {pending
              ? "Erzeugen …"
              : dataUrl
                ? "Neu erzeugen"
                : "Infografik erzeugen"}
          </button>
          {dataUrl ? (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => setClearOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
              title="Infografik löschen"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Infografik löschen</span>
            </button>
          ) : null}
        </div>
      </div>

      {dataUrl ? (
        <div className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-sky-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={`Infografik Geschichte ${kapitelNummer}`}
            className="mx-auto max-h-[28rem] w-full object-contain"
          />
          {(modelLabel || generatedAt) && (
            <p className="border-t border-sky-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
              {modelLabel}
              {generatedAt
                ? ` · ${new Date(generatedAt).toLocaleString("de-DE")}`
                : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-sky-900/70">
          Noch keine Infografik — aus den Fakten dieses Kapitels erzeugen.
        </p>
      )}
    </div>
  );
}
