"use client";

/**
 * Basics Vorab-Schritt: competitive market scan (Gemini + Google Search).
 * Needs stay visible; Top-5 and per-book Kritik/Stärken start collapsed.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { romanMarktanalyseScanAction } from "@/app/actions/roman-marktanalyse";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import type { RomanMarktanalyse } from "@/lib/roman/editorial";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

export function RomanMarktanalysePanel({
  romanId,
  genre,
  alterPresetId,
  richtungen = [],
  value,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  genre: string;
  alterPresetId: string;
  richtungen?: string[];
  value: RomanMarktanalyse | null;
  canSave: boolean;
  disabled?: boolean;
  onComplete: (input: {
    roman: RomanKontext;
    marktanalyse: RomanMarktanalyse;
  }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [topOpen, setTopOpen] = useState(false);
  const [openReviews, setOpenReviews] = useState<Record<string, boolean>>({});
  const ready = genre.trim().length >= 2 && alterPresetId.trim().length > 0;
  const busy = Boolean(disabled || pending || !canSave);

  async function runScan() {
    if (!ready) {
      toast.error("Zuerst Genre und Altersgruppe wählen.");
      return;
    }
    setPending(true);
    try {
      const result = await romanMarktanalyseScanAction({
        romanId,
        genre,
        alterPresetId,
        richtungen,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Marktanalyse fehlgeschlagen.");
        return;
      }
      setThemesOpen(false);
      setTopOpen(false);
      setOpenReviews({});
      onComplete(result.data);
      toast.success("Marktanalyse gespeichert.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-extrabold text-zinc-950">
          Vorab: Marktanalyse (Konkurrenz)
        </h3>
        <p className="text-xs font-semibold text-zinc-600">
          Findet die 5 aktuell meistgelesenen Titel in Deutschland und wertet
          je bis zu 20 schlechteste sowie 20 beste Rezensionen aus —
          vernachlässigtes und erfülltes Leserbedürfnis werden MUSS für Entwurf
          und Gegenlesen.
        </p>
      </div>

      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void runScan()}
        className="rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white ring-1 ring-orange-700 transition hover:bg-orange-800 disabled:opacity-60"
      >
        {value ? "Marktanalyse aktualisieren" : "Marktanalyse starten"}
      </button>

      {!ready ? (
        <p className="text-xs font-semibold text-amber-800">
          Genre und Altersgruppe oben setzen (Speichern empfohlen).
        </p>
      ) : null}

      {value ? (
        <div className="space-y-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/8">
          <p className="text-xs font-semibold text-zinc-500">
            {value.genre}
            {value.richtungen?.length
              ? ` · ${value.richtungen.join(" · ")}`
              : ""}{" "}
            · {value.zielgruppe}
            {value.scannedAt
              ? ` · ${new Date(value.scannedAt).toLocaleString("de-DE")}`
              : ""}
            {value.modelLabel ? ` · ${value.modelLabel}` : ""}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl bg-orange-50/80 p-3 ring-1 ring-orange-200/80">
              <p className="text-xs font-extrabold uppercase tracking-wide text-orange-900/70">
                Vernachlässigtes Bedürfnis · MUSS
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {value.neglectedNeed}
              </p>
            </div>
            {value.fulfilledNeed?.trim() ? (
              <div className="space-y-2 rounded-xl bg-emerald-50/80 p-3 ring-1 ring-emerald-200/80">
                <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-900/70">
                  Erfülltes Bedürfnis · MUSS
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {value.fulfilledNeed}
                </p>
              </div>
            ) : null}
          </div>

          {value.topCritiqueThemes.length > 0 ||
          (value.topStrengthThemes ?? []).length > 0 ? (
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/8">
              <button
                type="button"
                onClick={() => setThemesOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                aria-expanded={themesOpen}
              >
                <span>
                  <span className="block text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                    Kritik & Stärken (übergreifend)
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-zinc-800">
                    {[
                      value.topCritiqueThemes.length
                        ? `${value.topCritiqueThemes.length} Kritik-Themen`
                        : null,
                      (value.topStrengthThemes ?? []).length
                        ? `${value.topStrengthThemes.length} Stärken-Themen`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-zinc-500 transition",
                    themesOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {themesOpen ? (
                <div className="grid gap-4 border-t border-zinc-100 px-3 py-3 sm:grid-cols-2">
                  {value.topCritiqueThemes.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                        Kritik-Themen
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                        {value.topCritiqueThemes.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {(value.topStrengthThemes ?? []).length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                        Stärken-Themen
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-zinc-800">
                        {value.topStrengthThemes.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-950/8">
            <button
              type="button"
              onClick={() => setTopOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              aria-expanded={topOpen}
            >
              <span>
                <span className="block text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                  Top-{value.books.length} Konkurrenz (Deutschland)
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-zinc-800">
                  {value.books.map((b) => b.title).join(" · ")}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-zinc-500 transition",
                  topOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            {topOpen ? (
              <div className="space-y-3 border-t border-zinc-100 px-3 py-3">
                {value.books.map((book) => {
                  const bookKey = `${book.title}-${book.author}`;
                  const reviewsOpen = Boolean(openReviews[bookKey]);
                  return (
                    <article
                      key={bookKey}
                      className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5"
                    >
                      <p className="text-sm font-extrabold text-zinc-950">
                        {book.title}
                        <span className="font-semibold text-zinc-600">
                          {" "}
                          — {book.author}
                        </span>
                      </p>
                      {book.whyPopular ? (
                        <p className="mt-1 text-xs font-semibold text-zinc-600">
                          {book.whyPopular}
                        </p>
                      ) : null}

                      <div className="mt-2 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-950/8">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenReviews((prev) => ({
                              ...prev,
                              [bookKey]: !prev[bookKey],
                            }))
                          }
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                          aria-expanded={reviewsOpen}
                        >
                          <span className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                            Kritik & Stärken
                            {book.worstReviewsConsidered ||
                            book.bestReviewsConsidered
                              ? ` · ~${book.worstReviewsConsidered ?? "?"} neg. / ~${book.bestReviewsConsidered ?? "?"} pos.`
                              : ""}
                          </span>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-zinc-500 transition",
                              reviewsOpen && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </button>
                        {reviewsOpen ? (
                          <div className="grid gap-3 border-t border-zinc-100 px-3 py-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                                Kritik
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs font-semibold text-zinc-800">
                                {book.critiquePoints.map((c) => (
                                  <li key={c}>{c}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                                Stärken
                              </p>
                              {(book.strengthPoints ?? []).length > 0 ? (
                                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs font-semibold text-zinc-800">
                                  {book.strengthPoints.map((c) => (
                                    <li key={c}>{c}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs font-semibold text-zinc-500">
                                  Noch keine Stärken in diesem Scan.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          {value.sources && value.sources.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                Quellen (Auszug)
              </p>
              <ul className="space-y-1 text-xs font-semibold text-orange-800">
                {value.sources.slice(0, 8).map((s) => (
                  <li key={s.uri}>
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-orange-300 underline-offset-2 hover:text-orange-950"
                    >
                      {s.title || s.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {value.searchSuggestionsHtml ? (
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                Google-Suche (Vorschläge)
              </p>
              <div
                className="overflow-x-auto rounded-xl bg-white p-2 ring-1 ring-zinc-950/8"
                // Required by Gemini Grounding ToS when search suggestions are returned.
                dangerouslySetInnerHTML={{
                  __html: value.searchSuggestionsHtml,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs font-semibold text-zinc-500">
          Noch keine Marktanalyse — optional, aber empfohlen vor der Idee.
        </p>
      )}

      <RomanSceneWaitDialog open={pending} variant="marktanalyse" />
    </div>
  );
}
