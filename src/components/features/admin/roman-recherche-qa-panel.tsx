"use client";

/**
 * Recherche Q&A: Verlauf, Coach (text + Deepgram STT), Hintergrunddossier + Quellen.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { romanRechercheQaTurnAction } from "@/app/actions/roman-recherche-qa";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { useDeepgramLiveStt } from "@/hooks/use-deepgram-live-stt";
import {
  countWords,
  formatWordCount,
  type RomanRechercheSource,
} from "@/lib/roman/editorial";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const STARTER_QUESTION =
  "Worauf soll die Hintergrundrecherche zuerst gehen — Fakten, Historie, Fachbegriffe, Orte, Kontroversen? Oder tippe „Aus Idee recherchieren“.";

const FROM_IDEE_PROMPT =
  "Recherchiere aus der aktuellen Idee die wichtigsten Hintergrundfakten, Kontexte und typischen Missverständnisse — mit Google Search, spez-fähig verdichtet.";

const textareaClass =
  "w-full min-h-[14rem] flex-1 resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";

function splitDialog(messages: RomanIdeaChatMessage[]): {
  history: RomanIdeaChatMessage[];
  openQuestion: string;
} {
  if (messages.length === 0) {
    return { history: [], openQuestion: STARTER_QUESTION };
  }
  const last = messages[messages.length - 1]!;
  if (last.role === "assistant") {
    return {
      history: messages.slice(0, -1),
      openQuestion: last.content.trim() || STARTER_QUESTION,
    };
  }
  return {
    history: messages,
    openQuestion: "",
  };
}

function historyPairs(
  history: RomanIdeaChatMessage[],
): Array<{ question?: string; answer?: string }> {
  const pairs: Array<{ question?: string; answer?: string }> = [];
  let pendingQuestion: string | undefined;
  for (const m of history) {
    if (m.role === "assistant") {
      if (pendingQuestion) {
        pairs.push({ question: pendingQuestion });
      }
      pendingQuestion = m.content.trim();
    } else {
      pairs.push({
        question: pendingQuestion,
        answer: m.content.trim(),
      });
      pendingQuestion = undefined;
    }
  }
  if (pendingQuestion) {
    pairs.push({ question: pendingQuestion });
  }
  return pairs;
}

export function RomanRechercheQaPanel({
  romanId,
  messages,
  rechercheDossier,
  sources,
  canSave,
  disabled,
  hasIdee,
  onTurnComplete,
}: {
  romanId: string;
  messages: RomanIdeaChatMessage[];
  rechercheDossier: string;
  sources: RomanRechercheSource[];
  canSave: boolean;
  disabled?: boolean;
  hasIdee: boolean;
  onTurnComplete: (next: {
    messages: RomanIdeaChatMessage[];
    rechercheDossier: string;
    sources: RomanRechercheSource[];
  }) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [verlaufOpen, setVerlaufOpen] = useState(false);
  const {
    listening,
    liveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useDeepgramLiveStt({ enabled: canSave && !disabled && hasIdee });

  const { history, openQuestion } = useMemo(
    () => splitDialog(messages),
    [messages],
  );
  const pairs = useMemo(() => historyPairs(history), [history]);
  const verlaufCount = pairs.length;
  const busy = Boolean(disabled || pending);

  async function sendText(text: string) {
    if (!canSave || busy) return;
    if (!hasIdee) {
      toast.message("Zuerst Idee erarbeiten.");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      toast.message("Antwort eingeben.");
      return;
    }
    if (listening) stopListening();
    setPending(true);
    try {
      const result = await romanRechercheQaTurnAction({
        romanId,
        userMessage: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? "Recherche-Q&A fehlgeschlagen.");
        return;
      }
      setDraft("");
      clearTranscript();
      setVerlaufOpen(false);
      const ed = result.data!.roman.editorial;
      onTurnComplete({
        messages: ed?.rechercheChat ?? [],
        rechercheDossier: result.data!.rechercheDossier,
        sources: ed?.rechercheSources ?? [],
      });
      toast.success("Recherche aktualisiert.");
    } finally {
      setPending(false);
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
      <RomanSceneWaitDialog open={pending} variant="recherche" />

      <p className="text-sm font-semibold text-zinc-600">
        Recherche-Coach mit Google Search (Gemini) — tippen oder Mikrofon.
        Der Recherche-Redakteur verwebt jede Runde in das Hintergrunddossier für
        die Spec.
      </p>

      {!hasIdee ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Zuerst im Schritt Idee eine Dokumentation anlegen (mind. etwas
          Substanz).
        </p>
      ) : null}

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
                            Recherche-Coach
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

          <section className="flex min-h-[16rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Offene Frage · Recherche-Coach
            </p>
            <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/5">
              <pre className="whitespace-pre-wrap font-sans text-base font-semibold leading-relaxed text-zinc-900">
                {openQuestion ||
                  "Keine offene Frage. Schreib dem Coach etwas Neues oder starte „Aus Idee recherchieren“."}
              </pre>
            </div>
          </section>

          <section className="flex min-h-[18rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <label className="flex min-h-0 flex-1 flex-col">
              <span className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Deine Antwort
              </span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!canSave || busy || !hasIdee}
                rows={8}
                className={cn(textareaClass, "mt-3")}
                placeholder="Recherche-Winkel nennen oder Fragen beantworten …"
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
                disabled={!canSave || busy || !hasIdee}
                onClick={() => void sendText(draft)}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {pending
                  ? "An Recherche-Coach senden …"
                  : "An Recherche-Coach senden"}
              </button>
              <button
                type="button"
                disabled={!canSave || busy || !hasIdee}
                onClick={() => void sendText(FROM_IDEE_PROMPT)}
                className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
              >
                Aus Idee recherchieren
              </button>
              {!listening ? (
                <button
                  type="button"
                  disabled={!canSave || busy || !hasIdee}
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

        <div className="space-y-4">
          <section className="flex min-h-[20rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <h3 className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Hintergrunddossier
            </h3>
            <div
              className={cn(
                "mt-3 max-h-[80vh] flex-1 overflow-y-auto rounded-2xl px-4 py-4 text-sm font-semibold leading-relaxed ring-1",
                rechercheDossier.trim()
                  ? "bg-zinc-50 text-zinc-800 ring-zinc-950/8"
                  : "bg-zinc-100 text-zinc-500 ring-zinc-950/8",
              )}
            >
              {rechercheDossier.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {rechercheDossier}
                </pre>
              ) : (
                "Noch leer — entsteht nach der ersten Runde mit Google Search."
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-zinc-500">
              {formatWordCount(countWords(rechercheDossier))} Wörter · Fakten
              für Spec, kein Kapitelgerüst.
            </p>
          </section>

          {sources.length > 0 ? (
            <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
              <h3 className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Quellen ({sources.length})
              </h3>
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm font-semibold">
                {sources.map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-800 underline-offset-2 hover:underline"
                    >
                      {s.title || s.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
