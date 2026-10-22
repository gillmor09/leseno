"use client";

/**
 * Top-Down Roman dashboard: Pyramid contracts → Graph → Freeze → Prose briefs → Draft.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteNovelAction,
  forceChapterGateAction,
  forceStructureGateAction,
  forceStylePolishAction,
  compileProseBriefsAction,
  freezeSkeletonAction,
  handOffChapterGateAction,
  pauseNovelOrchestratorAction,
  resumeNextSceneAction,
  retryChapterGateAction,
  retryLogicGateAction,
  regenerateNovelActsAction,
  regenerateNovelChaptersAction,
  regenerateNovelManifestsAction,
  retryStructureGateAction,
  saveAndRecheckLogicAction,
  setNovelPilotModeAction,
  startNovelOrchestratorAction,
  startProseWritingAction,
} from "@/app/actions/roman-novel";
import { getPyramidGraph } from "@/lib/novel/pyramid-graph";
import { HighlightedProseEditor } from "@/components/features/admin/highlighted-prose-editor";
import { RomanNovelExportPanel } from "@/components/features/admin/roman-novel-export-panel";
import { RomanNovelIdeaInterviewPanel } from "@/components/features/admin/roman-novel-idea-interview-panel";
import { RomanNovelSceneCockpit } from "@/components/features/admin/roman-novel-scene-cockpit";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { extractEditMarkQuotes } from "@/lib/novel/feedback-marks";
import {
  countChapterWords,
  countNovelManuscriptWords,
  estimateNovelTargetWords,
  formatNovelWordCount,
} from "@/lib/novel/manuscript-stats";
import {
  NOVEL_CHAPTER_JOB_LABELS,
  NOVEL_SCENE_BEAT_LABELS,
} from "@/lib/novel/chapter-contract";
import {
  getPyramidBookState,
  PYRAMID_LEVEL_LABELS,
  PYRAMID_LEVELS,
} from "@/lib/novel/pyramid-state";
import {
  getStructureReports,
  STRUCTURE_LEVEL_LABELS,
} from "@/lib/novel/structure-reports";
import {
  normalizeArchitectActsList,
  novelSkeletonSchema,
  skeletonActSchema,
} from "@/lib/novel/tree-schemas";
import type {
  NovelBundle,
  NovelPilotMode,
  OrchestratorStatus,
} from "@/lib/novel/types";

type TabId = "idee" | "skelett" | "pipeline" | "manuskript" | "state" | "export";

const TABS: { id: TabId; label: string }[] = [
  { id: "idee", label: "Idee" },
  { id: "skelett", label: "Skelett" },
  { id: "pipeline", label: "Pipeline" },
  { id: "manuskript", label: "Manuskript" },
  { id: "state", label: "State" },
  { id: "export", label: "Export" },
];

function tabForPhase(phase: OrchestratorStatus["phase"]): TabId | null {
  if (
    phase === "architect_acts" ||
    phase === "architect_chapters" ||
    phase === "architect_manifests" ||
    phase === "skeleton_audit_acts" ||
    phase === "skeleton_audit_chapters" ||
    phase === "skeleton_audit_manifests"
  ) {
    return "skelett";
  }
  if (
    phase === "scene_dispatch" ||
    phase === "scene_draft" ||
    phase === "logic_audit" ||
    phase === "style_polish" ||
    phase === "scene_tic_scrub" ||
    phase === "state_commit" ||
    phase === "chapter_audit" ||
    phase === "chapter_revise" ||
    phase === "state_slice"
  ) {
    return "pipeline";
  }
  if (phase === "completed") return "manuskript";
  return null;
}

function sceneStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "wartet";
    case "drafting":
      return "Draft";
    case "auditing":
      return "Audit";
    case "polishing":
      return "Stil";
    case "approved":
      return "ok";
    case "error":
      return "Logik-Stopp";
    default:
      return status;
  }
}

export function RomanNovelDashboard({
  initialBundle,
  canSave,
}: {
  initialBundle: NovelBundle;
  canSave: boolean;
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initialBundle);
  const [tab, setTab] = useState<TabId>(() =>
    initialBundle.novel.skeletonFrozen
      ? "pipeline"
      : initialBundle.scenes.length > 0
        ? "skelett"
        : "idee",
  );
  const [pending, setPending] = useState<
    | "start"
    | "delete"
    | "pause"
    | "next"
    | "pilot"
    | "freeze"
    | "retry-logic"
    | "force-style"
    | "retry-chapter"
    | "handoff-chapter"
    | "force-chapter"
    | "retry-structure"
    | "force-structure"
    | "regen-acts"
    | "regen-chapters"
    | "regen-manifests"
    | "save-halt"
    | "compile-briefs"
    | "start-prose"
    | null
  >(null);
  const [jobActive, setJobActive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState<
    "acts" | "chapters" | "manifests" | null
  >(null);
  const [haltEditText, setHaltEditText] = useState("");
  const haltSceneIdRef = useRef<string | null>(null);
  const userPickedTab = useRef(false);
  const lastPhase = useRef(initialBundle.novel.orchestratorStatus.phase);
  const jobStartedAt = useRef(0);
  /** Caps silent auto-resume so a broken hop cannot hammer the job API. */
  const autoResumeRef = useRef({ count: 0, lastKey: "", lastAt: 0 });

  const novelId = bundle.novel.id;
  const ideaInterviewing = bundle.novel.ideaStatus === "interview";
  const orch = bundle.novel.orchestratorStatus;
  const skeletonHalt =
    bundle.novel.status === "paused" && orch.haltReason === "skeleton_gate";
  const logicHalt =
    bundle.novel.status === "paused" && orch.haltReason === "logic_gate";
  const chapterHalt =
    bundle.novel.status === "paused" && orch.haltReason === "chapter_gate";
  const structureHalt =
    bundle.novel.status === "paused" && orch.haltReason === "structure_gate";
  const structureHaltNotes =
    structureHalt &&
    typeof bundle.novel.stateMatrix?.__structureAudit === "object" &&
    bundle.novel.stateMatrix.__structureAudit &&
    !Array.isArray(bundle.novel.stateMatrix.__structureAudit)
      ? String(
          (bundle.novel.stateMatrix.__structureAudit as { notes?: string })
            .notes ??
            orch.error ??
            "",
        )
      : structureHalt
        ? (orch.error ?? "")
        : "";
  const blockedScene = logicHalt
    ? bundle.scenes.find((s) => s.id === orch.sceneId) ??
      bundle.scenes.find((s) => s.status === "error")
    : undefined;
  const chapterHaltScene = chapterHalt
    ? bundle.scenes.find((s) => s.id === orch.sceneId)
    : undefined;
  const chapterHaltNotes = chapterHalt
    ? chapterHaltScene?.logicNotes?.startsWith("[KAPITEL-AUDIT]")
      ? chapterHaltScene.logicNotes
      : (orch.error ?? chapterHaltScene?.logicNotes ?? "")
    : "";
  const haltEditDirty =
    Boolean(blockedScene) &&
    haltEditText.trim() !== (blockedScene?.rawText ?? "").trim();
  const haltEditQuotes = useMemo(
    () =>
      extractEditMarkQuotes({
        feedback: blockedScene?.feedback,
        logicNotes: blockedScene?.logicNotes,
      }),
    [blockedScene?.feedback, blockedScene?.logicNotes],
  );

  const skeleton = useMemo(() => {
    const p = novelSkeletonSchema.safeParse(bundle.novel.skeleton ?? {});
    if (!p.success) return { premise: "", acts: [], chapters: [] };
    // Deduplicate actNumbers (LLM sometimes emits Akt 3 twice).
    const acts = normalizeArchitectActsList(p.data.acts)
      .map((a) => skeletonActSchema.safeParse(a))
      .filter((r): r is { success: true; data: (typeof p.data.acts)[number] } =>
        r.success,
      )
      .map((r) => r.data);
    return { ...p.data, acts };
  }, [bundle.novel.skeleton]);
  const structureReports = useMemo(
    () => getStructureReports(bundle),
    [bundle],
  );
  const pyramidState = useMemo(() => getPyramidBookState(bundle), [bundle]);
  const pyramidGraph = useMemo(() => getPyramidGraph(bundle), [bundle]);

  const phaseActive =
    orch.phase !== "idle" &&
    orch.phase !== "completed" &&
    orch.phase !== "error";
  const serverRunning =
    bundle.novel.status !== "paused" &&
    (bundle.novel.status === "setup" ||
      bundle.novel.status === "outlining" ||
      bundle.novel.status === "writing" ||
      phaseActive);
  const orchUpdatedMs = orch.updatedAt ? Date.parse(orch.updatedAt) : 0;
  // Long LLM hops often take minutes without status writes — avoid false
  // „stehengeblieben“ while the hop is still working.
  const staleAfterMs =
    orch.phase.startsWith("architect_") ||
    orch.phase.startsWith("skeleton_audit_")
      ? 420_000
      : orch.phase === "scene_draft" ||
          orch.phase === "style_polish" ||
          orch.phase === "logic_audit" ||
          orch.phase === "scene_tic_scrub" ||
          orch.phase === "chapter_audit" ||
          orch.phase === "chapter_revise" ||
          orch.phase === "formel_tic_scrub"
        ? 360_000
        : 120_000;
  const pipelineStall = orch.haltReason === "pipeline_stall";
  const staleOrchestrator =
    !jobActive &&
    Number.isFinite(orchUpdatedMs) &&
    orchUpdatedMs > 0 &&
    Date.now() - orchUpdatedMs > staleAfterMs &&
    bundle.novel.status !== "completed" &&
    bundle.novel.status !== "paused" &&
    orch.phase !== "idle" &&
    orch.phase !== "completed";
  const running = jobActive || (serverRunning && !staleOrchestrator);
  const watchForResume =
    !running &&
    (staleOrchestrator ||
      pipelineStall ||
      orch.phase === "error" ||
      bundle.novel.status === "error" ||
      (Boolean(orch.step) &&
        orch.step !== "completed" &&
        orch.phase !== "idle" &&
        orch.phase !== "completed"));
  const canAutoResume =
    !running &&
    !pending &&
    canSave &&
    !logicHalt &&
    !structureHalt &&
    !skeletonHalt &&
    !chapterHalt &&
    (staleOrchestrator ||
      pipelineStall ||
      (bundle.novel.status === "error" && pipelineStall));

  useEffect(() => {
    if (jobActive) return;
    setBundle(initialBundle);
  }, [initialBundle, jobActive]);

  const applyBundle = useCallback((next: NovelBundle) => {
    setBundle(next);
    const phase = next.novel.orchestratorStatus.phase;
    if (!userPickedTab.current && phase !== lastPhase.current) {
      const suggested = tabForPhase(phase);
      if (suggested) setTab(suggested);
    }
    lastPhase.current = phase;
  }, []);

  const refreshProgress = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/roman/novel-progress?novelId=${encodeURIComponent(novelId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        bundle?: NovelBundle;
        status: string;
        orchestratorStatus: NovelBundle["novel"]["orchestratorStatus"];
      };

      const phase = data.orchestratorStatus?.phase;
      const status = data.status;
      const graceMs = Date.now() - jobStartedAt.current;
      const activePhase =
        phase != null &&
        phase !== "idle" &&
        phase !== "completed" &&
        phase !== "error";

      if (data.bundle) {
        if (
          jobActive &&
          graceMs < 12_000 &&
          (status === "error" || phase === "error") &&
          !activePhase
        ) {
          setBundle((prev) => ({
            ...data.bundle!,
            novel: {
              ...data.bundle!.novel,
              status: prev.novel.status,
              orchestratorStatus: {
                ...data.bundle!.novel.orchestratorStatus,
                phase: prev.novel.orchestratorStatus.phase,
                label: prev.novel.orchestratorStatus.label,
                error: null,
                step:
                  prev.novel.orchestratorStatus.step ??
                  data.bundle!.novel.orchestratorStatus.step,
              },
            },
          }));
        } else {
          applyBundle(data.bundle);
        }
      } else {
        setBundle((prev) => ({
          ...prev,
          novel: {
            ...prev.novel,
            status: data.status as NovelBundle["novel"]["status"],
            orchestratorStatus: data.orchestratorStatus,
          },
        }));
      }

      if (status === "paused") {
        setJobActive(false);
      } else if (status === "completed" || phase === "completed") {
        setJobActive(false);
        router.refresh();
      } else if (
        activePhase ||
        status === "setup" ||
        status === "outlining" ||
        status === "writing"
      ) {
        if (jobActive && graceMs > 2_000) setJobActive(false);
      } else if (
        jobActive &&
        (status === "error" || phase === "error") &&
        graceMs >= 12_000
      ) {
        setJobActive(false);
      }
    } catch {
      /* ignore poll errors */
    }
  }, [novelId, router, applyBundle, jobActive]);

  useEffect(() => {
    if (!canAutoResume) return;
    const key = `${orch.step ?? ""}:${orch.sceneId ?? ""}:${orch.updatedAt ?? ""}:${orch.haltReason ?? ""}`;
    const now = Date.now();
    const prev = autoResumeRef.current;
    if (prev.count >= 12) return;
    if (prev.lastKey === key && now - prev.lastAt < 25_000) return;

    const timer = window.setTimeout(() => {
      if (autoResumeRef.current.count >= 12) return;
      autoResumeRef.current = {
        count: autoResumeRef.current.count + 1,
        lastKey: key,
        lastAt: Date.now(),
      };
      void (async () => {
        try {
          const result = await startNovelOrchestratorAction({ novelId });
          if (!result.success) {
            toast.error(
              result.error ??
                "Auto-Fortsetzung fehlgeschlagen — bitte Fortsetzen klicken.",
            );
            return;
          }
          jobStartedAt.current = Date.now();
          setJobActive(true);
          if (autoResumeRef.current.count <= 2) {
            toast.message("Pipeline setzt automatisch fort…");
          }
        } catch {
          toast.error("Auto-Fortsetzung fehlgeschlagen — bitte Fortsetzen.");
        }
      })();
    }, staleOrchestrator ? 3_500 : 1_500);

    return () => window.clearTimeout(timer);
  }, [
    canAutoResume,
    canSave,
    novelId,
    orch.haltReason,
    orch.sceneId,
    orch.step,
    orch.updatedAt,
    staleOrchestrator,
  ]);

  useEffect(() => {
    if (!running && !watchForResume) return;
    void refreshProgress();
    const id = window.setInterval(
      () => {
        void refreshProgress();
      },
      running ? 1800 : 2500,
    );
    return () => window.clearInterval(id);
  }, [running, watchForResume, refreshProgress]);

  useEffect(() => {
    if (!logicHalt || !blockedScene) {
      haltSceneIdRef.current = null;
      return;
    }
    if (haltSceneIdRef.current === blockedScene.id) return;
    haltSceneIdRef.current = blockedScene.id;
    setHaltEditText(blockedScene.rawText || "");
  }, [logicHalt, blockedScene]);

  async function onStart() {
    if (!canSave || pending || running) return;
    if (logicHalt) {
      await onHandOffLogic();
      return;
    }
    if (skeletonHalt) {
      await onFreeze();
      return;
    }
    setPending("start");
    try {
      const result = await startNovelOrchestratorAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Start fehlgeschlagen.");
        return;
      }
      toast.success("Pipeline gestartet — läuft im Hintergrund.");
      jobStartedAt.current = Date.now();
      setJobActive(true);
      setBundle((prev) => ({
        ...prev,
        novel: {
          ...prev.novel,
          status: "outlining",
          orchestratorStatus: {
            ...prev.novel.orchestratorStatus,
            phase: "architect_acts",
            step: "architect_acts",
            label: "Architekt: Akte…",
            error: null,
            haltReason: null,
          },
        },
      }));
    } finally {
      setPending(null);
    }
  }

  async function onFreeze() {
    if (!canSave || pending || running) return;
    setPending("freeze");
    try {
      const result = await freezeSkeletonAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Freigabe fehlgeschlagen.");
        return;
      }
      toast.success(
        "Pyramide freigegeben — als Nächstes Prosa-Prompts kompilieren.",
      );
      setJobActive(false);
      setTab("skelett");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function onCompileBriefs() {
    if (!canSave || pending || running) return;
    setPending("compile-briefs");
    try {
      const result = await compileProseBriefsAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Kompilieren fehlgeschlagen.");
        return;
      }
      toast.success("Prosa-Prompts werden kompiliert…");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onStartProse() {
    if (!canSave || pending || running) return;
    setPending("start-prose");
    try {
      const result = await startProseWritingAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Prosa-Start fehlgeschlagen.");
        return;
      }
      toast.success("Prosa-Pipeline gestartet.");
      jobStartedAt.current = Date.now();
      setJobActive(true);
      setTab("pipeline");
    } finally {
      setPending(null);
    }
  }

  async function onHandOffLogic() {
    if (!canSave || pending || running || !blockedScene) return;
    const prose = haltEditText.trim() || blockedScene.rawText.trim();
    if (prose.length < 80) {
      toast.error("Rohtext zu kurz — bitte zuerst editieren oder speichern.");
      return;
    }
    setPending("retry-logic");
    try {
      const result = await retryLogicGateAction({
        novelId,
        rawText: prose,
      });
      if (!result.success) {
        toast.error(result.error ?? "Übergeben fehlgeschlagen.");
        return;
      }
      toast.success("An Autor übergeben — Logik-Hinweise werden umgesetzt…");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onRetryStructure() {
    if (!canSave || pending || running) return;
    setPending("retry-structure");
    try {
      const result = await retryStructureGateAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Struktur-Nachbesserung fehlgeschlagen.");
        return;
      }
      toast.success("Struktur-Ebene wird neu geplant…");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onForceStructure() {
    if (!canSave || pending || running) return;
    setPending("force-structure");
    try {
      const result = await forceStructureGateAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Struktur-Freigabe fehlgeschlagen.");
        return;
      }
      toast.success("Struktur-Warnung akzeptiert — Pipeline geht weiter.");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onRetryChapter() {
    if (!canSave || pending || running) return;
    setPending("retry-chapter");
    try {
      const result = await retryChapterGateAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Kapitel-Audit fehlgeschlagen.");
        return;
      }
      toast.success("Kapitel-Audit erneut…");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onHandOffChapter() {
    if (!canSave || pending || running) return;
    setPending("handoff-chapter");
    try {
      const result = await handOffChapterGateAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Übergeben fehlgeschlagen.");
        return;
      }
      toast.success(
        "An Autor übergeben — Dramaturgie-Hinweise werden umgesetzt…",
      );
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onForceChapter() {
    if (!canSave || pending || running) return;
    setPending("force-chapter");
    try {
      const result = await forceChapterGateAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Kapitel-Freigabe fehlgeschlagen.");
        return;
      }
      toast.success("Kapitel akzeptiert — Pipeline geht weiter.");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onForceStyle() {
    if (!canSave || pending || running || haltEditDirty) return;
    setPending("force-style");
    try {
      const result = await forceStylePolishAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Stil-Freigabe fehlgeschlagen.");
        return;
      }
      toast.success("Stilist startet trotz Logik-Stopp…");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onSaveHaltProse() {
    if (!canSave || pending || running || !blockedScene) return;
    if (haltEditText.trim().length < 80) {
      toast.error("Text zu kurz — bitte die Szene bearbeiten.");
      return;
    }
    setPending("save-halt");
    try {
      const result = await saveAndRecheckLogicAction({
        novelId,
        sceneId: blockedScene.id,
        rawText: haltEditText,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern & Check fehlgeschlagen.");
        return;
      }
      applyBundle(result.data.bundle);
      const nextScene = result.data.bundle.scenes.find(
        (s) => s.id === blockedScene.id,
      );
      setHaltEditText(nextScene?.rawText ?? haltEditText);
      if (result.data.passed) {
        toast.success("Logik OK — Hinweise weg. Stilist startet…");
        jobStartedAt.current = Date.now();
        setJobActive(true);
      } else {
        toast.message(
          "Hinweise noch offen — Markierungen aktualisiert. Bitte nachbessern.",
        );
      }
    } finally {
      setPending(null);
    }
  }

  async function onPause() {
    if (!canSave || pending) return;
    setPending("pause");
    try {
      const result = await pauseNovelOrchestratorAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Pausieren fehlgeschlagen.");
        return;
      }
      toast.success("Pausiert.");
      setJobActive(false);
      await refreshProgress();
    } finally {
      setPending(null);
    }
  }

  async function onNextScene() {
    if (!canSave || pending || running) return;
    setPending("next");
    try {
      const result = await resumeNextSceneAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Nächste Szene fehlgeschlagen.");
        return;
      }
      toast.success("Nächste Szene gestartet.");
      jobStartedAt.current = Date.now();
      setJobActive(true);
    } finally {
      setPending(null);
    }
  }

  async function onPilotMode(mode: NovelPilotMode) {
    if (!canSave || pending) return;
    setPending("pilot");
    try {
      const result = await setNovelPilotModeAction({
        novelId,
        pilotMode: mode,
      });
      if (!result.success) {
        toast.error(result.error ?? "Pilot-Modus fehlgeschlagen.");
        return;
      }
      setBundle((prev) => ({
        ...prev,
        novel: { ...prev.novel, pilotMode: mode },
      }));
      toast.success(
        mode === "auto" ? "Auto-Pilot aktiv." : "Pause nach jeder Szene.",
      );
    } finally {
      setPending(null);
    }
  }

  async function onDelete() {
    if (!canSave || pending) return;
    setPending("delete");
    try {
      const result = await deleteNovelAction({ novelId });
      if (!result.success) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      toast.success("Roman gelöscht.");
      setDeleteOpen(false);
      router.push("/admin/roman");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function onConfirmRegen() {
    if (!canSave || pending || running || !regenConfirm) return;
    const kind = regenConfirm;
    setPending(
      kind === "acts"
        ? "regen-acts"
        : kind === "chapters"
          ? "regen-chapters"
          : "regen-manifests",
    );
    try {
      const result =
        kind === "acts"
          ? await regenerateNovelActsAction({ novelId })
          : kind === "chapters"
            ? await regenerateNovelChaptersAction({ novelId })
            : await regenerateNovelManifestsAction({ novelId });
      if (!result.success) {
        toast.error(
          result.error ??
            (kind === "acts"
              ? "Akte neu erzeugen fehlgeschlagen."
              : kind === "chapters"
                ? "Kapitel neu erzeugen fehlgeschlagen."
                : "Manifeste neu erzeugen fehlgeschlagen."),
        );
        return;
      }
      toast.success(
        kind === "acts"
          ? "Akte werden neu erzeugt…"
          : kind === "chapters"
            ? "Kapitel werden neu erzeugt…"
            : "Szenen/Manifeste werden neu erzeugt…",
      );
      setRegenConfirm(null);
      jobStartedAt.current = Date.now();
      setJobActive(true);
      setTab("skelett");
    } finally {
      setPending(null);
    }
  }

  // Prefer skeleton count when present — DB can briefly lag or hold orphans.
  const chapterTotal =
    skeleton.chapters.length > 0
      ? skeleton.chapters.length
      : bundle.chapters.length;
  const scenesApproved = bundle.scenes.filter(
    (s) => s.status === "approved",
  ).length;
  const manuscriptWords = countNovelManuscriptWords(bundle);
  const targetWords = estimateNovelTargetWords(bundle);
  const wordPct =
    targetWords > 0
      ? Math.min(999, Math.round((manuscriptWords / targetWords) * 100))
      : 0;

  const prosePending =
    bundle.novel.skeletonFrozen &&
    (orch.phase === "prose_pending" ||
      orch.phase === "compile_prose_briefs" ||
      (bundle.novel.status === "paused" &&
        orch.step === "compile_prose_briefs"));
  const briefsReady =
    bundle.novel.skeletonFrozen &&
    bundle.scenes.some((s) => s.briefing.trim().length >= 40);
  const proseWritingStarted =
    bundle.novel.skeletonFrozen &&
    briefsReady &&
    (bundle.novel.status === "writing" ||
      orch.phase === "scene_dispatch" ||
      orch.phase === "scene_draft" ||
      orch.phase === "logic_audit" ||
      orch.phase === "style_polish" ||
      orch.phase === "state_commit" ||
      orch.phase === "chapter_audit" ||
      orch.phase === "completed" ||
      bundle.scenes.some((s) => s.rawText.trim().length >= 80));
  const proseUnlocked = proseWritingStarted;

  const primaryLabel = running
    ? "Läuft…"
    : skeletonHalt
      ? "Pyramide freigeben"
      : prosePending && !briefsReady
        ? "Prosa-Prompts kompilieren"
        : prosePending && briefsReady && !proseWritingStarted
          ? "Prosa schreiben"
          : logicHalt
            ? "Übergeben"
            : staleOrchestrator ||
                orch.phase === "error" ||
                bundle.novel.status === "paused" ||
                (orch.step &&
                  orch.step !== "architect_acts" &&
                  orch.phase !== "completed" &&
                  orch.phase !== "idle" &&
                  orch.phase !== "prose_pending")
              ? "Fortsetzen"
              : "Generierung starten";

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-zinc-500">
            <Link href="/admin/roman" className="hover:underline">
              Roman
            </Link>
            {" · "}
            Top-Down (Architekt Luna · Draft/Stil Haiku)
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-950">
            {bundle.novel.title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!ideaInterviewing ? (
            <>
              <button
                type="button"
                disabled={!canSave || Boolean(pending) || running}
                onClick={() => {
                  if (skeletonHalt) {
                    void onFreeze();
                    return;
                  }
                  if (prosePending && !briefsReady) {
                    void onCompileBriefs();
                    return;
                  }
                  if (prosePending && briefsReady && !proseWritingStarted) {
                    void onStartProse();
                    return;
                  }
                  void onStart();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 disabled:opacity-50"
              >
                {pending === "start" ||
                pending === "freeze" ||
                pending === "compile-briefs" ||
                pending === "start-prose" ||
                pending === "retry-logic" ||
                running ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {primaryLabel}
              </button>
              {running ||
              bundle.novel.status === "writing" ||
              bundle.novel.status === "outlining" ? (
                <button
                  type="button"
                  disabled={
                    !canSave ||
                    Boolean(pending) ||
                    bundle.novel.status === "paused"
                  }
                  onClick={() => void onPause()}
                  className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Pausieren
                </button>
              ) : null}
              {!skeletonHalt &&
              !logicHalt &&
              (bundle.novel.status === "paused" ||
                bundle.novel.pilotMode === "pause_after_scene") ? (
                <button
                  type="button"
                  disabled={!canSave || Boolean(pending) || running}
                  onClick={() => void onNextScene()}
                  className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-orange-800 ring-1 ring-orange-200 transition hover:bg-orange-50 disabled:opacity-50"
                >
                  {pending === "next" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : null}
                  Nächste Szene
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            disabled={!canSave || Boolean(pending)}
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
          >
            Löschen
          </button>
        </div>
      </div>

      {ideaInterviewing ? (
        <RomanNovelIdeaInterviewPanel
          novelId={novelId}
          messages={bundle.novel.ideaInterview}
          highConceptIdea={bundle.novel.highConceptIdea}
          canSave={canSave}
          onBundle={applyBundle}
        />
      ) : (
        <>
          <div className="min-w-0 overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-zinc-950/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Orchestrator
              </p>
              {running ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-800">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Live-Update
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {orch.label || "Bereit"}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-950/5">
                <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                  Skelett
                </p>
                <p className="mt-0.5 text-sm font-extrabold text-zinc-950">
                  {chapterTotal > 0
                    ? `${chapterTotal} Kapitel · ${skeleton.acts.length} Akte`
                    : "noch leer"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {bundle.novel.skeletonFrozen
                    ? "eingefroren"
                    : skeletonHalt
                      ? "warte auf Freeze"
                      : "Architekt"}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-950/5">
                <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                  Szenen
                </p>
                <p className="mt-0.5 text-sm font-extrabold text-zinc-950">
                  {bundle.scenes.length > 0
                    ? `${scenesApproved}/${bundle.scenes.length} fertig`
                    : "noch keine"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Draft → Logik → Stil → State
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-950/5">
                <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                  Manuskript
                </p>
                <p className="mt-0.5 text-sm font-extrabold text-zinc-950">
                  {formatNovelWordCount(manuscriptWords)} Wörter
                </p>
                <p className="text-[11px] text-zinc-500">
                  ~{formatNovelWordCount(targetWords)} Ziel
                  {manuscriptWords > 0 ? ` · ${wordPct} %` : ""}
                </p>
              </div>
            </div>
            {targetWords > 0 ? (
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100"
                role="progressbar"
                aria-valuenow={Math.min(100, wordPct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-orange-600 transition-[width]"
                  style={{ width: `${Math.min(100, wordPct)}%` }}
                />
              </div>
            ) : null}
            <p className="mt-2 text-xs text-zinc-500">
              Status: {bundle.novel.status}
              {orch.iteration != null && orch.iteration > 0
                ? ` · Logik-Rewrite ${orch.iteration}/2`
                : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canSave || Boolean(pending)}
                onClick={() => void onPilotMode("auto")}
                className={
                  bundle.novel.pilotMode === "auto"
                    ? "rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white"
                    : "rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700"
                }
              >
                Auto-Pilot
              </button>
              <button
                type="button"
                disabled={!canSave || Boolean(pending)}
                onClick={() => void onPilotMode("pause_after_scene")}
                className={
                  bundle.novel.pilotMode === "pause_after_scene"
                    ? "rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white"
                    : "rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700"
                }
              >
                Pause nach Szene
              </button>
            </div>
            {staleOrchestrator || pipelineStall ? (
              <p className="mt-2 text-sm text-amber-800">
                {pipelineStall
                  ? "Pipeline-Unterbrechung erkannt — setze automatisch fort…"
                  : "Pipeline scheint stehengeblieben — setze automatisch fort…"}{" "}
                Falls nichts passiert: „Fortsetzen“ klicken.
              </p>
            ) : null}
            {structureHalt ? (
              <div className="mt-3 space-y-2 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200/80">
                <p className="text-sm font-extrabold text-rose-950">
                  Struktur-Stopp — Logik/Dramaturgie auf Planungsebene
                </p>
                <p className="text-sm leading-relaxed text-rose-900">
                  {orch.label}
                </p>
                {structureHaltNotes ? (
                  <pre className="max-h-40 max-w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/80 p-2 font-sans text-xs text-rose-950 [overflow-wrap:anywhere]">
                    {structureHaltNotes}
                  </pre>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onRetryStructure()}
                    className="inline-flex items-center rounded-full bg-rose-800 px-4 py-2 text-xs font-bold text-white hover:bg-rose-900 disabled:opacity-50"
                  >
                    {pending === "retry-structure" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Ebene neu planen
                  </button>
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onForceStructure()}
                    className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-bold text-rose-950 ring-1 ring-rose-300 hover:bg-rose-100/80 disabled:opacity-50"
                  >
                    {pending === "force-structure" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Trotzdem weiter
                  </button>
                </div>
              </div>
            ) : null}
            {skeletonHalt ? (
              <div className="mt-3 space-y-2 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200/80">
                <p className="text-sm font-extrabold text-sky-950">
                  Skelett fertig — Freeze erforderlich
                </p>
                <p className="text-sm text-sky-900">{orch.label}</p>
                <button
                  type="button"
                  disabled={!canSave || Boolean(pending) || running}
                  onClick={() => void onFreeze()}
                  className="inline-flex items-center rounded-full bg-sky-800 px-4 py-2 text-xs font-bold text-white hover:bg-sky-900 disabled:opacity-50"
                >
                  {pending === "freeze" ? (
                    <Loader2
                      className="mr-1.5 size-3.5 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  Skelett einfrieren &amp; schreiben
                </button>
              </div>
            ) : null}
            {logicHalt ? (
              <div className="mt-3 min-w-0 space-y-3 overflow-hidden rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200/80">
                <p className="text-sm font-extrabold text-amber-950">
                  Logik-Stopp — max. Rewrites erreicht
                </p>
                <p className="text-sm leading-relaxed text-amber-900">
                  {orch.label}
                </p>
                {blockedScene?.logicNotes ? (
                  <pre className="max-h-40 max-w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/80 p-2 font-sans text-xs text-amber-950 [overflow-wrap:anywhere]">
                    {blockedScene.logicNotes}
                  </pre>
                ) : orch.error ? (
                  <p className="break-words text-xs text-amber-800 [overflow-wrap:anywhere]">
                    {orch.error}
                  </p>
                ) : null}
                {blockedScene ? (
                  <div className="min-w-0 space-y-2">
                    <label
                      htmlFor="halt-scene-edit"
                      className="block text-[11px] font-extrabold tracking-wide text-amber-900 uppercase"
                    >
                      Rohtext editieren
                      {haltEditDirty ? " · ungespeichert" : ""}
                      {haltEditQuotes.length > 0
                        ? ` · ${haltEditQuotes.length} Markierung${haltEditQuotes.length === 1 ? "" : "en"}`
                        : ""}
                    </label>
                    <HighlightedProseEditor
                      id="halt-scene-edit"
                      value={haltEditText}
                      onChange={setHaltEditText}
                      quotes={haltEditQuotes}
                      disabled={!canSave || Boolean(pending) || running}
                      rows={12}
                      className="max-w-full min-w-0 bg-white ring-1 ring-amber-200 focus-within:ring-2 focus-within:ring-orange-700"
                    />
                    {haltEditQuotes.length > 0 ? (
                      <p className="text-[11px] text-amber-800">
                        Gelb markiert: Stellen aus dem Logik-Audit — dort
                        strukturell nachbessern.
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-800">
                        Keine wörtlichen Stellen-Zitate — Änderungen anhand der
                        Logik-Notizen oben.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          !canSave ||
                          Boolean(pending) ||
                          running ||
                          haltEditText.trim().length < 80
                        }
                        onClick={() => void onSaveHaltProse()}
                        className="inline-flex items-center rounded-full bg-amber-900 px-4 py-2 text-xs font-bold text-white hover:bg-amber-950 disabled:opacity-50"
                      >
                        {pending === "save-halt" ? (
                          <Loader2
                            className="mr-1.5 size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        {pending === "save-halt"
                          ? "Prüfe Logik…"
                          : "Speichern & prüfen"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !canSave ||
                          Boolean(pending) ||
                          running ||
                          (
                            haltEditText.trim() || blockedScene.rawText.trim()
                          ).length < 80
                        }
                        onClick={() => void onHandOffLogic()}
                        className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                      >
                        {pending === "retry-logic" ? (
                          <Loader2
                            className="mr-1.5 size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        {pending === "retry-logic"
                          ? "Autor arbeitet…"
                          : "Übergeben"}
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Speichern &amp; prüfen = deine Edits gegen das Manifest.
                      Übergeben = Autor setzt die offenen Logik-Hinweise um
                      (auch mit ungespeicherten Edits).
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      !canSave || Boolean(pending) || running || haltEditDirty
                    }
                    onClick={() => void onForceStyle()}
                    className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-bold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100/80 disabled:opacity-50"
                  >
                    {pending === "force-style" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Trotzdem stilisieren
                  </button>
                </div>
              </div>
            ) : null}
            {chapterHalt ? (
              <div className="mt-3 space-y-2 rounded-xl bg-violet-50 p-3 ring-1 ring-violet-200/80">
                <p className="text-sm font-extrabold text-violet-950">
                  Kapitel-Dramaturgie — Audit nicht bestanden
                </p>
                <p className="text-sm leading-relaxed text-violet-900">
                  {orch.label}
                </p>
                {chapterHaltNotes ? (
                  <pre className="max-h-40 max-w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/80 p-2 font-sans text-xs text-violet-950 [overflow-wrap:anywhere]">
                    {chapterHaltNotes}
                  </pre>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onHandOffChapter()}
                    className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                  >
                    {pending === "handoff-chapter" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    {pending === "handoff-chapter"
                      ? "Autor arbeitet…"
                      : "Übergeben"}
                  </button>
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onRetryChapter()}
                    className="inline-flex items-center rounded-full bg-violet-800 px-4 py-2 text-xs font-bold text-white hover:bg-violet-900 disabled:opacity-50"
                  >
                    {pending === "retry-chapter" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Kapitel erneut prüfen
                  </button>
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onForceChapter()}
                    className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-bold text-violet-950 ring-1 ring-violet-300 hover:bg-violet-100/80 disabled:opacity-50"
                  >
                    {pending === "force-chapter" ? (
                      <Loader2
                        className="mr-1.5 size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Kapitel akzeptieren &amp; weiter
                  </button>
                </div>
                <p className="text-[11px] text-violet-800">
                  Übergeben = Autor setzt die Dramaturgie-Hinweise um und prüft
                  danach erneut. Erneut prüfen = nur Audit ohne Textänderung.
                </p>
              </div>
            ) : null}
            {orch.error &&
            !skeletonHalt &&
            !logicHalt &&
            !chapterHalt &&
            !structureHalt ? (
              <p className="mt-2 text-sm text-red-700">{orch.error}</p>
            ) : null}
            {bundle.scenes.length > 0 ? (
              <ul className="mt-3 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                {bundle.scenes
                  .slice()
                  .sort((a, b) => {
                    const ca =
                      bundle.chapters.find((c) => c.id === a.chapterId)
                        ?.chapterNumber ?? 0;
                    const cb =
                      bundle.chapters.find((c) => c.id === b.chapterId)
                        ?.chapterNumber ?? 0;
                    if (ca !== cb) return ca - cb;
                    return a.sceneIndex - b.sceneIndex;
                  })
                  .map((s) => {
                    const chNum =
                      bundle.chapters.find((c) => c.id === s.chapterId)
                        ?.chapterNumber ?? "?";
                    const active = orch.sceneId === s.id;
                    const done = s.status === "approved";
                    return (
                      <li
                        key={s.id}
                        title={`${s.planSummary || "Szene"} (${sceneStatusLabel(s.status)})`}
                        className={
                          active
                            ? "rounded-full bg-orange-700 px-2.5 py-0.5 text-[11px] font-bold text-white"
                            : done
                              ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900"
                              : s.status === "error"
                                ? "rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900"
                                : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700"
                        }
                      >
                        {chNum}.{s.sceneIndex}
                      </li>
                    );
                  })}
              </ul>
            ) : null}
          </div>
        </>
      )}

      {!ideaInterviewing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const badge =
                t.id === "idee" &&
                bundle.novel.highConceptIdea.trim().length > 0
                  ? "·"
                  : t.id === "skelett" && skeleton.chapters.length > 0
                    ? "·"
                    : t.id === "pipeline" && bundle.scenes.length > 0
                      ? "·"
                      : t.id === "manuskript" &&
                          bundle.chapters.some((c) => c.rawDraft || c.finalText)
                        ? "·"
                        : t.id === "state" &&
                            Object.keys(bundle.novel.stateMatrix ?? {}).length >
                              0
                          ? "·"
                          : t.id === "export" &&
                              (bundle.novel.summary.trim() ||
                                bundle.novel.coverImageDataUrl.trim() ||
                                Boolean(bundle.novel.abnahme))
                            ? "·"
                            : "";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    userPickedTab.current = true;
                    setTab(t.id);
                  }}
                  className={
                    tab === t.id
                      ? "rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white"
                      : "rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-50"
                  }
                >
                  {t.label}
                  {badge ? (
                    <span className="ml-1 text-orange-500" aria-hidden>
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl bg-white p-5 ring-1 ring-zinc-950/10">
            {tab === "idee" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    High Concept
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Ausgangsidee für den Architekten (Akte → Kapitel → Manifeste).
                  </p>
                </div>
                {bundle.novel.highConceptIdea.trim() ? (
                  <div className="max-h-[65vh] overflow-y-auto rounded-xl bg-gray-50/80 px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                      {bundle.novel.highConceptIdea}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Noch keine Idee hinterlegt.
                  </p>
                )}
              </div>
            ) : null}

            {tab === "skelett" ? (
              <div className="space-y-5">
                {PYRAMID_LEVELS.some((l) => pyramidState[l]) ? (
                  <div className="rounded-xl bg-sky-50/80 px-3 py-2.5 ring-1 ring-sky-200/70">
                    <p className="text-xs font-extrabold tracking-wide text-sky-800 uppercase">
                      Pyramid-State &amp; Plan → nächste Ebene
                    </p>
                    <ul className="mt-2 space-y-2">
                      {PYRAMID_LEVELS.map((level) => {
                        const rec = pyramidState[level];
                        if (!rec) return null;
                        const plan = rec.nextPlan;
                        const count =
                          plan.countMin === plan.countMax
                            ? `${plan.countMin}`
                            : `${plan.countMin}–${plan.countMax}`;
                        return (
                          <li
                            key={`pyr-${level}`}
                            className="rounded-lg bg-white/90 px-2.5 py-1.5 ring-1 ring-sky-100"
                          >
                            <p className="text-[11px] font-extrabold text-sky-950">
                              {PYRAMID_LEVEL_LABELS[level]}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-700">
                              State: {rec.state.summary}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-600">
                              Plan → {plan.target}: {count} ·{" "}
                              {plan.structure.slice(0, 120)}
                              {plan.structure.length > 120 ? "…" : ""}
                            </p>
                            {plan.functions.length > 0 ? (
                              <p className="mt-0.5 text-[10px] text-zinc-500">
                                {plan.functions.slice(0, 4).join(" · ")}
                                {plan.functions.length > 4 ? " …" : ""}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {Object.keys(structureReports).length > 0 ? (
                  <div className="rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-950/5">
                    <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                      Struktur-Prüfungen
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {(
                        ["acts", "chapters", "manifests"] as const
                      ).map((level) => {
                        const r = structureReports[level];
                        if (!r) return null;
                        return (
                          <li
                            key={level}
                            title={
                              r.issues.length
                                ? r.issues.join(" · ")
                                : "Keine Issues"
                            }
                            className={
                              r.passed
                                ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900"
                                : "rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-900"
                            }
                          >
                            {STRUCTURE_LEVEL_LABELS[level]}{" "}
                            {r.score}/10
                            {r.passed ? " · ok" : " · offen"}
                          </li>
                        );
                      })}
                    </ul>
                    {(
                      ["acts", "chapters", "manifests"] as const
                    ).map((level) => {
                      const r = structureReports[level];
                      if (!r || (r.passed && r.issues.length === 0)) return null;
                      return (
                        <details
                          key={`rep-${level}`}
                          className="mt-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-zinc-950/5"
                        >
                          <summary className="cursor-pointer text-[11px] font-bold text-zinc-700">
                            {STRUCTURE_LEVEL_LABELS[level]} — Details
                          </summary>
                          <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] text-zinc-600">
                            {[
                              ...r.issues,
                              ...r.changeOrders.map((c) => `→ ${c}`),
                            ]
                              .filter(
                                (line) =>
                                  line &&
                                  line !== "[object Object]" &&
                                  !line.includes("[object Object]"),
                              )
                              .join("\n") || "—"}
                          </pre>
                        </details>
                      );
                    })}
                  </div>
                ) : null}
                {skeleton.premise ? (
                  <div>
                    <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                      Prämisse
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-800">
                      {skeleton.premise}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Pyramid-Baum
                  </p>
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => setRegenConfirm("acts")}
                    className="ml-auto rounded-full bg-white px-3 py-1 text-[11px] font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Akte neu erzeugen
                  </button>
                  <button
                    type="button"
                    disabled={
                      !canSave ||
                      Boolean(pending) ||
                      running ||
                      skeleton.acts.length < 2
                    }
                    onClick={() => setRegenConfirm("chapters")}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Kapitel neu erzeugen
                  </button>
                  <button
                    type="button"
                    disabled={
                      !canSave ||
                      Boolean(pending) ||
                      running ||
                      skeleton.chapters.length < 10
                    }
                    onClick={() => setRegenConfirm("manifests")}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Manifeste neu erzeugen
                  </button>
                </div>
                {skeleton.acts.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Noch kein Skelett — Generierung starten oder Akte neu
                    erzeugen.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {skeleton.acts.map((a) => {
                      const actChapters = skeleton.chapters.filter(
                        (c) => c.actNumber === a.actNumber,
                      );
                      return (
                        <li key={`act-${a.actNumber}`}>
                          <details
                            open
                            className="group rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-950/5 open:bg-white"
                          >
                            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <div className="flex items-start gap-2">
                                <span
                                  aria-hidden
                                  className="mt-0.5 shrink-0 text-[10px] font-bold text-zinc-400 transition-transform group-open:rotate-90"
                                >
                                  ▶
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-zinc-950">
                                    Akt {a.actNumber} — {a.title}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-zinc-500">
                                    {actChapters.length} Kapitel
                                    {structureReports.acts
                                      ? ` · Prüfung ${structureReports.acts.score}/10`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                            </summary>
                            <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 pl-5">
                              <p className="text-xs text-zinc-600">{a.summary}</p>
                              {actChapters.length === 0 ? (
                                <p className="text-[11px] text-zinc-500">
                                  Noch keine Kapitel unter diesem Akt.
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {actChapters.map((c) => {
                                    const dbContract = bundle.chapters.find(
                                      (ch) =>
                                        ch.chapterNumber === c.chapterNumber,
                                    )?.contract;
                                    const job = dbContract?.job ?? c.job;
                                    const jobLabel =
                                      NOVEL_CHAPTER_JOB_LABELS[
                                        job as keyof typeof NOVEL_CHAPTER_JOB_LABELS
                                      ] ?? job;
                                    const chapterScenes = bundle.scenes
                                      .filter((s) => {
                                        const n =
                                          bundle.chapters.find(
                                            (ch) => ch.id === s.chapterId,
                                          )?.chapterNumber ?? 0;
                                        return n === c.chapterNumber;
                                      })
                                      .slice()
                                      .sort(
                                        (x, y) => x.sceneIndex - y.sceneIndex,
                                      );
                                    return (
                                      <li key={`sk-ch-${c.chapterNumber}`}>
                                        <details className="group/ch rounded-lg bg-zinc-50/80 px-2.5 py-1.5 ring-1 ring-zinc-950/5 open:bg-white">
                                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                                            <div className="flex items-start gap-2">
                                              <span
                                                aria-hidden
                                                className="mt-0.5 shrink-0 text-[10px] font-bold text-zinc-400 transition-transform group-open/ch:rotate-90"
                                              >
                                                ▶
                                              </span>
                                              <p className="min-w-0 text-xs font-bold text-zinc-950">
                                                Kap. {c.chapterNumber} —{" "}
                                                {c.title}
                                                <span className="ml-2 inline-block rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                                                  {jobLabel}
                                                </span>
                                              </p>
                                            </div>
                                          </summary>
                                          <div className="mt-1.5 space-y-1.5 border-t border-zinc-100 pt-1.5 pl-4">
                                            <p className="text-[11px] text-zinc-600">
                                              {c.goal}
                                            </p>
                                            {c.beats.length > 0 ? (
                                              <p className="text-[10px] text-zinc-500">
                                                {c.beats.join(" → ")}
                                              </p>
                                            ) : null}
                                            {chapterScenes.length === 0 ? (
                                              <p className="text-[10px] text-zinc-500">
                                                Noch keine Szenen-Manifeste.
                                              </p>
                                            ) : (
                                              <ul className="space-y-1">
                                                {chapterScenes.map((s) => {
                                                  const m = s.manifest as {
                                                    sceneGoal?: string;
                                                    beat?: string;
                                                    situations?: string[];
                                                  };
                                                  const beatLabel = m.beat
                                                    ? (NOVEL_SCENE_BEAT_LABELS[
                                                        m.beat as keyof typeof NOVEL_SCENE_BEAT_LABELS
                                                      ] ?? m.beat)
                                                    : null;
                                                  const situations =
                                                    Array.isArray(m.situations)
                                                      ? m.situations.filter(
                                                          Boolean,
                                                        )
                                                      : [];
                                                  const briefReady =
                                                    s.briefing.trim().length >=
                                                    40;
                                                  return (
                                                    <li
                                                      key={s.id}
                                                      className="rounded-md bg-white px-2 py-1 text-[11px] ring-1 ring-zinc-950/5"
                                                    >
                                                      <div>
                                                        <span className="font-bold text-zinc-900">
                                                          {c.chapterNumber}.
                                                          {s.sceneIndex}
                                                        </span>
                                                        {beatLabel ? (
                                                          <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-bold text-zinc-600">
                                                            {beatLabel}
                                                          </span>
                                                        ) : null}
                                                        {briefReady ? (
                                                          <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-800">
                                                            Brief
                                                          </span>
                                                        ) : null}{" "}
                                                        <span className="text-zinc-600">
                                                          {s.planSummary ||
                                                            m.sceneGoal ||
                                                            "—"}
                                                        </span>
                                                      </div>
                                                      {situations.length >
                                                      0 ? (
                                                        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] text-zinc-500">
                                                          {situations.map(
                                                            (sit, i) => (
                                                              <li
                                                                key={`${s.id}-sit-${i}`}
                                                              >
                                                                {sit}
                                                              </li>
                                                            ),
                                                          )}
                                                        </ol>
                                                      ) : (
                                                        <p className="mt-0.5 text-[10px] text-amber-700">
                                                          Noch keine
                                                          Situationen.
                                                        </p>
                                                      )}
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            )}
                                          </div>
                                        </details>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {skeletonHalt ||
                (!bundle.novel.skeletonFrozen &&
                  bundle.scenes.length > 0) ? (
                  <button
                    type="button"
                    disabled={!canSave || Boolean(pending) || running}
                    onClick={() => void onFreeze()}
                    className="inline-flex items-center rounded-full bg-sky-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-50"
                  >
                    {pending === "freeze" ? (
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    Pyramide freigeben
                  </button>
                ) : null}
                {bundle.novel.skeletonFrozen && !proseUnlocked ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200/70">
                    <p className="text-xs text-amber-950">
                      Struktur freigegeben. Prosa erst nach kompilierten
                      Prompts.
                    </p>
                    {!briefsReady ? (
                      <button
                        type="button"
                        disabled={!canSave || Boolean(pending) || running}
                        onClick={() => void onCompileBriefs()}
                        className="inline-flex items-center rounded-full bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-50"
                      >
                        {pending === "compile-briefs" ? (
                          <Loader2
                            className="mr-2 size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        Prosa-Prompts kompilieren
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canSave || Boolean(pending) || running}
                        onClick={() => void onStartProse()}
                        className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                      >
                        {pending === "start-prose" ? (
                          <Loader2
                            className="mr-2 size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        Prosa schreiben
                      </button>
                    )}
                  </div>
                ) : null}
                {pyramidGraph.nodes.length > 0 ? (
                  <details className="rounded-xl bg-violet-50/70 px-3 py-2.5 ring-1 ring-violet-200/60">
                    <summary className="cursor-pointer text-xs font-extrabold tracking-wide text-violet-900 uppercase">
                      Wissensgraph ({pyramidGraph.nodes.length} Knoten ·{" "}
                      {pyramidGraph.edges.length} Kanten)
                    </summary>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                      {pyramidGraph.nodes.slice(0, 80).map((n) => (
                        <li
                          key={n.id}
                          className="rounded-md bg-white/90 px-2 py-1 text-[11px] text-zinc-700 ring-1 ring-violet-100"
                        >
                          <span className="font-bold text-violet-950">
                            [{n.layer}]
                          </span>{" "}
                          {n.label}
                          {n.summary ? (
                            <span className="text-zinc-500">
                              {" "}
                              — {n.summary.slice(0, 100)}
                              {n.summary.length > 100 ? "…" : ""}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}

            {tab === "pipeline" ? (
              proseUnlocked ? (
                <RomanNovelSceneCockpit
                  bundle={bundle}
                  running={running}
                  canSave={canSave}
                  onBundle={applyBundle}
                  onJobStarted={() => {
                    jobStartedAt.current = Date.now();
                    setJobActive(true);
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">
                    Pipeline gesperrt, bis die Pyramide freigegeben und Prosa
                    gestartet ist.
                  </p>
                  {bundle.novel.skeletonFrozen && !briefsReady ? (
                    <button
                      type="button"
                      disabled={!canSave || Boolean(pending) || running}
                      onClick={() => void onCompileBriefs()}
                      className="inline-flex items-center rounded-full bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-50"
                    >
                      Prosa-Prompts kompilieren
                    </button>
                  ) : null}
                  {briefsReady && !proseUnlocked ? (
                    <button
                      type="button"
                      disabled={!canSave || Boolean(pending) || running}
                      onClick={() => void onStartProse()}
                      className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                    >
                      Prosa schreiben
                    </button>
                  ) : null}
                </div>
              )
            ) : null}

            {tab === "manuskript" ? (
              !proseUnlocked &&
              !bundle.scenes.some((s) => s.rawText.trim().length >= 80) ? (
                <p className="text-sm text-zinc-600">
                  Manuskript-Ansicht nach Prosa-Start. Bis dahin nur Pyramid-
                  Verträge im Tab Skelett.
                </p>
              ) : bundle.chapters.length > 0 ? (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-600">
                    {chapterTotal} Kapitel ·{" "}
                    {formatNovelWordCount(manuscriptWords)} / ~
                    {formatNovelWordCount(targetWords)} Wörter ({wordPct} %)
                  </p>
                  {bundle.chapters
                    .slice()
                    .sort((a, b) => a.chapterNumber - b.chapterNumber)
                    .map((c) => {
                      const body = (c.finalText || c.rawDraft).trim();
                      const chWords = countChapterWords(c, bundle);
                      return (
                        <section key={c.id} className="scroll-mt-4">
                          <h3 className="text-sm font-extrabold text-zinc-950">
                            Kapitel {c.chapterNumber} — {c.title || "Ohne Titel"}
                            <span className="ml-2 text-xs font-bold text-zinc-500">
                              {chWords > 0
                                ? ` · ${formatNovelWordCount(chWords)} W.`
                                : ""}
                            </span>
                          </h3>
                          {c.outline ? (
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              {c.outline}
                            </p>
                          ) : null}
                          {body ? (
                            <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">
                              {body}
                            </pre>
                          ) : (
                            <p className="mt-2 text-sm text-zinc-400">
                              Noch kein Prosa-Text.
                            </p>
                          )}
                        </section>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  Noch kein Kapitel — Generierung starten.
                </p>
              )
            ) : null}

            {tab === "state" ? (
              <div className="space-y-4 text-sm">
                {PYRAMID_LEVELS.some((l) => pyramidState[l]) ? (
                  <div>
                    <h3 className="font-extrabold text-zinc-900">
                      Pyramid-State (pro Ebene)
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {PYRAMID_LEVELS.map((level) => {
                        const rec = pyramidState[level];
                        if (!rec) return null;
                        return (
                          <li
                            key={`st-pyr-${level}`}
                            className="rounded-xl bg-sky-50/80 p-3 ring-1 ring-sky-200/60"
                          >
                            <p className="text-xs font-extrabold text-sky-950">
                              {PYRAMID_LEVEL_LABELS[level]}
                            </p>
                            <p className="mt-1 text-xs text-zinc-700">
                              {rec.state.summary}
                            </p>
                            {rec.state.worldFacts.length > 0 ? (
                              <p className="mt-1 text-[11px] text-zinc-600">
                                Fakten: {rec.state.worldFacts.join(" · ")}
                              </p>
                            ) : null}
                            {rec.state.characterSeeds.length > 0 ? (
                              <p className="mt-0.5 text-[11px] text-zinc-600">
                                Figuren: {rec.state.characterSeeds.join(" · ")}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] font-bold text-zinc-800">
                              → Plan {rec.nextPlan.target}:{" "}
                              {rec.nextPlan.countMin === rec.nextPlan.countMax
                                ? rec.nextPlan.countMin
                                : `${rec.nextPlan.countMin}–${rec.nextPlan.countMax}`}
                            </p>
                            <p className="text-[11px] text-zinc-600">
                              {rec.nextPlan.structure}
                            </p>
                            <p className="text-[11px] text-zinc-600">
                              {rec.nextPlan.plot}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="font-extrabold text-zinc-900">
                    State-Matrix (Buch)
                  </h3>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-gray-50 p-3 font-sans text-xs">
                    {JSON.stringify(bundle.novel.stateMatrix ?? {}, null, 2)}
                  </pre>
                </div>
                {bundle.sceneStates.length > 0 ? (
                  <div>
                    <h3 className="font-extrabold text-zinc-900">
                      Szenen-Diffs
                    </h3>
                    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                      {bundle.sceneStates.map((st) => {
                        const scene = bundle.scenes.find(
                          (s) => s.id === st.sceneId,
                        );
                        const ch =
                          bundle.chapters.find((c) => c.id === scene?.chapterId)
                            ?.chapterNumber ?? "?";
                        return (
                          <li
                            key={st.sceneId}
                            className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-950/5"
                          >
                            <p className="text-xs font-bold text-zinc-700">
                              Kap. {ch}.{scene?.sceneIndex ?? "?"}
                            </p>
                            <pre className="mt-1 max-h-32 overflow-auto font-sans text-[11px] text-zinc-600">
                              {JSON.stringify(st.state, null, 2)}
                            </pre>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "export" ? (
              <RomanNovelExportPanel
                bundle={bundle}
                canSave={canSave}
                onBundle={applyBundle}
                jobRunning={running}
                onJobStarted={() => {
                  jobStartedAt.current = Date.now();
                  setJobActive(true);
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <ConfirmDeleteDialog
        open={deleteOpen}
        title="Roman löschen?"
        description={`„${bundle.novel.title}“ und alle Kapitel, Manifeste und State werden unwiderruflich gelöscht.`}
        confirmLabel="Endgültig löschen"
        pending={pending === "delete"}
        onCancel={() => {
          if (pending !== "delete") setDeleteOpen(false);
        }}
        onConfirm={() => void onDelete()}
      />

      <ConfirmDeleteDialog
        open={regenConfirm !== null}
        title={
          regenConfirm === "manifests"
            ? "Szenen/Manifeste komplett neu erzeugen?"
            : regenConfirm === "chapters"
              ? "Kapitel komplett neu erzeugen?"
              : "Akte komplett neu erzeugen?"
        }
        description={
          regenConfirm === "manifests"
            ? "Alle Szenen/Manifeste, Kapitel-Prosa, Logic-Ledger und State ab der Szenen-Ebene werden gelöscht (Graph/Provenance). Akte und Kapitel-Outline bleiben. Danach startet die Manifest-Planung neu (Freigabe nur bei 10/10)."
            : regenConfirm === "chapters"
              ? "Alle Kapitel, Szenen/Manifeste, Struktur-Reports und State/Graph ab Kapitel-Ebene werden gelöscht. Die Akte bleiben. Danach startet die Kapitel-Planung neu (Freigabe nur bei 10/10)."
              : "Akte, Kapitel, Szenen/Manifeste und State/Graph ab Akte-Ebene werden gelöscht. Die High-Concept-Idee bleibt. Danach startet die Akte-Erzeugung neu (Freigabe nur bei 10/10)."
        }
        confirmLabel={
          regenConfirm === "manifests"
            ? "Manifeste neu erzeugen"
            : regenConfirm === "chapters"
              ? "Kapitel neu erzeugen"
              : "Akte neu erzeugen"
        }
        pending={
          pending === "regen-acts" ||
          pending === "regen-chapters" ||
          pending === "regen-manifests"
        }
        onCancel={() => {
          if (
            pending !== "regen-acts" &&
            pending !== "regen-chapters" &&
            pending !== "regen-manifests"
          ) {
            setRegenConfirm(null);
          }
        }}
        onConfirm={() => void onConfirmRegen()}
      />
    </div>
  );
}
