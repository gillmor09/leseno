"use client";

/**
 * Roman tab: Verbessern — prose quality up (Autor / Opus via Claude Batch).
 * Hard-gated: Manuskript freigabe (Seam/Payoff) must be clean first — no Opus
 * costs until then. Source = Manuskript draft → editorial.romanText.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  applyManuskriptFreigabeFixesAction,
  auditManuskriptFreigabeAction,
} from "@/app/actions/roman-manuskript-freigabe";
import {
  romanManuskriptOriginalRestoreAction,
  romanManuskriptVerbessernAction,
} from "@/app/actions/roman-manuskript-verbessern";
import { romanPipelineReloadRomanAction } from "@/app/actions/roman-pipeline";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import type { RomanEditorial } from "@/lib/roman/editorial";
import { isManuskriptFreigabeReadyForRoman } from "@/lib/roman/editorial";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import { getManuskriptRomanVerbessernGate } from "@/lib/roman/roman-verbessern-preflight";
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
  const [pending, setPending] = useState<
    "verbessern" | "restore" | "freigabe" | "nachziehen" | null
  >(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const hasManuskript = hasFilledManuskript(editorial.manuskriptText ?? "");
  const hasRoman = hasFilledManuskript(editorial.romanText ?? "");
  const busy = Boolean(disabled || pending);
  const gate = getManuskriptRomanVerbessernGate({ editorial });
  const gateBlocks = !gate.ok;
  const freigabeReady = isManuskriptFreigabeReadyForRoman(editorial);
  const freigabeFindings = editorial.manuskriptFreigabe?.findings ?? [];
  const freigabeBlocks =
    !freigabeReady &&
    Boolean(gate.ok === false && gate.reason.includes("Freigabe"));

  async function runFreigabeCheck(override = false) {
    if (!canSave || busy || !hasManuskript) return;
    setPending("freigabe");
    try {
      const audit = await auditManuskriptFreigabeAction({
        romanId,
        override,
      });
      if (!audit.success || !audit.data) {
        toast.error(audit.error ?? "Freigabe-Check fehlgeschlagen.");
        return;
      }
      onComplete?.(audit.data.roman);
      if (audit.data.findings.length > 0 && !override) {
        toast.message(audit.data.summary);
      } else {
        toast.success(audit.data.summary);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Freigabe-Check fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runNachziehen() {
    if (!canSave || busy || !hasManuskript) return;
    setPending("nachziehen");
    try {
      const result = await applyManuskriptFreigabeFixesAction({ romanId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Nachziehen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      if (result.data.autoFreigegeben) {
        toast.success(result.data.summary);
      } else {
        toast.message(result.data.summary);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nachziehen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runVerbessern() {
    if (!canSave || busy || !hasManuskript) return;
    // Re-read gate after possible freigabe — never kick Opus while blocked.
    const liveGate = getManuskriptRomanVerbessernGate({ editorial });
    if (!liveGate.ok) {
      toast.error(liveGate.reason);
      return;
    }
    if (!isManuskriptFreigabeReadyForRoman(editorial)) {
      toast.error(
        "Zuerst Manuskript-Freigabe (Seam/Payoff) — sonst startet kein Stil-Pass.",
      );
      return;
    }
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
            "Worker-Start fehlgeschlagen — bitte erneut „Verbessern“.",
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
        }
        if (consecutivePollErrors >= 40) {
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
            : "Verbessern läuft noch im Hintergrund — Fortschritt in der Pipeline-Historie prüfen.",
        );
        return;
      }
      if (finalPoll.status === "error") {
        toast.error(
          finalPoll.error?.trim() ||
            (polishedCount > 0
              ? `Verbessern mit Fehlern beendet — ${polishedCount} Kapitel bleiben im Roman.`
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
      {!gate.ok ? (
        <div
          role="status"
          className="space-y-3 rounded-2xl bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200"
        >
          <p>Verbessern gesperrt: {gate.reason}</p>
          {freigabeFindings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs font-semibold text-amber-900">
              {freigabeFindings.map((f, i) => (
                <li key={`${f.source}-${i}-${f.chapterNumbers.join("-")}`}>
                  [{f.source === "seam" ? (f.kind === "payoff" ? "Payoff" : "Naht") : "Emotion"}]
                  {" "}
                  Kap. {f.chapterNumbers.join(", ")}: {f.summary}
                </li>
              ))}
            </ul>
          ) : null}
          {hasManuskript ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={!canSave || busy}
                onClick={() => void runFreigabeCheck(false)}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100/80 disabled:opacity-50"
              >
                {pending === "freigabe" ? "Prüfen …" : "Erneut prüfen"}
              </button>
              {freigabeFindings.length > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={!canSave || busy}
                    onClick={() => void runNachziehen()}
                    className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                  >
                    {pending === "nachziehen"
                      ? "Nachziehen …"
                      : "Hinweise nachziehen"}
                  </button>
                  <button
                    type="button"
                    disabled={!canSave || busy}
                    onClick={() => void runFreigabeCheck(true)}
                    className="rounded-full bg-zinc-200 px-4 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-300 disabled:opacity-50"
                  >
                    Trotzdem freigeben
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy || !hasManuskript || gateBlocks}
          onClick={() => void runVerbessern()}
          className="rounded-full bg-amber-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-900 disabled:opacity-50"
        >
          {pending === "verbessern" ? "Verbessern …" : "Verbessern"}
        </button>
        {hasManuskript && (freigabeBlocks || !freigabeReady) && gate.ok ? (
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runFreigabeCheck(false)}
            className="rounded-full bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {pending === "freigabe" ? "Prüfen …" : "Freigabe prüfen"}
          </button>
        ) : null}
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
          Nur Stil-Pass (Opus) — startet erst nach Manuskript-Freigabe
          (Seam/Payoff). Keine Inhalts-Reparatur hier. Gate: Reifegrad + Freigabe.
        </p>
      </div>

      <RomanSceneWaitDialog
        open={
          pending === "verbessern" ||
          pending === "freigabe" ||
          pending === "nachziehen"
        }
        variant="manuskript-vereinfachen"
        contextLabel={
          pending === "nachziehen"
            ? "Manuskript · Hinweise nachziehen"
            : pending === "freigabe"
              ? "Manuskript · Freigabe-Check"
              : "Roman · Verbessern (Batch)"
        }
        title={
          pending === "nachziehen"
            ? "Nähte & Emotion nachziehen"
            : pending === "freigabe"
              ? "Seam / Payoff prüfen"
              : "Prosa verbessern"
        }
        progressLabel={
          pending === "nachziehen"
            ? "Co-Autor schärft betroffene Kapitel (günstig, kein Opus) …"
            : pending === "freigabe"
              ? "Günstiger Assist prüft Nähte, Payoffs und emotionale Konsequenzen …"
              : (progressLabel ??
                "Autor schärft Wortwahl und Satzbau — Kapitel landen im Roman …")
        }
      />
    </>
  );
}
