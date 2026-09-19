"use client";

/**
 * Manuskript: Vereinfachen (Register) + Original wiederherstellen.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  romanManuskriptOriginalRestoreAction,
  romanManuskriptVereinfachenAction,
} from "@/app/actions/roman-manuskript-vereinfachen";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";

export function RomanManuskriptVereinfachenControl({
  romanId,
  editorial,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  editorial: RomanEditorial;
  canSave: boolean;
  disabled?: boolean;
  onComplete?: (roman: RomanKontext) => void;
}) {
  const [pending, setPending] = useState<"simplify" | "restore" | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const hasManuskript = hasFilledManuskript(editorial.manuskriptText ?? "");
  const hasOriginal = Boolean(editorial.manuskriptOriginalText?.trim());
  const busy = Boolean(disabled || pending);

  async function runSimplify() {
    if (!canSave || busy || !hasManuskript) return;
    setPending("simplify");
    try {
      const result = await romanManuskriptVereinfachenAction({ romanId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Vereinfachen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(
        result.data.originalSaved
          ? "Vereinfacht — Original wurde gesichert."
          : result.data.summary,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Vereinfachen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runRestore() {
    if (!canSave || busy || !hasOriginal) return;
    setPending("restore");
    try {
      const result = await romanManuskriptOriginalRestoreAction({ romanId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Wiederherstellen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      setRestoreOpen(false);
      toast.success("Original-Manuskript wiederhergestellt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Wiederherstellen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy || !hasManuskript}
          onClick={() => void runSimplify()}
          className="rounded-full bg-sky-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-50"
        >
          {pending === "simplify" ? "Vereinfachen …" : "Vereinfachen"}
        </button>
        <button
          type="button"
          disabled={!canSave || busy || !hasOriginal}
          onClick={() => setRestoreOpen(true)}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
        >
          Original wiederherstellen
        </button>
        <p className="max-w-xl text-xs font-semibold text-zinc-500">
          Nur Sprache eine Stufe leichter (schwere Wörter, Fremdwörter,
          Schachtelsätze). Inhalt bleibt. Beim ersten Vereinfachen wird das
          aktuelle Manuskript als Original gesichert
          {hasOriginal && editorial.manuskriptOriginalSavedAt
            ? ` (seit ${formatWhen(editorial.manuskriptOriginalSavedAt)})`
            : ""}
          .
        </p>
      </div>

      <RomanSceneWaitDialog
        open={pending === "simplify"}
        variant="pipeline-generate"
        title="Manuskript wird vereinfacht"
        progressLabel="Sprachniveau senken — Inhalt unverändert …"
      />

      <ConfirmDeleteDialog
        open={restoreOpen}
        title="Original wiederherstellen?"
        description="Das aktuelle Manuskript wird durch das gesicherte Original ersetzt. Die vereinfachte Fassung geht verloren (das Original bleibt gespeichert)."
        confirmLabel="Wiederherstellen"
        pending={pending === "restore"}
        onCancel={() => {
          if (pending !== "restore") setRestoreOpen(false);
        }}
        onConfirm={() => void runRestore()}
      />
    </>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
