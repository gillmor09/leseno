"use client";

/**
 * Manuskript: Vereinfachen (Register) — one step lighter language, content unchanged.
 */

import { useState } from "react";
import { toast } from "sonner";
import { romanManuskriptVereinfachenAction } from "@/app/actions/roman-manuskript-vereinfachen";
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
  const [pending, setPending] = useState(false);

  const hasManuskript = hasFilledManuskript(editorial.manuskriptText ?? "");
  const busy = Boolean(disabled || pending);

  async function runSimplify() {
    if (!canSave || busy || !hasManuskript) return;
    setPending(true);
    try {
      const result = await romanManuskriptVereinfachenAction({ romanId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Vereinfachen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary || "Sprachniveau gesenkt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Vereinfachen fehlgeschlagen.",
      );
    } finally {
      setPending(false);
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
          {pending ? "Vereinfachen …" : "Vereinfachen"}
        </button>
        <p className="max-w-xl text-xs font-semibold text-zinc-500">
          Nur Sprache eine Stufe leichter (schwere Wörter, Fremdwörter,
          Schachtelsätze). Inhalt und Handlung bleiben gleich.
        </p>
      </div>

      <RomanSceneWaitDialog
        open={pending}
        variant="pipeline-generate"
        title="Manuskript wird vereinfacht"
        progressLabel="Sprachniveau senken — Inhalt unverändert …"
      />
    </>
  );
}
