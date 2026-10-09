"use client";

/**
 * Roman tab: Verbessern — prose quality up (Autor / Opus via Claude Batch).
 * Source = Manuskript draft; writes chapter-wise into editorial.romanText.
 * Kick+poll are resilient: retries on kick, long poll, partial reload on timeout.
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
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
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

async function kickVerbessernJob(
  romanId: string,
  runId: string,
): Promise<{ ok: boolean; message?: string }> {
  let lastMessage = "Verbessern konnte nicht gestartet werden.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const kick = await fetch("/api/admin/roman/manuskript-verbessern-job", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ romanId, runId }),
      });
      if (kick.ok) return { ok: true };
      try {
        const body = (await kick.json()) as { error?: string };
        if (body.error?.trim()) lastMessage = body.error.trim();
      } catch {
        /* ignore */
      }
      if (kick.status >= 500 || kick.status === 429) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      return { ok: false, message: lastMessage };
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return { ok: false, message: lastMessage };
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

      const kick = await kickVerbessernJob(romanId, runId);
      if (!kick.ok) {
        toast.error(
          kick.message ??
            "Worker-Start fehlgeschlagen — bitte erneut „Verbessern“ (hängt am gleichen Lauf bzw. Resume).",
        );
        return;
      }

      const deadline = Date.now() + 95 * 60_000;
      let finalPoll: ProgressPollPayload | null = null;
      let consecutivePollErrors = 0;
      while (Date.now() < deadline) {
        await sleep(1_800);
        try {
          const res = await fetch(
            `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(romanId)}&runId=${encodeURIComponent(runId)}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (!res.ok) {
            consecutivePollErrors += 1;
            continue;
          }
          consecutivePollErrors = 0;
          const data = (await res.json()) as ProgressPollPayload;
          if (data.progressLabel?.trim()) {
            setProgressLabel(data.progressLabel.trim());
          }
          if (data.status === "ok" || data.status === "error") {
            finalPoll = data;
            break;
          }
        } catch {
          consecutivePollErrors += 1;
          /* keep polling */
        }
        if (consecutivePollErrors >= 40) {
          // ~72s of pure poll failures — still wait out deadline, but surface hint.
          setProgressLabel(
            "Verbindung zum Fortschritt wackelig — Job läuft im Hintergrund weiter …",
          );
        }
      }

      const reloaded = await romanPipelineReloadRomanAction({ romanId });
      let polishedCount = 0;
      if (reloaded.success && reloaded.data?.roman) {
        onComplete?.(reloaded.data.roman);
        const rt = reloaded.data.roman.editorial?.romanText ?? "";
        polishedCount = parsePlotChapters(rt).filter(
          (c) => c.body.trim().length >= 80,
        ).length;
      }

      if (!finalPoll) {
        toast.message(
          polishedCount > 0
            ? `Verbessern läuft noch oder Poll-Timeout — ${polishedCount} Kapitel bereits im Roman. Erneut „Verbessern“ setzt nur offene Kapitel fort.`
            : "Verbessern läuft noch im Hintergrund — Fortschritt in der Pipeline-Historie prüfen. Erneut starten setzt fort.",
        );
        return;
      }
      if (finalPoll.status === "error") {
        toast.error(
          finalPoll.error?.trim() ||
            (polishedCount > 0
              ? `Verbessern mit Fehlern beendet — ${polishedCount} Kapitel bleiben im Roman. Erneut starten setzt fehlende fort.`
              : "Verbessern fehlgeschlagen."),
        );
        return;
      }
      toast.success(
        polishedCount > 0
          ? `Roman verbessert (Claude Batch · ${polishedCount}/${chapterCount} Kapitel). Manuskript unverändert.`
          : `Roman verbessert (Claude Batch · ${chapterCount} Kapitel). Manuskript unverändert.`,
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
          Zuerst Seam/Payoff und emotionale Konsequenzen (Wertwechsel /
          Nachwirkung) im Manuskript, dann zwei Wellen Stil (Stilanker zuerst),
          Freeze-QA + Soft-Repair. Resume: polierte Kapitel werden übersprungen.
          Gate: Logik/Dramaturgie ≥70%, Stil/Lesefluss ≥60%, Versprechen ≥70%.
          Danach Auto-Reifegrad. Override: „Roman fertig“.
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
