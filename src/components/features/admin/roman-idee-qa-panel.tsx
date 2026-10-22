"use client";

/**
 * Idea Q&A layout: Verlauf, Coach Q&A (text + Deepgram STT), Ideendokumentation.
 * No Erzeugen/Leser-Feedback here — Idee is dialog-only; Reifegrad sits above.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import {
  romanIdeeDiscardOpenQuestionsAction,
  romanIdeeProposeQuestionsAction,
  romanIdeeQaTurnAction,
} from "@/app/actions/roman-idee-qa";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useDeepgramLiveStt } from "@/hooks/use-deepgram-live-stt";
import { countWords, formatWordCount } from "@/lib/roman/editorial";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const STARTER_QUESTION =
  "Womit soll die Idee starten? Kernkonflikt/These, Figurrolle oder Setting — ohne Kapitelplan, ohne feste Eigennamen. Genre und Tonalität kommen danach in Basics.";

const textareaClass =
  "w-full min-h-[6.5rem] resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";

function splitDialog(
  messages: RomanIdeaChatMessage[],
  hideStarter: boolean,
): {
  history: RomanIdeaChatMessage[];
  /** Empty = no open Coach question. */
  openQuestion: string;
  /** Trailing assistant in chat (not the synthetic starter). */
  hasPersistedOpenQuestion: boolean;
} {
  if (messages.length === 0) {
    return {
      history: [],
      openQuestion: hideStarter ? "" : STARTER_QUESTION,
      hasPersistedOpenQuestion: false,
    };
  }
  const last = messages[messages.length - 1]!;
  if (last.role === "assistant") {
    return {
      history: messages.slice(0, -1),
      openQuestion: last.content.trim() || STARTER_QUESTION,
      hasPersistedOpenQuestion: true,
    };
  }
  // Last turn answered — no pending Coach question.
  return {
    history: messages,
    openQuestion: "",
    hasPersistedOpenQuestion: false,
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

export function RomanIdeeQaPanel({
  romanId,
  messages,
  ideeKurz,
  canSave,
  disabled,
  onTurnComplete,
}: {
  romanId: string;
  messages: RomanIdeaChatMessage[];
  ideeKurz: string;
  canSave: boolean;
  disabled?: boolean;
  onTurnComplete: (next: {
    messages: RomanIdeaChatMessage[];
    ideeKurz: string;
  }) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingKind, setPendingKind] = useState<
    "turn" | "propose" | "discard" | null
  >(null);
  const [verlaufOpen, setVerlaufOpen] = useState(false);
  const [hideStarter, setHideStarter] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const {
    listening,
    liveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useDeepgramLiveStt({ enabled: canSave && !disabled });

  // New persisted open question → show it (clear local starter hide).
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      setHideStarter(false);
    }
  }, [messages]);

  const { history, openQuestion, hasPersistedOpenQuestion } = useMemo(
    () => splitDialog(messages, hideStarter),
    [messages, hideStarter],
  );
  const pairs = useMemo(() => historyPairs(history), [history]);
  const verlaufCount = pairs.length;
  const busy = Boolean(disabled || pending);
  const hasOpenQuestion = Boolean(openQuestion.trim());
  const canDiscardQuestions =
    canSave && !busy && (hasPersistedOpenQuestion || hasOpenQuestion);
  const canProposeQuestions = canSave && !busy && !hasOpenQuestion;

  async function sendText(text: string) {
    if (!canSave || busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast.message("Antwort eingeben.");
      return;
    }
    if (listening) stopListening();
    setPending(true);
    setPendingKind("turn");
    try {
      const result = await romanIdeeQaTurnAction({
        romanId,
        userMessage: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? "Ideen-Q&A fehlgeschlagen.");
        return;
      }
      setDraft("");
      clearTranscript();
      setVerlaufOpen(false);
      setHideStarter(false);
      onTurnComplete({
        messages: result.data!.roman.ideenChat,
        ideeKurz: result.data!.ideeKurz,
      });
      toast.success("Idee aktualisiert.");
    } finally {
      setPending(false);
      setPendingKind(null);
    }
  }

  async function confirmDiscardQuestions() {
    if (!canDiscardQuestions) return;
    setPending(true);
    setPendingKind("discard");
    try {
      if (hasPersistedOpenQuestion) {
        const result = await romanIdeeDiscardOpenQuestionsAction({ romanId });
        if (!result.success) {
          toast.error(result.error ?? "Fragen verwerfen fehlgeschlagen.");
          return;
        }
        onTurnComplete({
          messages: result.data!.messages,
          ideeKurz,
        });
      } else {
        // Synthetic starter only — no chat row to delete.
        setHideStarter(true);
      }
      setDiscardConfirmOpen(false);
      toast.success("Offene Fragen verworfen.");
    } finally {
      setPending(false);
      setPendingKind(null);
    }
  }

  async function proposeNewQuestions() {
    if (!canProposeQuestions) return;
    if (listening) stopListening();
    setPending(true);
    setPendingKind("propose");
    try {
      const result = await romanIdeeProposeQuestionsAction({ romanId });
      if (!result.success) {
        toast.error(result.error ?? "Neue Fragen fehlgeschlagen.");
        return;
      }
      setHideStarter(false);
      onTurnComplete({
        messages: result.data!.messages,
        ideeKurz,
      });
      toast.success("Neue Fragen vom Schreib-Coach.");
    } finally {
      setPending(false);
      setPendingKind(null);
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
      <RomanSceneWaitDialog
        open={pending && pendingKind !== "discard"}
        variant="idee"
        contextLabel="Idee · Dialogrunde"
        title={
          pendingKind === "propose"
            ? "Neue Fragen holen"
            : "Idee weiterentwickeln"
        }
        progressLabel={
          pendingKind === "propose"
            ? "Schreib-Coach formuliert neue Konzeptfragen …"
            : "Schreib-Coach und Ideen-Redakteur arbeiten an dieser Runde …"
        }
      />

      <ConfirmDeleteDialog
        open={discardConfirmOpen}
        title="Offene Fragen verwerfen?"
        description="Die aktuelle Coach-Frage verschwindet. Der Verlauf und die Ideendokumentation bleiben. Danach kannst du „Neue Fragen“ holen."
        confirmLabel="Fragen verwerfen"
        pending={pendingKind === "discard"}
        onCancel={() => {
          if (pendingKind !== "discard") setDiscardConfirmOpen(false);
        }}
        onConfirm={() => void confirmDiscardQuestions()}
      />

      <p className="text-sm font-semibold text-zinc-600">
        Offene Frage vom Schreib-Coach beantworten — tippen oder per Mikrofon
        (Deepgram). Nach dem Senden aktualisiert der Ideen-Redakteur die
        Ideendokumentation (ohne Kapitelplan). Feste Tonalität ist hier noch
        nicht nötig. Wenn die Dokumentation steht: oben Reifegrad messen bis
        Hard-Gate grün — danach Basics Genre/Ton/Regeln ableiten.
      </p>

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
                            Schreib-Coach
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
                Offene Frage · Schreib-Coach
              </p>
              <div className="flex flex-wrap gap-2">
                {hasOpenQuestion ? (
                  <button
                    type="button"
                    disabled={!canDiscardQuestions}
                    onClick={() => setDiscardConfirmOpen(true)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Fragen verwerfen
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canProposeQuestions}
                    onClick={() => void proposeNewQuestions()}
                    className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {pendingKind === "propose" ? "Fragen …" : "Neue Fragen"}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/5">
              <pre className="whitespace-pre-wrap font-sans text-base font-semibold leading-relaxed text-zinc-900">
                {openQuestion ||
                  "Keine offene Frage. „Neue Fragen“ holen oder dem Coach etwas Neues schreiben."}
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
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {pendingKind === "turn"
                  ? "An Schreib-Coach senden …"
                  : "An Schreib-Coach senden"}
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

        <div className="space-y-4">
          <section className="flex min-h-[20rem] flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <h3 className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Ideendokumentation
            </h3>
            <div
              className={cn(
                "mt-3 max-h-[80vh] flex-1 overflow-y-auto rounded-2xl px-4 py-4 text-sm font-semibold leading-relaxed ring-1",
                ideeKurz.trim()
                  ? "bg-zinc-50 text-zinc-800 ring-zinc-950/8"
                  : "bg-zinc-100 text-zinc-500 ring-zinc-950/8",
              )}
            >
              {ideeKurz.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {ideeKurz}
                </pre>
              ) : (
                "Noch leer — entsteht nach der ersten Runde mit dem Ideen-Redakteur."
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-zinc-500">
              {formatWordCount(countWords(ideeKurz))} Wörter · Konzept für Spec
              (Figuren/Welt/Exposé), kein Kapitelgerüst.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
