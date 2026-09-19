"use client";

/**
 * Idea Q&A layout: Verlauf, Coach Q&A, Ideendokumentation.
 * Critique / Verbessern runs via pipeline stage actions above the panel.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { romanIdeeQaTurnAction } from "@/app/actions/roman-idee-qa";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { countWords, formatWordCount } from "@/lib/roman/editorial";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const STARTER_QUESTION =
  "Womit soll die Idee starten? Genre, Kernkonflikt/These, Figurrolle oder Setting — ohne Kapitelplan, ohne feste Eigennamen.";

const textareaClass =
  "w-full min-h-[14rem] flex-1 resize-y rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";

function splitDialog(messages: RomanIdeaChatMessage[]): {
  history: RomanIdeaChatMessage[];
  /** Empty = no open Coach question. */
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
  // Last turn answered — no pending Coach question.
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
  const [verlaufOpen, setVerlaufOpen] = useState(false);

  const { history, openQuestion } = useMemo(
    () => splitDialog(messages),
    [messages],
  );
  const pairs = useMemo(() => historyPairs(history), [history]);
  const verlaufCount = pairs.length;
  const busy = Boolean(disabled || pending);

  async function send() {
    if (!canSave || busy) return;
    const text = draft.trim();
    if (!text) {
      toast.message("Antwort eingeben.");
      return;
    }
    setPending(true);
    try {
      const result = await romanIdeeQaTurnAction({
        romanId,
        userMessage: text,
      });
      if (!result.success) {
        toast.error(result.error ?? "Ideen-Q&A fehlgeschlagen.");
        return;
      }
      setDraft("");
      setVerlaufOpen(false);
      onTurnComplete({
        messages: result.data!.roman.ideenChat,
        ideeKurz: result.data!.ideeKurz,
      });
      toast.success("Idee aktualisiert.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <RomanSceneWaitDialog open={pending} variant="idee" />

      <p className="text-sm font-semibold text-zinc-600">
        Offene Frage vom Schreib-Coach beantworten. Nach dem Senden aktualisiert
        der Ideen-Redakteur die Ideendokumentation — als Saat für die Spec, ohne
        Kapitel- oder Szenenpläne.
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
            <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Offene Frage · Schreib-Coach
            </p>
            <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/5">
              <pre className="whitespace-pre-wrap font-sans text-base font-semibold leading-relaxed text-zinc-900">
                {openQuestion ||
                  "Keine offene Frage. Schreib dem Coach etwas Neues, oder nutze Verbessern oben."}
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
                disabled={!canSave || busy}
                rows={8}
                className={cn(textareaClass, "mt-3")}
                placeholder="Hier antworten …"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canSave || busy}
                onClick={() => void send()}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {pending
                  ? "An Schreib-Coach senden …"
                  : "An Schreib-Coach senden"}
              </button>
              <p className="text-xs font-semibold text-zinc-500">
                Ctrl/⌘+Enter sendet
              </p>
            </div>
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
