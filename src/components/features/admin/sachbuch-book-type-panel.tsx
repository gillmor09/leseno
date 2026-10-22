"use client";

/**
 * After Idee: suggest & confirm gängigen Sachbuchtyp from Konzept.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  applySachbuchBookTypeAction,
  suggestSachbuchBookTypeAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import {
  getSachbuchBookType,
  SACHBUCH_BOOK_TYPES,
} from "@/lib/sachbuch/book-types";
import type { SachbuchBookTypeSuggestResult } from "@/lib/sachbuch/suggest-book-type";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import { SACHBUCH_MAKRO_TYP_LABELS } from "@/lib/sachbuch/types";
import {
  SACHBUCH_WAIT_UVP,
  sachbuchWaitAgent,
} from "@/lib/sachbuch/wait-presets";
import { cn } from "@/lib/utils";

export function SachbuchBookTypePanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const confirmed = getSachbuchBookType(book.makro.bookTypeId);
  const [suggestion, setSuggestion] =
    useState<SachbuchBookTypeSuggestResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (confirmed || suggestion || pending) return;
    const corpus =
      book.idee.briefing.trim().length +
      book.idee.unpopularOpinion.trim().length;
    if (corpus < 40) return;
    void (async () => {
      setPending(true);
      setWaitOpen(true);
      try {
        const result = await suggestSachbuchBookTypeAction({ id: book.id });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Vorschlag fehlgeschlagen.");
          return;
        }
        setSuggestion(result.data.suggestion);
        setSelectedId(result.data.suggestion.primary.bookTypeId);
      } finally {
        setWaitOpen(false);
        setPending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, confirmed?.id]);

  async function refreshSuggest() {
    if (!canSave || pending) return;
    setPending(true);
    setWaitOpen(true);
    try {
      const result = await suggestSachbuchBookTypeAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Vorschlag fehlgeschlagen.");
        return;
      }
      setSuggestion(result.data.suggestion);
      setSelectedId(result.data.suggestion.primary.bookTypeId);
      toast.success("Buchtyp neu vorgeschlagen.");
    } finally {
      setWaitOpen(false);
      setPending(false);
    }
  }

  async function apply(bookTypeId: string) {
    if (!canSave || pending || !bookTypeId) return;
    setPending(true);
    try {
      const result = await applySachbuchBookTypeAction({
        sachbuchId: book.id,
        bookTypeId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Sachbuchtyp übernommen.");
    } finally {
      setPending(false);
    }
  }

  if (confirmed) {
    return (
      <section className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Sachbuchtyp
            </p>
            <p className="mt-1 text-sm font-extrabold text-zinc-950">
              {confirmed.name}
            </p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {confirmed.description}
            </p>
            <p className="mt-2 text-xs font-semibold text-zinc-500">
              Makro: {SACHBUCH_MAKRO_TYP_LABELS[confirmed.makroTyp]}
            </p>
          </div>
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void refreshSuggest()}
            className="text-xs font-bold text-orange-800 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Neu vorschlagen
          </button>
        </div>
        {suggestion ? (
          <div className="space-y-2 rounded-2xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-950/5">
            <p className="text-xs font-bold text-zinc-600">
              Alternativen aus dem letzten Vorschlag
            </p>
            {[suggestion.primary, ...suggestion.alternatives].map((s) => (
              <button
                key={s.bookTypeId}
                type="button"
                disabled={!canSave || pending || s.bookTypeId === confirmed.id}
                onClick={() => void apply(s.bookTypeId)}
                className="block w-full rounded-xl bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 ring-1 ring-zinc-950/10 hover:ring-orange-400 disabled:opacity-40"
              >
                {s.shortLabel} · {Math.round(s.confidence * 100)} % — {s.reason}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const options = suggestion
    ? [suggestion.primary, ...suggestion.alternatives]
    : [];

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
      <div>
        <h2 className="text-lg font-extrabold text-zinc-950">
          Sachbuchtyp aus dem Konzept
        </h2>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Welcher gängige Typ passt zu Idee/These? Vorschlag prüfen, dann
          übernehmen — danach Evidenz und Makro.
        </p>
      </div>

      {options.length > 0 ? (
        <ul className="space-y-2">
          {options.map((s, i) => (
            <li key={s.bookTypeId}>
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() => setSelectedId(s.bookTypeId)}
                className={cn(
                  "w-full rounded-2xl px-4 py-3 text-left ring-1 transition",
                  selectedId === s.bookTypeId
                    ? "bg-orange-50 ring-2 ring-orange-600"
                    : "bg-zinc-50 ring-zinc-950/10 hover:ring-zinc-950/20",
                )}
              >
                <p className="text-sm font-extrabold text-zinc-950">
                  {i === 0 ? "Empfehlung: " : ""}
                  {s.name}
                  <span className="ml-2 text-xs font-bold text-zinc-500">
                    {Math.round(s.confidence * 100)} %
                  </span>
                </p>
                <p className="mt-1 text-xs font-semibold text-zinc-600">
                  {s.reason}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-zinc-500">
          {pending
            ? "Vorschlag wird berechnet…"
            : "Noch kein Vorschlag — manuell wählen oder erneut anstoßen."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave || pending || !selectedId}
          onClick={() => void apply(selectedId)}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            "Typ übernehmen"
          )}
        </button>
        <button
          type="button"
          disabled={!canSave || pending}
          onClick={() => void refreshSuggest()}
          className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 disabled:opacity-50"
        >
          Neu vorschlagen
        </button>
        <button
          type="button"
          disabled={!canSave || pending}
          onClick={() => setManualOpen((v) => !v)}
          className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 disabled:opacity-50"
        >
          {manualOpen ? "Katalog schließen" : "Aus Katalog wählen"}
        </button>
      </div>

      {manualOpen ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {SACHBUCH_BOOK_TYPES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={!canSave || pending}
                onClick={() => void apply(t.id)}
                className="w-full rounded-xl bg-zinc-50 px-3 py-2 text-left text-xs font-semibold text-zinc-800 ring-1 ring-zinc-950/10 hover:ring-orange-400 disabled:opacity-50"
              >
                <span className="font-extrabold">{t.shortLabel}</span> —{" "}
                {t.description.slice(0, 140)}
                {t.description.length > 140 ? "…" : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <SachbuchWaitDialog
        open={waitOpen}
        title="Buchtyp wird vorgeschlagen"
        steps={SACHBUCH_WAIT_UVP}
        agentInfo={sachbuchWaitAgent(book.agents, "architect")}
      />
    </section>
  );
}
