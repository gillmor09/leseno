"use client";

/**
 * Roman tab: Verbessern — prose quality up (Autor / Opus via Claude Batch).
 * Source = Manuskript draft; writes chapter-wise into editorial.romanText.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  romanManuskriptOriginalRestoreAction,
  romanManuskriptVerbessernAction,
} from "@/app/actions/roman-manuskript-verbessern";
import { romanPipelineReloadRomanAction } from "@/app/actions/roman-pipeline";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";

type ProgressPollPayload = {
  progressLabel?: string | null;
  status?: string | null;
  error?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function RomanManuskriptVerbessernControl({
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
  const [pending, setPending] = useState<"verbessern" | "restore" | null>(
    null,
  );
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const hasManuskript = hasFilledManuskript(editorial.manuskriptText ?? "");
  const hasRoman = hasFilledManuskript(editorial.romanText ?? "");
  const busy = Boolean(disabled || pending);

  async function runVerbessern() {
    if (!canSave || busy || !hasManuskript) return;
    setPending("verbessern");
    setProgressLabel("Roman Verbessern · Kapitelstruktur & Batch …");
    try {
      const started = await romanManuskriptVerbessernAction({ romanId });
      if (!started.success || !started.data) {
        toast.error(started.error ?? "Verbessern fehlgeschlagen.");
        return;
      }
      const { runId, chapterCount } = started.data;
      setProgressLabel(
        `Claude Batch einreichen · ${chapterCount} Kapitel …`,
      );

      const kick = await fetch("/api/admin/roman/manuskript-verbessern-job", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ romanId, runId }),
      });
      if (!kick.ok) {
        let message = "Verbessern konnte nicht gestartet werden.";
        try {
          const body = (await kick.json()) as { error?: string };
          if (body.error?.trim()) message = body.error.trim();
        } catch {
          /* ignore */
        }
        toast.error(message);
        return;
      }

      const deadline = Date.now() + 90 * 60_000;
      let finalPoll: ProgressPollPayload | null = null;
      while (Date.now() < deadline) {
        await sleep(1_500);
        try {
          const res = await fetch(
            `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(romanId)}&runId=${encodeURIComponent(runId)}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as ProgressPollPayload;
          if (data.progressLabel?.trim()) {
            setProgressLabel(data.progressLabel.trim());
          }
          if (data.status === "ok" || data.status === "error") {
            finalPoll = data;
            break;
          }
        } catch {
          /* keep polling */
        }
      }

      const reloaded = await romanPipelineReloadRomanAction({ romanId });
      if (reloaded.success && reloaded.data?.roman) {
        onComplete?.(reloaded.data.roman);
      }

      if (!finalPoll) {
        toast.error(
          "Verbessern läuft noch im Hintergrund — Fortschritt in der Pipeline-Historie prüfen.",
        );
        return;
      }
      if (finalPoll.status === "error") {
        toast.error(
          finalPoll.error?.trim() || "Verbessern fehlgeschlagen.",
        );
        return;
      }
      toast.success(
        `Roman verbessert (Claude Batch · ${chapterCount} Kapitel). Manuskript unverändert.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Verbessern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
      setProgressLabel(null);
    }
  }

  async function runRestore() {
    if (!canSave || busy || !hasManuskript) return;
    setPending("restore");
    try {
      const result = await romanManuskriptOriginalRestoreAction({ romanId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary || "Roman aus Manuskript übernommen.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Übernehmen fehlgeschlagen.",
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
          onClick={() => void runVerbessern()}
          className="rounded-full bg-amber-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-900 disabled:opacity-50"
        >
          {pending === "verbessern" ? "Verbessern …" : "Verbessern"}
        </button>
        {hasManuskript ? (
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runRestore()}
            className="rounded-full bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-800 hover:bg-zinc-300 disabled:opacity-50"
          >
            {pending === "restore"
              ? "Übernehmen …"
              : hasRoman
                ? "Manuskript → Roman"
                : "Manuskript übernehmen"}
          </button>
        ) : null}
        <p className="max-w-xl text-xs font-semibold text-zinc-500">
          Autor (Claude Opus, Message Batch ~50%): liest das Manuskript, schreibt
          den Feinschliff kapitelweise in den Roman. Das Manuskript bleibt zum
          Vergleich unverändert.
        </p>
      </div>

      <RomanSceneWaitDialog
        open={pending === "verbessern"}
        variant="manuskript-vereinfachen"
        contextLabel="Roman · Verbessern (Batch)"
        title="Prosa verbessern"
        progressLabel={
          progressLabel ??
          "Autor schärft Wortwahl und Satzbau — Kapitel landen im Roman …"
        }
      />
    </>
  );
}
