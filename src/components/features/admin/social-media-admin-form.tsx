"use client";

/**
 * Admin Social Media: collapsible global CRAFT + Instagram day calendar.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateSocialCaptionAction,
  generateSocialImageAction,
  loadSocialMonthAction,
  refineSocialCaptionAction,
  saveSocialCaptionAction,
  saveSocialGlobalSettingsAction,
} from "@/app/actions/social-admin";
import {
  datesInYearMonth,
  emptyGlobalSettings,
  type SocialGlobalSettings,
  type SocialPost,
} from "@/lib/social/types";
import { pickMotivationAngle } from "@/lib/social/motivation";
import { LESENO_SOCIAL_STYLE_GUIDE } from "@/lib/social/leseno-visual-style";
import { cn } from "@/lib/utils";

const CHANNEL = "instagram" as const;

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Blocking wait overlay while caption/image AI runs. */
function SocialWaitOverlay({ message }: { message: string | null }) {
  useEffect(() => {
    if (!message) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [message]);

  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-wait-title"
      aria-describedby="social-wait-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center shadow-2xl ring-1 ring-zinc-950/10">
        <Loader2
          className="mx-auto size-10 animate-spin text-orange-700"
          aria-hidden
        />
        <h2
          id="social-wait-title"
          className="mt-4 text-xl font-extrabold text-zinc-950"
        >
          Bitte warten
        </h2>
        <p
          id="social-wait-desc"
          className="mt-2 text-sm leading-relaxed text-zinc-600"
        >
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}

export function SocialMediaAdminForm({ canSave }: { canSave: boolean }) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [global, setGlobal] = useState<SocialGlobalSettings>(emptyGlobalSettings);
  const [postsByDate, setPostsByDate] = useState<Record<string, SocialPost>>({});
  const [loadPending, setLoadPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [waitStatus, setWaitStatus] = useState<string | null>(null);
  const [refineHints, setRefineHints] = useState<Record<string, string>>({});
  const [imageHints, setImageHints] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dates = useMemo(() => datesInYearMonth(yearMonth), [yearMonth]);

  const mergePost = useCallback((post: SocialPost) => {
    setPostsByDate((prev) => ({
      ...prev,
      [post.postDate]: post,
    }));
  }, []);

  const loadMonth = useCallback(async (ym: string) => {
    setLoadPending(true);
    const result = await loadSocialMonthAction({ yearMonth: ym });
    setLoadPending(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Monat konnte nicht geladen werden.");
      setPostsByDate({});
      return;
    }
    setGlobal(result.data.global);
    const map: Record<string, SocialPost> = {};
    for (const post of result.data.posts) {
      map[post.postDate] = post;
    }
    setPostsByDate(map);
  }, []);

  useEffect(() => {
    void loadMonth(yearMonth);
  }, [yearMonth, loadMonth]);

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

  async function runBatchCaptions() {
    if (!canSave) return;
    if (!(await persistGlobal())) return;

    const total = dates.length;
    let done = 0;
    setWaitStatus(`Texte 0 / ${total} …`);

    try {
      for (const date of dates) {
        const result = await generateSocialCaptionAction({
          yearMonth,
          postDate: date,
          channel: CHANNEL,
        });
        done += 1;
        setWaitStatus(`Texte ${done} / ${total} …`);
        if (!result.success || !result.data) {
          toast.error(`${date}: ${result.error ?? "Fehler"}`);
          continue;
        }
        mergePost(result.data.post);
      }
      toast.success("Text-Batch fertig.");
    } finally {
      setWaitStatus(null);
    }
  }

  async function runBatchImages() {
    if (!canSave) return;
    if (!(await persistGlobal())) return;

    const jobs = dates.filter((date) => postsByDate[date]?.caption?.trim());
    if (jobs.length === 0) {
      toast.error("Keine Texte vorhanden — zuerst Captions erzeugen.");
      return;
    }

    let done = 0;
    setWaitStatus(`Bilder 0 / ${jobs.length} …`);
    try {
      for (const date of jobs) {
        const result = await generateSocialImageAction({
          yearMonth,
          postDate: date,
          channel: CHANNEL,
        });
        done += 1;
        setWaitStatus(`Bilder ${done} / ${jobs.length} …`);
        if (!result.success || !result.data) {
          toast.error(`${date}: ${result.error ?? "Fehler"}`);
          continue;
        }
        mergePost(result.data.post);
      }
      toast.success("Bild-Batch fertig.");
    } finally {
      setWaitStatus(null);
    }
  }

  const busy = pending || loadPending || Boolean(waitStatus);
  const fieldClass =
    "mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60";

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
              Stimme & Bild-Stil. Inhaltliche Winkel kommen von{" "}
              <a
                href="/motivation"
                className="font-semibold text-orange-700 underline-offset-2 hover:underline"
              >
                /motivation
              </a>{" "}
              (ein Winkel pro Tag).
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
                placeholder="Nur falls nötig — die Winkel-Bank steuert den Inhalt."
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
              Bild-Stil (System für gpt-oss → FLUX)
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

      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm font-semibold text-zinc-700">
          Monat (Instagram-Posts)
          <input
            type="month"
            value={yearMonth}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) setYearMonth(e.target.value);
            }}
            className="mt-1 block rounded-xl border border-zinc-950/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        {loadPending ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Monat wird geladen …
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() => void runBatchCaptions()}
          className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
        >
          Alle Texte erzeugen (gpt-oss)
        </button>
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() => void runBatchImages()}
          className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"
        >
          Alle Bilder erzeugen (FLUX.2)
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-zinc-950">
          Tage ({dates.length})
        </h2>
        {dates.map((date) => {
          const post = postsByDate[date];
          const angle = pickMotivationAngle(date);
          return (
            <article
              key={date}
              className="rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10"
            >
              <h3 className="text-base font-extrabold text-zinc-950">
                {new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <p className="mt-1 text-xs font-semibold text-orange-800">
                Winkel: {angle.title}
              </p>
              <textarea
                rows={6}
                disabled={busy || !canSave}
                value={post?.caption ?? ""}
                onChange={(e) => {
                  const caption = e.target.value;
                  setPostsByDate((prev) => ({
                    ...prev,
                    [date]: {
                      id: post?.id ?? "",
                      yearMonth,
                      postDate: date,
                      channel: CHANNEL,
                      caption,
                      imageDataUrl: post?.imageDataUrl ?? null,
                      lastImagePrompt: post?.lastImagePrompt ?? null,
                      updatedAt: post?.updatedAt ?? "",
                    },
                  }));
                }}
                className="mt-3 w-full rounded-xl border border-zinc-950/10 bg-gray-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-700"
                placeholder="Caption …"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !canSave}
                  onClick={() => {
                    startTransition(async () => {
                      setWaitStatus("Text wird erzeugt (gpt-oss) …");
                      try {
                        if (!(await persistGlobal())) return;
                        const result = await generateSocialCaptionAction({
                          yearMonth,
                          postDate: date,
                          channel: CHANNEL,
                        });
                        if (!result.success || !result.data) {
                          toast.error(result.error ?? "Fehler");
                          return;
                        }
                        mergePost(result.data.post);
                        toast.success(
                          `Text erzeugt — ${result.data.angleTitle}`,
                        );
                      } finally {
                        setWaitStatus(null);
                      }
                    });
                  }}
                  className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  Text erzeugen
                </button>
                <button
                  type="button"
                  disabled={busy || !canSave}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await saveSocialCaptionAction({
                        yearMonth,
                        postDate: date,
                        channel: CHANNEL,
                        caption: post?.caption ?? "",
                      });
                      if (!result.success || !result.data) {
                        toast.error(result.error ?? "Fehler");
                        return;
                      }
                      mergePost(result.data.post);
                      toast.success("Text gespeichert.");
                    });
                  }}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold ring-1 ring-zinc-950/10 disabled:opacity-60"
                >
                  Speichern
                </button>
              </div>
              <label className="mt-3 block text-xs font-bold text-zinc-500">
                Text nachbearbeiten (Prompt)
                <div className="mt-1 flex gap-2">
                  <input
                    disabled={busy || !canSave}
                    value={refineHints[date] ?? ""}
                    onChange={(e) =>
                      setRefineHints((prev) => ({
                        ...prev,
                        [date]: e.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 rounded-xl border border-zinc-950/10 bg-white px-3 py-1.5 text-sm"
                    placeholder="Kürzer, mehr CTA …"
                  />
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={() => {
                      const hint = refineHints[date]?.trim();
                      if (!hint) {
                        toast.error("Hinweis eingeben.");
                        return;
                      }
                      startTransition(async () => {
                        setWaitStatus("Text wird überarbeitet …");
                        try {
                          const result = await refineSocialCaptionAction({
                            yearMonth,
                            postDate: date,
                            channel: CHANNEL,
                            refineInstruction: hint,
                          });
                          if (!result.success || !result.data) {
                            toast.error(result.error ?? "Fehler");
                            return;
                          }
                          mergePost(result.data.post);
                          toast.success("Text überarbeitet.");
                        } finally {
                          setWaitStatus(null);
                        }
                      });
                    }}
                    className="shrink-0 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    KI
                  </button>
                </div>
              </label>

              {post?.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.imageDataUrl}
                  alt=""
                  className="mt-3 aspect-square w-full max-w-[220px] rounded-xl object-cover ring-1 ring-zinc-950/10"
                />
              ) : (
                <p className="mt-3 text-xs text-zinc-500">Kein Bild</p>
              )}
              <label className="mt-2 block text-xs font-bold text-zinc-500">
                Bild neu (optional Extra-Prompt)
                <div className="mt-1 flex gap-2">
                  <input
                    disabled={busy || !canSave}
                    value={imageHints[date] ?? ""}
                    onChange={(e) =>
                      setImageHints((prev) => ({
                        ...prev,
                        [date]: e.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 rounded-xl border border-zinc-950/10 bg-white px-3 py-1.5 text-sm"
                    placeholder="mehr Abendlicht …"
                  />
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={() => {
                      startTransition(async () => {
                        setWaitStatus(
                          "Bild: gpt-oss plant Szene, dann FLUX …",
                        );
                        try {
                          if (!(await persistGlobal())) return;
                          const result = await generateSocialImageAction({
                            yearMonth,
                            postDate: date,
                            channel: CHANNEL,
                            extraInstruction:
                              imageHints[date]?.trim() || undefined,
                          });
                          if (!result.success || !result.data) {
                            toast.error(result.error ?? "Fehler");
                            return;
                          }
                          mergePost(result.data.post);
                          toast.success("Bild erzeugt.");
                        } finally {
                          setWaitStatus(null);
                        }
                      });
                    }}
                    className="shrink-0 rounded-full bg-orange-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    FLUX
                  </button>
                </div>
              </label>
            </article>
          );
        })}
      </div>
    </div>
  );
}
