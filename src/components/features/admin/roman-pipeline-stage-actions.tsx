/**
 * Pipeline controls: Erzeugen (draft + Reifegrad), Leser-Feedback.
 * Analyse/Einarbeiten lives under Reifegrad (Gesamt / Dimension).
 * Gerüst/Plot Erzeugen confirms when downstream content would be cleared.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  loadRomanPipelineAufgabenAction,
  romanPipelineReloadRomanAction,
  romanPipelineStepStartAction,
} from "@/app/actions/roman-pipeline";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import { RomanLeserFeedbackControl } from "@/components/features/admin/roman-leser-feedback-control";
import {
  MANUSKRIPT_GENERATE_STEPS,
  PLOT_GENERATE_STEPS,
  RomanSceneWaitDialog,
  SPEC_GENERATE_STEPS,
  waitModelLabelForRole,
  type WaitAgentInfo,
} from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  cleverManuskriptSkipsReifegrad,
  isPlotStage,
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

export type GenerateCascadeConfirm = {
  title: string;
  description: string;
  confirmLabel?: string;
};

type RunMode = "generate";

type ProgressPollPayload = {
  progressLabel?: string | null;
  status?: string | null;
  error?: string | null;
  draftSummary?: string | null;
  reifeSummary?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Silent background poll after the wait dialog closes — keeps hitting
 * pipeline-progress so the server stale-watchdog can auto-continue.
 */
async function pollGenerateWatchdogInBackground(input: {
  romanId: string;
  runId: string;
  onSettled?: () => void;
}): Promise<void> {
  const deadline = Date.now() + 8 * 60 * 60_000;
  while (Date.now() < deadline) {
    await sleep(30_000);
    try {
      const res = await fetch(
        `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(input.romanId)}&runId=${encodeURIComponent(input.runId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as ProgressPollPayload;
      if (data.status === "ok" || data.status === "error") {
        input.onSettled?.();
        return;
      }
    } catch {
      /* keep watching */
    }
  }
}

/**
 * Client recovery when Erzeugen finished but stage Reifegrad is still missing
 * (e.g. background worker timed out after clearing/before scoring).
 */
async function recoverMissingReifegrad(input: {
  romanId: string;
  stage: PipelineStage;
  setProgressLabel: (label: string | null) => void;
}): Promise<{
  roman: RomanKontext | null;
  reifeSummary: string | null;
}> {
  const kick = await fetch("/api/admin/roman/pipeline-assess-job", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      romanId: input.romanId,
      stage: input.stage,
      changeSummary: `Nachholung: Reifegrad nach ${PIPELINE_STAGE_LABELS[input.stage]}-Erzeugung.`,
    }),
  });
  if (!kick.ok) {
    return { roman: null, reifeSummary: null };
  }
  let runId: string | null = null;
  try {
    const body = (await kick.json()) as { runId?: string };
    runId = body.runId?.trim() || null;
  } catch {
    return { roman: null, reifeSummary: null };
  }
  if (!runId) return { roman: null, reifeSummary: null };

  input.setProgressLabel("Reifegrad wird nachgeholt …");
  const deadline = Date.now() + 12 * 60_000;
  let finalPoll: ProgressPollPayload | null = null;
  while (Date.now() < deadline) {
    await sleep(1_200);
    try {
      const res = await fetch(
        `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(input.romanId)}&runId=${encodeURIComponent(runId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as ProgressPollPayload;
      if (data.progressLabel?.trim()) {
        input.setProgressLabel(data.progressLabel.trim());
      }
      if (data.status === "ok" || data.status === "error") {
        finalPoll = data;
        break;
      }
    } catch {
      /* keep polling */
    }
  }

  const reloaded = await romanPipelineReloadRomanAction({
    romanId: input.romanId,
  });
  const roman =
    reloaded.success && reloaded.data?.roman ? reloaded.data.roman : null;
  if (!finalPoll || finalPoll.status === "error") {
    return { roman, reifeSummary: null };
  }
  return {
    roman,
    reifeSummary: finalPoll.reifeSummary?.trim() || null,
  };
}

/** Match resolvePipelineTask: prose model only for Manuskript-Entwurf. */
function agentFromRolle(
  rolle: RomanKiRolle | undefined,
  opts?: { allowProseModel?: boolean },
): WaitAgentInfo | null {
  if (!rolle) return null;
  return {
    roleLabel: rolle.label,
    modelLabel: waitModelLabelForRole(rolle.key, rolle.modelSlug, {
      allowProseModel: opts?.allowProseModel === true,
    }),
  };
}

export function RomanPipelineStageActions({
  romanId,
  stage,
  canSave,
  disabled,
  onComplete,
  leserFeedback,
  hasLeserArtifact,
  generateMode = "stage",
  /** When true, Erzeugen also runs Reifegrad after the draft. */
  showAssess = true,
  displayLabel,
  rolesHref,
  cleverStories = false,
  /** When set, Erzeugen asks confirm first (downstream wipe). */
  generateCascadeConfirm = null,
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
  /** Link to module KI-Rollen admin; omit when the module has no roles UI. */
  rolesHref?: string;
  /** Clever erzählt: independent Kurzgeschichten wording. */
  cleverStories?: boolean;
  generateCascadeConfirm?: GenerateCascadeConfirm | null;
}) {
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [pending, setPending] = useState<RunMode | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState<string | null>(null);
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
      // Idee: Dialog (Schreib-Coach) is the real work; draft task is legacy.
      const dialogTask = aufgaben.find(
        (a) => a.stage === roleStage && a.kind === "dialog",
      );
      const displayRolleKey =
        stage === "idee" && dialogTask?.rolleKey
          ? dialogTask.rolleKey
          : assign.draftRolleKey;
      const displayLabel =
        stage === "idee" && dialogTask
          ? (rolleMap.get(dialogTask.rolleKey) ?? dialogTask.rolleKey)
          : assign.draftLabel;
      setDraftLabel(displayLabel);
      const draftProse =
        !cleverStories &&
        stage === "manuskript" &&
        (displayRolleKey === "co_autor" || displayRolleKey === "autor");
      setDraftAgent(
        agentFromRolle(
          displayRolleKey ? byKey.get(displayRolleKey) : undefined,
          // Explicit false for Spec/Gerüst Co-Autor → assist model (matches runtime).
          { allowProseModel: draftProse },
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

  function requestGenerate() {
    if (!canSave || busy) return;
    if (generateCascadeConfirm) {
      setConfirmGenerateOpen(true);
      return;
    }
    void runGenerate();
  }

  async function runGenerate() {
    if (!canSave || busy) return;
    setConfirmGenerateOpen(false);
    setPending("generate");
    setActiveStepIndex(0);
    setProgressLabel(
      generateMode === "spec-chain"
        ? "Figuren stecken …"
        : stage === "manuskript"
          ? cleverStories
            ? "Alle Geschichten: nacheinander …"
            : "Alles erzeugen: Arbeitsbrief vorbereiten …"
          : stage === "kapitelgeruest"
            ? "Outline & Spannungsbögen vorbereiten …"
            : stage === "szenenplot"
              ? "Gerüst lesen & Szenen planen …"
              : `${PIPELINE_STAGE_LABELS[stage]}: Entwurf vorbereiten …`,
    );

    let runId = "";

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
      setProgressLabel(
        stage === "manuskript"
          ? cleverStories
            ? "Alle Geschichten: vorbereiten …"
            : "Alles erzeugen: Arbeitsbrief vorbereiten …"
          : stage === "kapitelgeruest"
            ? "Outline & Spannungsbögen vorbereiten …"
            : stage === "szenenplot"
              ? started.data.progressLabel?.trim() ||
                "Gerüst lesen & Szenen planen …"
              : started.data.progressLabel?.trim() ||
                `${PIPELINE_STAGE_LABELS[stage]}: Entwurf vorbereiten …`,
      );
      setActiveStepIndex(0);

      // Background job: returns 202 immediately; work continues via `after()`.
      const kick = await fetch("/api/admin/roman/pipeline-generate-job", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          romanId,
          runId,
          stage,
          generateMode,
          showAssess,
        }),
      });
      if (!kick.ok) {
        let message = "Erzeugen konnte nicht gestartet werden.";
        try {
          const body = (await kick.json()) as { error?: string };
          if (body.error?.trim()) message = body.error.trim();
        } catch {
          /* ignore */
        }
        toast.error(message);
        return;
      }

      // Manuskript/Gerüst can span many auto-continue hops (unattended).
      const deadline =
        Date.now() +
        (stage === "manuskript" ||
        stage === "kapitelgeruest" ||
        stage === "szenenplot"
          ? 8 * 60 * 60_000
          : 90 * 60_000);
      let finalPoll: ProgressPollPayload | null = null;
      while (Date.now() < deadline) {
        await sleep(1_200);
        try {
          const res = await fetch(
            `/api/admin/roman/pipeline-progress?romanId=${encodeURIComponent(romanId)}&runId=${encodeURIComponent(runId)}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as ProgressPollPayload;
          if (data.progressLabel?.trim()) {
            const pl = data.progressLabel.trim();
            setProgressLabel(pl);
            if (stage === "kapitelgeruest") {
              if (/reifegrad/i.test(pl)) setActiveStepIndex(3);
              else if (/wissensgraph/i.test(pl)) setActiveStepIndex(2);
              else if (/^Kapitel\s+\d+/i.test(pl) || /Nachzug/i.test(pl)) {
                setActiveStepIndex(1);
              } else if (/Outline|Spannungsbogen|Fortsetzen/i.test(pl)) {
                setActiveStepIndex(0);
              }
            } else if (stage === "szenenplot") {
              if (/reifegrad/i.test(pl)) setActiveStepIndex(3);
              else if (/wissensgraph/i.test(pl)) setActiveStepIndex(2);
              else if (
                /Kap\.\s*\d+/i.test(pl) ||
                /Szenenverträge/i.test(pl) ||
                /Versuch/i.test(pl)
              ) {
                setActiveStepIndex(1);
              } else if (/vorbereiten|Fortsetzen|Gerüst/i.test(pl)) {
                setActiveStepIndex(0);
              }
            } else if (/reifegrad/i.test(pl)) {
              setActiveStepIndex(1);
            }
          }
          if (data.status === "ok" || data.status === "error") {
            finalPoll = data;
            break;
          }
        } catch {
          /* ignore transient poll errors — job keeps running */
        }
      }

      if (!finalPoll) {
        const reloaded = await romanPipelineReloadRomanAction({ romanId });
        if (reloaded.success && reloaded.data?.roman) {
          onComplete?.(reloaded.data.roman);
        }
        toast.message(
          "Dialog zu — Erzeugung läuft im Hintergrund weiter (Watchdog setzt bei Hängern automatisch fort). Historie prüfen oder warten.",
        );
        // Keep progress polls alive so stale-watchdog can fire without the dialog.
        void pollGenerateWatchdogInBackground({
          romanId,
          runId,
          onSettled: () => {
            void romanPipelineReloadRomanAction({ romanId }).then((r) => {
              if (r.success && r.data?.roman) onComplete?.(r.data.roman);
            });
            toast.message("Hintergrund-Erzeugung beendet — Seite aktualisieren.");
          },
        });
        return;
      }

      if (finalPoll.status === "error") {
        const errMsg = finalPoll.error?.trim() || "Erzeugen fehlgeschlagen.";
        const reloaded = await romanPipelineReloadRomanAction({ romanId });
        const romanAfter = reloaded.success ? reloaded.data?.roman : null;
        if (
          /gespeichert|fortsetz|Kapitel/i.test(errMsg) &&
          romanAfter?.editorial?.manuskriptText?.trim()
        ) {
          onComplete?.(romanAfter);
          toast.message(
            `${errMsg} Erneut „Erzeugen“ setzt nur fehlende Kapitel fort.`,
          );
          return;
        }
        // Draft may already be persisted when only Reifegrad failed — recover.
        if (
          showAssess &&
          romanAfter &&
          /reifegrad/i.test(errMsg) &&
          !cleverManuskriptSkipsReifegrad(
            romanAfter.editorial?.buchTyp,
            stage,
          ) &&
          !(
            typeof romanAfter.editorial?.reifegrade?.[stage]?.gesamtPct ===
            "number"
          )
        ) {
          setProgressLabel("Reifegrad nachholen …");
          if (stage === "kapitelgeruest") setActiveStepIndex(3);
          else setActiveStepIndex(1);
          const recovered = await recoverMissingReifegrad({
            romanId,
            stage,
            setProgressLabel,
          });
          if (recovered.roman) {
            onComplete?.(recovered.roman);
            if (recovered.reifeSummary) {
              toast.success(
                `${label}: ${finalPoll.draftSummary ? `${finalPoll.draftSummary} · ` : ""}${recovered.reifeSummary}`,
              );
              return;
            }
          }
        }
        toast.error(errMsg);
        if (romanAfter) onComplete?.(romanAfter);
        return;
      }

      let reloaded = await romanPipelineReloadRomanAction({ romanId });
      let romanAfter = reloaded.success ? reloaded.data?.roman : null;
      let reifeSummary = finalPoll.reifeSummary?.trim() || null;

      // Belt-and-suspenders: if Erzeugen finished without a stage score, assess once.
      if (
        showAssess &&
        romanAfter &&
        !cleverManuskriptSkipsReifegrad(
          romanAfter.editorial?.buchTyp,
          stage,
        ) &&
        !(
          typeof romanAfter.editorial?.reifegrade?.[stage]?.gesamtPct ===
          "number"
        )
      ) {
        setProgressLabel("Reifegrad nachholen …");
        if (stage === "kapitelgeruest") setActiveStepIndex(3);
        else setActiveStepIndex(1);
        const recovered = await recoverMissingReifegrad({
          romanId,
          stage,
          setProgressLabel,
        });
        if (recovered.roman) romanAfter = recovered.roman;
        if (recovered.reifeSummary) reifeSummary = recovered.reifeSummary;
      }

      if (romanAfter) onComplete?.(romanAfter);
      toast.success(
        reifeSummary
          ? `${label}: ${finalPoll.draftSummary ? `${finalPoll.draftSummary} · ` : ""}${reifeSummary}`
          : finalPoll.draftSummary
            ? `${label}: ${finalPoll.draftSummary}`
            : `${label}: erzeugt.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erzeugen fehlgeschlagen.";
      toast.error(message);
    } finally {
      setPending(null);
      setProgressLabel(null);
      setActiveStepIndex(null);
    }
  }

  return (
    <div className="space-y-2">
      <ConfirmDeleteDialog
        open={confirmGenerateOpen && Boolean(generateCascadeConfirm)}
        title={generateCascadeConfirm?.title ?? "Neu erzeugen?"}
        description={generateCascadeConfirm?.description ?? ""}
        confirmLabel={generateCascadeConfirm?.confirmLabel ?? "Erzeugen"}
        pending={false}
        onCancel={() => {
          if (!busy) setConfirmGenerateOpen(false);
        }}
        onConfirm={() => void runGenerate()}
      />

      <RomanSceneWaitDialog
        open={pending === "generate"}
        variant={
          showAssess ? "pipeline-generate" : "pipeline-generate-draft-only"
        }
        contextLabel={`${PIPELINE_STAGE_LABELS[stage]} · Erzeugen`}
        title={
          stage === "manuskript"
            ? cleverStories
              ? "Alle Geschichten erzeugen"
              : "Alles erzeugen"
            : isPlotStage(stage)
              ? `${PIPELINE_STAGE_LABELS[stage]} erzeugen (+ Auto-Repair)`
              : `${PIPELINE_STAGE_LABELS[stage]} erzeugen`
        }
        footer={
          cleverStories && stage === "manuskript"
            ? "Nur dieser Schritt: jede Kurzgeschichte einzeln — ohne Buch-Reifegrad. Tab offen lassen."
            : stage === "manuskript"
              ? "Manuskript-Erzeugen: Hard-Gate Plot muss grün sein. Kapitel nacheinander, Reifegrad danach. Tab offen lassen."
              : isPlotStage(stage)
                ? "Plot-Erzeugen: Gerüst → Szenen → Reifegrad → Auto-Repair Logik (bis Hard-Gate grün oder Fehler). Tab offen lassen."
                : stage === "expose" || generateMode === "spec-chain"
                  ? "Spec-Erzeugen: Figuren → Welt → Exposé → Reifegrad. Basics-Hard-Gate muss vorher grün sein. Tab offen lassen."
                  : `Nur ${PIPELINE_STAGE_LABELS[stage]} erzeugen. Tab offen lassen.`
        }
        progressLabel={progressLabel}
        activeStepIndex={activeStepIndex}
        steps={
          isPlotStage(stage)
            ? PLOT_GENERATE_STEPS
            : stage === "expose" || generateMode === "spec-chain"
              ? SPEC_GENERATE_STEPS
              : stage === "manuskript" && !cleverStories
                ? MANUSKRIPT_GENERATE_STEPS
                : null
        }
        agentInfo={activeAgent}
      />

      <div className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/8">
        <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          KI für diesen Schritt
        </p>
        <p className="mt-1.5 text-sm font-semibold text-zinc-800">
          <span className="text-zinc-500">Rolle: </span>
          <span className="font-extrabold text-zinc-950">
            {draftAgent?.roleLabel ?? draftLabel ?? "…"}
          </span>
          {draftAgent?.modelLabel ? (
            <>
              <span className="text-zinc-500"> · </span>
              <span className="tabular-nums text-zinc-800">
                {draftAgent.modelLabel}
              </span>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          {cleverStories && stage === "manuskript"
            ? "Erzeugen = Erzähler schreibt jede Geschichte (+ Infografik). Verbessern je Geschichte läuft automatisch bis nur noch Nice-to-have oder nichts übrig ist, dann Fertig."
            : isPlotStage(stage)
              ? "Erzeugen = Kapitel-Gerüst → Szenen + Schreibprompts + Reifegrad + Auto-Repair Logik bis Hard-Gate grün. Fertig-Toggle friert nur Schreibprompts ein — kein Gate-Bypass. Override nur über „Trotzdem weiter“."
              : stage === "manuskript"
                ? "Erzeugen = Co-Autor: kapitelweise aus eingefrorenen Szenenverträgen. Vorstufe Plot-Hard-Gate muss grün sein. Feedback = Testleser; optionaler Stil-Pass über Verbessern am Manuskript."
                : stage === "expose" || generateMode === "spec-chain"
                  ? "Erzeugen = Figuren → Welt → Exposé + Reifegrad. Vorstufe Basics-Hard-Gate muss grün sein (nach Idee abgeleitet). Feedback = Testleser."
                  : stage === "idee"
                    ? "Idee: Dialog mit Schreib-Coach → Dokumentation (ohne feste Tonalität). Danach Reifegrad; Basics werden aus der Idee abgeleitet; Folgestufen brauchen grünes Basics-Gate (nicht nur Fertig-Toggle)."
                    : "Eine Rolle pro Schritt (+ Reifegrad). Fertig = Soft-Chrome; Hard-Gates steuern die Freigabe der nächsten Stufe."}
          {rolesHref ? (
            <>
              {" "}
              Anpassen unter{" "}
              <Link
                href={rolesHref}
                className="font-bold text-orange-800 hover:underline"
              >
                KI-Rollen
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => requestGenerate()}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending === "generate" ? generatePendingLabel : generateIdleLabel}
        </button>
        {typeof hasLeserArtifact === "boolean" &&
        !(cleverStories && stage === "manuskript") ? (
          <RomanLeserFeedbackControl
            romanId={romanId}
            stage={
              (stage === "idee" || stage === "expose" || stage === "manuskript"
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
            : "Alles erzeugen = Kapitel strikt nacheinander mit Continuity (+ Reifegrad). "
          : isPlotStage(stage)
            ? "Soll-Pfad: Erzeugen bis Hard-Gate grün (Auto-Repair). Fertig = Verträge einfrieren, nicht Gate überspringen. "
            : showAssess
              ? "Erzeugen = Entwurf + Reifegrad (Hard-Gate danach). "
              : generateMode === "spec-chain"
                ? "Erzeugen = Spec (Figuren + Welt + Exposé) + Reifegrad. "
                : "Erzeugen = Entwurf. "}
        {cleverStories && stage === "manuskript"
          ? "Verbessern je Geschichte läuft automatisch: einarbeiten, solange kritisch oder wichtig, sonst Fertig."
          : isPlotStage(stage)
            ? "Optional unter Reifegrad: „Nur Logik“ / „Nur Craft“ / Dimensionen — zusätzlich zum Auto-Repair beim Erzeugen."
            : "Analyse/Einarbeiten unter Reifegrad (Gesamt / Dimension) — optional nach Erzeugen."}
      </p>
    </div>
  );
}
