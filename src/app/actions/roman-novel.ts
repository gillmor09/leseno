"use server";

/**
 * Server Actions for greenfield Roman (`leseno.novels`).
 */

import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  createNovel,
  deleteNovel,
  getNovelBundle,
  listNovels,
  upsertNovelAbnahme,
  upsertNovelExport,
} from "@/lib/novel/repository";
import type { NovelAbnahme, NovelBundle, NovelSummary } from "@/lib/novel/types";
import type { ActionResult } from "@/lib/types/actions";
import { revalidatePath } from "next/cache";
import {
  emptyVorsatz,
  parseVorsatzJson,
} from "@/lib/roman/front-matter";

function revalidateNovel(id?: string) {
  revalidatePath("/admin/roman");
  if (id) revalidatePath(`/admin/roman/${id}`);
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
  /** ready = paste idea; interview = develop via Haiku/Luna Q&A */
  ideaMode: z.enum(["ready", "interview"]).default("ready"),
  highConceptIdea: z.string().max(100_000).optional(),
});

export async function createNovelAction(
  input: unknown,
): Promise<ActionResult<{ novelId: string; bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }
  try {
    const mode = parsed.data.ideaMode;
    const idea = (parsed.data.highConceptIdea ?? "").trim();
    if (mode === "ready" && idea.length < 20) {
      return {
        success: false,
        error:
          "Bitte die Idee etwas ausführlicher beschreiben (mind. 20 Zeichen).",
      };
    }
    const title =
      parsed.data.title?.trim() ||
      idea.split(/[.!?\n]/)[0]?.trim().slice(0, 80) ||
      "Unbenannter Roman";
    const bundle = await createNovel({
      title,
      highConceptIdea: idea,
      ideaStatus: mode === "interview" ? "interview" : "ready",
    });
    if (mode === "interview") {
      const { startNovelIdeaInterview } = await import(
        "@/lib/novel/idea-interview"
      );
      const withOpener = await startNovelIdeaInterview(bundle.novel.id);
      revalidateNovel(withOpener.novel.id);
      return {
        success: true,
        data: { novelId: withOpener.novel.id, bundle: withOpener },
      };
    }
    revalidateNovel(bundle.novel.id);
    return {
      success: true,
      data: { novelId: bundle.novel.id, bundle },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Roman anlegen fehlgeschlagen.",
    };
  }
}

export async function listNovelsAction(): Promise<
  ActionResult<{ novels: NovelSummary[] }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  try {
    const novels = await listNovels();
    return { success: true, data: { novels } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Liste laden fehlgeschlagen.",
    };
  }
}

export async function getNovelBundleAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const id = z.string().uuid().safeParse(
    typeof input === "object" && input && "novelId" in input
      ? (input as { novelId: unknown }).novelId
      : input,
  );
  if (!id.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  try {
    let bundle = await getNovelBundle(id.data);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };

    // Skeleton is source of truth: drop orphan DB chapters (+ cascaded scenes).
    const skRaw = bundle.novel.skeleton ?? {};
    const skChapters = Array.isArray(
      (skRaw as { chapters?: unknown }).chapters,
    )
      ? ((skRaw as { chapters: Array<{ chapterNumber?: unknown }> }).chapters)
      : [];
    const maxSkeleton = skChapters.reduce((m, c) => {
      const n = Number(c?.chapterNumber);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    if (
      maxSkeleton > 0 &&
      bundle.chapters.some((c) => c.chapterNumber > maxSkeleton)
    ) {
      const { deleteChaptersAboveNumber } = await import(
        "@/lib/novel/repository"
      );
      const trimmed = await deleteChaptersAboveNumber(id.data, maxSkeleton);
      if (trimmed > 0) {
        console.warn(
          `[getNovelBundleAction] ${trimmed} überzählige Kapitel (DB > Skelett ${maxSkeleton}) gelöscht.`,
        );
        bundle = (await getNovelBundle(id.data)) ?? bundle;
      }
    }

    return { success: true, data: { bundle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Roman laden fehlgeschlagen.",
    };
  }
}

export async function deleteNovelAction(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const id = z.string().uuid().safeParse(
    typeof input === "object" && input && "novelId" in input
      ? (input as { novelId: unknown }).novelId
      : input,
  );
  if (!id.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  try {
    await deleteNovel(id.data);
    revalidateNovel();
    return { success: true, data: { ok: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
    };
  }
}

export async function startNovelOrchestratorAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const id = z.string().uuid().safeParse(
    typeof input === "object" && input && "novelId" in input
      ? (input as { novelId: unknown }).novelId
      : input,
  );
  if (!id.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  try {
    const bundle = await getNovelBundle(id.data);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.ideaStatus === "interview") {
      return {
        success: false,
        error:
          "Idee noch im Interview — bitte „Idee übernehmen“, bevor die Generierung startet.",
      };
    }
    if (bundle.novel.highConceptIdea.trim().length < 20) {
      return {
        success: false,
        error: "Bitte zuerst eine High-Concept-Idee speichern (mind. 20 Zeichen).",
      };
    }

    const orch = bundle.novel.orchestratorStatus;
    if (orch.haltReason === "skeleton_gate") {
      return {
        success: false,
        error:
          "Skelett wartet auf Freigabe — bitte „Skelett einfrieren & schreiben“.",
      };
    }
    if (orch.haltReason === "logic_gate") {
      return retryLogicGateAction({ novelId: id.data });
    }
    if (orch.haltReason === "chapter_gate") {
      return forceChapterGateAction({ novelId: id.data });
    }
    if (orch.haltReason === "structure_gate") {
      return retryStructureGateAction({ novelId: id.data });
    }

    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { resumeNovelHop } = await import("@/lib/novel/novelOrchestrator");
    const { updateNovel } = await import("@/lib/novel/repository");
    const hop = resumeNovelHop({
      novelId: id.data,
      phase: orch.phase,
      step: orch.step,
      chapterNumber: orch.chapterNumber,
      sceneId: orch.sceneId,
      iteration: orch.iteration,
    });
    const resumeStatus =
      hop.step.startsWith("architect_") || hop.step.startsWith("skeleton_audit_")
        ? "outlining"
        : "writing";
    const hopPhase = (
      hop.step === "architect_acts" ||
      hop.step === "architect_chapters" ||
      hop.step === "architect_manifests" ||
      hop.step === "skeleton_audit_acts" ||
      hop.step === "skeleton_audit_chapters" ||
      hop.step === "skeleton_audit_manifests" ||
      hop.step === "scene_dispatch" ||
      hop.step === "scene_draft" ||
      hop.step === "logic_audit" ||
      hop.step === "style_polish" ||
      hop.step === "scene_tic_scrub" ||
      hop.step === "state_commit" ||
      hop.step === "chapter_audit" ||
      hop.step === "chapter_revise"
        ? hop.step
        : orch.phase === "error"
          ? "architect_acts"
          : orch.phase
    ) as typeof orch.phase;
    await updateNovel({
      id: id.data,
      status: resumeStatus,
      orchestratorStatus: {
        ...orch,
        phase: hopPhase,
        step: hop.step,
        chapterNumber: hop.chapterNumber ?? orch.chapterNumber,
        sceneId: hop.sceneId ?? orch.sceneId,
        iteration: hop.iteration ?? orch.iteration,
        label: `Setze fort (${hop.step})…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({
      hop,
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(id.data);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Orchestrator-Start fehlgeschlagen.",
    };
  }
}

function parseNovelId(input: unknown): string | null {
  const id = z.string().uuid().safeParse(
    typeof input === "object" && input && "novelId" in input
      ? (input as { novelId: unknown }).novelId
      : input,
  );
  return id.success ? id.data : null;
}

/** Generate subtitle, Klappentext, 6 keywords + Vorsatz; persist. */
export async function generateNovelMarketingAction(
  input: unknown,
): Promise<
  ActionResult<{
    bundle: NovelBundle;
    subtitle: string;
    summary: string;
    keywords: string[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const { generateNovelMarketingCopy } = await import(
      "@/lib/novel/export-meta"
    );
    const copy = await generateNovelMarketingCopy(bundle);
    await upsertNovelExport({
      id: novelId,
      subtitle: copy.subtitle,
      summary: copy.summary,
      keywords: copy.keywords,
      vorsatz: copy.vorsatz as unknown as Record<string, unknown>,
    });
    const next = await getNovelBundle(novelId);
    if (!next) return { success: false, error: "Speichern fehlgeschlagen." };
    revalidateNovel(novelId);
    return {
      success: true,
      data: {
        bundle: next,
        subtitle: copy.subtitle,
        summary: copy.summary,
        keywords: copy.keywords,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Marketing-Texte fehlgeschlagen.",
    };
  }
}

/** Cover via gpt-image-2.5-sunburst 1600×2400 JPEG. */
export async function generateNovelCoverAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const { generateNovelCoverImage } = await import(
      "@/lib/novel/export-cover"
    );
    const cover = await generateNovelCoverImage(bundle);
    await upsertNovelExport({
      id: novelId,
      coverImageDataUrl: cover.dataUrl,
      coverPrompt: cover.prompt,
    });
    const next = await getNovelBundle(novelId);
    if (!next) return { success: false, error: "Cover speichern fehlgeschlagen." };
    revalidateNovel(novelId);
    return { success: true, data: { bundle: next } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover-Generierung fehlgeschlagen.",
    };
  }
}

const saveExportSchema = z.object({
  novelId: z.string().uuid(),
  subtitle: z.string().max(500).optional(),
  summary: z.string().max(20_000).optional(),
  keywords: z.array(z.string().max(80)).max(6).optional(),
  autorName: z.string().max(120).optional(),
  vorsatz: z.record(z.string(), z.unknown()).optional(),
});

/** Manual edits to export fields. */
export async function saveNovelExportAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = saveExportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }
  try {
    const existing = await getNovelBundle(parsed.data.novelId);
    if (!existing) return { success: false, error: "Roman nicht gefunden." };

    const base = parseVorsatzJson(
      parsed.data.vorsatz ?? existing.novel.vorsatz ?? emptyVorsatz(),
    );
    const subtitle =
      parsed.data.subtitle ?? existing.novel.subtitle;
    const autorName =
      parsed.data.autorName?.trim() || existing.novel.autorName;
    const vorsatz = {
      ...base,
      titelseite: {
        ...base.titelseite,
        titel: base.titelseite.titel.trim() || existing.novel.title,
        untertitel: subtitle.trim() || base.titelseite.untertitel,
        autor: autorName,
      },
      impressum: {
        ...base.impressum,
        rechteinhaber: autorName,
      },
    };

    await upsertNovelExport({
      id: parsed.data.novelId,
      subtitle: parsed.data.subtitle,
      summary: parsed.data.summary,
      keywords: parsed.data.keywords,
      autorName: parsed.data.autorName,
      vorsatz: vorsatz as unknown as Record<string, unknown>,
    });
    const next = await getNovelBundle(parsed.data.novelId);
    if (!next) return { success: false, error: "Roman nicht gefunden." };
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { bundle: next } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
    };
  }
}

/**
 * Full-manuscript Abnahmecheck by Lektor (Haiku 5.5): scores 1–10 + AI-voice gate.
 */
export async function runNovelAbnahmeAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle; abnahme: NovelAbnahme }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const { runNovelAbnahmeCheck } = await import("@/lib/novel/abnahme");
    const abnahme = await runNovelAbnahmeCheck(bundle);
    await upsertNovelAbnahme(
      novelId,
      abnahme as unknown as Record<string, unknown>,
    );
    const next = await getNovelBundle(novelId);
    if (!next) return { success: false, error: "Abnahme speichern fehlgeschlagen." };
    revalidateNovel(novelId);
    return { success: true, data: { bundle: next, abnahme } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Abnahmecheck fehlgeschlagen.",
    };
  }
}

/**
 * Export leftover: async Formel-Tic scrub (per chapter). Primary gate is scene_tic_scrub.
 */
export async function startFormelTicScrubAction(
  input: unknown,
): Promise<
  ActionResult<{ accepted: true; hitChapters: number; hitTotal: number }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const phase = bundle.novel.orchestratorStatus.phase;
    if (phase === "formel_tic_scrub" && bundle.novel.status === "writing") {
      return {
        success: false,
        error: "Formel-Tic-Bereinigung läuft bereits.",
      };
    }
    if (
      (bundle.novel.status === "writing" ||
        bundle.novel.status === "outlining") &&
      phase !== "idle" &&
      phase !== "completed" &&
      phase !== "error"
    ) {
      return {
        success: false,
        error: "Pipeline läuft noch — bitte warten oder pausieren.",
      };
    }
    const { beginFormelTicScrub } = await import("@/lib/novel/formel-tic-scrub");
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const started = await beginFormelTicScrub(novelId);
    const kicked = await enqueueNovelJobHop({
      hop: started.hop,
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return {
      success: true,
      data: {
        accepted: true,
        hitChapters: started.hitChapters,
        hitTotal: started.hitTotal,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Formel-Tic-Bereinigung fehlgeschlagen.",
    };
  }
}

/**
 * HITL: freeze pyramid contracts (no prose). Next: compile briefs → write.
 */
export async function freezeSkeletonAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.skeletonFrozen) {
      return {
        success: false,
        error: "Pyramide ist bereits freigegeben.",
      };
    }
    if (bundle.scenes.length === 0) {
      return {
        success: false,
        error: "Noch keine Manifeste — bitte zuerst Architekt laufen lassen.",
      };
    }
    const { freezeSkeletonAndStartWriting } = await import(
      "@/lib/novel/novelOrchestrator"
    );
    await freezeSkeletonAndStartWriting(novelId);
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pyramide freigeben fehlgeschlagen.",
    };
  }
}

/**
 * After pyramid freeze: compile prose briefs from graph + manifests.
 */
export async function compileProseBriefsAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (!bundle.novel.skeletonFrozen) {
      return {
        success: false,
        error: "Zuerst Pyramide freigeben.",
      };
    }
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    await updateNovel({
      id: novelId,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "compile_prose_briefs",
        step: "compile_prose_briefs",
        label: "Kompiliere Prosa-Prompts…",
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({
      hop: { novelId, step: "compile_prose_briefs" },
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Prosa-Prompts kompilieren fehlgeschlagen.",
    };
  }
}

/**
 * After briefs exist: start scene_dispatch prose pipeline.
 */
export async function startProseWritingAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (!bundle.novel.skeletonFrozen) {
      return { success: false, error: "Zuerst Pyramide freigeben." };
    }
    const withBrief = bundle.scenes.filter((s) => s.briefing.trim().length >= 40);
    if (withBrief.length < 1) {
      return {
        success: false,
        error: "Noch keine Prosa-Prompts — bitte zuerst kompilieren.",
      };
    }
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "scene_dispatch",
        step: "scene_dispatch",
        label: "Prosa-Pipeline startet…",
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({
      hop: { novelId, step: "scene_dispatch" },
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Prosa starten fehlgeschlagen.",
    };
  }
}

/** Set Auto-Pilot vs Pause nach Szene. */
export async function setNovelPilotModeAction(
  input: unknown,
): Promise<ActionResult<{ pilotMode: "auto" | "pause_after_scene" }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = z
    .object({
      novelId: z.string().uuid(),
      pilotMode: z.enum(["auto", "pause_after_scene"]),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Pilot-Einstellungen." };
  }
  try {
    const { updateNovel } = await import("@/lib/novel/repository");
    await updateNovel({
      id: parsed.data.novelId,
      pilotMode: parsed.data.pilotMode,
    });
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { pilotMode: parsed.data.pilotMode } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Pilot-Modus speichern fehlgeschlagen.",
    };
  }
}

/** Soft-pause the hop chain (status=paused). */
export async function pauseNovelOrchestratorAction(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const { updateNovel } = await import("@/lib/novel/repository");
    await updateNovel({
      id: novelId,
      status: "paused",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        label: "Pausiert — Fortsetzen oder Nächste Szene.",
        error: null,
        haltReason: "manual_pause",
      },
    });
    revalidateNovel(novelId);
    return { success: true, data: { ok: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Pausieren fehlgeschlagen.",
    };
  }
}

const sceneEditSchema = z.object({
  novelId: z.string().uuid(),
  sceneId: z.string().uuid(),
  rawText: z.string().min(80).max(80_000),
});

/** Persist manual prose edit (no score — Top-Down uses logic audit). */
export async function saveSceneProseAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sceneEditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Szene-Text ungültig (mind. 80 Zeichen).",
    };
  }
  try {
    const bundle = await getNovelBundle(parsed.data.novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const scene = bundle.scenes.find((s) => s.id === parsed.data.sceneId);
    if (!scene) return { success: false, error: "Szene nicht gefunden." };
    const { upsertScene } = await import("@/lib/novel/repository");
    await upsertScene({
      ...scene,
      rawText: parsed.data.rawText.trim(),
      finalText:
        scene.status === "approved"
          ? parsed.data.rawText.trim()
          : scene.finalText,
    });
    revalidateNovel(parsed.data.novelId);
    const next = await getNovelBundle(parsed.data.novelId);
    if (!next) return { success: false, error: "Roman nach Speichern fehlt." };
    return { success: true, data: { bundle: next } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
    };
  }
}

/**
 * HITL Logik-Stopp: Speichern + sofortiger Logik-Recheck (Hinweise weg?).
 * Pass → Stilist-Hop; Fail → aktualisierte Markierungen, Gate bleibt.
 */
export async function saveAndRecheckLogicAction(
  input: unknown,
): Promise<
  ActionResult<{
    bundle: NovelBundle;
    passed: boolean;
    accepted: boolean;
    notes: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = sceneEditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Szene-Text ungültig (mind. 80 Zeichen).",
    };
  }
  try {
    const { saveAndRecheckLogic } = await import("@/lib/novel/tree-pipeline");
    const result = await saveAndRecheckLogic(parsed.data);
    if (result.passed && result.hop) {
      const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
      const kicked = await enqueueNovelJobHop({ hop: result.hop, delayMs: 0 });
      if (!kicked) {
        return {
          success: false,
          error:
            "Logik OK, aber Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
        };
      }
    }
    revalidateNovel(parsed.data.novelId);
    return {
      success: true,
      data: {
        bundle: result.bundle,
        passed: result.passed,
        accepted: result.passed,
        notes: result.notes,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern & Logik-Check fehlgeschlagen.",
    };
  }
}

/**
 * Fresh draft hop for one scene (manifest required; clears prose).
 */
export async function regenerateSceneAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean; bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = z
    .object({
      novelId: z.string().uuid(),
      sceneId: z.string().uuid(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Szenen-Angabe." };
  }
  const { novelId, sceneId } = parsed.data;
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (!bundle.novel.skeletonFrozen) {
      return {
        success: false,
        error: "Skelett noch nicht eingefroren.",
      };
    }
    const scene = bundle.scenes.find((s) => s.id === sceneId);
    if (!scene) return { success: false, error: "Szene nicht gefunden." };
    if (Object.keys(scene.manifest ?? {}).length < 2) {
      return { success: false, error: "Szene hat kein Manifest." };
    }
    const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
    if (!chapter) return { success: false, error: "Kapitel zur Szene fehlt." };

    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel, upsertScene, upsertChapter } = await import(
      "@/lib/novel/repository"
    );

    await upsertScene({
      ...scene,
      status: "drafting",
      rawText: "",
      finalText: "",
      score: 0,
      feedback: ["Manuell: Neu erzeugen gestartet."],
      logicNotes: "",
      summary: "",
      iteration: 0,
    });

    if (scene.status === "approved") {
      const siblings = bundle.scenes.filter(
        (s) =>
          s.chapterId === chapter.id &&
          s.id !== scene.id &&
          s.status === "approved",
      );
      const chapterText = siblings
        .slice()
        .sort((a, b) => a.sceneIndex - b.sceneIndex)
        .map((s) => s.finalText || s.rawText)
        .filter(Boolean)
        .join("\n\n");
      await upsertChapter({
        ...chapter,
        rawDraft: chapterText,
        finalText: chapterText,
        status: "drafting",
      });
    }

    const hop = {
      novelId,
      step: "scene_draft" as const,
      sceneId,
      chapterNumber: chapter.chapterNumber,
      iteration: 0,
    };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "scene_draft",
        step: "scene_draft",
        sceneId,
        chapterNumber: chapter.chapterNumber,
        iteration: 0,
        label: `Neu erzeugen Kap. ${chapter.chapterNumber}.${scene.sceneIndex}…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    const next = await getNovelBundle(novelId);
    if (!next) return { success: false, error: "Roman nach Start nicht gefunden." };
    return { success: true, data: { accepted: true, bundle: next } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Neu erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * After logic_gate halt: hand open logic notes back to the author model
 * („Übergeben“) — revise current prose against hints, then re-audit.
 * Optional `rawText` persists the HITL editor buffer before the hop.
 */
export async function retryLogicGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = z
    .object({
      novelId: z.string().uuid(),
      rawText: z.string().max(80_000).optional(),
    })
    .safeParse(
      typeof input === "object" && input && "novelId" in input
        ? input
        : { novelId: input },
    );
  if (!parsed.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  const novelId = parsed.data.novelId;
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (
      bundle.novel.orchestratorStatus.haltReason &&
      bundle.novel.orchestratorStatus.haltReason !== "logic_gate"
    ) {
      return { success: false, error: "Kein Logik-Stopp aktiv." };
    }
    const sceneId =
      bundle.novel.orchestratorStatus.sceneId ??
      bundle.scenes.find((s) => s.status === "error")?.id;
    if (!sceneId) {
      return { success: false, error: "Keine blockierte Szene gefunden." };
    }
    const scene = bundle.scenes.find((s) => s.id === sceneId);
    if (!scene) return { success: false, error: "Szene nicht gefunden." };
    if (!scene.logicNotes.trim()) {
      return {
        success: false,
        error: "Keine Logik-Hinweise zum Übergeben vorhanden.",
      };
    }
    const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel, upsertScene } = await import(
      "@/lib/novel/repository"
    );
    const handoffProse = parsed.data.rawText?.trim();
    // iteration=1 so the rewrite budget counts this as a fresh agentic attempt
    // and draft always sees logicNotes + prior prose.
    await upsertScene({
      ...scene,
      rawText:
        handoffProse && handoffProse.length >= 80
          ? handoffProse
          : scene.rawText,
      status: "drafting",
      iteration: 1,
    });
    const hop = {
      novelId,
      step: "scene_draft" as const,
      sceneId,
      chapterNumber: chapter?.chapterNumber,
      iteration: 1,
    };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "scene_draft",
        step: "scene_draft",
        sceneId,
        chapterNumber: chapter?.chapterNumber ?? null,
        iteration: 1,
        label: `Übergeben: Logik-Hinweise Kap. ${chapter?.chapterNumber ?? "?"}.${scene.sceneIndex}…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Übergeben fehlgeschlagen.",
    };
  }
}

/**
 * After structure_gate: rewrite the failed skeleton level (acts/chapters/manifests).
 */
export async function retryStructureGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason !== "structure_gate") {
      return { success: false, error: "Kein Struktur-Stopp aktiv." };
    }
    const step = bundle.novel.orchestratorStatus.step ?? "";
    const rewriteStep =
      step === "skeleton_audit_chapters"
        ? "architect_chapters"
        : step === "skeleton_audit_manifests"
          ? "architect_manifests"
          : "architect_acts";
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    const hop = {
      novelId,
      step: rewriteStep as
        | "architect_acts"
        | "architect_chapters"
        | "architect_manifests",
      iteration: 0,
    };
    await updateNovel({
      id: novelId,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: rewriteStep,
        step: rewriteStep,
        iteration: 0,
        label: `Struktur: ${rewriteStep} erneut…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Struktur-Retry fehlgeschlagen.",
    };
  }
}

/**
 * Wipe acts+downstream and re-run architect_acts from the fixed idea.
 */
export async function regenerateNovelActsAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.highConceptIdea.trim().length < 20) {
      return {
        success: false,
        error: "High-Concept-Idee fehlt — Akte können nicht neu erzeugt werden.",
      };
    }
    if (bundle.novel.ideaStatus === "interview") {
      return {
        success: false,
        error: "Idee noch im Interview — bitte zuerst übernehmen.",
      };
    }

    const {
      deleteChaptersAboveNumber,
      deleteNovelScenes,
      updateNovel,
      upsertKnowledgeGraph,
    } = await import("@/lib/novel/repository");
    const { STRUCTURE_REPORTS_KEY } = await import(
      "@/lib/novel/structure-reports"
    );
    const { retractForStructureRegen } = await import(
      "@/lib/novel/provenance"
    );
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");

    await deleteNovelScenes(novelId);
    await deleteChaptersAboveNumber(novelId, 0);
    try {
      const { deletePyramidEmbeddingsFromLayer } = await import(
        "@/lib/novel/repository"
      );
      await deletePyramidEmbeddingsFromLayer(novelId, "acts");
    } catch {
      /* RPC may be missing until migration is applied */
    }

    const retracted = retractForStructureRegen({
      matrix: { ...(bundle.novel.stateMatrix ?? {}) },
      entityStates: { ...(bundle.knowledgeGraph?.entityStates ?? {}) },
      timelineEvents: [...(bundle.knowledgeGraph?.timelineEvents ?? [])],
      fromLayer: "acts",
    });
    delete retracted.matrix.__structureAudit;
    const reports =
      retracted.matrix[STRUCTURE_REPORTS_KEY] &&
      typeof retracted.matrix[STRUCTURE_REPORTS_KEY] === "object" &&
      !Array.isArray(retracted.matrix[STRUCTURE_REPORTS_KEY])
        ? {
            ...(retracted.matrix[STRUCTURE_REPORTS_KEY] as Record<
              string,
              unknown
            >),
          }
        : {};
    delete reports.acts;
    delete reports.chapters;
    delete reports.manifests;
    retracted.matrix[STRUCTURE_REPORTS_KEY] = reports;

    await upsertKnowledgeGraph({
      novelId,
      entityStates: retracted.entityStates,
      timelineEvents: retracted.timelineEvents,
    });
    await updateNovel({
      id: novelId,
      skeleton: { premise: "", acts: [], chapters: [] },
      skeletonFrozen: false,
      stateMatrix: retracted.matrix,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "architect_acts",
        step: "architect_acts",
        chapterNumber: null,
        sceneId: null,
        iteration: 0,
        label: "Akte werden neu erzeugt…",
        error: null,
        haltReason: null,
      },
    });

    const kicked = await enqueueNovelJobHop({
      hop: { novelId, step: "architect_acts", iteration: 0 },
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Akte neu erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * Keep acts; wipe chapters+scenes and re-run architect_chapters.
 */
export async function regenerateNovelChaptersAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };

    const sk = bundle.novel.skeleton ?? {};
    const acts = Array.isArray((sk as { acts?: unknown }).acts)
      ? (sk as { acts: unknown[] }).acts
      : [];
    if (acts.length < 2) {
      return {
        success: false,
        error: "Noch keine Akte — zuerst Akte erzeugen.",
      };
    }

    const {
      deleteChaptersAboveNumber,
      deleteNovelScenes,
      updateNovel,
      upsertKnowledgeGraph,
    } = await import("@/lib/novel/repository");
    const { STRUCTURE_REPORTS_KEY } = await import(
      "@/lib/novel/structure-reports"
    );
    const { retractForStructureRegen } = await import(
      "@/lib/novel/provenance"
    );
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");

    await deleteNovelScenes(novelId);
    await deleteChaptersAboveNumber(novelId, 0);

    const premise =
      typeof (sk as { premise?: unknown }).premise === "string"
        ? (sk as { premise: string }).premise
        : "";
    try {
      const { deletePyramidEmbeddingsFromLayer } = await import(
        "@/lib/novel/repository"
      );
      await deletePyramidEmbeddingsFromLayer(novelId, "chapters");
    } catch {
      /* migration optional until applied */
    }
    const retracted = retractForStructureRegen({
      matrix: { ...(bundle.novel.stateMatrix ?? {}) },
      entityStates: { ...(bundle.knowledgeGraph?.entityStates ?? {}) },
      timelineEvents: [...(bundle.knowledgeGraph?.timelineEvents ?? [])],
      fromLayer: "chapters",
    });
    delete retracted.matrix.__structureAudit;
    const reports =
      retracted.matrix[STRUCTURE_REPORTS_KEY] &&
      typeof retracted.matrix[STRUCTURE_REPORTS_KEY] === "object" &&
      !Array.isArray(retracted.matrix[STRUCTURE_REPORTS_KEY])
        ? {
            ...(retracted.matrix[STRUCTURE_REPORTS_KEY] as Record<
              string,
              unknown
            >),
          }
        : {};
    delete reports.chapters;
    delete reports.manifests;
    retracted.matrix[STRUCTURE_REPORTS_KEY] = reports;

    await upsertKnowledgeGraph({
      novelId,
      entityStates: retracted.entityStates,
      timelineEvents: retracted.timelineEvents,
    });
    await updateNovel({
      id: novelId,
      skeleton: {
        premise,
        acts,
        chapters: [],
      },
      skeletonFrozen: false,
      stateMatrix: retracted.matrix,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "architect_chapters",
        step: "architect_chapters",
        chapterNumber: null,
        sceneId: null,
        iteration: 0,
        label: "Kapitel werden neu erzeugt…",
        error: null,
        haltReason: null,
      },
    });

    const kicked = await enqueueNovelJobHop({
      hop: { novelId, step: "architect_chapters", iteration: 0 },
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel neu erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * Keep acts+chapters; wipe scenes/manifests and re-run architect_manifests.
 */
export async function regenerateNovelManifestsAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };

    const sk = bundle.novel.skeleton ?? {};
    const chapters = Array.isArray((sk as { chapters?: unknown }).chapters)
      ? (sk as { chapters: unknown[] }).chapters
      : [];
    if (chapters.length < 10) {
      return {
        success: false,
        error: "Noch keine Kapitel — zuerst Kapitel erzeugen.",
      };
    }

    const { deleteNovelScenes, updateNovel, upsertChapter, upsertKnowledgeGraph } =
      await import("@/lib/novel/repository");
    const { STRUCTURE_REPORTS_KEY } = await import(
      "@/lib/novel/structure-reports"
    );
    const { retractForStructureRegen } = await import(
      "@/lib/novel/provenance"
    );
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");

    await deleteNovelScenes(novelId);

    // Prose layer rides on scenes — clear assembled chapter drafts too.
    for (const chapter of bundle.chapters) {
      if (!(chapter.finalText || chapter.rawDraft).trim()) continue;
      await upsertChapter({
        id: chapter.id,
        novelId,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        outline: chapter.outline,
        scenePlan: chapter.scenePlan,
        contract: chapter.contract ?? undefined,
        rawDraft: "",
        finalText: "",
        status: "planned",
      });
    }

    try {
      const { deletePyramidEmbeddingsFromLayer } = await import(
        "@/lib/novel/repository"
      );
      await deletePyramidEmbeddingsFromLayer(novelId, "scenes");
    } catch {
      /* migration optional until applied */
    }
    const retracted = retractForStructureRegen({
      matrix: { ...(bundle.novel.stateMatrix ?? {}) },
      entityStates: { ...(bundle.knowledgeGraph?.entityStates ?? {}) },
      timelineEvents: [...(bundle.knowledgeGraph?.timelineEvents ?? [])],
      fromLayer: "scenes",
    });
    delete retracted.matrix.__structureAudit;
    const reports =
      retracted.matrix[STRUCTURE_REPORTS_KEY] &&
      typeof retracted.matrix[STRUCTURE_REPORTS_KEY] === "object" &&
      !Array.isArray(retracted.matrix[STRUCTURE_REPORTS_KEY])
        ? {
            ...(retracted.matrix[STRUCTURE_REPORTS_KEY] as Record<
              string,
              unknown
            >),
          }
        : {};
    delete reports.manifests;
    retracted.matrix[STRUCTURE_REPORTS_KEY] = reports;

    await upsertKnowledgeGraph({
      novelId,
      entityStates: retracted.entityStates,
      timelineEvents: retracted.timelineEvents,
    });
    await updateNovel({
      id: novelId,
      skeletonFrozen: false,
      stateMatrix: retracted.matrix,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "architect_manifests",
        step: "architect_manifests",
        chapterNumber: 1,
        sceneId: null,
        iteration: 0,
        label: "Szenen/Manifeste werden neu erzeugt…",
        error: null,
        haltReason: null,
      },
    });

    const kicked = await enqueueNovelJobHop({
      hop: {
        novelId,
        step: "architect_manifests",
        chapterNumber: 1,
        iteration: 0,
      },
      delayMs: 0,
    });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Manifeste neu erzeugen fehlgeschlagen.",
    };
  }
}

/**
 * After structure_gate: accept gaps and continue to the next pyramid level / freeze.
 */
export async function forceStructureGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason !== "structure_gate") {
      return { success: false, error: "Kein Struktur-Stopp aktiv." };
    }
    const step = bundle.novel.orchestratorStatus.step ?? "";
    const nextStep =
      step === "skeleton_audit_acts"
        ? "architect_chapters"
        : step === "skeleton_audit_chapters"
          ? "architect_manifests"
          : null;
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");

    if (!nextStep) {
      // manifests level — go to freeze gate
      const sceneCount = bundle.scenes.length;
      await updateNovel({
        id: novelId,
        status: "paused",
        orchestratorStatus: {
          ...bundle.novel.orchestratorStatus,
          phase: "architect_manifests",
          step: "architect_manifests",
          label: `Struktur-Warnung akzeptiert · ${sceneCount} Manifeste — Freeze prüfen.`,
          error: bundle.novel.orchestratorStatus.error,
          haltReason: "skeleton_gate",
        },
      });
      revalidateNovel(novelId);
      return { success: true, data: { accepted: true } };
    }

    const hop = { novelId, step: nextStep as "architect_chapters" | "architect_manifests" };
    await updateNovel({
      id: novelId,
      status: "outlining",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: nextStep,
        step: nextStep,
        label: `Struktur akzeptiert — weiter mit ${nextStep}…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Struktur-Freigabe fehlgeschlagen.",
    };
  }
}

/**
 * After chapter_gate: accept dramaturgy warnings and continue to next scenes.
 */
export async function forceChapterGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason !== "chapter_gate") {
      return { success: false, error: "Kein Kapitel-Stopp aktiv." };
    }
    const chapterNumber = bundle.novel.orchestratorStatus.chapterNumber;
    const chapter =
      chapterNumber != null
        ? bundle.chapters.find((c) => c.chapterNumber === chapterNumber)
        : undefined;
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel, upsertChapter } = await import(
      "@/lib/novel/repository"
    );
    if (chapter) {
      await upsertChapter({
        ...chapter,
        status: "approved_with_warnings",
      });
    }
    const hop = { novelId, step: "scene_dispatch" as const };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "scene_dispatch",
        step: "scene_dispatch",
        label: `Kap. ${chapterNumber ?? "?"} akzeptiert — nächste Szene…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel-Freigabe fehlgeschlagen.",
    };
  }
}

/**
 * After chapter_gate: re-run chapter dramaturgy audit (no prose change).
 */
export async function retryChapterGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason !== "chapter_gate") {
      return { success: false, error: "Kein Kapitel-Stopp aktiv." };
    }
    const chapterNumber = bundle.novel.orchestratorStatus.chapterNumber;
    if (chapterNumber == null || chapterNumber < 1) {
      return { success: false, error: "Keine Kapitelnummer für Audit." };
    }
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    const hop = {
      novelId,
      step: "chapter_audit" as const,
      chapterNumber,
    };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "chapter_audit",
        step: "chapter_audit",
        chapterNumber,
        label: `Kapitel-Audit Kap. ${chapterNumber} erneut…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel-Audit-Retry fehlgeschlagen.",
    };
  }
}

/**
 * After chapter_gate: hand dramaturgy notes to the author model („Übergeben“),
 * revise chapter prose, then re-run chapter_audit.
 */
export async function handOffChapterGateAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason !== "chapter_gate") {
      return { success: false, error: "Kein Kapitel-Stopp aktiv." };
    }
    const chapterNumber = bundle.novel.orchestratorStatus.chapterNumber;
    if (chapterNumber == null || chapterNumber < 1) {
      return { success: false, error: "Keine Kapitelnummer für Übergeben." };
    }
    const chapter = bundle.chapters.find(
      (c) => c.chapterNumber === chapterNumber,
    );
    if (!chapter) return { success: false, error: "Kapitel nicht gefunden." };
    const hasNotes = bundle.scenes.some(
      (s) =>
        s.chapterId === chapter.id &&
        s.logicNotes.trim().startsWith("[KAPITEL-AUDIT]"),
    );
    if (!hasNotes && !String(bundle.novel.orchestratorStatus.error ?? "").trim()) {
      return {
        success: false,
        error: "Keine Dramaturgie-Hinweise zum Übergeben vorhanden.",
      };
    }

    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    const hop = {
      novelId,
      step: "chapter_revise" as const,
      chapterNumber,
    };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "chapter_revise",
        step: "chapter_revise",
        chapterNumber,
        label: `Übergeben: Dramaturgie Kap. ${chapterNumber}…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Kapitel-Übergeben fehlgeschlagen.",
    };
  }
}

/**
 * After logic_gate: skip further audit and run style polish on current raw text.
 */
export async function forceStylePolishAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    const sceneId =
      bundle.novel.orchestratorStatus.sceneId ??
      bundle.scenes.find((s) => s.status === "error")?.id;
    if (!sceneId) {
      return { success: false, error: "Keine blockierte Szene gefunden." };
    }
    const scene = bundle.scenes.find((s) => s.id === sceneId);
    if (!scene) return { success: false, error: "Szene nicht gefunden." };
    if (scene.rawText.trim().length < 80) {
      return {
        success: false,
        error: "Rohtext fehlt — bitte zuerst editieren und speichern.",
      };
    }
    const chapter = bundle.chapters.find((c) => c.id === scene.chapterId);
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel, upsertScene } = await import(
      "@/lib/novel/repository"
    );
    await upsertScene({
      ...scene,
      status: "polishing",
      logicNotes: `${scene.logicNotes}\n[HITL] Logik-Gate übersprungen — Stilist.`.trim(),
      feedback: [
        ...(scene.feedback ?? []),
        "Manuell: Logik-Gate übersprungen, Stil-Politur.",
      ],
    });
    const hop = {
      novelId,
      step: "style_polish" as const,
      sceneId,
      chapterNumber: chapter?.chapterNumber,
    };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "style_polish",
        step: "style_polish",
        sceneId,
        chapterNumber: chapter?.chapterNumber ?? null,
        label: `Stil (Zwang) Kap. ${chapter?.chapterNumber ?? "?"}.${scene.sceneIndex}…`,
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Stil-Freigabe fehlgeschlagen.",
    };
  }
}

/** After HITL pause: kick scene_dispatch for the next pending scene. */
export async function resumeNextSceneAction(
  input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const novelId = parseNovelId(input);
  if (!novelId) return { success: false, error: "Ungültige Buch-ID." };
  try {
    const bundle = await getNovelBundle(novelId);
    if (!bundle) return { success: false, error: "Roman nicht gefunden." };
    if (bundle.novel.orchestratorStatus.haltReason === "logic_gate") {
      return {
        success: false,
        error:
          "Logik-Stopp aktiv — bitte „Übergeben“, „Speichern & prüfen“ oder „Trotzdem stilisieren“.",
      };
    }
    if (bundle.novel.orchestratorStatus.haltReason === "chapter_gate") {
      return {
        success: false,
        error:
          "Kapitel-Dramaturgie-Stopp — bitte „Übergeben“, „Kapitel erneut prüfen“ oder „Kapitel akzeptieren“.",
      };
    }
    if (bundle.novel.orchestratorStatus.haltReason === "skeleton_gate") {
      return freezeSkeletonAction({ novelId });
    }
    if (!bundle.novel.skeletonFrozen) {
      return {
        success: false,
        error: "Skelett noch nicht freigegeben.",
      };
    }
    const briefsReady = bundle.scenes.some(
      (s) => s.briefing.trim().length >= 40,
    );
    const phase = bundle.novel.orchestratorStatus.phase;
    if (
      !briefsReady ||
      phase === "prose_pending" ||
      phase === "compile_prose_briefs"
    ) {
      if (!briefsReady) {
        return compileProseBriefsAction({ novelId });
      }
      return startProseWritingAction({ novelId });
    }
    const { enqueueNovelJobHop } = await import("@/lib/novel/novel-job-kick");
    const { updateNovel } = await import("@/lib/novel/repository");
    const hop = { novelId, step: "scene_dispatch" as const };
    await updateNovel({
      id: novelId,
      status: "writing",
      orchestratorStatus: {
        ...bundle.novel.orchestratorStatus,
        phase: "scene_dispatch",
        step: "scene_dispatch",
        label: "Nächste Szene…",
        error: null,
        haltReason: null,
      },
    });
    const kicked = await enqueueNovelJobHop({ hop, delayMs: 0 });
    if (!kicked) {
      return {
        success: false,
        error:
          "Job-Start fehlgeschlagen (LESENO_INTERNAL_JOB_SECRET / Site-URL prüfen).",
      };
    }
    revalidateNovel(novelId);
    return { success: true, data: { accepted: true } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Nächste Szene starten fehlgeschlagen.",
    };
  }
}

const novelIdOnlySchema = z.object({
  novelId: z.string().uuid(),
});

/** Seed first Haiku question when interview messages are empty. */
export async function startNovelIdeaInterviewAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = novelIdOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  try {
    const { startNovelIdeaInterview } = await import(
      "@/lib/novel/idea-interview"
    );
    const bundle = await startNovelIdeaInterview(parsed.data.novelId);
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { bundle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Interview-Start fehlgeschlagen.",
    };
  }
}

const interviewTurnSchema = z.object({
  novelId: z.string().uuid(),
  userMessage: z
    .string()
    .min(2, "Bitte eine Antwort eingeben.")
    .max(20_000, "Antwort zu lang."),
});

/** One interview turn: Luna weaves idea, Haiku asks next question. */
export async function novelIdeaInterviewTurnAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = interviewTurnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }
  try {
    const { runNovelIdeaInterviewTurn } = await import(
      "@/lib/novel/idea-interview"
    );
    const bundle = await runNovelIdeaInterviewTurn(parsed.data);
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { bundle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Interview-Runde fehlgeschlagen.",
    };
  }
}

/** Lock idea (`ideaStatus=ready`) so the orchestrator can start. */
export async function finalizeNovelIdeaAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = novelIdOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Buch-ID." };
  }
  try {
    const { finalizeNovelIdea } = await import("@/lib/novel/idea-interview");
    const bundle = await finalizeNovelIdea(parsed.data.novelId);
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { bundle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Idee übernehmen fehlgeschlagen.",
    };
  }
}

const saveIdeaSchema = z.object({
  novelId: z.string().uuid(),
  highConceptIdea: z
    .string()
    .max(100_000, "Idee zu lang (max. 100.000 Zeichen)."),
  ideaStatus: z.enum(["ready", "interview"]).optional(),
});

/** Paste / manual edit of high_concept_idea; optional status switch. */
export async function saveNovelIdeaAction(
  input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  const parsed = saveIdeaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.",
    };
  }
  try {
    const { saveNovelIdeaText } = await import("@/lib/novel/idea-interview");
    const idea = parsed.data.highConceptIdea.trim();
    const status = parsed.data.ideaStatus;
    if (status === "ready" && idea.length < 20) {
      return {
        success: false,
        error: "Idee noch zu kurz (mind. 20 Zeichen).",
      };
    }
    const bundle = await saveNovelIdeaText({
      novelId: parsed.data.novelId,
      highConceptIdea: idea,
      ideaStatus: status,
    });
    revalidateNovel(parsed.data.novelId);
    return { success: true, data: { bundle } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Idee speichern fehlgeschlagen.",
    };
  }
}
