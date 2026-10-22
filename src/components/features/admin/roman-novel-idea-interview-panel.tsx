"use client";

/**
 * Novel idea interview: Haiku questions, Deepgram STT answers, Luna weave preview.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import {
  finalizeNovelIdeaAction,
  novelIdeaInterviewTurnAction,
  saveNovelIdeaAction,
} from "@/app/actions/roman-novel";
import { useDeepgramLiveStt } from "@/hooks/use-deepgram-live-stt";
import type {
  NovelBundle,
  NovelIdeaInterviewMessage,
} from "@/lib/novel/types";
import { cn } from "@/lib/utils";

const textareaClass =
  "w-full min-h-[6.5rem] resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";

function splitDialog(messages: NovelIdeaInterviewMessage[]): {
  history: NovelIdeaInterviewMessage[];
  openQuestion: string;
} {
  if (messages.length === 0) {
    return { history: [], openQuestion: "" };
  }
  const last = messages[messages.length - 1]!;
  if (last.role === "assistant") {
    return {
      history: messages.slice(0, -1),
      openQuestion: last.content.trim(),
    };
  }
  return { history: messages, openQuestion: "" };
}

function historyPairs(
  history: NovelIdeaInterviewMessage[],
): Array<{ question?: string; answer?: string }> {
  const pairs: Array<{ question?: string; answer?: string }> = [];
  let pendingQuestion: string | undefined;
  for (const m of history) {
    if (m.role === "assistant") {
      if (pendingQuestion) pairs.push({ question: pendingQuestion });
      pendingQuestion = m.content.trim();
    } else {
      pairs.push({
        question: pendingQuestion,
        answer: m.content.trim(),
      });
      pendingQuestion = undefined;
    }
  }
  if (pendingQuestion) pairs.push({ question: pendingQuestion });
  return pairs;
}

export function RomanNovelIdeaInterviewPanel({
  novelId,
  messages,
  highConceptIdea,
  canSave,
  onBundle,
}: {
  novelId: string;
  messages: NovelIdeaInterviewMessage[];
  highConceptIdea: string;
  canSave: boolean;
  onBundle: (bundle: NovelBundle) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState(highConceptIdea);
  const [pending, setPending] = useState<
    "turn" | "finalize" | "paste" | null
  >(null);
  const [verlaufOpen, setVerlaufOpen] = useState(false);
  const {
    listening,
    liveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useDeepgramLiveStt({ enabled: canSave && !pending });

  const { history, openQuestion } = useMemo(
    () => splitDialog(messages),
    [messages],
  );
  const pairs = useMemo(() => historyPairs(history), [history]);
  const verlaufCount = pairs.length;
  const busy = Boolean(pending);
  const ideaReady = highConceptIdea.trim().length >= 20;

  async function sendText(text: string) {
    if (!canSave || busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast.message("Antwort eingeben.");
      return;
    }
    if (listening) stopListening();
    setPending("turn");
    try {
      const result = await novelIdeaInterviewTurnAction({
        novelId,
        userMessage: trimmed,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Interview-Runde fehlgeschlagen.");
        return;
      }
      setDraft("");
      clearTranscript();
      setVerlaufOpen(false);
      onBundle(result.data.bundle);
      toast.success("Idee aktualisiert.");
    } finally {
      setPending(null);
    }
  }

  async function onFinalize() {
    if (!canSave || busy || !ideaReady) return;
    if (listening) stopListening();
    setPending("finalize");
    try {
      const result = await finalizeNovelIdeaAction({ novelId });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Idee übernehmen fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      toast.success("Idee übernommen — Generierung freigegeben.");
    } finally {
      setPending(null);
    }
  }

  async function onPasteSave() {
    if (!canSave || busy) return;
    const text = pasteText.trim();
    if (text.length < 20) {
      toast.error("Idee noch zu kurz (mind. 20 Zeichen).");
      return;
    }
    setPending("paste");
    try {
      const result = await saveNovelIdeaAction({
        novelId,
        highConceptIdea: text,
        ideaStatus: "ready",
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      setPasteOpen(false);
      toast.success("Fertige Idee gespeichert — Generierung freigegeben.");
    } finally {
      setPending(null);
    }
  }

  function applyTranscriptToDraft() {
    const t = liveTranscript.trim();
    if (!t) return;
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t));
    clearTranscript();
    stopListening();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Idee-Interview
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Lektor (Haiku) fragt — du antwortest per Text oder Mikrofon
            (Deepgram). Autor (Luna) webt die Antwort in die High-Concept-Idee.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => {
              setPasteText(highConceptIdea);
              setPasteOpen((v) => !v);
            }}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pasteOpen ? "Interview fortsetzen" : "Fertige Idee einfügen"}
          </button>
          <button
            type="button"
            disabled={!canSave || busy || !ideaReady}
            onClick={() => void onFinalize()}
            className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {pending === "finalize" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Idee übernehmen
          </button>
        </div>
      </div>

      {pasteOpen ? (
        <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
          <label className="flex flex-col">
            <span className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Fertige High-Concept-Idee
            </span>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={!canSave || busy}
              rows={10}
              className={cn(textareaClass, "mt-3")}
              placeholder="Idee hier einfügen oder bearbeiten …"
            />
          </label>
          <p className="mt-1.5 text-xs font-semibold text-zinc-500">
            {pasteText.trim().length.toLocaleString("de-DE")} Zeichen
          </p>
          <button
            type="button"
            disabled={!canSave || busy || pasteText.trim().length < 20}
            onClick={() => void onPasteSave()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending === "paste" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Speichern und freigeben
          </button>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            {verlaufCount > 0 ? (
              <div className="rounded-3xl bg-white ring-1 ring-zinc-950/10">
                <button
                  type="button"
                  onClick={() => setVerlaufOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  aria-expanded={verlaufOpen}
                >
                  <span>
                    <span className="block text-sm font-extrabold text-zinc-950">
                      Verlauf
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                      {verlaufCount}{" "}
                      {verlaufCount === 1 ? "Runde" : "Runden"} erledigt
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-zinc-500 transition",
                      verlaufOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {verlaufOpen ? (
                  <div className="max-h-72 space-y-3 overflow-y-auto border-t border-zinc-100 px-5 py-4">
                    {pairs.map((pair, i) => (
                      <div
                        key={`pair-${i}`}
                        className="rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-950/5"
                      >
                        {pair.question ? (
                          <div className="mb-2">
                            <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                              Lektor
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm font-semibold text-zinc-700">
                              {pair.question}
                            </pre>
                          </div>
                        ) : null}
                        {pair.answer ? (
                          <div>
                            <p className="text-[10px] font-extrabold tracking-wide text-orange-800 uppercase">
                              Deine Antwort
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm font-semibold text-zinc-800">
                              {pair.answer}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <section className="flex min-h-[12rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
              <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Offene Frage · Lektor
              </p>
              <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/5">
                <pre className="whitespace-pre-wrap font-sans text-base font-semibold leading-relaxed text-zinc-900">
                  {openQuestion ||
                    "Noch keine Frage — bitte Seite neu laden oder Roman erneut anlegen."}
                </pre>
              </div>
            </section>

            <section className="flex flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
              <label className="flex flex-col">
                <span className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                  Deine Antwort
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!canSave || busy}
                  rows={4}
                  maxLength={20_000}
                  className={cn(textareaClass, "mt-3")}
                  placeholder="Hier tippen oder per Mikrofon diktieren …"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void sendText(draft);
                    }
                  }}
                />
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canSave || busy}
                  onClick={() => void sendText(draft)}
                  className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  {pending === "turn" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Senden
                </button>
                {!listening ? (
                  <button
                    type="button"
                    disabled={!canSave || busy}
                    onClick={() => void startListening()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
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
                      disabled={!liveTranscript.trim() || busy}
                      onClick={() => applyTranscriptToDraft()}
                      className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Transkript übernehmen
                    </button>
                    <button
                      type="button"
                      disabled={!liveTranscript.trim() || busy}
                      onClick={() => void sendText(liveTranscript)}
                      className="rounded-full bg-orange-100 px-4 py-2.5 text-sm font-bold text-orange-950 ring-1 ring-orange-200 disabled:opacity-50"
                    >
                      Transkript senden
                    </button>
                  </>
                )}
                <p className="text-xs font-semibold text-zinc-500">
                  Ctrl/⌘+Enter sendet
                </p>
              </div>
              {listening || liveTranscript ? (
                <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  {liveTranscript || "Hör zu …"}
                </p>
              ) : null}
            </section>
          </div>

          <section className="flex min-h-[20rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <h3 className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              High-Concept-Idee (Live)
            </h3>
            <div
              className={cn(
                "mt-3 max-h-[80vh] flex-1 overflow-y-auto rounded-2xl px-4 py-4 text-sm font-semibold leading-relaxed ring-1",
                highConceptIdea.trim()
                  ? "bg-zinc-50 text-zinc-800 ring-zinc-950/8"
                  : "bg-zinc-100 text-zinc-500 ring-zinc-950/8",
              )}
            >
              {highConceptIdea.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {highConceptIdea}
                </pre>
              ) : (
                "Noch leer — entsteht nach der ersten Antwort."
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-zinc-500">
              {highConceptIdea.trim().length.toLocaleString("de-DE")} Zeichen
              {ideaReady
                ? " — bereit zum Übernehmen"
                : " — mind. 20 Zeichen zum Übernehmen"}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
