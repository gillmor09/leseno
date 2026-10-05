"use client";

/**
 * Modal coach dialog to craft Basics „Sprache & Tonalität (Schreiber)“.
 * Close via X; Übernehmen syncs the latest brief into the form field.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Mic, MicOff, X } from "lucide-react";
import { toast } from "sonner";
import { romanSchreiberTonalitaetQaTurnAction } from "@/app/actions/roman-schreiber-tonalitaet-qa";
import { useDeepgramLiveStt } from "@/hooks/use-deepgram-live-stt";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const STARTER =
  "Beschreib kurz, wie sich der Text anhören soll — Stimme, Tempo, Humor/Ernst, Dialogdichte, Tabus. Oder sag: „Stell mir gezielte Fragen.“";

type RomanSchreiberTonalitaetDialogProps = {
  open: boolean;
  romanId: string;
  canSave: boolean;
  initialBrief: string;
  initialChat: RomanIdeaChatMessage[];
  onClose: () => void;
  /** Sync form + workspace after each coach turn and on Übernehmen. */
  onApplied: (next: {
    tonalitaet: string;
    chat: RomanIdeaChatMessage[];
  }) => void;
};

export function RomanSchreiberTonalitaetDialog({
  open,
  romanId,
  canSave,
  initialBrief,
  initialChat,
  onClose,
  onApplied,
}: RomanSchreiberTonalitaetDialogProps) {
  const [brief, setBrief] = useState(initialBrief);
  const [chat, setChat] = useState<RomanIdeaChatMessage[]>(initialChat);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const {
    listening,
    liveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useDeepgramLiveStt({ enabled: open && canSave && !pending });

  useEffect(() => {
    if (!open) return;
    setBrief(initialBrief);
    setChat(initialChat);
    setDraft("");
    clearTranscript();
    stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const openQuestion =
    chat.length === 0
      ? STARTER
      : chat[chat.length - 1]?.role === "assistant"
        ? chat[chat.length - 1]!.content
        : "Antworte weiter — oder formuliere die Vorgabe direkt.";

  async function sendText(text: string) {
    if (!canSave || pending) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast.message("Antwort eingeben.");
      return;
    }
    if (listening) stopListening();
    setPending(true);
    try {
      const result = await romanSchreiberTonalitaetQaTurnAction({
        romanId,
        userMessage: trimmed,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Dialog fehlgeschlagen.");
        return;
      }
      const nextChat = result.data.roman.editorial?.schreiberTonalitaetChat ?? [];
      setBrief(result.data.tonalitaet);
      setChat(nextChat);
      setDraft("");
      clearTranscript();
      onApplied({
        tonalitaet: result.data.tonalitaet,
        chat: nextChat,
      });
      toast.success("Vorgabe aktualisiert.");
    } finally {
      setPending(false);
    }
  }

  function applyTranscript() {
    const t = liveTranscript.trim();
    if (!t) return;
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t));
    clearTranscript();
    stopListening();
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schreiber-ton-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div>
            <h2
              id="schreiber-ton-dialog-title"
              className="text-lg font-extrabold text-zinc-950"
            >
              Sprache & Tonalität erarbeiten
            </h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              Dialog mit dem Schreib-Coach — tippen oder Mikrofon. Jede Runde
              schärft die Vorgabe.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            aria-label="Dialog schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <section className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/8">
            <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Aktuelle Vorgabe
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm font-semibold leading-relaxed text-zinc-800">
              {brief.trim() || "Noch leer — entsteht nach der ersten Runde."}
            </pre>
          </section>

          {chat.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {chat.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm font-semibold ring-1",
                    m.role === "assistant"
                      ? "bg-white text-zinc-700 ring-zinc-950/8"
                      : "bg-orange-50 text-orange-950 ring-orange-200/70",
                  )}
                >
                  <p className="text-[10px] font-extrabold tracking-wide uppercase opacity-70">
                    {m.role === "assistant" ? "Coach" : "Du"}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap font-sans">
                    {m.content}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}

          <section className="rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-950/10">
            <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Offene Frage · Coach
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm font-semibold leading-relaxed text-zinc-900">
              {openQuestion}
            </pre>
          </section>

          <label className="block">
            <span className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Deine Antwort
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSave || pending}
              rows={4}
              className="mt-1.5 w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              placeholder="Hier tippen oder diktieren …"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendText(draft);
                }
              }}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || pending || !draft.trim()}
              onClick={() => void sendText(draft)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {pending ? "Coach antwortet …" : "Senden"}
            </button>
            {!listening ? (
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() => void startListening()}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 disabled:opacity-50"
              >
                <Mic className="size-4" aria-hidden />
                Sprachdialog
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => stopListening()}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10"
                >
                  <MicOff className="size-4" aria-hidden />
                  Stop
                </button>
                <button
                  type="button"
                  disabled={!liveTranscript.trim() || pending}
                  onClick={() => applyTranscript()}
                  className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  Transkript übernehmen
                </button>
                <button
                  type="button"
                  disabled={!liveTranscript.trim() || pending}
                  onClick={() => void sendText(liveTranscript)}
                  className="rounded-full bg-orange-100 px-4 py-2.5 text-sm font-bold text-orange-950 ring-1 ring-orange-200 disabled:opacity-50"
                >
                  Transkript senden
                </button>
              </>
            )}
          </div>
          {listening || liveTranscript ? (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
              {liveTranscript || "Hör zu …"}
            </p>
          ) : null}
        </div>

        <div className="border-t border-zinc-100 px-5 py-4 sm:px-6">
          <button
            type="button"
            disabled={pending || !brief.trim()}
            onClick={() => {
              onApplied({ tonalitaet: brief.trim(), chat });
              onClose();
            }}
            className="w-full rounded-full bg-zinc-900 px-5 py-3 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
