/**
 * Pipeline controls: Erzeugen (draft + Reifegrad), Leser-Feedback.
 * Analyse/Einarbeiten lives under Reifegrad (Gesamt / Dimension).
 * Local stage only — no upstream/downstream cascade.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  loadRomanPipelineAufgabenAction,
  romanPipelineStepAssessAction,
  romanPipelineStepDraftAction,
  romanPipelineStepDraftSpecAction,
  romanPipelineStepFinishAction,
  romanPipelineStepStartAction,
} from "@/app/actions/roman-pipeline";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import { RomanLeserFeedbackControl } from "@/components/features/admin/roman-leser-feedback-control";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import type { PipelineHistoryEvent } from "@/lib/roman/pipeline/history";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { stageRoleAssignment, filterAufgabenForAdminModule } from "@/lib/roman/pipeline/tasks";
import type {
  LeserFeedbackStage,
  RomanLeserFeedback,
} from "@/lib/roman/editorial";
import type { RomanReifegrade } from "@/lib/roman/reifegrad-model";
import {
  filterRollenForAdminModule,
  type RomanKiRolle,
} from "@/lib/roman/roles";
import type { RomanKontext } from "@/lib/roman/types";

type RunMode = "generate";

type WaitAgentInfo = { roleLabel: string; modelLabel: string };

function agentFromRolle(
  rolle: RomanKiRolle | undefined,
): WaitAgentInfo | null {
  if (!rolle) return null;
  return {
    roleLabel: rolle.label,
    modelLabel:
      findWiredAiEndpoint(rolle.modelSlug)?.label ?? rolle.modelSlug,
  };
}

export function RomanPipelineStageActions({
  romanId,
  stage,
  canSave,
  disabled,
  onComplete,
  reifegrade: _reifegrade,
  leserFeedback,
  hasLeserArtifact,
  generateMode = "stage",
  /** When true, Erzeugen also runs Reifegrad after the draft. */
  showAssess = true,
  displayLabel,
  rolesHref = "/admin/roman/rollen",
  cleverStories = false,
}: {
  romanId: string;
  stage: PipelineStage;
  canSave: boolean;
  disabled?: boolean;
  onComplete?: (roman: RomanKontext) => void;
  reifegrade?: RomanReifegrade | null;
  /** Stored Leser-Feedback for this stage (button next to Erzeugen). */
  leserFeedback?: RomanLeserFeedback | null;
  /** Whether the stage artifact is ready for Leser-Feedback. */
  hasLeserArtifact?: boolean;
  /** `spec-chain` drafts Charaktere → Welt → Exposé in one Erzeugen run. */
  generateMode?: "stage" | "spec-chain";
  showAssess?: boolean;
  displayLabel?: string;
  /** Link to module KI-Rollen admin. */
  rolesHref?: string;
  /** Clever erzählt: independent Kurzgeschichten wording. */
  cleverStories?: boolean;
}) {
  const [pending, setPending] = useState<RunMode | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState<string | null>(null);
  const [critiqueLabel, setCritiqueLabel] = useState<string | null>(null);
  const [draftAgent, setDraftAgent] = useState<WaitAgentInfo | null>(null);
  const [bewerterAgent, setBewerterAgent] = useState<WaitAgentInfo | null>(
    null,
  );

  const busy = Boolean(disabled || pending);
  const label =
    displayLabel ??
    (cleverStories && stage === "manuskript"
      ? "Kurzgeschichten"
      : PIPELINE_STAGE_LABELS[stage]);
  const generateIdleLabel =
    stage === "manuskript"
      ? cleverStories
        ? "Alle Geschichten erzeugen"
        : "Alles erzeugen"
      : "Erzeugen";
  const generatePendingLabel =
    stage === "manuskript"
      ? cleverStories
        ? "Alle Geschichten …"
        : "Alles erzeugen …"
      : "Erzeugen …";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [aufgabenResult, rollenResult] = await Promise.all([
        loadRomanPipelineAufgabenAction(),
        loadRomanKiRollenAction(),
      ]);
      if (cancelled || !aufgabenResult.success) return;
      const moduleId = cleverStories ? "clever_erzaehlt" : "roman";
      /** Clever pipeline tasks use stage `geschichte`, UI tab is still `manuskript`. */
      const roleStage =
        cleverStories && stage === "manuskript" ? "geschichte" : stage;
      const rollen = filterRollenForAdminModule(
        rollenResult.success
          ? rollenResult.data!.rollen
          : ([] as RomanKiRolle[]),
        moduleId,
      );
      const aufgaben = filterAufgabenForAdminModule(
        aufgabenResult.data!.aufgaben,
        moduleId,
      );
      const byKey = new Map(rollen.map((r) => [r.key, r]));
      const rolleMap = new Map(rollen.map((r) => [r.key, r.label]));
      const assign = stageRoleAssignment(aufgaben, rolleMap, roleStage);
      setDraftLabel(assign.draftLabel);
      setCritiqueLabel(assign.critiqueLabel);
      setDraftAgent(
        agentFromRolle(
          assign.draftRolleKey
            ? byKey.get(assign.draftRolleKey)
            : undefined,
        ),
      );
      setBewerterAgent(agentFromRolle(byKey.get("bewerter")));
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, cleverStories]);

  const activeAgent = useMemo((): WaitAgentInfo | null => {
    if (pending !== "generate") return null;
    const idx = activeStepIndex ?? 0;
    if (idx <= 0) return draftAgent;
    return bewerterAgent;
  }, [pending, activeStepIndex, draftAgent, bewerterAgent]);

  async function runGenerate() {
    if (!canSave || busy) return;
    setPending("generate");
    setActiveStepIndex(0);
    setProgressLabel(
      generateMode === "spec-chain"
        ? "Spec: Figuren → Welt → Exposé …"
        : stage === "manuskript"
          ? cleverStories
            ? "Alle Geschichten: nacheinander …"
            : "Alles erzeugen: Kapitel nacheinander …"
          : `Entwurf: ${label} …`,
    );

    let runId = "";
    let events: PipelineHistoryEvent[] = [];
    let lastRoman: RomanKontext | null = null;
    let progressPoll: number | null = null;

    const stopProgressPoll = () => {
      if (progressPoll != null) {
        window.clearInterval(progressPoll);
        progressPoll = null;
      }
    };

    try {
      const started = await romanPipelineStepStartAction({
        romanId,
        stage,
        includeDraft: true,
        critiqueOnly: false,
      });
      if (!started.success || !started.data) {
        toast.error(started.error ?? "Pipeline-Start fehlgeschlagen.");
        return;
      }
      runId = started.data.runId;
      events = started.data.events;
      lastRoman = started.data.roman;
      setProgressLabel(
        stage === "manuskript"
          ? cleverStories
            ? "Alle Geschichten: vorbereiten …"
            : "Alles erzeugen: Arbeitsbrief vorbereiten …"
          : started.data.progressLabel,
      );

      setActiveStepIndex(0);

      if (stage === "manuskript" && generateMode === "stage") {
        let pollInFlight = false;
        progressPoll = window.setInterval(() => {
          if (pollInFlight || !runId) return;
          pollInFlight = true;
          void (async () => {
            try {
              const res = await fetch(
                `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(romanId)}&runId=${encodeURIComponent(runId)}`,
                { credentials: "same-origin", cache: "no-store" },
              );
              if (!res.ok) return;
              const data = (await res.json()) as {
                progressLabel?: string | null;
              };
              if (data.progressLabel?.trim()) {
                setProgressLabel(data.progressLabel.trim());
              }
            } catch {
              /* ignore transient poll errors */
            } finally {
              pollInFlight = false;
            }
          })();
        }, 1_200);
      }

      const draftResult =
        generateMode === "spec-chain"
          ? await romanPipelineStepDraftSpecAction({
              romanId,
              runId,
              events,
            })
          : await romanPipelineStepDraftAction({
              romanId,
              stage,
              runId,
              events,
            });
      stopProgressPoll();

      if (!draftResult.success || !draftResult.data) {
        toast.error(draftResult.error ?? "Entwurf fehlgeschlagen.");
        if (draftResult.data?.roman) onComplete?.(draftResult.data.roman);
        return;
      }
      events = draftResult.data.events;
      lastRoman = draftResult.data.roman;
      setProgressLabel(draftResult.data.progressLabel);

      if (showAssess) {
        setActiveStepIndex(1);
        setProgressLabel(`Reifegrad: ${label} …`);
        const assessed = await romanPipelineStepAssessAction({
          romanId,
          stage,
          runId,
          events,
          changeSummary: `Frischer Entwurf von ${label}.`,
        });
        if (!assessed.success || !assessed.data) {
          toast.error(assessed.error ?? "Reifegrad-Bewertung fehlgeschlagen.");
          if (assessed.data?.roman) onComplete?.(assessed.data.roman);
          return;
        }
        events = assessed.data.events;
        lastRoman = assessed.data.roman;
        setProgressLabel(assessed.data.progressLabel);
      }

      const finished = await romanPipelineStepFinishAction({
        romanId,
        runId,
        ok: true,
      });
      if (finished.data?.roman) lastRoman = finished.data.roman;
      if (lastRoman) onComplete?.(lastRoman);
      const draftEv = [...events]
        .reverse()
        .find((e) => e.type === "draft" && e.summary);
      const reifeEv = [...events]
        .reverse()
        .find(
          (e) =>
            e.type === "info" &&
            e.roleKey === "bewerter" &&
            e.summary.startsWith("Reifegrad:"),
        );
      toast.success(
        reifeEv?.summary
          ? `${label}: ${draftEv?.summary ? `${draftEv.summary} · ` : ""}${reifeEv.summary}`
          : draftEv?.summary
            ? `${label}: ${draftEv.summary}`
            : `${label}: erzeugt.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erzeugen fehlgeschlagen.";
      // Long drafts often finish in the DB, then the browser stream closes
      // before the result arrives. Do not mark that run as failed.
      const streamClosed = /destination stream closed/i.test(message);
      if (streamClosed) {
        toast.error(
          "Die Verbindung ist abgebrochen, der Entwurf kann trotzdem gespeichert sein. Seite wird neu geladen.",
        );
        window.location.reload();
        return;
      }
      toast.error(message);
      if (runId) {
        try {
          await romanPipelineStepFinishAction({
            romanId,
            runId,
            ok: false,
            error: message,
          });
        } catch {
          /* ignore */
        }
      }
      if (lastRoman) onComplete?.(lastRoman);
    } finally {
      stopProgressPoll();
      setPending(null);
      setProgressLabel(null);
      setActiveStepIndex(null);
    }
  }

  return (
    <div className="space-y-2">
      <RomanSceneWaitDialog
        open={pending === "generate"}
        variant={
          showAssess ? "pipeline-generate" : "pipeline-generate-draft-only"
        }
        title={
          stage === "manuskript"
            ? cleverStories
              ? "Alle Geschichten erzeugen"
              : "Alles erzeugen"
            : null
        }
        footer={
          cleverStories && stage === "manuskript"
            ? "Jede Kurzgeschichte einzeln — ohne Buch-Reifegrad. Tab offen lassen."
            : null
        }
        progressLabel={progressLabel}
        activeStepIndex={activeStepIndex}
        agentInfo={activeAgent}
      />

      <div className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/8">
        <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          KI für diesen Schritt
        </p>
        <dl className="mt-1.5 grid gap-1 text-sm font-semibold text-zinc-800 sm:grid-cols-2">
          <div>
            <dt className="inline text-zinc-500">Ersteller: </dt>
            <dd className="inline font-extrabold text-zinc-950">
              {draftLabel ?? "…"}
            </dd>
          </div>
          {!(cleverStories && stage === "manuskript") ? (
            <div>
              <dt className="inline text-zinc-500">Lektor: </dt>
              <dd className="inline font-extrabold text-zinc-950">
                {critiqueLabel ?? "…"}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          {cleverStories && stage === "manuskript"
            ? "Erzeugen = Erzähler schreibt jede Geschichte (+ Infografik). Verbessern je Geschichte läuft automatisch bis nur noch Nice-to-have oder nichts übrig ist, dann Fertig. Anpassen unter "
            : "Erzeugen = Co-Autor (+ Reifegrad). Analyse/Einarbeiten = Reifegrad-Knöpfe (Gesamt oder Dimension). Feedback = Testleser. Nur dieser Schritt — keine Upstream-/Downstream-Kaskade. Anpassen unter "}
          <Link
            href={rolesHref}
            className="font-bold text-orange-800 hover:underline"
          >
            KI-Rollen
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => void runGenerate()}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending === "generate" ? generatePendingLabel : generateIdleLabel}
        </button>
        {typeof hasLeserArtifact === "boolean" &&
        !(cleverStories && stage === "manuskript") ? (
          <RomanLeserFeedbackControl
            romanId={romanId}
            stage={
              (stage === "idee" ||
              stage === "expose" ||
              stage === "szenenplot" ||
              stage === "manuskript"
                ? stage
                : "manuskript") as LeserFeedbackStage
            }
            feedback={leserFeedback ?? null}
            hasArtifact={hasLeserArtifact}
            disabled={disabled || busy}
            onComplete={onComplete}
            displayLabel={displayLabel}
          />
        ) : null}
      </div>
      <p className="text-xs font-semibold text-zinc-500">
        {stage === "manuskript"
          ? cleverStories
            ? "Alle Geschichten = Kurzgeschichte + Infografik je Kapitel nacheinander. "
            : "Alles erzeugen = alle Kapitel nacheinander (+ Reifegrad). "
          : showAssess
            ? "Erzeugen = Entwurf + Reifegrad. "
            : generateMode === "spec-chain"
              ? "Erzeugen = Spec (Figuren + Welt + Exposé). "
              : "Erzeugen = Entwurf. "}
        {cleverStories && stage === "manuskript"
          ? "Verbessern je Geschichte läuft automatisch: einarbeiten, solange kritisch oder wichtig, sonst Fertig."
          : "Analyse unter Reifegrad (Gesamt / Dimension)."}
      </p>
    </div>
  );
}
