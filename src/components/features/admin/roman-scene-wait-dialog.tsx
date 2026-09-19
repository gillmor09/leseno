"use client";

/**
 * Blocking wait dialog for book-pipeline KI work.
 * Shows elapsed time + live statusLabel; checklist advances slowly and never
 * claims the last step until the dialog closes (avoids “stuck on last item”).
 * Under the status line: active KI role · model (prop or variant default).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

export type WaitAgentInfo = { roleLabel: string; modelLabel: string };

const IDEE_QA_STEPS = [
  "Schreib-Coach liest deine Nachricht …",
  "Coach formuliert Rückfragen und Impulse …",
  "Ideen-Redakteur verwebt die Runde …",
  "Idee und Dialog werden gespeichert …",
] as const;

const MARKTANALYSE_STEPS = [
  "Genre und Altersgruppe werden gelesen …",
  "Google Search sucht aktuelle Konkurrenz-Titel …",
  "Bis zu 20 schlechteste Rezensionen je Titel …",
  "Bis zu 20 beste Rezensionen je Titel …",
  "Kritik, Stärken und Bedürfnisse werden verdichtet …",
  "Marktanalyse wird gespeichert …",
] as const;

const PIPELINE_GENERATE_STEPS = [
  "Co-Autor erzeugt …",
  "Reifegrad wird bewertet …",
] as const;

const PIPELINE_CRITIQUE_STEPS = [
  "Entwicklungslektor analysiert …",
  "Änderungsaufträge werden verdichtet …",
  "Co-Autor arbeitet ein …",
  "Reifegrad wird neu bewertet …",
] as const;

const REIFEGRAD_ASSESS_STEPS = [
  "Bewerter liest das Artefakt …",
  "Vier Dimensionen werden gemessen …",
  "Reifegrad wird gespeichert …",
] as const;

const LESER_FEEDBACK_STEPS = [
  "Testleser liest das Artefakt …",
  "Einschätzung und Aufträge werden verdichtet …",
  "Feedback wird gespeichert …",
] as const;

const LESER_FEEDBACK_APPLY_STEPS = [
  "Feedback wird in Patch-Brief verdichtet …",
  "Co-Autor arbeitet die Aufträge ein …",
  "Reifegrad wird neu bewertet …",
  "Ergebnis wird gespeichert …",
] as const;

const MANUSKRIPT_CHAPTER_GENERATE_STEPS = [
  "Entwicklungslektor schreibt Arbeitsbrief …",
  "Continuity-Buffer (Vorgänger-Ende + Story-State) …",
  "Co-Autor schreibt das Kapitel …",
  "Länge prüfen und speichern …",
] as const;

const MANUSKRIPT_CHAPTER_IMPROVE_STEPS = [
  "Entwicklungslektor analysiert das Kapitel …",
  "Co-Autor arbeitet Verbesserungen ein …",
  "Continuity und Speichern …",
] as const;

const MANUSKRIPT_CHAPTER_CRITIQUE_STEPS = [
  "Vorgänger-Ende und Gerüst-Beats werden gelesen …",
  "Entwicklungslektor analysiert …",
  "Analyse wird verdichtet …",
] as const;

type WaitVariant =
  | "idee"
  | "marktanalyse"
  | "pipeline-generate"
  | "pipeline-critique"
  | "reifegrad-assess"
  | "leser-feedback"
  | "leser-feedback-apply"
  | "manuskript-chapter-generate"
  | "manuskript-chapter-improve"
  | "manuskript-chapter-critique";

type RomanSceneWaitDialogProps = {
  open: boolean;
  variant?: WaitVariant;
  /** Override dialog title (e.g. „Alles erzeugen“). */
  title?: string | null;
  /** Live status from the caller (preferred over fake step animation). */
  progressLabel?: string | null;
  /** Optional checklist index driven by the caller (0-based). */
  activeStepIndex?: number | null;
  /**
   * Role + model currently working. When omitted/null, resolved from `variant`
   * via roman KI roles (see `roleKeysForVariant`).
   */
  agentInfo?: WaitAgentInfo | null;
};

/** Primary roman KI role keys for each wait variant (join order = display order). */
function roleKeysForVariant(variant: WaitVariant): string[] {
  switch (variant) {
    case "idee":
      return ["schreib_coach", "ideen_redakteur"];
    case "marktanalyse":
      return ["marktanalyst"];
    case "pipeline-generate":
      return ["co_autor", "bewerter"];
    case "pipeline-critique":
      return ["entwicklungslektor", "co_autor", "bewerter"];
    case "reifegrad-assess":
      return ["bewerter"];
    case "leser-feedback":
      return ["testleser_fanbase"];
    case "leser-feedback-apply":
      return ["co_autor", "bewerter"];
    case "manuskript-chapter-generate":
      return ["entwicklungslektor", "co_autor", "bewerter"];
    case "manuskript-chapter-improve":
      return ["entwicklungslektor", "co_autor"];
    case "manuskript-chapter-critique":
      return ["entwicklungslektor"];
  }
}

function agentInfoFromRoleKeys(
  rollen: { key: string; label: string; modelSlug: string }[],
  keys: string[],
): WaitAgentInfo | null {
  const byKey = new Map(rollen.map((r) => [r.key, r]));
  const picked = keys
    .map((k) => byKey.get(k))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (picked.length === 0) return null;
  const roleLabel = picked.map((r) => r.label).join(" → ");
  const models = picked.map(
    (r) => findWiredAiEndpoint(r.modelSlug)?.label ?? r.modelSlug,
  );
  const modelLabel =
    models.length > 1 && models.every((m) => m === models[0])
      ? models[0]!
      : models.join(" / ");
  return { roleLabel, modelLabel };
}

function stepsForVariant(variant: WaitVariant) {
  switch (variant) {
    case "idee":
      return IDEE_QA_STEPS;
    case "marktanalyse":
      return MARKTANALYSE_STEPS;
    case "pipeline-generate":
      return PIPELINE_GENERATE_STEPS;
    case "pipeline-critique":
      return PIPELINE_CRITIQUE_STEPS;
    case "reifegrad-assess":
      return REIFEGRAD_ASSESS_STEPS;
    case "leser-feedback":
      return LESER_FEEDBACK_STEPS;
    case "leser-feedback-apply":
      return LESER_FEEDBACK_APPLY_STEPS;
    case "manuskript-chapter-generate":
      return MANUSKRIPT_CHAPTER_GENERATE_STEPS;
    case "manuskript-chapter-improve":
      return MANUSKRIPT_CHAPTER_IMPROVE_STEPS;
    case "manuskript-chapter-critique":
      return MANUSKRIPT_CHAPTER_CRITIQUE_STEPS;
  }
}

function titleForVariant(variant: WaitVariant) {
  switch (variant) {
    case "idee":
      return "Idee wird weiterentwickelt";
    case "marktanalyse":
      return "Marktanalyse läuft";
    case "pipeline-generate":
      return "Schritt wird erzeugt";
    case "pipeline-critique":
      return "Analyse & Einarbeiten";
    case "reifegrad-assess":
      return "Reifegrad wird bewertet";
    case "leser-feedback":
      return "Feedback wird eingeholt";
    case "leser-feedback-apply":
      return "Feedback wird eingearbeitet";
    case "manuskript-chapter-generate":
      return "Kapitel wird erzeugt";
    case "manuskript-chapter-improve":
      return "Kapitel wird verbessert";
    case "manuskript-chapter-critique":
      return "Kapitel-Analyse";
  }
}

function footerForVariant(variant: WaitVariant) {
  switch (variant) {
    case "pipeline-generate":
      return "Entwurf + Reifegrad. Bei Manuskript: Kapitel-Status live. Tab offen lassen.";
    case "pipeline-critique":
      return "Analyse, Einarbeiten und Reifegrad — nur dieser Schritt. Tab offen lassen.";
    case "reifegrad-assess":
      return "Nur Messung — Text wird nicht verändert. Tab offen lassen.";
    case "leser-feedback":
      return "Nur Feedback — das Artefakt wird noch nicht geändert. Tab offen lassen.";
    case "leser-feedback-apply":
      return "Feedback wird eingearbeitet und Reifegrad neu gemessen. Tab offen lassen.";
    case "manuskript-chapter-generate":
      return "Nur dieses Kapitel — Continuity vom Vorgänger. Tab offen lassen.";
    case "manuskript-chapter-improve":
      return "Analyse und Einarbeiten nur für dieses Kapitel. Tab offen lassen.";
    case "manuskript-chapter-critique":
      return "Nur Analyse — Manuskript bleibt unverändert. Tab offen lassen.";
    default:
      return "Bitte diesen Tab offen lassen — Abbrechen mitten im KI-Lauf ist nicht möglich.";
  }
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RomanSceneWaitDialog({
  open,
  variant = "pipeline-generate",
  title: titleOverride = null,
  progressLabel = null,
  activeStepIndex = null,
  agentInfo = null,
}: RomanSceneWaitDialogProps) {
  const steps = stepsForVariant(variant);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [softStep, setSoftStep] = useState(0);
  const [variantAgent, setVariantAgent] = useState<WaitAgentInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setElapsedSec(0);
      setSoftStep(0);
      return;
    }
    const tick = window.setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1_000);
    // Soft checklist: ~40s per step, never claim the last item while open.
    const maxSoft = Math.max(0, steps.length - 2);
    const soft = window.setInterval(() => {
      setSoftStep((current) => (current < maxSoft ? current + 1 : current));
    }, 40_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(soft);
    };
  }, [open, steps.length]);

  useEffect(() => {
    if (!open) {
      setVariantAgent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await loadRomanKiRollenAction();
      if (cancelled || !result.success) return;
      setVariantAgent(
        agentInfoFromRoleKeys(
          result.data!.rollen,
          roleKeysForVariant(variant),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, variant]);

  if (!open) return null;

  const controlled =
    typeof activeStepIndex === "number" &&
    activeStepIndex >= 0 &&
    activeStepIndex < steps.length;
  const stepIndex = controlled
    ? activeStepIndex
    : Math.min(softStep, Math.max(0, steps.length - 2));
  const statusText =
    progressLabel?.trim() ||
    steps[stepIndex] ||
    "KI arbeitet …";
  const title = titleOverride?.trim() || titleForVariant(variant);
  const footerHint = footerForVariant(variant);
  const barPct = Math.round(((stepIndex + 1) / steps.length) * 100);
  const shownAgent = agentInfo ?? variantAgent;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="roman-scene-wait-title"
      aria-describedby="roman-scene-wait-desc"
      aria-busy="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2
            className="size-10 animate-spin text-orange-700"
            aria-hidden
          />
          <h2
            id="roman-scene-wait-title"
            className="mt-5 text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <p className="mt-2 font-mono text-sm font-extrabold tracking-wide text-orange-800">
            {formatElapsed(elapsedSec)}
          </p>
          <p
            id="roman-scene-wait-desc"
            className="mt-2 text-sm font-extrabold text-zinc-900"
          >
            {statusText}
          </p>
          {shownAgent?.roleLabel ? (
            <p className="mt-2 max-w-sm text-xs font-semibold leading-snug text-zinc-600">
              <span className="font-extrabold text-zinc-900">
                {shownAgent.roleLabel}
              </span>
              {shownAgent.modelLabel ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{shownAgent.modelLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="mt-3 text-xs font-semibold text-zinc-500">
            {footerHint}
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600 transition-[width] duration-700 ease-out"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <ol className="mt-5 w-full space-y-1.5 text-left text-xs font-semibold text-zinc-500">
            {steps.map((label, index) => (
              <li
                key={label}
                className={
                  index < stepIndex
                    ? "text-orange-800"
                    : index === stepIndex
                      ? "font-extrabold text-zinc-950"
                      : "text-zinc-400"
                }
              >
                {index < stepIndex ? "✓" : index === stepIndex ? "→" : "·"}{" "}
                {label.replace(/ …$/, "")}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  );
}
