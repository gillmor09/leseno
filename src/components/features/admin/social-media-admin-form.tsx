"use client";

/**
 * Admin Social Media: CRAFT settings + create (Winkel or marketing) and edit list.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  commitSocialPostAction,
  generateSocialCaptionAction,
  generateSocialFrageAction,
  generateSocialImageAction,
  deleteSocialPostAction,
  loadSocialWorkspaceAction,
  saveSocialGlobalSettingsAction,
} from "@/app/actions/social-admin";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  frageDisplayTitle,
  newFrageAngleId,
} from "@/lib/social/frage";
import {
  buildMarketingAngleId,
  getMarketingTopicByAngleId,
  MARKETING_EXTRA_IDS,
  marketingFeatureLabel,
  parseMarketingAngleId,
  type MarketingFeatureId,
} from "@/lib/social/marketing-features";
import {
  emptyGlobalSettings,
  SOCIAL_POST_KIND_LABELS,
  type SocialGlobalSettings,
  type SocialPost,
  type SocialPostKind,
} from "@/lib/social/types";
import type { SocialAiModelInfo } from "@/lib/social/generate";
import {
  getMotivationAngleById,
  MOTIVATION_THEME_LABELS,
  SOCIAL_SELECTABLE_ANGLES,
  VS_CHAT_ANGLE_ID_PREFIX,
} from "@/lib/social/motivation";
import { LESENO_SOCIAL_STYLE_GUIDE } from "@/lib/social/leseno-visual-style";
import { PACKAGE_FEATURE_IDS } from "@/lib/users/packages";
import { cn } from "@/lib/utils";

const CHANNEL = "instagram" as const;

type GenerateConfirm =
  | { kind: "frage" }
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
  const [postKind, setPostKind] = useState<SocialPostKind>("winkel");
  const [angleId, setAngleId] = useState(SOCIAL_SELECTABLE_ANGLES[0]?.id ?? "");
  const [marketingFeatures, setMarketingFeatures] = useState<
    MarketingFeatureId[]
  >(["wissen"]);
  const [frageAngleId, setFrageAngleId] = useState(newFrageAngleId);
  const [frageDraft, setFrageDraft] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [imageDraft, setImageDraft] = useState<string | null>(null);
  const [lastImagePromptDraft, setLastImagePromptDraft] = useState<
    string | null
  >(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateConfirm, setGenerateConfirm] =
    useState<GenerateConfirm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialPost | null>(null);

  const marketingAngleId = useMemo(() => {
    if (marketingFeatures.length < 1 || marketingFeatures.length > 2) {
      return "";
    }
    try {
      return buildMarketingAngleId(marketingFeatures);
    } catch {
      return "";
    }
  }, [marketingFeatures]);

  const effectiveAngleId =
    postKind === "marketing"
      ? marketingAngleId
      : postKind === "frage"
        ? frageAngleId
        : angleId;

  const activePost = useMemo(
    () =>
      posts.find(
        (post) =>
          post.postDate === postDate &&
          post.channel === CHANNEL &&
          post.postKind === postKind &&
          post.angleId === effectiveAngleId,
      ) ?? null,
    [posts, postDate, postKind, effectiveAngleId],
  );

  const anglesUsedToday = useMemo(() => {
    const used = new Set<string>();
    for (const post of posts) {
      if (
        post.postDate === postDate &&
        post.postKind === postKind &&
        post.angleId
      ) {
        used.add(post.angleId);
      }
    }
    return used;
  }, [posts, postDate, postKind]);

  const selectedAngle = useMemo(
    () =>
      postKind === "winkel" ? getMotivationAngleById(angleId) : null,
    [postKind, angleId],
  );

  const selectedMarketing = useMemo(
    () =>
      postKind === "marketing" && marketingAngleId
        ? getMarketingTopicByAngleId(marketingAngleId)
        : null,
    [postKind, marketingAngleId],
  );

  const topicTitle =
    postKind === "marketing"
      ? (selectedMarketing?.title ?? "Funktionen wählen")
      : postKind === "frage"
        ? frageDisplayTitle(frageDraft)
        : (selectedAngle?.title ?? angleId);

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
    setImageDraft(activePost?.imageDataUrl ?? null);
    setLastImagePromptDraft(activePost?.lastImagePrompt ?? null);
    if (postKind === "frage") {
      if (activePost?.angleId) setFrageAngleId(activePost.angleId);
      setFrageDraft(activePost?.lastImagePrompt ?? "");
    }
    // Sync when create-form topic changes — not on every posts reload while drafting.
  }, [postDate, postKind, effectiveAngleId, activePost?.id, activePost?.updatedAt]);

  const hasCreateDraft =
    Boolean(captionDraft.trim()) ||
    Boolean(imageDraft?.trim()) ||
    Boolean(frageDraft.trim());
  const previewImage = imageDraft;

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
    const kindLabel = SOCIAL_POST_KIND_LABELS[postKind];
    if (generateConfirm.kind === "frage") {
      return {
        title: "Frage erzeugen?",
        description: `Motivierende/provokante Lesefrage für ${dateLabel}\n\nNur Entwurf — Speichern erst mit „Übernehmen“.\n\nKI-Modell: ${textModelLine}`,
        confirmLabel: "Frage erzeugen",
      };
    }
    if (generateConfirm.kind === "text") {
      return {
        title: "Text erzeugen?",
        description:
          postKind === "frage"
            ? `Caption als Antwort auf die Frage\n${kindLabel}: ${topicTitle}\n\nNur Entwurf — Speichern erst mit „Übernehmen“.\n\nKI-Modell: ${textModelLine}`
            : `Caption für ${dateLabel}\n${kindLabel}: ${topicTitle}\n\nNur Entwurf — Speichern erst mit „Übernehmen“.\n\nKI-Modell: ${textModelLine}`,
        confirmLabel: "Text erzeugen",
      };
    }
    return {
      title: "Bild erzeugen?",
      description:
        postKind === "frage"
          ? `Festes Hintergrundbild (bg3) + Frage als Overlay\n${kindLabel}: ${topicTitle}\n\nKein KI-Bild — nur Vorlage + Schrift.`
          : `Bild für ${dateLabel}\n${kindLabel}: ${topicTitle}\n\nNur Entwurf — Speichern erst mit „Übernehmen“.\n\nSzenenplanung: ${textModelLine}\nBildpixel: ${imageModelLine}`,
      confirmLabel: "Bild erzeugen",
    };
  }, [
    generateConfirm,
    postDate,
    postKind,
    topicTitle,
    textModelLine,
    imageModelLine,
  ]);

  function toggleMarketingFeature(id: MarketingFeatureId) {
    setMarketingFeatures((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        toast.error("Maximal 2 Funktionen.");
        return prev;
      }
      return [...prev, id];
    });
  }

  function applyPostSelection(post: SocialPost) {
    setPostDate(post.postDate);
    setPostKind(post.postKind);
    if (post.postKind === "marketing" && post.angleId) {
      const features = parseMarketingAngleId(post.angleId);
      if (features?.length) setMarketingFeatures(features);
    } else if (post.postKind === "frage" && post.angleId) {
      setFrageAngleId(post.angleId);
      setFrageDraft(post.lastImagePrompt ?? "");
    } else if (post.angleId) {
      setAngleId(post.angleId);
    }
  }

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
    setImageDraft(null);
    setLastImagePromptDraft(null);
    setFrageDraft("");
    setFrageAngleId(newFrageAngleId());
    setPostDate(todayIsoDate());
    setPostKind("winkel");
    setAngleId(SOCIAL_SELECTABLE_ANGLES[0]?.id ?? "");
    setMarketingFeatures(["wissen"]);
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

    if (job.kind === "frage") {
      setWaitStatus("Frage wird erzeugt …");
      void (async () => {
        try {
          if (!(await persistGlobal())) return;
          const result = await generateSocialFrageAction({
            postDate,
            channel: CHANNEL,
          });
          if (!result.success || !result.data) {
            toast.error(result.error ?? "Fehler");
            return;
          }
          if (!frageAngleId.trim()) setFrageAngleId(newFrageAngleId());
          setFrageDraft(result.data.question);
          setCaptionDraft("");
          setImageDraft(null);
          setLastImagePromptDraft(result.data.question);
          toast.success("Frage erzeugt (Entwurf).");
        } finally {
          setWaitStatus(null);
        }
      })();
      return;
    }

    if (!effectiveAngleId.trim()) {
      toast.error(
        postKind === "marketing"
          ? "Bitte 1–2 Funktionen wählen."
          : postKind === "frage"
            ? "Bitte zuerst eine Frage erzeugen."
            : "Bitte einen Winkel wählen.",
      );
      return;
    }

    if (job.kind === "text") {
      if (postKind === "frage" && !frageDraft.trim()) {
        toast.error("Bitte zuerst eine Frage erzeugen.");
        return;
      }
      setWaitStatus("Text wird erzeugt …");
      void (async () => {
        try {
          if (!(await persistGlobal())) return;
          const result = await generateSocialCaptionAction({
            postDate,
            angleId: effectiveAngleId,
            postKind,
            channel: CHANNEL,
            frageQuestion: postKind === "frage" ? frageDraft : undefined,
          });
          if (!result.success || !result.data) {
            toast.error(result.error ?? "Fehler");
            return;
          }
          setCaptionDraft(result.data.caption);
          toast.success(`Text erzeugt (Entwurf) — ${result.data.angleTitle}`);
        } finally {
          setWaitStatus(null);
        }
      })();
      return;
    }

    if (postKind === "frage" && !frageDraft.trim()) {
      toast.error("Bitte zuerst eine Frage erzeugen.");
      return;
    }

    setWaitStatus(
      postKind === "frage" ? "Bild wird zusammengesetzt …" : "Bild wird erzeugt …",
    );
    void (async () => {
      try {
        if (!(await persistGlobal())) return;
        const result = await generateSocialImageAction({
          postDate,
          angleId: effectiveAngleId,
          postKind,
          channel: CHANNEL,
          caption: captionDraft,
          frageQuestion: postKind === "frage" ? frageDraft : undefined,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Fehler");
          return;
        }
        setImageDraft(result.data.imageDataUrl);
        setLastImagePromptDraft(result.data.lastImagePrompt);
        toast.success(
          postKind === "frage"
            ? "Bild aus Vorlage erzeugt (Entwurf)."
            : "Bild erzeugt (Entwurf).",
        );
      } finally {
        setWaitStatus(null);
      }
    })();
  }

  function commitAndReset() {
    if (!effectiveAngleId.trim()) {
      toast.error(
        postKind === "marketing"
          ? "Bitte 1–2 Funktionen wählen."
          : postKind === "frage"
            ? "Bitte zuerst eine Frage erzeugen."
            : "Bitte einen Winkel wählen.",
      );
      return;
    }
    if (postKind === "frage" && !frageDraft.trim()) {
      toast.error("Frage fehlt — zuerst Frage erzeugen.");
      return;
    }
    if (!captionDraft.trim()) {
      toast.error("Caption fehlt — zuerst Text erzeugen.");
      return;
    }

    setWaitStatus("Beitrag wird gespeichert …");
    void (async () => {
      try {
        if (!(await persistGlobal())) return;
        let imageDataUrl = imageDraft;
        let lastImagePrompt = lastImagePromptDraft;
        // Frage: ensure image exists before commit (compose from bg3 if needed).
        if (postKind === "frage" && !imageDataUrl?.trim()) {
          const imageResult = await generateSocialImageAction({
            postDate,
            angleId: effectiveAngleId,
            postKind,
            channel: CHANNEL,
            caption: captionDraft,
            frageQuestion: frageDraft,
          });
          if (!imageResult.success || !imageResult.data) {
            toast.error(imageResult.error ?? "Bild konnte nicht erzeugt werden.");
            return;
          }
          imageDataUrl = imageResult.data.imageDataUrl;
          lastImagePrompt = imageResult.data.lastImagePrompt;
          setImageDraft(imageDataUrl);
          setLastImagePromptDraft(lastImagePrompt);
        }
        const result = await commitSocialPostAction({
          postDate,
          angleId: effectiveAngleId,
          postKind,
          channel: CHANNEL,
          caption: captionDraft,
          imageDataUrl,
          lastImagePrompt,
          frageQuestion: postKind === "frage" ? frageDraft : undefined,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Speichern fehlgeschlagen.");
          return;
        }
        mergePost(result.data.post);
        await reloadWorkspace();
        toast.success("Beitrag übernommen.");
        focusCreatedPost(result.data.post);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
        toast.error(
          /body exceeded|413/i.test(message)
            ? "Bild zu groß fürs Speichern — Dev-Server neu starten (Limit erhöht) oder Bild neu erzeugen."
            : message,
        );
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
              Stimme & Bild-Stil für Winkel-Posts. Marketing nutzt dieselben Figuren
              (Wiedererkennung), aber freiere Produkt-Inszenierung. Frage nutzt
              festes Hintergrundbild. Inhalt: Winkel auf{" "}
              <a
                href="/motivation"
                className="font-semibold text-orange-700 underline-offset-2 hover:underline"
              >
                /motivation
              </a>{" "}
              oder 1–2 Funktionen.
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
                Gilt für Winkel-Bilder. Marketing-Bilder haben einen eigenen
                Poster-Stil. Titel/Features werden danach in Nunito SemiBold
                (weiß) aufgelegt.
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
              Post-Art: Winkel, Marketing (1–2 Funktionen) oder Frage (Frage →
              Antwort-Caption → festes Bild). Mehrere Beiträge pro Tag möglich,
              solange Thema/Art anders ist.
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
            <div className="flex flex-wrap gap-2">
              {(["winkel", "marketing", "frage"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={busy || !canSave}
                  onClick={() => {
                    setPostKind(kind);
                    if (kind === "frage" && !frageAngleId.trim()) {
                      setFrageAngleId(newFrageAngleId());
                    }
                  }}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors disabled:opacity-60",
                    postKind === kind
                      ? "bg-orange-700 text-white ring-orange-800"
                      : "bg-zinc-100 text-zinc-800 ring-zinc-950/10 hover:bg-zinc-200",
                  )}
                >
                  {SOCIAL_POST_KIND_LABELS[kind]}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              {postKind === "winkel" ? (
                <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Winkel
                  <select
                    disabled={busy || !canSave}
                    value={angleId}
                    onChange={(e) => setAngleId(e.target.value)}
                    className={fieldClass}
                  >
                    <optgroup label="Lesen & Haltung">
                      {SOCIAL_SELECTABLE_ANGLES.filter(
                        (angle) =>
                          !angle.id.startsWith(VS_CHAT_ANGLE_ID_PREFIX),
                      ).map((angle) => {
                        const count = angleUsage[angle.id] ?? 0;
                        const usedToday = anglesUsedToday.has(angle.id);
                        return (
                          <option key={angle.id} value={angle.id}>
                            {angle.title} ·{" "}
                            {MOTIVATION_THEME_LABELS[angle.theme]} ({count}×)
                            {usedToday ? " · heute schon" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="vs. Chatfenster (Archiv)">
                      {SOCIAL_SELECTABLE_ANGLES.filter((angle) =>
                        angle.id.startsWith(VS_CHAT_ANGLE_ID_PREFIX),
                      ).map((angle) => {
                        const count = angleUsage[angle.id] ?? 0;
                        const usedToday = anglesUsedToday.has(angle.id);
                        return (
                          <option key={angle.id} value={angle.id}>
                            {angle.title} ·{" "}
                            {MOTIVATION_THEME_LABELS[angle.theme]} ({count}×)
                            {usedToday ? " · heute schon" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                  </select>
                </label>
              ) : postKind === "marketing" ? (
                <div className="sm:col-span-1">
                  <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Funktionen (1–2)
                  </p>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {marketingFeatures.length}/2 gewählt
                    {marketingAngleId && anglesUsedToday.has(marketingAngleId)
                      ? " · Kombination heute schon"
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="sm:col-span-1">
                  <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Ablauf
                  </p>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    1) Frage · 2) Antwort-Caption · 3) Bild (bg3)
                  </p>
                </div>
              )}
            </div>

            {postKind === "marketing" ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-zinc-500 uppercase">
                    Story &amp; Persönlich
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {MARKETING_EXTRA_IDS.map((id) => {
                      const active = marketingFeatures.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={busy || !canSave}
                          onClick={() => toggleMarketingFeature(id)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors disabled:opacity-60",
                            active
                              ? "bg-orange-100 text-orange-950 ring-orange-700/30"
                              : "bg-zinc-50 text-zinc-700 ring-zinc-950/10 hover:bg-zinc-100",
                          )}
                        >
                          {marketingFeatureLabel(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-zinc-500 uppercase">
                    Paket-Funktionen
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {PACKAGE_FEATURE_IDS.map((id) => {
                      const active = marketingFeatures.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={busy || !canSave}
                          onClick={() => toggleMarketingFeature(id)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors disabled:opacity-60",
                            active
                              ? "bg-orange-100 text-orange-950 ring-orange-700/30"
                              : "bg-zinc-50 text-zinc-700 ring-zinc-950/10 hover:bg-zinc-100",
                          )}
                        >
                          {marketingFeatureLabel(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedAngle ? (
              <p className="mt-3 rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-950 ring-1 ring-orange-700/15">
                <span className="font-extrabold">{selectedAngle.title}</span>
                <span className="mt-1 block text-orange-900/90">
                  {selectedAngle.insight}
                </span>
              </p>
            ) : null}

            {selectedMarketing ? (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-700/20">
                <span className="font-extrabold">{selectedMarketing.title}</span>
                <span className="mt-1 block whitespace-pre-line text-amber-950/90">
                  {selectedMarketing.insight}
                </span>
                <span className="mt-2 block text-xs font-semibold text-amber-900/80">
                  CTA im Text: Seite besuchen oder kostenlos ausprobieren.
                </span>
              </p>
            ) : null}

            {postKind === "frage" && frageDraft.trim() ? (
              <p className="mt-3 rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-relaxed text-zinc-900 ring-1 ring-zinc-950/10">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Overlay-Frage
                </span>
                <span className="mt-1 block font-extrabold text-zinc-800">
                  {frageDraft.trim()}
                </span>
              </p>
            ) : null}

            {activePost ? (
              <p className="mt-3 text-sm font-semibold text-zinc-600">
                Dieses Thema existiert an diesem Tag schon — „Übernehmen“
                überschreibt den gespeicherten Text bzw. das Bild. Erzeugen
                speichert noch nichts.
              </p>
            ) : hasCreateDraft ? (
              <p className="mt-3 text-sm font-semibold text-zinc-600">
                Entwurf — erst mit „Übernehmen und zurücksetzen“ speichern.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {postKind === "frage" ? (
                <button
                  type="button"
                  disabled={busy || !canSave}
                  onClick={() => setGenerateConfirm({ kind: "frage" })}
                  className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
                >
                  Frage erzeugen
                </button>
              ) : null}
              <button
                type="button"
                disabled={
                  busy ||
                  !canSave ||
                  (postKind === "frage"
                    ? !frageDraft.trim()
                    : !effectiveAngleId)
                }
                onClick={() => setGenerateConfirm({ kind: "text" })}
                className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
                title={
                  postKind === "frage" && !frageDraft.trim()
                    ? "Zuerst Frage erzeugen"
                    : undefined
                }
              >
                Text erzeugen
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !canSave ||
                  (postKind === "frage"
                    ? !frageDraft.trim()
                    : !effectiveAngleId || !captionDraft.trim())
                }
                onClick={() => setGenerateConfirm({ kind: "image" })}
                className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
                title={
                  postKind === "frage"
                    ? !frageDraft.trim()
                      ? "Zuerst Frage erzeugen"
                      : undefined
                    : !captionDraft.trim()
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
                emptyHint={
                  postKind === "frage"
                    ? "Noch kein Text — zuerst Frage, dann „Text erzeugen“."
                    : "Noch kein Text — „Text erzeugen“ starten."
                }
                className="mt-1 min-h-[8rem] rounded-xl border border-zinc-950/10 bg-zinc-50 px-3 py-2"
              />
            </div>

            {previewImage ? (
              <div className="mt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt={`Social-Bild ${formatDeDate(postDate)}`}
                  className="mx-auto max-h-[28rem] w-auto max-w-full rounded-2xl ring-1 ring-zinc-950/10"
                />
              </div>
            ) : null}

            {hasCreateDraft ? (
              <div className="mt-6">
                <div className="border-t border-zinc-950/10" role="separator" />
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    disabled={busy || !canSave || !captionDraft.trim()}
                    onClick={commitAndReset}
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
            const angle =
              post.postKind === "marketing"
                ? post.angleId
                  ? getMarketingTopicByAngleId(post.angleId)
                  : null
                : post.postKind === "frage"
                  ? {
                      title: frageDisplayTitle(post.lastImagePrompt),
                      insight: post.lastImagePrompt ?? "",
                    }
                  : post.angleId
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
                    applyPostSelection(post);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div>
                    <p className="font-extrabold text-zinc-950">
                      {formatDeDate(post.postDate)}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      <span className="font-semibold text-zinc-500">
                        {SOCIAL_POST_KIND_LABELS[post.postKind]} ·{" "}
                      </span>
                      {angle?.title ?? post.angleId ?? "Ohne Thema"}
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
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="text-sm font-bold text-orange-700 underline-offset-2 hover:underline"
                        onClick={() => {
                          applyPostSelection(post);
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
                      <button
                        type="button"
                        disabled={busy || !canSave}
                        onClick={() => setDeleteTarget(post)}
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 underline-offset-2 hover:underline disabled:opacity-60"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Löschen
                      </button>
                    </div>
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

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Beitrag löschen?"
        description={
          deleteTarget
            ? (() => {
                const topic =
                  deleteTarget.postKind === "marketing" && deleteTarget.angleId
                    ? getMarketingTopicByAngleId(deleteTarget.angleId)?.title
                    : deleteTarget.postKind === "frage"
                      ? frageDisplayTitle(deleteTarget.lastImagePrompt)
                      : deleteTarget.angleId
                        ? getMotivationAngleById(deleteTarget.angleId)?.title
                        : null;
                return `Der Social-Media-Beitrag vom ${formatDeDate(deleteTarget.postDate)} (${SOCIAL_POST_KIND_LABELS[deleteTarget.postKind]}${topic ? ` · ${topic}` : ""}) wird dauerhaft gelöscht — Text und Bild inklusive.`;
              })()
            : ""
        }
        confirmLabel="Endgültig löschen"
        pending={pending}
        onCancel={() => {
          if (!pending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          const target = deleteTarget;
          if (!target) return;
          startTransition(async () => {
            const result = await deleteSocialPostAction({ postId: target.id });
            if (!result.success) {
              toast.error(result.error ?? "Löschen fehlgeschlagen.");
              return;
            }
            setPosts((prev) => prev.filter((item) => item.id !== target.id));
            if (expandedId === target.id) setExpandedId(null);
            setDeleteTarget(null);
            toast.success("Beitrag gelöscht.");
            await reloadWorkspace();
          });
        }}
      />
    </div>
  );
}
