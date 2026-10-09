"use client";

/**
 * Pipeline maturity card: Logik + craft knobs + Gesamt.
 * Dimension + Gesamt (stage Verbessern): Analysieren → Dialog → Einarbeiten.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import {
  romanPipelineDimensionAnalyzeAction,
  romanPipelineDimensionApplyAction,
  romanPipelineDimensionDiscardAction,
  romanPipelineStageVerbessernAnalyzeAction,
  romanPipelineStageVerbessernApplyAction,
  romanPipelineStageVerbessernDiscardAction,
  romanReifegradAssessAction,
} from "@/app/actions/roman-pipeline";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import {
  RomanSceneWaitDialog,
  waitModelLabelForRole,
} from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import { ROMAN_ASSIST_MODEL_SLUG } from "@/lib/roman/assist-model";
import type { RomanReifegradImprovePlan } from "@/lib/roman/editorial";
import {
  STAGE_VERBESSERN_DIMENSION,
  STAGE_VERBESSERN_FOCUS_LABELS,
  actionableAenderungsPrompts,
  aenderungsPromptsNeedingDecision,
  formatDialogProsa,
  missingAutorEntscheidungen,
  onlyNiceToHavePrompts,
  reifegradImprovePlansForStage,
  stageImproveForStage,
  type StageVerbessernFocus,
} from "@/lib/roman/editorial";
import {
  KritikWichtigkeitBadge,
  NiceToHaveOnlyBanner,
} from "@/components/features/admin/roman-kritik-wichtigkeit";
import {
  dimensionLabel,
  improveDimensionsForAssessKey,
  pctForDimension,
  pipelineStageForAssessKey,
  statusForDimension,
  REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG,
  type ReifegradDimension,
  type ReifegradDimensionDef,
} from "@/lib/roman/reifegrad-craft";
import {
  REIFEGRAD_ERFUELLUNG_LABEL,
  REIFEGRAD_FREIGABE_LABEL,
  type ReifegradAssessKey,
  type StageReifegrad,
} from "@/lib/roman/reifegrad-model";
import { PIPELINE_STAGE_LABELS } from "@/lib/roman/pipeline/stages";

const ASSESS_STAGE_LABELS: Record<ReifegradAssessKey, string> = {
  ...PIPELINE_STAGE_LABELS,
  roman: "Roman",
};
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

type KnobAccent =
  | "emerald"
  | "sky"
  | "amber"
  | "violet"
  | "rose"
  | "teal"
  | "orange";

const ACCENTS: KnobAccent[] = [
  "sky",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
];

function Knob({
  pct,
  label,
  status,
  accent,
  size = "sm",
  action,
  pendingBadge,
  hint,
}: {
  pct: number;
  label: string;
  status: string;
  accent: KnobAccent;
  size?: "sm" | "lg";
  action?: ReactNode;
  /** Amber = Pflichtpunkte offen; emerald = Analyse ok, nichts einzuarbeiten. */
  pendingBadge?: false | "amber" | "emerald";
  /** Author-facing explanation shown on hover. */
  hint?: string;
}) {
  const isLg = size === "lg";
  const r = isLg ? 34 : 20;
  const view = isLg ? 80 : 52;
  const cx = view / 2;
  const strokeW = isLg ? 7 : 5;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - filled / 100);
  const stroke =
    accent === "emerald"
      ? "stroke-emerald-500/80"
      : accent === "sky"
        ? "stroke-sky-500/75"
        : accent === "amber"
          ? "stroke-amber-500/80"
          : accent === "violet"
            ? "stroke-violet-500/75"
            : accent === "rose"
              ? "stroke-rose-500/75"
              : accent === "teal"
                ? "stroke-teal-500/75"
                : "stroke-orange-600";

  return (
    <div
      className="group relative flex h-full flex-col items-center text-center"
      aria-label={hint ? `${label}: ${hint}` : label}
    >
      {hint ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%-0.25rem)] left-1/2 z-30 w-56 -translate-x-1/2 rounded-2xl bg-zinc-950 px-3 py-2 text-left text-[11px] font-semibold leading-snug text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:w-64"
        >
          <p className="text-[10px] font-extrabold tracking-wide text-zinc-400 uppercase">
            {label}
          </p>
          <p className="mt-1">{hint}</p>
        </div>
      ) : null}
      <div className={cn("relative", isLg ? "size-[4.75rem]" : "size-12")}>
        <svg
          viewBox={`0 0 ${view} ${view}`}
          className="size-full -rotate-90"
          aria-hidden
        >
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            className="stroke-zinc-200"
            strokeWidth={strokeW}
          />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            className={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "font-extrabold tabular-nums text-zinc-950",
              isLg ? "text-lg" : "text-xs",
            )}
          >
            {filled}%
          </span>
        </div>
        {pendingBadge ? (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
              pendingBadge === "emerald" ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 font-extrabold tracking-wide text-zinc-500 uppercase",
          isLg ? "text-[11px]" : "min-h-[2.5em] text-[9px] leading-tight",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-bold text-zinc-800",
          isLg ? "text-sm" : "min-h-[1.25rem] text-[11px]",
        )}
      >
        {status}
      </p>
      {action ? <div className="mt-auto pt-1.5">{action}</div> : null}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RomanReifegradCard({
  value,
  romanId,
  stage,
  canSave,
  disabled,
  improvePlans,
  stageImprovePlan,
  onComplete,
  className,
}: {
  value: StageReifegrad | null | undefined;
  romanId: string;
  stage: ReifegradAssessKey;
  canSave: boolean;
  disabled?: boolean;
  /** Open analyze plans for this stage, keyed by dimension. */
  improvePlans?: Record<string, RomanReifegradImprovePlan> | null;
  /** Stage-wide Verbessern plan (Gesamt-Knob → Analysieren). */
  stageImprovePlan?: RomanReifegradImprovePlan | null;
  onComplete?: (roman: RomanKontext) => void;
  className?: string;
}) {
  const [pending, setPending] = useState<
    "analyze" | "apply" | "discard" | "assess" | null
  >(null);
  const [pendingDim, setPendingDim] = useState<ReifegradDimension | null>(
    null,
  );
  const [pendingGesamt, setPendingGesamt] = useState(false);
  const [pendingFocus, setPendingFocus] =
    useState<StageVerbessernFocus>("gesamt");
  const isRomanAssess = stage === "roman";
  const showFocusPresets =
    !isRomanAssess &&
    (stage === "manuskript" ||
      stage === "szenenplot" ||
      stage === "expose");
  const showGesamtKnob = !isRomanAssess;

  function focusFromPlan(
    plan: RomanReifegradImprovePlan | null,
  ): StageVerbessernFocus {
    const label = plan?.dimensionLabel ?? "";
    if (label === STAGE_VERBESSERN_FOCUS_LABELS.logik) return "logik";
    if (label === STAGE_VERBESSERN_FOCUS_LABELS.craft) return "craft";
    return "gesamt";
  }
  const [localPlans, setLocalPlans] = useState<
    Record<string, RomanReifegradImprovePlan>
  >(() => improvePlans ?? {});
  const [localStagePlan, setLocalStagePlan] =
    useState<RomanReifegradImprovePlan | null>(stageImprovePlan ?? null);
  const [dialogPlan, setDialogPlan] =
    useState<RomanReifegradImprovePlan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [autorEntscheidungen, setAutorEntscheidungen] = useState<
    Record<number, string>
  >({});
  const [agentInfo, setAgentInfo] = useState<{
    roleLabel: string;
    modelLabel: string;
  } | null>(null);
  const busy = Boolean(disabled || pending);
  const dims = improveDimensionsForAssessKey(stage);
  const isStagePlan = (plan: RomanReifegradImprovePlan | null) =>
    plan?.dimension === STAGE_VERBESSERN_DIMENSION;

  const [syncedImprovePlans, setSyncedImprovePlans] = useState(improvePlans);
  if (improvePlans !== syncedImprovePlans) {
    setSyncedImprovePlans(improvePlans);
    setLocalPlans(improvePlans ?? {});
  }

  const [syncedStagePlan, setSyncedStagePlan] = useState(stageImprovePlan);
  if (stageImprovePlan !== syncedStagePlan) {
    setSyncedStagePlan(stageImprovePlan);
    setLocalStagePlan(stageImprovePlan ?? null);
  }

  const structureStage =
    stage === "kapitelgeruest" || stage === "szenenplot";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadRomanKiRollenAction();
      if (cancelled || !result.success) return;
      const byKey = new Map(result.data!.rollen.map((r) => [r.key, r]));
      const lektor = byKey.get("entwicklungslektor");
      const co = byKey.get("co_autor");
      if (!lektor && !co) return;
      const flashLabel =
        findWiredAiEndpoint(ROMAN_ASSIST_MODEL_SLUG)?.label ??
        ROMAN_ASSIST_MODEL_SLUG;
      const analyzeLabel =
        findWiredAiEndpoint(REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG)?.label ??
        REIFEGRAD_DIMENSION_ANALYZE_MODEL_SLUG;

      // Gerüst/Plot: Lektor + Flash (structured patch).
      if (structureStage) {
        setAgentInfo({
          roleLabel: lektor?.label ?? "Entwicklungslektor",
          modelLabel: flashLabel,
        });
        return;
      }

      // Alle Stufen außer Manuskript/Roman: Analyse + Einarbeiten = Entwicklungslektor.
      // Manuskript: Analyse Lektor, Einarbeiten Co-Autor. Roman: Einarbeiten Autor.
      if (pending === "apply" && stage === "roman") {
        const autor = byKey.get("autor");
        setAgentInfo({
          roleLabel: autor?.label ?? "Autor",
          modelLabel: waitModelLabelForRole(
            autor?.key ?? "autor",
            autor?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
            { allowProseModel: true },
          ),
        });
        return;
      }
      if (pending === "apply" && stage === "manuskript") {
        setAgentInfo({
          roleLabel: co?.label ?? "Co-Autor",
          modelLabel: waitModelLabelForRole(
            co?.key ?? "co_autor",
            co?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
            { allowProseModel: true },
          ),
        });
        return;
      }
      setAgentInfo({
        roleLabel: lektor?.label ?? "Entwicklungslektor",
        modelLabel:
          pending === "apply"
            ? waitModelLabelForRole(
                lektor?.key ?? "entwicklungslektor",
                lektor?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
              )
            : analyzeLabel,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [structureStage, stage, pending]);

  async function assessRoman() {
    if (!canSave || busy || !isRomanAssess) return;
    setPending("assess");
    try {
      const result = await romanReifegradAssessAction({
        romanId,
        stage: "roman",
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Reifegrad-Messung fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } finally {
      setPending(null);
    }
  }

  async function analyzeDimension(def: ReifegradDimensionDef) {
    if (!canSave || busy) return;
    setPending("analyze");
    setPendingDim(def.key);
    try {
      const result = await romanPipelineDimensionAnalyzeAction({
        romanId,
        stage,
        dimension: def.key,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Dimensions-Analyse fehlgeschlagen.");
        return;
      }
      const plan = result.data.plan;
      setLocalPlans((prev) => ({ ...prev, [plan.dimension]: plan }));
      onComplete?.(result.data.roman);
      setAutorEntscheidungen({});
      setDialogPlan(plan);
      setDialogOpen(true);
      toast.success(result.data.summary);
    } finally {
      setPending(null);
      setPendingDim(null);
    }
  }

  async function analyzeGesamt(focus: StageVerbessernFocus = "gesamt") {
    if (!canSave || busy) return;
    setPending("analyze");
    setPendingGesamt(true);
    setPendingFocus(focus);
    try {
      const result = await romanPipelineStageVerbessernAnalyzeAction({
        romanId,
        stage,
        focus,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Analyse fehlgeschlagen.");
        return;
      }
      setLocalStagePlan(result.data.plan);
      onComplete?.(result.data.roman);
      setAutorEntscheidungen({});
      setDialogPlan(result.data.plan);
      setDialogOpen(true);
      toast.success(result.data.summary);
    } finally {
      setPending(null);
      setPendingGesamt(false);
    }
  }

  async function applyPlan(entscheidungen: Record<number, string>) {
    if (!canSave || busy || !dialogPlan) return;
    setPending("apply");
    try {
      if (isStagePlan(dialogPlan)) {
        const result = await romanPipelineStageVerbessernApplyAction({
          romanId,
          stage,
          autorEntscheidungen: Object.fromEntries(
            Object.entries(entscheidungen).map(([k, v]) => [String(k), v]),
          ),
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Einarbeiten fehlgeschlagen.");
          return;
        }
        onComplete?.(result.data.roman);
        const next = stageImproveForStage(result.data.roman.editorial, stage);
        setLocalStagePlan(next);
        setDialogPlan(next);
        setAutorEntscheidungen({});
        toast.success(result.data.summary);
        return;
      }

      const result = await romanPipelineDimensionApplyAction({
        romanId,
        stage,
        dimension: dialogPlan.dimension as ReifegradDimension,
        autorEntscheidungen: Object.fromEntries(
          Object.entries(entscheidungen).map(([k, v]) => [String(k), v]),
        ),
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Einarbeiten fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      const next = reifegradImprovePlansForStage(
        result.data.roman.editorial?.reifegradImprove,
        stage,
      );
      setLocalPlans(next);
      setDialogPlan(next[dialogPlan.dimension] ?? null);
      setAutorEntscheidungen({});
      toast.success(result.data.summary);
    } finally {
      setPending(null);
    }
  }

  async function discardPlan() {
    if (!canSave || busy || !dialogPlan) return;
    setPending("discard");
    try {
      if (isStagePlan(dialogPlan)) {
        const result = await romanPipelineStageVerbessernDiscardAction({
          romanId,
          stage,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Plan verwerfen fehlgeschlagen.");
          return;
        }
        onComplete?.(result.data.roman);
        setLocalStagePlan(null);
        setDiscardConfirmOpen(false);
        setDialogOpen(false);
        setDialogPlan(null);
        toast.success(result.data.summary);
        return;
      }

      const result = await romanPipelineDimensionDiscardAction({
        romanId,
        stage,
        dimension: dialogPlan.dimension as ReifegradDimension,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Plan verwerfen fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      const next = reifegradImprovePlansForStage(
        result.data.roman.editorial?.reifegradImprove,
        stage,
      );
      setLocalPlans(next);
      setDiscardConfirmOpen(false);
      setDialogOpen(false);
      setDialogPlan(null);
      toast.success(result.data.summary);
    } finally {
      setPending(null);
    }
  }

  function openExistingPlan(def: ReifegradDimensionDef) {
    const existing = localPlans[def.key];
    if (existing && !existing.appliedAt) {
      setAutorEntscheidungen({});
      setDialogPlan(existing);
      setDialogOpen(true);
      return;
    }
    void analyzeDimension(def);
  }

  function openGesamtPlan(focus: StageVerbessernFocus = "gesamt") {
    if (
      localStagePlan &&
      !localStagePlan.appliedAt &&
      focusFromPlan(localStagePlan) === focus
    ) {
      setAutorEntscheidungen({});
      setDialogPlan(localStagePlan);
      setDialogOpen(true);
      return;
    }
    void analyzeGesamt(focus);
  }

  const stageHasPlan = Boolean(localStagePlan && !localStagePlan.appliedAt);
  const stagePlanClear =
    stageHasPlan &&
    localStagePlan != null &&
    actionableAenderungsPrompts(localStagePlan.aenderungsPrompts).length === 0;

  return (
    <section
      className={cn(
        "overflow-visible rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6",
        className,
      )}
    >
      <RomanSceneWaitDialog
        open={pending === "analyze" || pending === "apply"}
        variant="pipeline-critique"
        contextLabel={
          pending === "apply"
            ? `${ASSESS_STAGE_LABELS[stage]} · Einarbeiten`
            : `${ASSESS_STAGE_LABELS[stage]} · Analyse`
        }
        title={
          pending === "apply"
            ? `Einarbeiten · ${
                dialogPlan?.dimensionLabel ??
                (pendingGesamt
                  ? STAGE_VERBESSERN_FOCUS_LABELS[pendingFocus]
                  : pendingDim
                    ? dimensionLabel(
                        pipelineStageForAssessKey(stage),
                        pendingDim,
                      )
                    : "Aufträge")
              }`
            : pendingGesamt
              ? `Analyse · ${STAGE_VERBESSERN_FOCUS_LABELS[pendingFocus]}`
              : pendingDim
                ? `Analyse · ${dimensionLabel(pipelineStageForAssessKey(stage), pendingDim)}`
                : "Analyse"
        }
        footer={
          structureStage
            ? pending === "apply"
              ? "Nur Einarbeiten: Struktur patchen (+ Wissensgraph), danach neuer Reifegrad. Tab offen lassen."
              : "Nur Analyse: Struktur prüfen und Aufträge verdichten — Text noch unverändert. Tab offen lassen."
            : stage === "roman"
              ? pending === "apply"
                ? "Nur Einarbeiten: Autor (content-frozen Stil/Lesefluss), danach neuer Reifegrad. Tab offen lassen."
                : "Nur Analyse: Entwicklungslektor — Roman-Prosa noch unverändert. Tab offen lassen."
              : stage === "manuskript"
                ? pending === "apply"
                  ? "Nur Einarbeiten: Co-Autor (Prosa + Continuity/Graph), danach neuer Reifegrad. Tab offen lassen."
                  : "Nur Analyse: Entwicklungslektor — Prosa noch unverändert. Tab offen lassen."
                : pending === "apply"
                  ? "Nur Einarbeiten: Entwicklungslektor, danach neuer Reifegrad. Tab offen lassen."
                  : "Nur Analyse: Entwicklungslektor — Text noch unverändert. Tab offen lassen."
        }
        progressLabel={
          pending === "analyze" && pendingGesamt
            ? `${STAGE_VERBESSERN_FOCUS_LABELS[pendingFocus]}: ${
                stage === "kapitelgeruest"
                  ? "Entwicklungslektor prüft Gerüst-Struktur …"
                  : stage === "szenenplot"
                    ? "Entwicklungslektor prüft Szenenverträge …"
                    : stage === "expose"
                      ? "Entwicklungslektor prüft Spec-Tragfähigkeit …"
                      : "Entwicklungslektor analysiert …"
              }`
            : pending === "analyze" && pendingDim
              ? `${dimensionLabel(pipelineStageForAssessKey(stage), pendingDim)}: ${
                  stage === "kapitelgeruest"
                    ? "Entwicklungslektor prüft Gerüst-Struktur …"
                    : stage === "szenenplot"
                      ? "Entwicklungslektor prüft Szenenverträge …"
                      : "Entwicklungslektor analysiert …"
                }`
              : pending === "apply"
                ? `${dialogPlan?.dimensionLabel ?? "Analyse"}: ${
                    stage === "kapitelgeruest"
                      ? "Entwicklungslektor patcht Gerüst-Struktur (+ Wissensgraph) …"
                      : stage === "szenenplot"
                        ? "Entwicklungslektor patcht Szenenverträge (+ Wissensgraph) …"
                        : stage === "manuskript"
                          ? "Co-Autor arbeitet Prosa ein (+ Continuity/Graph) …"
                          : stage === "roman"
                            ? "Autor arbeitet Stil/Lesefluss ein (content frozen) …"
                            : stage === "expose"
                              ? "Entwicklungslektor arbeitet Spec ein (Figuren/Welt/Exposé) …"
                              : "Entwicklungslektor arbeitet Aufträge ein …"
                  }`
                : null
        }
        agentInfo={agentInfo}
      />

      {dialogOpen && dialogPlan ? (
        <ReifegradImproveDialog
          plan={dialogPlan}
          stage={stage}
          pending={pending === "assess" ? null : pending}
          autorEntscheidungen={autorEntscheidungen}
          onAutorEntscheidungChange={(index, value) => {
            setAutorEntscheidungen((prev) => ({ ...prev, [index]: value }));
          }}
          onClose={() => {
            if (!busy) {
              setDiscardConfirmOpen(false);
              setDialogOpen(false);
            }
          }}
          onReanalyze={() => {
            if (isStagePlan(dialogPlan)) {
              void analyzeGesamt(focusFromPlan(dialogPlan));
              return;
            }
            const def = dims.find((d) => d.key === dialogPlan.dimension);
            if (def) void analyzeDimension(def);
          }}
          onApply={() => void applyPlan(autorEntscheidungen)}
          onDiscardRequest={() => setDiscardConfirmOpen(true)}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={discardConfirmOpen && dialogPlan != null}
        title="Plan verwerfen?"
        description={
          isStagePlan(dialogPlan)
            ? `Der offene Gesamt-Plan wird gelöscht. Kritik und Änderungsaufträge gehen verloren. Dimensions-Pläne bleiben. Das Buch selbst bleibt unverändert.`
            : `Der offene Plan für „${dialogPlan?.dimensionLabel ?? "diese Dimension"}“ wird gelöscht. Kritik und Änderungsaufträge gehen verloren. Andere Dimensions-Pläne bleiben. Das Buch selbst bleibt unverändert.`
        }
        confirmLabel="Plan verwerfen"
        pending={pending === "discard"}
        onCancel={() => {
          if (pending !== "discard") setDiscardConfirmOpen(false);
        }}
        onConfirm={() => void discardPlan()}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-extrabold text-zinc-950">
          {isRomanAssess ? "Roman-Reifegrad" : "Reifegrad"}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {isRomanAssess ? (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void assessRoman()}
              className="rounded-full bg-sky-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-900 disabled:opacity-50"
            >
              {pending === "assess" ? "Misst …" : "Reifegrad messen"}
            </button>
          ) : null}
          {value ? (
            <p className="text-xs font-semibold text-zinc-500">
              geprüft {new Date(value.assessedAt).toLocaleString("de-DE")}
              {value.modelLabel ? ` · ${value.modelLabel}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {!value ? (
        <p className="mt-3 text-sm font-semibold text-zinc-600">
          {isRomanAssess
            ? "Noch nicht bewertet — „Reifegrad messen“ oder nach Verbessern automatisch. Dann Stil/Lesefluss analysieren und content-frozen einarbeiten."
            : stage === "kapitelgeruest"
              ? "Noch nicht bewertet — erscheint nach „Erzeugen“. Danach Gesamt oder Dimensionen: Analyse prüft Arcs/Lifecycle, Einarbeiten patcht die Gerüst-Struktur."
              : stage === "szenenplot"
                ? "Noch nicht bewertet — erscheint nach „Erzeugen“. Danach „Nur Logik“ / „Nur Craft“ / „Gesamt“ oder Einzeldimensionen: Analyse an Szenenverträgen, Einarbeiten patcht die Struktur."
                : "Noch nicht bewertet — erscheint automatisch nach „Erzeugen“ und nach Analyse/Einarbeiten. Danach Gesamt oder einzelne Dimensionen analysieren und gezielt einarbeiten."}
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center justify-center">
            <div
              className={cn(
                "grid w-full items-stretch gap-x-3 gap-y-4 sm:gap-x-2",
                dims.length <= 2
                  ? "grid-cols-2 sm:grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-4",
              )}
            >
              {dims.map((def, i) => {
                const active = pendingDim === def.key;
                const plan = localPlans[def.key] ?? null;
                const hasPlan = Boolean(plan && !plan.appliedAt);
                const planClear =
                  hasPlan &&
                  plan != null &&
                  actionableAenderungsPrompts(plan.aenderungsPrompts)
                    .length === 0;
                return (
                  <Knob
                    key={def.key}
                    pct={pctForDimension(value, def)}
                    label={def.label}
                    hint={def.hint}
                    status={
                      REIFEGRAD_ERFUELLUNG_LABEL[statusForDimension(value, def)]
                    }
                    accent={ACCENTS[i] ?? "sky"}
                    pendingBadge={
                      hasPlan ? (planClear ? "emerald" : "amber") : false
                    }
                    action={
                      <button
                        type="button"
                        disabled={!canSave || busy}
                        onClick={() => openExistingPlan(def)}
                        className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {active
                          ? "Läuft …"
                          : hasPlan
                            ? "Plan öffnen"
                            : "Analysieren"}
                      </button>
                    }
                  />
                );
              })}
            </div>
          </div>

          {showGesamtKnob ? (
            <>
          <div
            className="hidden w-px self-stretch bg-zinc-200 sm:block"
            aria-hidden
          />
          <div className="h-px w-full bg-zinc-200 sm:hidden" aria-hidden />

          <div className="flex shrink-0 flex-col items-center justify-center gap-2 px-2 sm:min-w-[7.5rem]">
            <Knob
              pct={value.gesamtPct}
              label="Gesamt"
              hint={
                stage === "szenenplot"
                  ? "Mittelwert. „Nur Logik“ = Continuity/Info-Fluss/Lifecycle. „Nur Craft“ = Konkretheit/Spannung/schreibPrompt. „Gesamt“ mischt beides (Härteste zuerst)."
                  : stage === "expose"
                    ? "Mittelwert. Prüft Roman-Tragfähigkeit: reicht Spec für einen ganzen Roman? „Nur Logik“ = Canon Figuren↔Welt↔Exposé. „Nur Craft“ = Mehrakt-Stoff/Escalation/Bogen. „Gesamt“ mischt beides."
                    : showFocusPresets
                      ? "Mittelwert. Für 1–2 Läufe: zuerst „Nur Logik“, dann „Nur Craft“. „Gesamt“ mischt beides."
                      : stage === "kapitelgeruest"
                        ? "Mittelwert. „Analysieren“ = Aufträge an Arcs, Kapitel-Lifecycle und Gerüst-Felder."
                        : "Mittelwert der vier Dimensionen. „Analysieren“ = stufenweite Änderungsaufträge."
              }
              status={REIFEGRAD_FREIGABE_LABEL[value.freigabe]}
              accent="orange"
              pendingBadge={
                stageHasPlan ? (stagePlanClear ? "emerald" : "amber") : false
              }
              action={
                showFocusPresets ? (
                  <div className="flex max-w-[11rem] flex-wrap justify-center gap-1">
                    {(
                      ["logik", "craft", "gesamt"] as StageVerbessernFocus[]
                    ).map((focus) => {
                      const planMatches =
                        stageHasPlan &&
                        focusFromPlan(localStagePlan) === focus;
                      return (
                        <button
                          key={focus}
                          type="button"
                          disabled={!canSave || busy}
                          onClick={() => openGesamtPlan(focus)}
                          className="rounded-full bg-zinc-900 px-2 py-1 text-[9px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                          title={STAGE_VERBESSERN_FOCUS_LABELS[focus]}
                        >
                          {pendingGesamt && pendingFocus === focus
                            ? "…"
                            : planMatches
                              ? "Plan"
                              : STAGE_VERBESSERN_FOCUS_LABELS[focus]}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canSave || busy}
                    onClick={() => openGesamtPlan("gesamt")}
                    className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {pendingGesamt
                      ? "Läuft …"
                      : stageHasPlan
                        ? "Plan öffnen"
                        : "Analysieren"}
                  </button>
                )
              }
            />
          </div>
            </>
          ) : (
            <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-2 sm:min-w-[6rem]">
              <p className="text-2xl font-extrabold text-zinc-950">
                {value.gesamtPct}%
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Gesamt
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Kritik + Änderungsaufträge dialog (Reifegrad / Clever Verbessern).
 * Autor-Entscheidungen are off by default — Analyse picks the patch path.
 */
function improveDialogSubtitle(stage?: ReifegradAssessKey): string {
  if (stage === "roman") {
    return "Analyse an der Roman-Prosa. Einarbeiten bleibt content-frozen (Stil/Lesefluss) und schreibt nur den Roman-Tab.";
  }
  if (stage === "kapitelgeruest") {
    return "Analyse am Gerüst (Arcs, Kapitel-Lifecycle). Einarbeiten patcht die Strukturfelder und aktualisiert die Anzeige.";
  }
  if (stage === "szenenplot") {
    return "Analyse an den Szenenverträgen. Einarbeiten patcht Dramaturgie/Continuity/schreibPrompt und aktualisiert die Anzeige.";
  }
  if (stage === "expose") {
    return "Spec-Analyse inkl. Roman-Tragfähigkeit. Einarbeiten durch Entwicklungslektor (Figuren/Welt/Exposé).";
  }
  if (stage === "manuskript") {
    return "Analyse durch Entwicklungslektor. Einarbeiten durch Co-Autor (Prosa + Continuity/Graph).";
  }
  return "Analyse und Einarbeiten durch Entwicklungslektor (außer Manuskript-Prosa = Co-Autor).";
}

function improveApplyActor(stage?: ReifegradAssessKey): string {
  if (stage === "roman") return "Autor";
  if (stage === "manuskript") return "Co-Autor";
  return "Entwicklungslektor";
}

export function ReifegradImproveDialog({
  plan,
  stage,
  pending,
  autorEntscheidungen,
  onAutorEntscheidungChange,
  onClose,
  onReanalyze,
  onApply,
  onDiscardRequest,
  hideAutorEntscheidungen = true,
  /** Clever: „Fertig“ marks chapter OK instead of discarding the plan. */
  fertigInsteadOfDiscard = false,
  onFertig,
}: {
  plan: RomanReifegradImprovePlan;
  /** When set, subtitle and decision copy match Gerüst / Plot / Manuskript. */
  stage?: ReifegradAssessKey;
  pending: "analyze" | "apply" | "discard" | "fertig" | null;
  autorEntscheidungen: Record<number, string>;
  onAutorEntscheidungChange: (index: number, value: string) => void;
  onClose: () => void;
  onReanalyze: () => void;
  onApply: () => void;
  onDiscardRequest: () => void;
  /** Hide „Deine Entscheidung“ (default on — Lektor entscheidet selbst). */
  hideAutorEntscheidungen?: boolean;
  fertigInsteadOfDiscard?: boolean;
  onFertig?: () => void;
}) {
  const busy = pending != null;
  const applyActor = improveApplyActor(stage);
  const onlyNice = onlyNiceToHavePrompts(plan.aenderungsPrompts);
  const decisionRows = hideAutorEntscheidungen
    ? []
    : aenderungsPromptsNeedingDecision(plan.aenderungsPrompts);
  const needsDecisionAt = new Set(decisionRows.map((r) => r.index));
  const decisionsMissing =
    !hideAutorEntscheidungen &&
    missingAutorEntscheidungen(
      plan.aenderungsPrompts,
      autorEntscheidungen,
    ).length > 0;
  const canApply =
    !plan.appliedAt &&
    actionableAenderungsPrompts(plan.aenderungsPrompts).length > 0 &&
    !decisionsMissing;
  const canSecondary = !plan.appliedAt || fertigInsteadOfDiscard;
  const applyLabel = plan.appliedAt
    ? "Bereits eingearbeitet"
    : decisionsMissing
      ? "Entscheidung fehlt"
      : actionableAenderungsPrompts(plan.aenderungsPrompts).length === 0
        ? onlyNice
          ? "Nur Nice-to-have"
          : "Nichts einzuarbeiten"
        : "Einarbeiten";

  useEffect(() => {
    return lockBodyScroll();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reifegrad-improve-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reifegrad-improve-title"
              className="text-xl font-extrabold text-zinc-950"
            >
              Analyse · {plan.dimensionLabel}
            </h2>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {formatWhen(plan.createdAt)}
              {plan.modelLabel ? ` · ${plan.modelLabel}` : ""}
            </p>
            <p className="mt-1 text-xs font-semibold text-zinc-600">
              {improveDialogSubtitle(stage)}
            </p>
            {plan.appliedAt ? (
              <p className="mt-1 text-xs font-bold text-amber-800">
                Bereits eingearbeitet ({formatWhen(plan.appliedAt)}). Für eine
                frische Analyse erneut „Neu analysieren“.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-5 overflow-auto pr-1">
          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kritik
            </h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-800">
              {formatDialogProsa(plan.kritik)}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Änderungsaufträge
            </h3>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {fertigInsteadOfDiscard
                ? "Bis zu 3 Pflichtpunkte nach Wichtigkeit — einarbeiten oder mit Fertig als OK markieren."
                : stage === "kapitelgeruest"
                  ? "Bis zu 3 Pflichtpunkte (Arcs, Lifecycle, Props/Events) — prüfen, dann einarbeiten oder verwerfen."
                  : stage === "szenenplot"
                    ? "Bis zu 3 Pflichtpunkte (Szenen, Dramaturgie, Continuity) — prüfen, dann einarbeiten oder verwerfen."
                    : "Bis zu 3 Pflichtpunkte nach Wichtigkeit — prüfen, dann einarbeiten oder verwerfen."}
            </p>
            <div className="mt-2">
              <NiceToHaveOnlyBanner prompts={plan.aenderungsPrompts} />
            </div>
            {plan.aenderungsPrompts.length > 0 ? (
              <ul className="mt-2 space-y-3">
                {plan.aenderungsPrompts.map((p, i) => (
                  <li
                    key={`${i}-${p.titel.slice(0, 24)}`}
                    className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-zinc-950">
                        {p.titel}
                      </span>
                      <KritikWichtigkeitBadge
                        wichtigkeit={p.wichtigkeit ?? "wichtig"}
                      />
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1",
                          p.scope === "buchweit"
                            ? "bg-amber-50 text-amber-950 ring-amber-200"
                            : "bg-sky-50 text-sky-950 ring-sky-200",
                        )}
                      >
                        {p.scope === "buchweit"
                          ? "buchweit"
                          : p.kapitel.length > 0
                            ? `Kap. ${p.kapitel.join(", ")}`
                            : "lokal"}
                      </span>
                      {needsDecisionAt.has(i) ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-950 ring-1 ring-violet-200">
                          Entscheidung
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-zinc-800">
                      {p.anweisung}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {decisionRows.length > 0 && !plan.appliedAt ? (
            <section className="space-y-3 rounded-2xl bg-violet-50/80 px-4 py-3 ring-1 ring-violet-200">
              <h3 className="text-xs font-extrabold tracking-wide text-violet-900 uppercase">
                Deine Entscheidung
              </h3>
              <p className="text-xs font-semibold text-violet-900/80">
                Für diese Punkte braucht der {applyActor} vor dem Einarbeiten
                eine verbindliche Vorgabe — dann wird nur deine Variante
                eingearbeitet.
              </p>
              {decisionRows.map(({ index, prompt }) => (
                <label key={index} className="block">
                  <span className="mb-1.5 block text-sm font-extrabold text-zinc-950">
                    {prompt.titel}
                  </span>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-600">
                    {prompt.entscheidungFrage?.trim() ||
                      "Welche Variante soll gelten?"}
                  </span>
                  <textarea
                    value={autorEntscheidungen[index] ?? ""}
                    onChange={(e) =>
                      onAutorEntscheidungChange(index, e.target.value)
                    }
                    disabled={busy}
                    rows={3}
                    className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                    placeholder={`z. B. Variante A gilt — konkrete Vorgabe für den ${applyActor} …`}
                  />
                </label>
              ))}
            </section>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            {canSecondary ? (
              fertigInsteadOfDiscard ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onFertig?.()}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Check
                    className={cn(
                      "size-4",
                      pending === "fertig" && "animate-pulse",
                    )}
                    aria-hidden
                  />
                  {pending === "fertig" ? "Fertig …" : "Fertig"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDiscardRequest}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Plan verwerfen
                </button>
              )
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onReanalyze}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-4", pending === "analyze" && "animate-spin")}
                aria-hidden
              />
              {pending === "analyze" ? "Analysiert …" : "Neu analysieren"}
            </button>
            <button
              type="button"
              disabled={busy || !canApply}
              onClick={onApply}
              className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              <Wand2
                className={cn("size-4", pending === "apply" && "animate-spin")}
                aria-hidden
              />
              {pending === "apply" ? "Einarbeiten …" : applyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
