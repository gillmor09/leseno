"use client";

/**
 * Idee / Spec / Manuskript: Leser-Feedback button + dialog.
 * Opens last saved Testleser feedback; „Feedback einholen“ regenerates;
 * „Einarbeiten“: Spec/Idee → Entwicklungslektor; Manuskript → Co-Autor.
 * Analyse picks the patch path — no author decision fields before Einarbeiten.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MessageSquareText, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import {
  romanLeserFeedbackAction,
  romanLeserFeedbackApplyAction,
  romanLeserFeedbackDiscardAction,
} from "@/app/actions/roman-leser-feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  RomanSceneWaitDialog,
  waitModelLabelForRole,
  type WaitAgentInfo,
} from "@/components/features/admin/roman-scene-wait-dialog";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import { ROMAN_ASSIST_MODEL_SLUG } from "@/lib/roman/assist-model";
import type {
  LeserFeedbackStage,
  RomanAenderungsPrompt,
  RomanLeserFeedback,
  RomanLeserFeedbackStatus,
} from "@/lib/roman/editorial";
import {
  actionableAenderungsPrompts,
  formatDialogProsa,
  leserFeedbackForStage,
  onlyNiceToHavePrompts,
} from "@/lib/roman/editorial";
import {
  KritikWichtigkeitBadge,
  NiceToHaveOnlyBanner,
} from "@/components/features/admin/roman-kritik-wichtigkeit";
import { PIPELINE_STAGE_LABELS } from "@/lib/roman/pipeline/stages";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

const STATUS_LABEL: Record<RomanLeserFeedbackStatus, string> = {
  erfuellt: "Erfüllt",
  teilweise: "Teilweise",
  fehlt: "Fehlt",
};

function statusClass(status: RomanLeserFeedbackStatus): string {
  if (status === "erfuellt") return "bg-emerald-50 text-emerald-900 ring-emerald-200";
  if (status === "fehlt") return "bg-rose-50 text-rose-900 ring-rose-200";
  return "bg-amber-50 text-amber-950 ring-amber-200";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function stageDisplayLabel(
  stage: LeserFeedbackStage,
  override?: string,
): string {
  if (override?.trim()) return override.trim();
  return stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[stage];
}

function missingArtifactMessage(stage: LeserFeedbackStage): string {
  if (stage === "idee") return "Zuerst eine Ideendokumentation anlegen.";
  if (stage === "expose") {
    return "Zuerst einen Spec anlegen (Figuren / Welt / Exposé).";
  }
  return "Zuerst ein Manuskript anlegen.";
}

function promptsForDisplay(
  feedback: RomanLeserFeedback,
): RomanAenderungsPrompt[] {
  if (feedback.aenderungsPrompts.length > 0) {
    return feedback.aenderungsPrompts;
  }
  return feedback.vorschlaege.map((v) => ({
    titel: v.stelle || "Auftrag",
    scope: /buchweit|überall/i.test(v.stelle)
      ? ("buchweit" as const)
      : ("lokal" as const),
    kapitel: [] as number[],
    anweisung: v.text,
    wichtigkeit: "wichtig" as const,
  }));
}

type PendingKind = "collect" | "apply" | "discard" | null;

export function RomanLeserFeedbackControl({
  romanId,
  stage = "manuskript",
  feedback,
  hasArtifact,
  /** @deprecated Use hasArtifact */
  hasManuskript,
  disabled,
  onComplete,
  displayLabel,
}: {
  romanId: string;
  stage?: LeserFeedbackStage;
  feedback: RomanLeserFeedback | null;
  hasArtifact?: boolean;
  hasManuskript?: boolean;
  disabled?: boolean;
  onComplete?: (roman: RomanKontext) => void;
  displayLabel?: string;
}) {
  const ready = hasArtifact ?? hasManuskript ?? false;
  const label = stageDisplayLabel(stage, displayLabel);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingKind>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<RomanLeserFeedback | null>(
    feedback,
  );
  const [waitAgent, setWaitAgent] = useState<WaitAgentInfo | null>(null);
  const [syncedFeedback, setSyncedFeedback] = useState(feedback);
  if (feedback !== syncedFeedback) {
    setSyncedFeedback(feedback);
    setLocalFeedback(feedback);
  }

  useEffect(() => {
    if (!pending || pending === "discard") {
      setWaitAgent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await loadRomanKiRollenAction();
      if (cancelled || !result.success) return;
      const byKey = new Map(result.data!.rollen.map((r) => [r.key, r]));
      if (pending === "collect") {
        const leser = byKey.get("testleser_fanbase");
        setWaitAgent({
          roleLabel: leser?.label ?? "Testleser",
          modelLabel: waitModelLabelForRole(
            leser?.key ?? "testleser_fanbase",
            leser?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
          ),
        });
        return;
      }
      // Apply: Manuskript = Co-Autor-Prosa; Spec/Idee/… = Entwicklungslektor.
      if (stage === "manuskript") {
        const co = byKey.get("co_autor");
        setWaitAgent({
          roleLabel: co?.label ?? "Co-Autor",
          modelLabel: waitModelLabelForRole(
            co?.key ?? "co_autor",
            co?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
            { allowProseModel: true },
          ),
        });
        return;
      }
      const lektor = byKey.get("entwicklungslektor");
      setWaitAgent({
        roleLabel: lektor?.label ?? "Entwicklungslektor",
        modelLabel: waitModelLabelForRole(
          lektor?.key ?? "entwicklungslektor",
          lektor?.modelSlug ?? ROMAN_ASSIST_MODEL_SLUG,
        ),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, stage]);

  async function runNewFeedback() {
    if (!ready) {
      toast.error(missingArtifactMessage(stage));
      return;
    }
    setPending("collect");
    try {
      const result = await romanLeserFeedbackAction({ romanId, stage });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Leser-Feedback fehlgeschlagen.");
        if (result.data?.roman) onComplete?.(result.data.roman);
        return;
      }
      setLocalFeedback(result.data.feedback);
      onComplete?.(result.data.roman);
      setOpen(true);
      toast.success("Leser-Feedback gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Leser-Feedback fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runApplyFeedback() {
    if (!localFeedback) {
      toast.error("Kein gespeichertes Leser-Feedback.");
      return;
    }
    if (!ready) {
      toast.error(missingArtifactMessage(stage));
      return;
    }
    setPending("apply");
    try {
      const result = await romanLeserFeedbackApplyAction({
        romanId,
        stage,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Einarbeiten fehlgeschlagen.");
        if (result.data?.roman) onComplete?.(result.data.roman);
        return;
      }
      onComplete?.(result.data.roman);
      const nextFeedback = result.data.roman.editorial
        ? leserFeedbackForStage(result.data.roman.editorial, stage)
        : null;
      if (nextFeedback) setLocalFeedback(nextFeedback);
      const summary =
        result.data.summary?.trim() || "Feedback eingearbeitet.";
      if (stage === "expose" || stage === "idee") {
        toast.success(
          `${summary} Danach erneut „Feedback einholen“ für eine frische Einschätzung.`,
        );
        return;
      }
      const caps = result.data.patchedChapters;
      if (caps.length === 0) {
        toast.error(
          summary || "Keine Kapitel geändert — Feedback nicht eingearbeitet.",
        );
        return;
      }
      toast.success(
        `${summary} Danach erneut „Feedback einholen“ für eine frische Einschätzung.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Einarbeiten des Leser-Feedbacks fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  function onButtonClick() {
    if (localFeedback) {
      setOpen(true);
      return;
    }
    void runNewFeedback();
  }

  async function runDiscardFeedback() {
    if (!localFeedback) {
      toast.error("Kein gespeichertes Leser-Feedback.");
      return;
    }
    setPending("discard");
    try {
      const result = await romanLeserFeedbackDiscardAction({
        romanId,
        stage,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Feedback verwerfen fehlgeschlagen.");
        return;
      }
      setLocalFeedback(null);
      setDiscardConfirmOpen(false);
      setOpen(false);
      onComplete?.(result.data.roman);
      toast.success(result.data.summary);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Feedback verwerfen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  const busy = pending != null;
  const feedbackOpen = Boolean(localFeedback && !localFeedback.appliedAt);
  const feedbackClear =
    feedbackOpen &&
    localFeedback != null &&
    actionableAenderungsPrompts(localFeedback.aenderungsPrompts).length === 0;

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy || !ready}
        onClick={onButtonClick}
        className={cn(
          "relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold ring-1 disabled:opacity-50",
          feedbackOpen
            ? feedbackClear
              ? "bg-emerald-50 text-emerald-950 ring-emerald-200 hover:bg-emerald-100"
              : "bg-amber-50 text-amber-950 ring-amber-200 hover:bg-amber-100"
            : "bg-white text-zinc-950 ring-zinc-950/15 hover:bg-zinc-50",
        )}
      >
        <MessageSquareText className="size-4" aria-hidden />
        {pending === "collect"
          ? "Feedback …"
          : pending === "apply"
            ? "Einarbeiten …"
            : pending === "discard"
              ? "Verwerfen …"
              : feedbackOpen
                ? "Feedback offen"
                : "Feedback einholen"}
        {feedbackOpen ? (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
              feedbackClear ? "bg-emerald-500" : "bg-amber-500",
            )}
            aria-hidden
          />
        ) : null}
      </button>

      <RomanSceneWaitDialog
        open={busy && pending !== "discard"}
        variant={
          pending === "apply" ? "leser-feedback-apply" : "leser-feedback"
        }
        contextLabel={
          pending === "apply"
            ? `${label} · Feedback einarbeiten`
            : `${label} · Feedback einholen`
        }
        title={
          pending === "apply"
            ? "Testleser-Feedback einarbeiten"
            : "Testleser-Feedback einholen"
        }
        progressLabel={
          pending === "apply"
            ? stage === "manuskript"
              ? `${label}: Co-Autor arbeitet Prosa ein …`
              : `${label}: Entwicklungslektor arbeitet Feedback ein …`
            : `${label}: Testleser liest und formuliert Feedback …`
        }
        agentInfo={waitAgent}
      />

      <ConfirmDeleteDialog
        open={discardConfirmOpen && localFeedback != null}
        title="Feedback verwerfen?"
        description={`Das gespeicherte Leser-Feedback für „${label}“ wird gelöscht (Einschätzung und Änderungsaufträge). Das Buch selbst bleibt unverändert. Danach kannst du erneut Feedback einholen.`}
        confirmLabel="Feedback verwerfen"
        pending={pending === "discard"}
        onCancel={() => {
          if (pending !== "discard") setDiscardConfirmOpen(false);
        }}
        onConfirm={() => void runDiscardFeedback()}
      />

      {open && localFeedback ? (
        <LeserFeedbackDialog
          feedback={localFeedback}
          stageLabel={label}
          pending={pending}
          onClose={() => {
            if (!busy) {
              setDiscardConfirmOpen(false);
              setOpen(false);
            }
          }}
          onNewFeedback={() => void runNewFeedback()}
          onApplyFeedback={() => void runApplyFeedback()}
          onDiscardRequest={() => setDiscardConfirmOpen(true)}
        />
      ) : null}
    </>
  );
}

function LeserFeedbackDialog({
  feedback,
  stageLabel,
  pending,
  onClose,
  onNewFeedback,
  onApplyFeedback,
  onDiscardRequest,
}: {
  feedback: RomanLeserFeedback;
  stageLabel: string;
  pending: PendingKind;
  onClose: () => void;
  onNewFeedback: () => void;
  onApplyFeedback: () => void;
  onDiscardRequest: () => void;
}) {
  const busy = pending != null;
  const displayPrompts = promptsForDisplay(feedback);
  const onlyNice = onlyNiceToHavePrompts(
    feedback.aenderungsPrompts.length > 0 ? feedback.aenderungsPrompts : [],
  );
  const canApply = !onlyNice && !feedback.appliedAt;
  const applyLabel = feedback.appliedAt
    ? "Bereits eingearbeitet"
    : onlyNice
      ? "Nur Nice-to-have"
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
      aria-labelledby="leser-feedback-title"
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
              id="leser-feedback-title"
              className="text-xl font-extrabold text-zinc-950"
            >
              Feedback · {stageLabel}
            </h2>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {feedback.personaName
                ? `${feedback.personaName} · `
                : ""}
              {formatWhen(feedback.createdAt)}
              {feedback.modelLabel ? ` · ${feedback.modelLabel}` : ""}
            </p>
            {feedback.appliedAt ? (
              <p className="mt-1 text-xs font-bold text-amber-800">
                Bereits eingearbeitet ({formatWhen(feedback.appliedAt)}). Für
                eine aktuelle Einschätzung erneut „Feedback einholen“.
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
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm font-bold ring-1",
              feedback.weiterlesen
                ? "bg-emerald-50 text-emerald-950 ring-emerald-200"
                : "bg-rose-50 text-rose-950 ring-rose-200",
            )}
          >
            {feedback.weiterlesen
              ? "Würde weiterlesen"
              : "Würde nicht weiterlesen"}
          </div>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Einschätzung
            </h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-800">
              {formatDialogProsa(feedback.gesamt)}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Logik-Hinweis
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold ring-1",
                  statusClass(feedback.regelnStatus),
                )}
              >
                Regeln: {STATUS_LABEL[feedback.regelnStatus]}
              </span>
            </div>
            {feedback.checkDetail ? (
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-zinc-700">
                {formatDialogProsa(feedback.checkDetail)}
              </p>
            ) : null}
          </section>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Änderungsaufträge
            </h3>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Maximal 2 Punkte — nur wenn etwas wirklich stört. Leer = passt so,
              kein Einarbeiten nötig.
            </p>
            {displayPrompts.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200">
                Keine Änderungsaufträge — der Testleser würde so weiterlesen.
              </p>
            ) : (
              <>
                <div className="mt-2">
                  <NiceToHaveOnlyBanner prompts={displayPrompts} />
                </div>
                <ul className="mt-2 space-y-3">
                  {displayPrompts.map((p, i) => (
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
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-zinc-800">
                        {p.anweisung}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {feedback.genreVergleich.trim() ? (
            <section>
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Genre-Vergleich
              </h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-zinc-800">
                {feedback.genreVergleich}
              </p>
            </section>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onDiscardRequest}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
            Feedback verwerfen
          </button>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onNewFeedback}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-4", pending === "collect" && "animate-spin")}
                aria-hidden
              />
              {pending === "collect" ? "Einholen …" : "Feedback einholen"}
            </button>
            <button
              type="button"
              disabled={busy || !canApply}
              onClick={onApplyFeedback}
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
