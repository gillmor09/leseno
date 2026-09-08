"use client";

/**
 * Admin Social Media: CRAFT settings + single-post create (date + Winkel) and edit list.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateSocialCaptionAction,
  generateSocialImageAction,
  loadSocialWorkspaceAction,
  saveSocialGlobalSettingsAction,
} from "@/app/actions/social-admin";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import {
  emptyGlobalSettings,
  type SocialGlobalSettings,
  type SocialPost,
} from "@/lib/social/types";
import type { SocialAiModelInfo } from "@/lib/social/generate";
import {
  getMotivationAngleById,
  MOTIVATION_ANGLES,
  MOTIVATION_THEME_LABELS,
} from "@/lib/social/motivation";
import { LESENO_SOCIAL_STYLE_GUIDE } from "@/lib/social/leseno-visual-style";
import { cn } from "@/lib/utils";

const CHANNEL = "instagram" as const;

type GenerateConfirm =
  | { kind: "text" }
  | { kind: "image" };

async function copyCaptionText(text: string): Promise<void> {
  const value = text.trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Text kopiert", { duration: 1600 });
  } catch {
    toast.error("Kopieren fehlgeschlagen.");
  }
}

/** Click-to-copy caption — quiet affordance, no loud chrome. */
function CopyableCaption({
  text,
  emptyHint,
  className,
}: {
  text: string;
  emptyHint?: string;
  className?: string;
}) {
  const value = text.trim();
  if (!value) {
    return (
      <p className={cn("text-sm text-zinc-500", className)}>
        {emptyHint ?? "Kein Text."}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copyCaptionText(value)}
      title="Klicken zum Kopieren"
      className={cn(
        "group relative w-full rounded-xl text-left transition-colors",
        "hover:bg-zinc-950/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700/40",
        className,
      )}
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
        {value}
      </p>
      <span className="pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase opacity-0 shadow-sm ring-1 ring-zinc-950/5 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Copy className="size-3" aria-hidden />
        Kopieren
      </span>
    </button>
  );
}

function formatModelLine(model: SocialAiModelInfo): string {
  return `${model.modelSlug} · ${model.label}`;
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDeDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE");
}

function StatusChip({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase",
        active
          ? "bg-orange-100 text-orange-900 ring-1 ring-orange-700/20"
          : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-950/5",
      )}
    >
      {label}
    </span>
  );
}

/** Blocking wait overlay while caption/image AI runs. */
function SocialWaitOverlay({ message }: { message: string | null }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!message) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [message]);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="social-wait-title"
      aria-describedby="social-wait-desc"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center shadow-2xl ring-1 ring-zinc-950/10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 ring-1 ring-orange-700/15">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </span>
        <h2
          id="social-wait-title"
          className="mt-5 text-xl font-extrabold text-zinc-950"
        >
          Bitte warten
        </h2>
        <p
          id="social-wait-desc"
          className="mt-2 text-sm font-semibold text-orange-900"
        >
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}

export function SocialMediaAdminForm({
  canSave,
  textModel,
  imageModel,
}: {
  canSave: boolean;
  textModel: SocialAiModelInfo;
  imageModel: SocialAiModelInfo;
}) {
  const [global, setGlobal] = useState<SocialGlobalSettings>(emptyGlobalSettings);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [angleUsage, setAngleUsage] = useState<Record<string, number>>({});
  const [loadPending, setLoadPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [waitStatus, setWaitStatus] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [postDate, setPostDate] = useState(todayIsoDate);
  const [angleId, setAngleId] = useState(MOTIVATION_ANGLES[0]?.id ?? "");
  const [captionDraft, setCaptionDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateConfirm, setGenerateConfirm] =
    useState<GenerateConfirm | null>(null);

  const activePost = useMemo(
    () =>
      posts.find(
        (post) =>
          post.postDate === postDate &&
          post.channel === CHANNEL &&
          post.angleId === angleId,
      ) ?? null,
    [posts, postDate, angleId],
  );

  const anglesUsedToday = useMemo(() => {
    const used = new Set<string>();
    for (const post of posts) {
      if (post.postDate === postDate && post.angleId) {
        used.add(post.angleId);
      }
    }
    return used;
  }, [posts, postDate]);

  const selectedAngle = useMemo(
    () => getMotivationAngleById(angleId),
    [angleId],
  );

  const mergePost = useCallback((post: SocialPost) => {
    setPosts((prev) => {
      const without = prev.filter((item) => item.id !== post.id);
      return [post, ...without].sort((a, b) => {
        const byDate = b.postDate.localeCompare(a.postDate);
        if (byDate !== 0) return byDate;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    });
  }, []);

  const reloadWorkspace = useCallback(async () => {
    setLoadPending(true);
    const result = await loadSocialWorkspaceAction();
    setLoadPending(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Workspace konnte nicht geladen werden.");
      setPosts([]);
      setAngleUsage({});
      return;
    }
    setGlobal(result.data.global);
    setPosts(result.data.posts);
    setAngleUsage(result.data.angleUsage);
  }, []);

  useEffect(() => {
    void reloadWorkspace();
  }, [reloadWorkspace]);

  useEffect(() => {
    setCaptionDraft(activePost?.caption ?? "");
  }, [activePost]);

  const busy = pending || loadPending || Boolean(waitStatus);
  const fieldClass =
    "mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60";

  const textModelLine = formatModelLine(textModel);
  const imageModelLine = formatModelLine(imageModel);

  const confirmCopy = useMemo(() => {
    if (!generateConfirm) {
      return { title: "", description: "", confirmLabel: "" };
    }
    const dateLabel = formatDeDate(postDate);
    const angleLabel = selectedAngle?.title ?? angleId;
    if (generateConfirm.kind === "text") {
      return {
        title: "Text erzeugen?",
        description: `Caption für ${dateLabel}\nWinkel: ${angleLabel}\n\nKI-Modell: ${textModelLine}`,
        confirmLabel: "Text erzeugen",
      };
    }
    return {
      title: "Bild erzeugen?",
      description: `Bild für ${dateLabel}\nWinkel: ${angleLabel}\n\nSzenenplanung: ${textModelLine}\nBildpixel: ${imageModelLine}`,
      confirmLabel: "Bild erzeugen",
    };
  }, [
    generateConfirm,
    postDate,
    selectedAngle,
    angleId,
    textModelLine,
    imageModelLine,
  ]);

  function handleSaveGlobal() {
    if (!canSave) return;
    startTransition(async () => {
      const result = await saveSocialGlobalSettingsAction(global);
      if (!result.success) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      toast.success("Einstellungen gespeichert.");
    });
  }

  async function persistGlobal(): Promise<boolean> {
    const result = await saveSocialGlobalSettingsAction(global);
    if (!result.success) {
      toast.error(result.error ?? "Bitte Einstellungen speichern.");
      return false;
    }
    return true;
  }

  /** Collapse create form, clear drafts, expand & scroll to the saved post. */
  function focusCreatedPost(post: SocialPost) {
    setCreateOpen(false);
    setCaptionDraft("");
    setPostDate(todayIsoDate());
    setAngleId(MOTIVATION_ANGLES[0]?.id ?? "");
    setExpandedId(post.id);
    window.setTimeout(() => {
      document
        .getElementById(`social-post-${post.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function runConfirmedGenerate() {
    const job = generateConfirm;
    setGenerateConfirm(null);
    if (!job) return;

    if (!angleId.trim()) {
      toast.error("Bitte einen Winkel wählen.");
      return;
    }

    if (job.kind === "text") {
      setWaitStatus("Text wird erzeugt …");
      void (async () => {
        try {
          if (!(await persistGlobal())) return;
          const result = await generateSocialCaptionAction({
            postDate,
            angleId,
            channel: CHANNEL,
          });
          if (!result.success || !result.data) {
            toast.error(result.error ?? "Fehler");
            return;
          }
          mergePost(result.data.post);
          await reloadWorkspace();
          setCaptionDraft(result.data.post.caption);
          toast.success(
            `Text erzeugt und gespeichert — ${result.data.angleTitle}`,
          );
        } finally {
          setWaitStatus(null);
        }
      })();
      return;
    }

    setWaitStatus("Bild wird erzeugt …");
    void (async () => {
      try {
        if (!(await persistGlobal())) return;
        const result = await generateSocialImageAction({
          postDate,
          angleId,
          channel: CHANNEL,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Fehler");
          return;
        }
        mergePost(result.data.post);
        await reloadWorkspace();
        toast.success("Bild erzeugt und gespeichert.");
      } finally {
        setWaitStatus(null);
      }
    })();
  }

  return (
    <div className="space-y-10">
      <SocialWaitOverlay message={waitStatus} />

      {!canSave ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-700/20">
          Service-Role oder Migration fehlt — nur Vorschau.
        </p>
      ) : null}

      <section className="rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left"
        >
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">
              Übergreifende Einstellungen
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Stimme & Bild-Stil. Inhalt kommt vom gewählten Winkel auf{" "}
              <a
                href="/motivation"
                className="font-semibold text-orange-700 underline-offset-2 hover:underline"
              >
                /motivation
              </a>
              .
            </p>
          </div>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-zinc-500 transition-transform",
              settingsOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {settingsOpen ? (
          <div className="space-y-3 border-t border-zinc-950/10 px-6 pb-6 pt-4">
            <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Redaktionsnotiz (optional, nachrangig)
              <textarea
                rows={3}
                disabled={busy || !canSave}
                value={global.storyline}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, storyline: e.target.value }))
                }
                className={fieldClass}
                placeholder="Nur falls nötig — der Winkel steuert den Inhalt."
              />
            </label>
            <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Role
              <textarea
                rows={2}
                disabled={busy || !canSave}
                value={global.role}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, role: e.target.value }))
                }
                className={fieldClass}
                placeholder="Kolumnist:in — humorvoll, nie Oberlehrer"
              />
            </label>
            <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Format
              <textarea
                rows={2}
                disabled={busy || !canSave}
                value={global.format}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, format: e.target.value }))
                }
                className={fieldClass}
                placeholder="Hook → ein Punch → softes Ende, kurz"
              />
            </label>
            <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Action
              <textarea
                rows={2}
                disabled={busy || !canSave}
                value={global.action}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, action: e.target.value }))
                }
                className={fieldClass}
                placeholder="Schreibe einen Feed-Post zum Lesen"
              />
            </label>
            <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Bild-Stil (System für Szenenplanung → Bildmodell)
              <textarea
                rows={6}
                disabled={busy || !canSave}
                value={global.imagePrompt}
                onChange={(e) =>
                  setGlobal((g) => ({ ...g, imagePrompt: e.target.value }))
                }
                className={fieldClass}
                placeholder="Oder leer lassen → eingebauter leseno-Stil. Keine Bild-URLs."
              />
              <span className="mt-1 block text-[11px] font-semibold normal-case tracking-normal text-zinc-500">
                Bildmodelle malen keinen Text. Der Winkel-Titel wird danach
                exakt in Nunito SemiBold (weiß) aufgelegt.
              </span>
            </label>
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() =>
                setGlobal((g) => ({
                  ...g,
                  imagePrompt: LESENO_SOCIAL_STYLE_GUIDE,
                }))
              }
              className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-200 disabled:opacity-60"
            >
              leseno-Stilvorlage einsetzen
            </button>
            <div>
              <button
                type="button"
                disabled={busy || !canSave}
                onClick={handleSaveGlobal}
                className="mt-2 inline-flex rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-60"
              >
                Einstellungen speichern
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section
        id="social-create-card"
        className="scroll-mt-6 rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
      >
        <button
          type="button"
          aria-expanded={createOpen}
          onClick={() => setCreateOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left"
        >
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">
              Beitrag erstellen
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Datum und Winkel wählen — mehrere Beiträge pro Tag möglich, solange
              der Winkel anders ist.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {loadPending ? (
              <Loader2
                className="size-4 animate-spin text-zinc-500"
                aria-hidden
              />
            ) : null}
            <ChevronDown
              className={cn(
                "size-5 text-zinc-500 transition-transform",
                createOpen && "rotate-180",
              )}
              aria-hidden
            />
          </div>
        </button>

        {createOpen ? (
          <div className="border-t border-zinc-950/10 px-6 pb-6 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Datum
                <input
                  type="date"
                  disabled={busy || !canSave}
                  value={postDate}
                  onChange={(e) => {
                    if (e.target.value) setPostDate(e.target.value);
                  }}
                  className={fieldClass}
                />
              </label>
              <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Winkel
                <select
                  disabled={busy || !canSave}
                  value={angleId}
                  onChange={(e) => setAngleId(e.target.value)}
                  className={fieldClass}
                >
                  {MOTIVATION_ANGLES.map((angle) => {
                    const count = angleUsage[angle.id] ?? 0;
                    const usedToday = anglesUsedToday.has(angle.id);
                    return (
                      <option key={angle.id} value={angle.id}>
                        {angle.title} · {MOTIVATION_THEME_LABELS[angle.theme]} (
                        {count}×)
                        {usedToday ? " · heute schon" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {selectedAngle ? (
              <p className="mt-3 rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-950 ring-1 ring-orange-700/15">
                <span className="font-extrabold">{selectedAngle.title}</span>
                <span className="mt-1 block text-orange-900/90">
                  {selectedAngle.insight}
                </span>
              </p>
            ) : null}

            {activePost ? (
              <p className="mt-3 text-sm font-semibold text-zinc-600">
                Dieser Winkel existiert an diesem Tag schon — Erzeugen
                überschreibt Text bzw. Bild. Andere Winkel sind am gleichen Tag
                möglich.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !canSave || !angleId}
                onClick={() => setGenerateConfirm({ kind: "text" })}
                className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
              >
                Text erzeugen
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !canSave ||
                  !angleId ||
                  !(captionDraft.trim() || activePost?.caption?.trim())
                }
                onClick={() => setGenerateConfirm({ kind: "image" })}
                className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
                title={
                  !(captionDraft.trim() || activePost?.caption?.trim())
                    ? "Zuerst Text erzeugen"
                    : undefined
                }
              >
                Bild erzeugen
              </button>
            </div>

            <div className="mt-5">
              <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Caption
              </p>
              <CopyableCaption
                text={captionDraft}
                emptyHint="Noch kein Text — „Text erzeugen“ starten."
                className="mt-1 min-h-[8rem] rounded-xl border border-zinc-950/10 bg-zinc-50 px-3 py-2"
              />
            </div>

            {activePost?.imageDataUrl ? (
              <div className="mt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activePost.imageDataUrl}
                  alt={`Social-Bild ${formatDeDate(postDate)}`}
                  className="mx-auto max-h-[28rem] w-auto max-w-full rounded-2xl ring-1 ring-zinc-950/10"
                />
              </div>
            ) : null}

            {activePost ? (
              <div className="mt-6">
                <div className="border-t border-zinc-950/10" role="separator" />
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => focusCreatedPost(activePost)}
                    className="rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-60"
                  >
                    Übernehmen und zurücksetzen
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold text-zinc-950">
          Bestehende Beiträge ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm font-semibold text-zinc-500 shadow-xl ring-1 ring-zinc-950/10">
            Noch keine Beiträge — „Beitrag erstellen“ aufklappen.
          </p>
        ) : (
          posts.map((post) => {
            const angle = post.angleId
              ? getMotivationAngleById(post.angleId)
              : null;
            const open = expandedId === post.id;
            return (
              <article
                key={post.id}
                id={`social-post-${post.id}`}
                className="scroll-mt-6 rounded-[1.5rem] bg-white shadow-lg ring-1 ring-zinc-950/10"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => {
                    setExpandedId(open ? null : post.id);
                    setPostDate(post.postDate);
                    if (post.angleId) setAngleId(post.angleId);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div>
                    <p className="font-extrabold text-zinc-950">
                      {formatDeDate(post.postDate)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {angle?.title ?? post.angleId ?? "Ohne Winkel"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      active={Boolean(post.caption?.trim())}
                      label="Text"
                    />
                    <StatusChip
                      active={Boolean(post.imageDataUrl)}
                      label="Bild"
                    />
                    <ChevronDown
                      className={cn(
                        "size-4 text-zinc-400 transition-transform",
                        open && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </div>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-zinc-950/10 px-5 pb-5 pt-3">
                    <CopyableCaption
                      text={post.caption}
                      className="px-1 py-1"
                    />
                    {post.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.imageDataUrl}
                        alt=""
                        className="max-h-64 w-auto max-w-full rounded-xl ring-1 ring-zinc-950/10"
                      />
                    ) : null}
                    <button
                      type="button"
                      className="text-sm font-bold text-orange-700 underline-offset-2 hover:underline"
                      onClick={() => {
                        setPostDate(post.postDate);
                        if (post.angleId) setAngleId(post.angleId);
                        setCreateOpen(true);
                        window.setTimeout(() => {
                          document
                            .getElementById("social-create-card")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }, 50);
                      }}
                    >
                      Oben bearbeiten
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <ConfirmActionDialog
        open={Boolean(generateConfirm)}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        onCancel={() => setGenerateConfirm(null)}
        onConfirm={runConfirmedGenerate}
      />
    </div>
  );
}
