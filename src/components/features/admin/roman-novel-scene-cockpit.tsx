"use client";

/**
 * Scene cockpit for Top-Down pipeline: manifest + prose edit + regenerate draft.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  regenerateSceneAction,
  saveSceneProseAction,
} from "@/app/actions/roman-novel";
import { HighlightedProseEditor } from "@/components/features/admin/highlighted-prose-editor";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  NOVEL_CHAPTER_JOB_LABELS,
  NOVEL_SCENE_BEAT_LABELS,
} from "@/lib/novel/chapter-contract";
import { extractEditMarkQuotes } from "@/lib/novel/feedback-marks";
import type { NovelBundle, NovelScene } from "@/lib/novel/types";

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
      return "fertig";
    case "error":
      return "Logik-Stopp";
    default:
      return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-900";
    case "error":
      return "bg-amber-100 text-amber-900";
    case "drafting":
    case "auditing":
    case "polishing":
      return "bg-orange-100 text-orange-900";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

function chapterNumberFor(bundle: NovelBundle, chapterId: string): number {
  return bundle.chapters.find((c) => c.id === chapterId)?.chapterNumber ?? 0;
}

function sortScenes(bundle: NovelBundle): NovelScene[] {
  return [...bundle.scenes].sort((a, b) => {
    const ca = chapterNumberFor(bundle, a.chapterId);
    const cb = chapterNumberFor(bundle, b.chapterId);
    if (ca !== cb) return ca - cb;
    return a.sceneIndex - b.sceneIndex;
  });
}

function sceneProse(scene: NovelScene): string {
  return (scene.finalText || scene.rawText).trim();
}

export function RomanNovelSceneCockpit({
  bundle,
  running,
  canSave,
  onBundle,
  onJobStarted,
}: {
  bundle: NovelBundle;
  running: boolean;
  canSave: boolean;
  onBundle: (next: NovelBundle) => void;
  onJobStarted?: () => void;
}) {
  const orch = bundle.novel.orchestratorStatus;
  const ordered = useMemo(() => sortScenes(bundle), [bundle]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => orch.sceneId ?? ordered[0]?.id ?? null,
  );
  const userPicked = useRef(false);
  const [editText, setEditText] = useState("");
  const [pending, setPending] = useState<"save" | "regen" | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);

  useEffect(() => {
    if (userPicked.current) return;
    if (orch.sceneId) setSelectedId(orch.sceneId);
  }, [orch.sceneId]);

  const selected =
    ordered.find((s) => s.id === selectedId) ?? ordered[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setEditText("");
      return;
    }
    setEditText(sceneProse(selected) || selected.rawText || "");
  }, [selected?.id, selected?.rawText, selected?.finalText]);

  const dirty =
    Boolean(selected) &&
    editText.trim() !== (sceneProse(selected!) || selected!.rawText || "").trim();
  const editQuotes = useMemo(
    () =>
      selected
        ? extractEditMarkQuotes({
            feedback: selected.feedback,
            logicNotes: selected.logicNotes,
          })
        : [],
    [selected?.id, selected?.feedback, selected?.logicNotes],
  );

  async function onSave() {
    if (!canSave || !selected || pending || running) return;
    if (editText.trim().length < 80) {
      toast.error("Text zu kurz (mind. 80 Zeichen).");
      return;
    }
    setPending("save");
    try {
      const result = await saveSceneProseAction({
        novelId: bundle.novel.id,
        sceneId: selected.id,
        rawText: editText,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      toast.success("Szene gespeichert.");
    } finally {
      setPending(null);
    }
  }

  async function onRegen() {
    if (!canSave || !selected || pending || running) return;
    setPending("regen");
    try {
      const result = await regenerateSceneAction({
        novelId: bundle.novel.id,
        sceneId: selected.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Neu erzeugen fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      onJobStarted?.();
      setRegenOpen(false);
      toast.success("Draft neu gestartet.");
    } finally {
      setPending(null);
    }
  }

  const chaptersNav = useMemo(() => {
    const map = new Map<number, NovelScene[]>();
    for (const s of ordered) {
      const n = chapterNumberFor(bundle, s.chapterId);
      const list = map.get(n) ?? [];
      list.push(s);
      map.set(n, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, scenes]) => ({
        num,
        title:
          bundle.chapters.find((c) => c.chapterNumber === num)?.title ?? "",
        scenes,
      }));
  }, [bundle, ordered]);

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Noch keine Szenen-Manifeste — zuerst Architekt bis Freeze.
      </p>
    );
  }

  const chNum = selected
    ? chapterNumberFor(bundle, selected.chapterId)
    : 0;
  const chapter = selected
    ? bundle.chapters.find((c) => c.id === selected.chapterId)
    : undefined;
  const manifest = selected?.manifest ?? {};
  const beatRaw =
    typeof manifest.beat === "string" ? manifest.beat : undefined;
  const beatLabel = beatRaw
    ? (NOVEL_SCENE_BEAT_LABELS[
        beatRaw as keyof typeof NOVEL_SCENE_BEAT_LABELS
      ] ?? beatRaw)
    : null;
  const jobLabel = chapter?.contract?.job
    ? NOVEL_CHAPTER_JOB_LABELS[chapter.contract.job]
    : null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <ul className="max-h-[70vh] min-w-0 space-y-1.5 overflow-y-auto">
        {chaptersNav.map((ch) => {
          const hasActive = ch.scenes.some((s) => s.id === selected?.id);
          return (
            <li key={`nav-ch-${ch.num}`}>
              <details
                key={`nav-ch-details-${ch.num}-${hasActive ? "on" : "off"}`}
                className="group rounded-xl bg-zinc-50 ring-1 ring-zinc-950/5 open:bg-white"
                {...(hasActive ? { open: true } : {})}
              >
                <summary className="cursor-pointer list-none px-2.5 py-2 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className="mt-0.5 shrink-0 text-[10px] font-bold text-zinc-400 transition-transform group-open:rotate-90"
                    >
                      ▶
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-zinc-900">
                        Kap. {ch.num}
                        <span className="ml-1.5 text-[10px] font-bold text-zinc-500">
                          {ch.scenes.length}
                        </span>
                      </p>
                      {ch.title ? (
                        <p className="line-clamp-1 text-[10px] font-semibold text-zinc-500">
                          {ch.title}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </summary>
                <ul className="space-y-1 border-t border-zinc-100 px-1.5 py-1.5">
                  {ch.scenes.map((s) => {
                    const active = selected?.id === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            userPicked.current = true;
                            setSelectedId(s.id);
                          }}
                          className={
                            active
                              ? "w-full rounded-lg bg-orange-700 px-2.5 py-1.5 text-left text-xs font-bold text-white"
                              : "w-full rounded-lg bg-white px-2.5 py-1.5 text-left text-xs font-bold text-zinc-800 ring-1 ring-zinc-950/5 hover:bg-zinc-100"
                          }
                        >
                          <span>
                            {ch.num}.{s.sceneIndex}
                          </span>
                          <span
                            className={
                              active
                                ? "ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]"
                                : `ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${statusTone(s.status)}`
                            }
                          >
                            {sceneStatusLabel(s.status)}
                          </span>
                          <p
                            className={
                              active
                                ? "mt-0.5 line-clamp-2 font-semibold text-orange-50"
                                : "mt-0.5 line-clamp-2 font-semibold text-zinc-500"
                            }
                          >
                            {s.planSummary || "—"}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div className="min-w-0 space-y-4 overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-zinc-950">
                Kap. {chNum}.{selected.sceneIndex}
              </h3>
              <p className="break-words text-xs text-zinc-500">
                {sceneStatusLabel(selected.status)}
                {jobLabel ? ` · Job ${jobLabel}` : ""}
                {beatLabel ? ` · Beat ${beatLabel}` : ""}
                {selected.iteration > 0
                  ? ` · Logik-Rewrite ${selected.iteration}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canSave || Boolean(pending) || running || !dirty}
                onClick={() => void onSave()}
                className="inline-flex items-center rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {pending === "save" ? (
                  <Loader2
                    className="mr-1.5 size-3.5 animate-spin"
                    aria-hidden
                  />
                ) : null}
                Speichern
              </button>
              <button
                type="button"
                disabled={
                  !canSave ||
                  Boolean(pending) ||
                  running ||
                  !bundle.novel.skeletonFrozen
                }
                onClick={() => setRegenOpen(true)}
                className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-zinc-950/10 disabled:opacity-50"
              >
                Neu erzeugen
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Manifest (immutable)
            </p>
            <pre className="mt-1 max-h-48 max-w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-3 font-sans text-[11px] leading-relaxed text-zinc-700 [overflow-wrap:anywhere]">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </div>

          {selected.logicNotes.trim() ? (
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Logik-Notizen
              </p>
              <pre className="mt-1 max-h-32 max-w-full min-w-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-amber-50/80 p-3 font-sans text-xs text-amber-950 [overflow-wrap:anywhere]">
                {selected.logicNotes}
              </pre>
            </div>
          ) : null}

          <div className="min-w-0">
            <label
              htmlFor="scene-prose"
              className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase"
            >
              Prosa{dirty ? " · ungespeichert" : ""}
              {editQuotes.length > 0
                ? ` · ${editQuotes.length} Markierung${editQuotes.length === 1 ? "" : "en"}`
                : ""}
            </label>
            <HighlightedProseEditor
              id="scene-prose"
              value={editText}
              onChange={setEditText}
              quotes={editQuotes}
              disabled={!canSave || Boolean(pending) || running}
              rows={16}
              className="mt-1 max-w-full min-w-0 bg-white ring-1 ring-zinc-950/10 focus-within:ring-2 focus-within:ring-orange-700"
            />
            {editQuotes.length > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Gelb: Stellen aus Logik-Notizen / Feedback — dort nachbessern.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={regenOpen}
        title="Szene neu erzeugen?"
        description={`Kap. ${chNum}.${selected?.sceneIndex ?? "?"} wird neu gedraftet (Manifest bleibt). Bestehender Text geht verloren.`}
        confirmLabel="Neu erzeugen"
        pending={pending === "regen"}
        onCancel={() => {
          if (pending !== "regen") setRegenOpen(false);
        }}
        onConfirm={() => void onRegen()}
      />
    </div>
  );
}
