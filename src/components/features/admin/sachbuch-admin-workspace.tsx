"use client";

/**
 * Sachbuch workspace: Phasen 1–5 + Agenten.
 * Buchart (Journey / Erklärung) sits in Grundlagen and drives Idee + Makro.
 */

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { saveSachbuchAction } from "@/app/actions/sachbuch-admin";
import { SachbuchAgentsPanel } from "@/components/features/admin/sachbuch-agents-panel";
import { SachbuchEvidenzPanel } from "@/components/features/admin/sachbuch-evidenz-panel";
import { SachbuchIdeePanel } from "@/components/features/admin/sachbuch-idee-panel";
import { SachbuchMakroPanel } from "@/components/features/admin/sachbuch-makro-panel";
import { SachbuchSchreibenPanel } from "@/components/features/admin/sachbuch-schreiben-panel";
import type { SachbuchKontext, SachbuchMakroTyp } from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_TYP_HINTS,
  SACHBUCH_MAKRO_TYP_LABELS,
  SACHBUCH_MAKRO_TYP_OPTIONS,
  emptyMakroStages,
} from "@/lib/sachbuch/types";
import { cn } from "@/lib/utils";

type TabId =
  | "grundlagen"
  | "idee"
  | "evidenz"
  | "makro"
  | "agenten"
  | "schreiben";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "grundlagen", label: "Grundlagen" },
  { id: "agenten", label: "Agenten" },
  { id: "idee", label: "Idee" },
  { id: "evidenz", label: "Evidenz" },
  { id: "makro", label: "Makro" },
  { id: "schreiben", label: "Schreiben" },
];

export function SachbuchAdminWorkspace({
  initialBook,
  modelOptions,
  canSave,
}: {
  initialBook: SachbuchKontext;
  modelOptions: Array<{ modelSlug: string; label: string }>;
  canSave: boolean;
}) {
  const [book, setBook] = useState(initialBook);
  const [tab, setTab] = useState<TabId>("grundlagen");
  const [title, setTitle] = useState(initialBook.title);
  const [stilbibel, setStilbibel] = useState(initialBook.stilbibel);
  const [zielgruppe, setZielgruppe] = useState(initialBook.zielgruppe);
  const [buchArt, setBuchArt] = useState<SachbuchMakroTyp>(
    initialBook.makro.typ ?? "journey",
  );
  const [pending, setPending] = useState(false);

  async function saveGrundlagen() {
    if (!canSave || pending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Titel angeben.");
      return;
    }
    const typChanged = buchArt !== (book.makro.typ ?? "journey");
    setPending(true);
    const result = await saveSachbuchAction({
      id: book.id,
      title: trimmed,
      stilbibel,
      zielgruppe,
      agents: book.agents,
      idee: book.idee,
      evidenz: book.evidenz,
      makro: typChanged
        ? {
            typ: buchArt,
            stages: emptyMakroStages(buchArt),
            status: "empty",
            kapitelGenerated: false,
          }
        : { ...book.makro, typ: buchArt },
      kapitel: book.kapitel,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setBook(result.data!.book);
    setBuchArt(result.data!.book.makro.typ);
    toast.success(
      typChanged
        ? "Grundlagen gespeichert — Makro-Stages an neue Buchart angepasst."
        : "Grundlagen gespeichert.",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/sachbuch"
            className="text-sm font-bold text-orange-800 hover:underline"
          >
            ← Alle Sachbücher
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            {book.title}
          </h1>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            Buchart: {SACHBUCH_MAKRO_TYP_LABELS[book.makro.typ ?? "journey"]}
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Sachbuch-Phasen">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition",
              tab === t.id
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "grundlagen" ? (
        <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
          <div>
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Buchart
            </span>
            <div className="flex flex-wrap gap-2">
              {SACHBUCH_MAKRO_TYP_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => setBuchArt(option)}
                  className={cn(
                    "rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50",
                    buchArt === option
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-700 ring-1 ring-zinc-950/10",
                  )}
                >
                  {SACHBUCH_MAKRO_TYP_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-500">
              {SACHBUCH_MAKRO_TYP_HINTS[buchArt]}
              {buchArt !== (book.makro.typ ?? "journey")
                ? " Wechsel setzt Makro-Stages zurück."
                : ""}
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Titel
            </span>
            <input
              value={title}
              disabled={!canSave || pending}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Zielgruppe
            </span>
            <input
              value={zielgruppe}
              disabled={!canSave || pending}
              onChange={(e) => setZielgruppe(e.target.value)}
              placeholder="Für wen schreibst du?"
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Stilbibel / Autor-DNA
            </span>
            <textarea
              value={stilbibel}
              disabled={!canSave || pending}
              onChange={(e) => setStilbibel(e.target.value)}
              rows={10}
              placeholder="Ton, Satzlänge, Lieblingswendungen, Tabus …"
              className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold leading-relaxed outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
          </label>
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => void saveGrundlagen()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? "Speichern …" : "Speichern"}
          </button>
        </section>
      ) : null}

      {tab === "idee" ? (
        <SachbuchIdeePanel
          book={book}
          canSave={canSave}
          onBookUpdate={setBook}
        />
      ) : null}

      {tab === "evidenz" ? (
        <SachbuchEvidenzPanel
          book={book}
          canSave={canSave}
          onBookUpdate={setBook}
        />
      ) : null}

      {tab === "makro" ? (
        <SachbuchMakroPanel
          book={book}
          canSave={canSave}
          onBookUpdate={setBook}
        />
      ) : null}

      {tab === "agenten" ? (
        <SachbuchAgentsPanel
          book={book}
          modelOptions={modelOptions}
          canSave={canSave}
          onSaved={setBook}
        />
      ) : null}

      {tab === "schreiben" ? (
        <SachbuchSchreibenPanel
          book={book}
          canSave={canSave}
          onBookUpdate={setBook}
        />
      ) : null}
    </div>
  );
}
