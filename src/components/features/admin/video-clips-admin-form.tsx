"use client";

/**
 * Admin Video-Clips: image + prompt → Gemini Veo → Supabase Storage, list + download + delete.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteVideoClipAction,
  generateVideoClipAction,
} from "@/app/actions/video-clips-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { videoClipDownloadPath } from "@/lib/video-clips/download-name";
import type { VideoClipListItem } from "@/lib/video-clips/repository";
import { cn } from "@/lib/utils";

type VideoClipAdminFormProps = {
  canGenerate: boolean;
  defaultModelSlug: string;
  modelLabel: string;
  initialClips: VideoClipListItem[];
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
      {children}
    </span>
  );
}

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";

const WAIT_STEPS = [
  "Anfrage geht an Gemini Veo …",
  "Szene wird berechnet (kann 1–3 Minuten dauern) …",
  "Clip wird in Supabase gespeichert …",
] as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function VideoClipWaitDialog({ open }: { open: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setInterval(() => {
      setStepIndex((current) =>
        current < WAIT_STEPS.length - 1 ? current + 1 : current,
      );
    }, 20_000);
    return () => {
      document.body.style.overflow = previous;
      window.clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="video-clip-wait-title"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2
            className="size-10 animate-spin text-orange-700"
            aria-hidden
          />
          <h2
            id="video-clip-wait-title"
            className="mt-5 text-xl font-extrabold text-zinc-950"
          >
            Video-Clip wird erzeugt
          </h2>
          <p className="mt-2 text-sm font-semibold text-zinc-600">
            {WAIT_STEPS[stepIndex]}
          </p>
          <p className="mt-4 text-xs font-semibold text-zinc-500">
            Bitte diesen Tab offen lassen — Abbrechen ist nicht möglich.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function VideoClipsAdminForm({
  canGenerate,
  defaultModelSlug,
  modelLabel,
  initialClips,
}: VideoClipAdminFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [pending, setPending] = useState(false);
  const [clips, setClips] = useState(initialClips);
  const [deleteTarget, setDeleteTarget] = useState<VideoClipListItem | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  async function handleGenerate() {
    if (!canGenerate) {
      toast.error("Service-Role fehlt — Generierung nicht möglich.");
      return;
    }
    if (!file) {
      toast.error("Bitte ein Bild als Vorlage wählen.");
      return;
    }
    if (prompt.trim().length < 8) {
      toast.error("Prompt etwas genauer formulieren.");
      return;
    }

    setPending(true);
    const form = new FormData();
    form.set("file", file);
    form.set("prompt", prompt.trim());
    form.set("durationSeconds", "8");
    form.set("aspectRatio", aspectRatio);
    form.set("modelSlug", defaultModelSlug);

    const response = await generateVideoClipAction(form);
    setPending(false);

    if (!response.success || !response.data) {
      toast.error(response.error ?? "Video-Clip fehlgeschlagen.");
      return;
    }

    setClips((current) => [response.data!, ...current]);
    toast.success("Video-Clip erzeugt und gespeichert.");
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteVideoClipAction({ clipId: deleteTarget.id });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setClips((current) => current.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Video-Clip gelöscht.");
  }

  return (
    <>
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">
              Vorlage & Prompt
            </h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              Bild hochladen und Bewegung/Szene per Prompt beschreiben. Modell:{" "}
              <span className="text-zinc-800">
                {modelLabel} ({defaultModelSlug})
              </span>
              .
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <FieldLabel>Bildvorlage</FieldLabel>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(event) =>
                  handleFileChange(event.target.files?.[0] ?? null)
                }
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white disabled:opacity-50"
              >
                <Upload className="size-4" aria-hidden />
                Bild wählen
              </button>
              {file ? (
                <p className="text-xs font-semibold text-zinc-500">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              ) : (
                <p className="text-xs font-semibold text-zinc-500">
                  JPEG/PNG/WebP bis 8&nbsp;MB
                </p>
              )}
              {previewUrl ? (
                <div className="overflow-hidden rounded-2xl bg-zinc-950/5 ring-1 ring-zinc-950/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Vorlage"
                    className="max-h-72 w-full object-contain"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <label className="block">
                <FieldLabel>Prompt / Befehl</FieldLabel>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={pending}
                  rows={8}
                  className={inputClass}
                  placeholder="z. B. Langsame Kamerafahrt, sanfter Wind in den Blättern, warmes Abendlicht …"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Dauer</FieldLabel>
                  <p className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/10">
                    8 Sekunden
                    <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                      Veo Image→Video nur mit 8&nbsp;s
                    </span>
                  </p>
                </div>
                <label className="block">
                  <FieldLabel>Seitenverhältnis</FieldLabel>
                  <select
                    value={aspectRatio}
                    disabled={pending}
                    onChange={(event) =>
                      setAspectRatio(event.target.value as "16:9" | "9:16")
                    }
                    className={inputClass}
                  >
                    <option value="16:9">16:9 Querformat</option>
                    <option value="9:16">9:16 Hochformat</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={
              !canGenerate || pending || !file || prompt.trim().length < 8
            }
            onClick={() => void handleGenerate()}
            className={cn(
              "rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white hover:bg-orange-800",
              (!canGenerate || pending || !file || prompt.trim().length < 8) &&
                "opacity-70",
            )}
          >
            {pending
              ? "Clip wird erzeugt …"
              : "Video-Clip erzeugen & speichern"}
          </button>
        </section>

        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950">
              Gespeicherte Clips
            </h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              {clips.length === 0
                ? "Noch keine Clips gespeichert."
                : `${clips.length} Clip(s) im Storage.`}
            </p>
          </div>

          <ul className="space-y-6">
            {clips.map((clip) => (
              <li
                key={clip.id}
                className="space-y-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-zinc-950/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-zinc-950">{clip.title}</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">
                      {formatDate(clip.createdAt)} · {clip.durationSeconds}s ·{" "}
                      {clip.aspectRatio} · {clip.modelSlug}
                      {clip.byteSize
                        ? ` · ${(clip.byteSize / (1024 * 1024)).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canGenerate || deletePending}
                    onClick={() => setDeleteTarget(clip)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-900 ring-1 ring-orange-200 hover:bg-orange-100 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Löschen
                  </button>
                </div>
                {clip.signedUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={clip.signedUrl}
                    controls
                    className="max-h-80 w-full rounded-xl bg-zinc-950 object-contain"
                  />
                ) : (
                  <p className="text-xs font-semibold text-amber-800">
                    Wiedergabe-Link konnte nicht erzeugt werden — Download
                    trotzdem möglich.
                  </p>
                )}
                <p className="text-xs font-semibold text-zinc-600">
                  Prompt: {clip.prompt}
                </p>
                <a
                  href={videoClipDownloadPath(clip.id, clip.title)}
                  className="inline-flex rounded-full bg-yellow-400 px-4 py-2 text-xs font-extrabold text-zinc-950 hover:bg-yellow-300"
                >
                  MP4 herunterladen
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <VideoClipWaitDialog open={pending} />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title="Video-Clip löschen?"
        description={
          deleteTarget
            ? `„${deleteTarget.title}“ wird unwiderruflich aus der Datenbank und dem Storage-Bucket entfernt.`
            : ""
        }
        confirmLabel="Clip löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
