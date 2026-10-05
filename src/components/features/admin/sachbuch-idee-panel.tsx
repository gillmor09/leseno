"use client";

/**
 * Phase 1 — Mind-Extraction & UVP (book-level interview).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  sachbuchIdeeTurnAction,
  sharpenSachbuchUvpAction,
  startSachbuchIdeeAction,
  undoSachbuchIdeeLastTurnAction,
} from "@/app/actions/sachbuch-phases";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { useDeepgramLiveStt } from "@/hooks/use-deepgram-live-stt";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import { SACHBUCH_MAKRO_TYP_LABELS } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_IDEE_TURN,
  SACHBUCH_WAIT_UVP,
  sachbuchWaitAgent,
} from "@/lib/sachbuch/wait-presets";
import { cn } from "@/lib/utils";

export function SachbuchIdeePanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const buchArt = book.makro.typ ?? "journey";
  const sharpenLabel =
    buchArt === "erklaerung"
      ? "Kernaussage schärfen"
      : buchArt === "erzaehlung"
        ? "Story-These schärfen"
        : "UVP schärfen";
  const dossierTitle =
    buchArt === "erklaerung"
      ? "Kernaussage / Erklärthese"
      : buchArt === "erzaehlung"
        ? "Story-These / zentrale Erkenntnis"
        : "Unpopular Opinion / UVP";
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [waitKind, setWaitKind] = useState<"turn" | "uvp" | null>(null);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const {
    listening,
    liveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useDeepgramLiveStt({ enabled: canSave });
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      if (book.idee.interviewMessages.length > 0) return;
      const result = await startSachbuchIdeeAction({ id: book.id });
      if (result.success && result.data) onBookUpdate(result.data.book);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  /** Keep the latest interviewer turn in view (chat best practice: chrono + stick to bottom). */
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [book.idee.interviewMessages]);

  async function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canSave || pending) return;
    if (listening) stopListening();
    setPending(true);
    setWaitKind("turn");
    try {
      const result = await sachbuchIdeeTurnAction({
        sachbuchId: book.id,
        userText: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? "Antwort fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      setDraft("");
      clearTranscript();
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function sharpen() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitKind("uvp");
    try {
      const result = await sharpenSachbuchUvpAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "UVP schärfen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data!.book);
      toast.success("UVP geschärft.");
    } finally {
      setWaitKind(null);
      setPending(false);
    }
  }

  async function confirmUndoLastTurn() {
    if (!canSave || pending) return;
    setPending(true);
    const result = await undoSachbuchIdeeLastTurnAction({ id: book.id });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    onBookUpdate(result.data!.book);
    setUndoConfirmOpen(false);
    toast.success("Letzte Frage/Antwort gelöscht.");
  }

  const canUndoLast =
    book.idee.interviewMessages.length > 1 ||
    (book.idee.interviewMessages.length === 1 &&
      book.idee.interviewMessages[0]?.role === "user");

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-zinc-600">
        Phase 1 · Buchart {SACHBUCH_MAKRO_TYP_LABELS[buchArt]}
        {buchArt === "erklaerung"
          ? ": Interview zu Verständnisziel, Fehlvorstellungen und Beispielen — danach Kernaussage schärfen."
          : buchArt === "erzaehlung"
            ? ": Interview zu Fall, Szenen und Wendepunkt — danach Story-These schärfen."
            : ": Mind-Extraction zu Erfahrungen, Anti-Konsens und Case Studies — danach UVP schärfen."}{" "}
        Buchart in Grundlagen ändern.
      </p>

      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canSave || pending || !canUndoLast}
            onClick={() => setUndoConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-orange-800 transition hover:bg-orange-50 disabled:opacity-40"
            title="Letzte Frage und Antwort löschen"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Letzte Frage/Antwort löschen
          </button>
        </div>
        <div
          ref={transcriptScrollRef}
          className="max-h-[28rem] space-y-3 overflow-y-auto rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10"
        >
          {book.idee.interviewMessages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-2xl px-4 py-3 text-sm font-semibold",
                m.role === "assistant"
                  ? "bg-emerald-50/80 ring-1 ring-emerald-700/10"
                  : "bg-gray-100",
              )}
            >
              <p className="mb-1 text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                {m.role === "assistant" ? "Interviewer" : "Du"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10">
        <textarea
          value={draft}
          disabled={!canSave || pending}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Gedanken, Anekdoten, ungewöhnliche Thesen …"
          className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave || pending || !draft.trim()}
            onClick={() => void submitText(draft)}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Senden
          </button>
          {!listening ? (
            <button
              type="button"
              disabled={!canSave || pending}
              onClick={() => void startListening()}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 disabled:opacity-50"
            >
              <Mic className="size-4" aria-hidden />
              Live-Audio
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => stopListening()}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold ring-1 ring-zinc-950/10"
              >
                <MicOff className="size-4" aria-hidden />
                Stop
              </button>
              <button
                type="button"
                disabled={!liveTranscript.trim() || pending}
                onClick={() => void submitText(liveTranscript)}
                className="rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Transkript senden
              </button>
            </>
          )}
          <button
            type="button"
            disabled={!canSave || pending || book.idee.interviewMessages.length < 2}
            onClick={() => void sharpen()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                …
              </span>
            ) : (
              sharpenLabel
            )}
          </button>
        </div>
        {listening || liveTranscript ? (
          <p className="text-sm font-semibold text-zinc-600">
            {liveTranscript || "Hör zu …"}
          </p>
        ) : null}
      </div>

      {book.idee.status === "ready" ? (
        <div className="space-y-3 rounded-3xl bg-emerald-50/80 p-5 ring-1 ring-emerald-700/15">
          <h3 className="text-sm font-extrabold text-emerald-950">
            {dossierTitle}
          </h3>
          <p className="text-sm font-semibold leading-relaxed text-emerald-950">
            {book.idee.unpopularOpinion || "—"}
          </p>
          {book.idee.briefing ? (
            <pre className="whitespace-pre-wrap text-xs font-semibold text-emerald-900/90">
              {book.idee.briefing}
            </pre>
          ) : null}
          {book.idee.caseStudies.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-emerald-950">
              {book.idee.caseStudies.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={undoConfirmOpen}
        title="Letzte Frage/Antwort löschen?"
        description="Die letzte Autor-Antwort und die zugehörige Interviewer-Frage werden entfernt. Die Einstiegsfrage bleibt erhalten."
        confirmLabel="Löschen"
        pending={pending}
        onCancel={() => {
          if (!pending) setUndoConfirmOpen(false);
        }}
        onConfirm={() => void confirmUndoLastTurn()}
      />
      <SachbuchWaitDialog
        open={waitKind === "turn"}
        title="Interviewer antwortet"
        steps={SACHBUCH_WAIT_IDEE_TURN}
        agentInfo={sachbuchWaitAgent(book.agents, "interviewer")}
      />
      <SachbuchWaitDialog
        open={waitKind === "uvp"}
        title="UVP wird geschärft"
        steps={SACHBUCH_WAIT_UVP}
        agentInfo={sachbuchWaitAgent(book.agents, "interviewer")}
      />
    </div>
  );
}
