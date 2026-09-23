"use client";

/**
 * Per-chapter Manuskript controls: Erzeugen / Verbessern / Gegenlesen.
 * Roman: Continuity via Gerüst + Vorgänger (server-side); one-shot Verbessern.
 * Clever: independent Kurzgeschichten — Verbessern läuft automatisch
 * (Analyse → bei kritisch/wichtig einarbeiten → erneut, bis nur Nice-to-have
 * oder leer, dann Fertig). Dieselben Server-Actions und der Durchlauf-Zähler.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  romanCleverGeschichteAnalyzeAction,
  romanCleverGeschichteApplyAction,
  romanCleverGeschichteFertigAction,
  romanManuskriptChapterCritiqueAction,
  romanManuskriptChapterGenerateAction,
  romanManuskriptChapterImproveAction,
} from "@/app/actions/roman-manuskript-chapter";
import { ReifegradImproveDialog } from "@/components/features/admin/roman-reifegrad-card";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { hasRealCleverGeschichteProse } from "@/lib/roman/clever-geschichte";
import {
  actionableAenderungsPrompts,
  countWords,
  formatWordCount,
  type CleverUnterthemen,
  type RomanReifegradImprovePlan,
} from "@/lib/roman/editorial";
import {
  parsePlotChapters,
  sanitizeChapterTitle,
} from "@/lib/roman/plot-chapters";
import type { RomanKontext } from "@/lib/roman/types";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

type PendingKind =
  | "generate"
  | "improve"
  | "critique"
  | "analyze"
  | "apply"
  | "fertig"
  | null;

type CleverChapterStatus = {
  hasProse: boolean;
  hasInfografik: boolean;
};

function cleverStatusFor(
  chapterNumber: number,
  prose: string,
  unterthemen: CleverUnterthemen | null | undefined,
): CleverChapterStatus {
  const kap = unterthemen?.kapitel.find((k) => k.nummer === chapterNumber);
  return {
    hasProse: hasRealCleverGeschichteProse(prose),
    hasInfografik: Boolean(
      kap?.infografikDataUrl?.trim().startsWith("data:image/"),
    ),
  };
}

export function RomanManuskriptChapterControl({
  romanId,
  plotMarkdown,
  manuskriptMarkdown,
  canSave,
  disabled,
  onComplete,
  chapterNumber: controlledChapter,
  onChapterNumberChange,
  mode = "roman",
  cleverUnterthemen = null,
  cleverGeschichteImprove = null,
  cleverGeschichteImproveCount = null,
  cleverGeschichteOk = null,
}: {
  romanId: string;
  /** Kapitelgerüst / Unterthemen — source of chapter numbers/titles. */
  plotMarkdown: string;
  /** Current manuskript prose (may be empty slots). */
  manuskriptMarkdown: string;
  canSave: boolean;
  disabled?: boolean;
  onComplete?: (roman: RomanKontext) => void;
  /** Controlled selection (Clever: drives the single-story editor). */
  chapterNumber?: number;
  onChapterNumberChange?: (n: number) => void;
  /** Clever: independent Kurzgeschichten copy + labels. */
  mode?: "roman" | "clever";
  /** Clever: Infografik-Status in der Kapitelauswahl. */
  cleverUnterthemen?: CleverUnterthemen | null;
  /** Clever: pending Verbessern plans keyed by chapter number. */
  cleverGeschichteImprove?: Record<string, RomanReifegradImprovePlan> | null;
  /** Clever: applied Verbessern counts keyed by chapter number. */
  cleverGeschichteImproveCount?: Record<string, number> | null;
  /** Clever: chapters marked OK via Verbessern-Dialog „Fertig“. */
  cleverGeschichteOk?: Record<string, true> | null;
}) {
  const isClever = mode === "clever";
  const plotChapters = useMemo(
    () => parsePlotChapters(plotMarkdown),
    [plotMarkdown],
  );
  const msByNum = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of parsePlotChapters(manuskriptMarkdown)) {
      map.set(c.number, c.body);
    }
    return map;
  }, [manuskriptMarkdown]);

  const [internalChapter, setInternalChapter] = useState<number>(
    () => plotChapters[0]?.number ?? 1,
  );
  const chapterNumber = controlledChapter ?? internalChapter;
  const setChapterNumber = onChapterNumberChange ?? setInternalChapter;
  const chapterNumberRef = useRef(chapterNumber);
  chapterNumberRef.current = chapterNumber;

  const [pending, setPending] = useState<PendingKind>(null);
  const [critiqueDialog, setCritiqueDialog] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [localImprovePlans, setLocalImprovePlans] = useState<
    Record<string, RomanReifegradImprovePlan>
  >(() => cleverGeschichteImprove ?? {});
  const [localImproveCounts, setLocalImproveCounts] = useState<
    Record<string, number>
  >(() => cleverGeschichteImproveCount ?? {});
  const [localOk, setLocalOk] = useState<Record<string, true>>(
    () => cleverGeschichteOk ?? {},
  );
  const [dialogPlan, setDialogPlan] =
    useState<RomanReifegradImprovePlan | null>(null);
  const [dialogChapter, setDialogChapter] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** 1-based pass while Clever auto-improve is running. */
  const [autoPass, setAutoPass] = useState(0);

  useEffect(() => {
    setLocalImprovePlans(cleverGeschichteImprove ?? {});
  }, [cleverGeschichteImprove]);

  useEffect(() => {
    setLocalImproveCounts(cleverGeschichteImproveCount ?? {});
  }, [cleverGeschichteImproveCount]);

  useEffect(() => {
    setLocalOk(cleverGeschichteOk ?? {});
  }, [cleverGeschichteOk]);

  useEffect(() => {
    setDialogOpen(false);
    setDialogPlan(null);
    setDialogChapter(null);
  }, [chapterNumber]);

  useEffect(() => {
    if (plotChapters.length === 0) return;
    if (!plotChapters.some((c) => c.number === chapterNumber)) {
      setChapterNumber(plotChapters[0]!.number);
    }
  }, [plotChapters, chapterNumber, setChapterNumber]);

  const selected = plotChapters.find((c) => c.number === chapterNumber);
  const body = msByNum.get(chapterNumber) ?? "";
  const hasProse = isClever
    ? hasRealCleverGeschichteProse(body)
    : body.trim().length > 40;
  const words = countWords(body);
  const busy = Boolean(disabled || pending);

  const unitLabel = isClever ? "Kurzgeschichte" : "Kapitel";
  const unitLabelAccusative = isClever ? "Kurzgeschichte" : "Kapitel";

  const openPlan = localImprovePlans[String(chapterNumber)] ?? null;
  const hasOpenPlan = Boolean(openPlan && !openPlan.appliedAt);
  const storySelectedOk = Boolean(localOk[String(chapterNumber)]);
  const planClear =
    hasOpenPlan &&
    openPlan != null &&
    actionableAenderungsPrompts(openPlan.aenderungsPrompts).length === 0;

  async function runGenerate() {
    if (!canSave || busy || !selected) return;
    setPending("generate");
    try {
      const result = await romanManuskriptChapterGenerateAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(
          result.error ?? `${unitLabel} erzeugen fehlgeschlagen.`,
        );
        return;
      }
      if (isClever) {
        const key = String(chapterNumber);
        setLocalImprovePlans((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setLocalImproveCounts((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setLocalOk((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `${unitLabel} erzeugen fehlgeschlagen.`,
      );
    } finally {
      setPending(null);
    }
  }

  /** Roman one-shot Verbessern. */
  async function runImprove() {
    if (!canSave || busy || !selected) return;
    if (!hasProse) {
      toast.error("Kapitel hat noch keine Prosa — zuerst erzeugen.");
      return;
    }
    setPending("improve");
    try {
      const result = await romanManuskriptChapterImproveAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(
          result.error ?? `${unitLabel} verbessern fehlgeschlagen.`,
        );
        return;
      }
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `${unitLabel} verbessern fehlgeschlagen.`,
      );
    } finally {
      setPending(null);
    }
  }

  async function runCleverAnalyze() {
    if (!canSave || busy || !selected) return;
    if (!hasProse) {
      toast.error("Noch keine Geschichte — zuerst erzeugen.");
      return;
    }
    const targetChapter = chapterNumber;
    setPending("analyze");
    try {
      const result = await romanCleverGeschichteAnalyzeAction({
        romanId,
        chapterNumber: targetChapter,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Analyse fehlgeschlagen.");
        return;
      }
      const plan = result.data.plan;
      setLocalImprovePlans((prev) => ({
        ...prev,
        [String(targetChapter)]: plan,
      }));
      setLocalOk((prev) => {
        if (!prev[String(targetChapter)]) return prev;
        const next = { ...prev };
        delete next[String(targetChapter)];
        return next;
      });
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
      if (chapterNumberRef.current === targetChapter) {
        setDialogChapter(targetChapter);
        setDialogPlan(plan);
        setDialogOpen(true);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Analyse fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  function onCleverVerbessernClick() {
    void runCleverAutoImprove();
  }

  /**
   * Same actions as the dialog buttons: analyze, apply when kritisch/wichtig
   * remain, analyze again. Fertig when the plan is empty or only nice-to-have.
   */
  async function runCleverAutoImprove() {
    if (!canSave || busy || !selected) return;
    if (!hasProse) {
      toast.error("Noch keine Geschichte — zuerst erzeugen.");
      return;
    }
    if (localOk[String(chapterNumber)]) {
      toast.error(
        "Diese Kurzgeschichte ist schon fertig. Ein neuer Klick startet keine weitere Analyse.",
      );
      return;
    }
    const targetChapter = chapterNumber;
    const key = String(targetChapter);
    let plan: RomanReifegradImprovePlan | null =
      hasOpenPlan && openPlan ? openPlan : null;
    const maxPasses = 8;

    try {
      for (let pass = 1; pass <= maxPasses; pass += 1) {
        if (!plan || plan.appliedAt) {
          setAutoPass(pass);
          setPending("analyze");
          const analyzed = await romanCleverGeschichteAnalyzeAction({
            romanId,
            chapterNumber: targetChapter,
          });
          if (!analyzed.success || !analyzed.data) {
            toast.error(analyzed.error ?? "Analyse fehlgeschlagen.");
            return;
          }
          plan = analyzed.data.plan;
          setLocalImprovePlans((prev) => ({ ...prev, [key]: plan! }));
          setLocalOk((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          onComplete?.(analyzed.data.roman);
        }

        const needsApply =
          !plan.appliedAt &&
          actionableAenderungsPrompts(plan.aenderungsPrompts).length > 0;

        if (!needsApply) {
          setPending("fertig");
          const fertig = await romanCleverGeschichteFertigAction({
            romanId,
            chapterNumber: targetChapter,
          });
          if (!fertig.success || !fertig.data) {
            toast.error(fertig.error ?? "Fertig markieren fehlgeschlagen.");
            return;
          }
          onComplete?.(fertig.data.roman);
          setLocalImprovePlans((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setLocalOk((prev) => ({ ...prev, [key]: true }));
          setDialogPlan(null);
          setDialogChapter(null);
          setDialogOpen(false);
          toast.success(fertig.data.summary);
          return;
        }

        setAutoPass(pass);
        setPending("apply");
        const applied = await romanCleverGeschichteApplyAction({
          romanId,
          chapterNumber: targetChapter,
        });
        if (!applied.success || !applied.data) {
          toast.error(applied.error ?? "Einarbeiten fehlgeschlagen.");
          return;
        }
        onComplete?.(applied.data.roman);
        const stored =
          applied.data.roman.editorial?.cleverGeschichteImprove?.[key] ??
          null;
        const marked =
          stored ??
          ({ ...plan, appliedAt: new Date().toISOString() } satisfies RomanReifegradImprovePlan);
        setLocalImprovePlans((prev) => ({ ...prev, [key]: marked }));
        const nextCount =
          applied.data.roman.editorial?.cleverGeschichteImproveCount?.[key];
        setLocalImproveCounts((prev) => ({
          ...prev,
          [key]: nextCount ?? (prev[key] ?? 0) + 1,
        }));
        plan = null;
      }
      toast.error(
        "Nach mehreren Durchläufen sind noch wichtige Punkte offen. Bitte erneut verbessern.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Kurzgeschichte verbessern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
      setAutoPass(0);
    }
  }

  async function runCleverApply() {
    if (!canSave || busy || !dialogPlan || dialogChapter == null) return;
    setPending("apply");
    try {
      const result = await romanCleverGeschichteApplyAction({
        romanId,
        chapterNumber: dialogChapter,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Einarbeiten fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      const next =
        result.data.roman.editorial?.cleverGeschichteImprove?.[
          String(dialogChapter)
        ] ?? null;
      const marked =
        next ??
        (dialogPlan
          ? { ...dialogPlan, appliedAt: new Date().toISOString() }
          : null);
      if (marked) {
        setLocalImprovePlans((prev) => ({
          ...prev,
          [String(dialogChapter)]: marked,
        }));
      }
      const nextCount =
        result.data.roman.editorial?.cleverGeschichteImproveCount?.[
          String(dialogChapter)
        ];
      setLocalImproveCounts((prev) => ({
        ...prev,
        [String(dialogChapter)]:
          nextCount ?? (prev[String(dialogChapter)] ?? 0) + 1,
      }));
      setDialogPlan(null);
      setDialogChapter(null);
      setDialogOpen(false);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Einarbeiten fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runCleverFertig() {
    if (!canSave || busy || dialogChapter == null) return;
    setPending("fertig");
    try {
      const result = await romanCleverGeschichteFertigAction({
        romanId,
        chapterNumber: dialogChapter,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Fertig markieren fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
      setLocalImprovePlans((prev) => {
        const next = { ...prev };
        delete next[String(dialogChapter)];
        return next;
      });
      setLocalOk((prev) => ({
        ...prev,
        [String(dialogChapter)]: true,
      }));
      setDialogPlan(null);
      setDialogChapter(null);
      setDialogOpen(false);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fertig markieren fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runCritique() {
    if (!canSave || busy || !selected || isClever) return;
    if (!hasProse) {
      toast.error("Kapitel hat noch keine Prosa — zuerst erzeugen.");
      return;
    }
    setPending("critique");
    try {
      const result = await romanManuskriptChapterCritiqueAction({
        romanId,
        chapterNumber,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Gegenlesen fehlgeschlagen.");
        return;
      }
      toast.success(result.data.summary);
      setCritiqueDialog({
        title: `Gegenlese · Kapitel ${chapterNumber}`,
        body: result.data.critiqueText,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gegenlesen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  if (plotChapters.length === 0) {
    return null;
  }

  const waitVariant = isClever
    ? pending === "generate"
      ? ("clever-geschichte-generate" as const)
      : pending === "apply"
        ? ("clever-geschichte-improve-apply" as const)
        : ("clever-geschichte-improve-analyze" as const)
    : pending === "generate"
      ? ("manuskript-chapter-generate" as const)
      : pending === "improve"
        ? ("manuskript-chapter-improve" as const)
        : ("manuskript-chapter-critique" as const);

  const waitTitle = isClever
    ? pending === "generate"
      ? "Kurzgeschichte wird erzeugt"
      : pending === "apply"
        ? "Kurzgeschichte wird eingearbeitet"
        : pending === "analyze"
          ? "Kurzgeschichte wird analysiert"
          : null
    : null;

  const dialogPending =
    pending === "analyze" ||
    pending === "apply" ||
    pending === "fertig"
      ? pending
      : null;

  return (
    <div className="space-y-3 rounded-2xl bg-zinc-50 px-5 py-4 ring-1 ring-zinc-950/8">
      <RomanSceneWaitDialog
        open={
          pending === "generate" ||
          pending === "improve" ||
          pending === "critique" ||
          pending === "analyze" ||
          pending === "apply"
        }
        variant={waitVariant}
        title={waitTitle}
        footer={
          isClever
            ? "Eigenständige Kurzgeschichte — kein Fortsetzungsfaden. Tab offen lassen."
            : null
        }
        progressLabel={
          isClever && pending === "generate"
            ? "Eigenständige Geschichte aus Unterthema + Fakten …"
              : isClever && pending === "analyze"
              ? `Durchlauf ${autoPass || 1}: Leser prüft Kritik und Änderungsaufträge …`
              : isClever && pending === "apply"
                ? `Durchlauf ${autoPass || 1}: Erzähler arbeitet wichtige Punkte ein …`
                : null
        }
      />

      {critiqueDialog ? (
        <ChapterCritiqueDialog
          title={critiqueDialog.title}
          body={critiqueDialog.body}
          onClose={() => setCritiqueDialog(null)}
        />
      ) : null}

      {isClever && dialogOpen && dialogPlan ? (
        <ReifegradImproveDialog
          plan={dialogPlan}
          pending={dialogPending}
          autorEntscheidungen={{}}
          onAutorEntscheidungChange={() => {}}
          hideAutorEntscheidungen
          fertigInsteadOfDiscard
          onFertig={() => void runCleverFertig()}
          onClose={() => {
            if (dialogPending == null) setDialogOpen(false);
          }}
          onReanalyze={() => void runCleverAnalyze()}
          onApply={() => void runCleverApply()}
          onDiscardRequest={() => {}}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {isClever ? (
          <div className="w-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Kurzgeschichte wählen
              </span>
            </div>
            <div className="grid gap-2.5 p-1 sm:grid-cols-2">
              {plotChapters.map((c) => {
                const prose = msByNum.get(c.number) ?? "";
                const st = cleverStatusFor(
                  c.number,
                  prose,
                  cleverUnterthemen,
                );
                const selectedNow = c.number === chapterNumber;
                const title =
                  cleverUnterthemen?.kapitel.find((k) => k.nummer === c.number)
                    ?.titel?.trim() ||
                  sanitizeChapterTitle(c.title, c.number) ||
                  "ohne Titel";
                const doneCount =
                  (st.hasProse ? 1 : 0) + (st.hasInfografik ? 1 : 0);
                const storyPlan = localImprovePlans[String(c.number)] ?? null;
                const storyHasPlan = Boolean(storyPlan && !storyPlan.appliedAt);
                const storyOk = Boolean(localOk[String(c.number)]);
                const improveCount =
                  localImproveCounts[String(c.number)] ?? 0;
                return (
                  <button
                    key={c.number}
                    type="button"
                    disabled={busy}
                    onClick={() => setChapterNumber(c.number)}
                    className={cn(
                      "rounded-2xl border-2 px-3 py-2.5 text-left transition disabled:opacity-50",
                      storyOk && selectedNow
                        ? "border-emerald-600 bg-emerald-50"
                        : storyOk
                          ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100/70"
                          : selectedNow
                            ? "border-orange-700 bg-orange-50"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-zinc-950">
                        {c.number}. {title}
                      </p>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {storyOk ? (
                          <span
                            className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-emerald-900 uppercase"
                            title="Als OK markiert"
                          >
                            OK
                          </span>
                        ) : null}
                        {improveCount > 0 ? (
                          <span
                            className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500"
                            title={`${improveCount}× verbessert`}
                          >
                            {improveCount}×
                          </span>
                        ) : null}
                        {storyHasPlan ? (
                          <span
                            className="size-1.5 rounded-full bg-amber-500"
                            title="Offener Verbessern-Plan"
                            aria-label="Offener Verbessern-Plan"
                          />
                        ) : null}
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase",
                            doneCount === 2
                              ? "bg-emerald-100 text-emerald-900"
                              : doneCount === 0
                                ? "bg-zinc-100 text-zinc-500"
                                : "bg-amber-100 text-amber-950",
                          )}
                          title="Text + Infografik"
                        >
                          {doneCount}/2
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              {hasProse
                ? `Ausgewählt: ${formatWordCount(words)} Wörter`
                : "Ausgewählt: noch kein Text"}
            </p>
          </div>
        ) : (
          <>
            <label className="min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Einzelkapitel
              </span>
              <select
                value={chapterNumber}
                disabled={busy}
                onChange={(e) => setChapterNumber(Number(e.target.value))}
                className="w-full rounded-2xl bg-white px-3 py-2.5 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
              >
                {plotChapters.map((c) => {
                  const prose = (msByNum.get(c.number) ?? "").trim();
                  const mark = prose.length > 40 ? "· Text" : "· leer";
                  return (
                    <option key={c.number} value={c.number}>
                      Kap. {c.number} — {c.title || "ohne Titel"} {mark}
                    </option>
                  );
                })}
              </select>
            </label>
            <p className="pb-2.5 text-xs font-semibold text-zinc-500">
              {hasProse
                ? `${formatWordCount(words)} Wörter`
                : "Noch keine Prosa"}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => void runGenerate()}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {pending === "generate"
            ? "Erzeugen …"
            : hasProse
              ? `${unitLabelAccusative} neu erzeugen`
              : `${unitLabelAccusative} erzeugen`}
        </button>
        <button
          type="button"
          disabled={
            !canSave || busy || !hasProse || (isClever && storySelectedOk)
          }
          onClick={() =>
            isClever ? onCleverVerbessernClick() : void runImprove()
          }
          className="relative rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isClever && hasOpenPlan ? (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-zinc-50",
                planClear ? "bg-emerald-500" : "bg-amber-500",
              )}
              aria-hidden
            />
          ) : null}
          {pending === "apply"
            ? "Arbeitet ein …"
            : pending === "improve" || pending === "analyze"
            ? isClever
              ? "Analysiert …"
              : "Verbessern …"
            : isClever && storySelectedOk
              ? "Fertig"
              : `${unitLabelAccusative} verbessern`}
        </button>
        {!isClever ? (
          <button
            type="button"
            disabled={!canSave || busy || !hasProse}
            onClick={() => void runCritique()}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending === "critique"
              ? "Gegenlesen …"
              : `${unitLabelAccusative} gegenlesen`}
          </button>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-zinc-500">
        {isClever
          ? "Verbessern läuft automatisch: Kritik, dann Einarbeiten, bis nur noch Nice-to-have oder nichts übrig ist — dann Fertig. Darunter: Infografik, dann Abenteuer-Wissen — gleiche Reihenfolge wie im Export. Im Feld nur die ausgewählte Geschichte."
          : "Nutzt Kapitelgerüst-Beats und das Ende des Vorgängers, damit Einzelkapitel wie aus einem Guss wirken. Spätere Kapitel ggf. danach neu erzeugen."}
      </p>
    </div>
  );
}

function ChapterCritiqueDialog({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manuskript-chapter-critique-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="manuskript-chapter-critique-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          Nur Gegenlese — Speichern/Übernehmen läuft über Verbessern.
        </p>
        <pre className="mt-4 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/8">
          {body}
        </pre>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
