"use client";

/**
 * Ideen-Finder: Gemini Flash chat at roman start; Übernehmen fills steps 1–4 via Mistral.
 * Chat history is owned by the parent and persisted on `roman_kontext.ideen_chat`.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  romanIdeaApplyAction,
  romanIdeaChatAction,
  saveRomanIdeenChatAction,
} from "@/app/actions/roman-admin";
import type {
  RomanIdeaChatMessage,
  RomanIdeaFoundationFill,
} from "@/lib/roman/idea-finder";
import { cn } from "@/lib/utils";

type RomanIdeaFinderProps = {
  romanId?: string | null;
  messages: RomanIdeaChatMessage[];
  onMessagesChange: (messages: RomanIdeaChatMessage[]) => void;
  canSave: boolean;
  disabled?: boolean;
  onApplied: (fill: RomanIdeaFoundationFill) => void;
};

/**
 * Collapsible chat UI for developing a book idea before the foundation forms.
 */
export function RomanIdeaFinder({
  romanId,
  messages,
  onMessagesChange,
  canSave,
  disabled = false,
  onApplied,
}: RomanIdeaFinderProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = chatPending || applyPending || disabled;
  const canApply =
    messages.some((m) => m.role === "assistant") &&
    messages.some((m) => m.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, chatPending]);

  async function persistChat(next: RomanIdeaChatMessage[]) {
    if (!romanId) return false;
    const result = await saveRomanIdeenChatAction({
      romanId,
      messages: next,
    });
    if (!result.success) {
      toast.error(result.error ?? "Ideen-Chat konnte nicht gespeichert werden.");
      return false;
    }
    return true;
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !canSave || busy) return;

    const history = messages;
    setDraft("");
    const withUser: RomanIdeaChatMessage[] = [
      ...history,
      { role: "user", content: text },
    ];
    onMessagesChange(withUser);
    setChatPending(true);

    const result = await romanIdeaChatAction({
      history,
      userMessage: text,
    });
    setChatPending(false);

    if (!result.success) {
      toast.error(result.error ?? "Ideen-Chat fehlgeschlagen.");
      onMessagesChange(history);
      return;
    }
    const next: RomanIdeaChatMessage[] = [
      ...withUser,
      { role: "assistant", content: result.data!.reply },
    ];
    onMessagesChange(next);
    const saved = await persistChat(next);
    if (!romanId) {
      toast.message(
        "Chat lokal — beim Speichern des Romans wird der Verlauf historisiert.",
      );
    } else if (saved) {
      // silent success — avoid toast spam every turn
    }
  }

  async function handleApply() {
    if (!canSave || busy || !canApply) return;
    setApplyPending(true);
    const result = await romanIdeaApplyAction({ messages });
    setApplyPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Übernahme fehlgeschlagen.");
      return;
    }
    await persistChat(messages);
    onApplied(result.data!.fill);
    toast.success(
      "Idee übernommen — Schritte 1–4 (Fundament bis Szenen-Raster) befüllt.",
    );
  }

  async function handleClear() {
    if (busy) return;
    onMessagesChange([]);
    setDraft("");
    await persistChat([]);
  }

  return (
    <div className="rounded-2xl ring-1 ring-zinc-950/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-extrabold text-zinc-950">
            0. Ideen-Finder (Gemini Flash)
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
            Idee per Chat entwickeln — Verlauf wird am Roman historisiert.
            „Übernehmen“ füllt Schritte 1–4 (Mistral).
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-zinc-500">
          {open ? "Einklappen" : "Ausklappen"}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-zinc-100 p-4">
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl bg-gray-50 p-3 ring-1 ring-zinc-950/5">
            {messages.length === 0 ? (
              <p className="text-sm font-semibold text-zinc-500">
                Starte z. B. mit Genre, Figur oder einem Konflikt — Gemini
                hilft dir, die Idee schärfer zu machen.
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-6 bg-orange-50 font-semibold text-orange-950"
                      : "mr-6 bg-white font-semibold text-zinc-800 ring-1 ring-zinc-950/5",
                  )}
                >
                  <p className="mb-1 text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                    {m.role === "user" ? "Du" : "Ideen-Coach"}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {m.content}
                  </pre>
                </div>
              ))
            )}
            {chatPending ? (
              <p className="text-xs font-semibold text-zinc-500">
                Gemini denkt nach …
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Deine Nachricht
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canSave || busy}
              rows={3}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              placeholder="z. B. Thriller um eine Bibliothekarin, die …"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || busy || !draft.trim()}
              onClick={() => void handleSend()}
              className={cn(
                "rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
                (!canSave || busy || !draft.trim()) && "opacity-70",
              )}
            >
              {chatPending ? "Senden …" : "Senden"}
            </button>
            <button
              type="button"
              disabled={!canSave || busy || !canApply}
              onClick={() => void handleApply()}
              className={cn(
                "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
                (!canSave || busy || !canApply) && "opacity-70",
              )}
            >
              {applyPending
                ? "Mistral befüllt …"
                : "Übernehmen → Schritte 1–4"}
            </button>
            {messages.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleClear()}
                className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-white"
              >
                Chat leeren
              </button>
            ) : null}
          </div>
          <p className="text-xs font-semibold text-zinc-500">
            {romanId
              ? "Verlauf wird nach jeder Antwort am Roman gespeichert."
              : "Noch kein gespeicherter Roman — Verlauf wird beim Speichern historisiert."}{" "}
            Strg/⌘+Enter sendet.
          </p>
        </div>
      ) : null}
    </div>
  );
}
