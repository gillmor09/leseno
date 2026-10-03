"use client";

/**
 * Admin: pick Clever title, teaser copy, publish as Buch der Woche,
 * generate Instagram image + caption (same layout as live creative).
 * Form opens empty; live status sits above the week editor.
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateBuchDerWocheIgAction,
  saveBuchDerWocheEntryAction,
  saveBuchDerWocheIgAction,
  setBuchDerWocheCurrentAction,
  type CleverRomanOption,
} from "@/app/actions/buch-der-woche-admin";
import { slugifyBuchDerWocheTitle } from "@/lib/buch-der-woche/slug";
import type { BuchDerWocheEntry } from "@/lib/buch-der-woche/types";
import { cn } from "@/lib/utils";

type BuchDerWocheAdminFormProps = {
  canSave: boolean;
  currentSlug: string | null;
  /** ISO timestamp when the current slug was last set live (`settings.updated_at`). */
  liveSince: string | null;
  entries: BuchDerWocheEntry[];
  cleverRomans: CleverRomanOption[];
  currentEntry: BuchDerWocheEntry | null;
};

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Kopiert", { duration: 1600 });
  } catch {
    toast.error("Kopieren fehlgeschlagen.");
  }
}

/** Whole days since `iso` (0 = today). */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return null;
  const ms = Date.now() - start;
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function formatDaysLive(days: number): string {
  if (days <= 0) return "seit heute";
  if (days === 1) return "seit 1 Tag";
  return `seit ${days} Tagen`;
}

export function BuchDerWocheAdminForm({
  canSave,
  currentSlug: initialCurrentSlug,
  liveSince: initialLiveSince,
  entries: initialEntries,
  cleverRomans,
  currentEntry: initialCurrent,
}: BuchDerWocheAdminFormProps) {
  const [currentSlug, setCurrentSlug] = useState(initialCurrentSlug);
  const [liveSince, setLiveSince] = useState(initialLiveSince);
  const [entries, setEntries] = useState(initialEntries);
  const [liveEntry, setLiveEntry] = useState(initialCurrent);
  // Empty on first paint — load a week via select or „Laden“.
  const [romanId, setRomanId] = useState("");
  const [slug, setSlug] = useState("");
  const [teaserHeadline, setTeaserHeadline] = useState("");
  const [teaserLead, setTeaserLead] = useState("");
  const [igPreview, setIgPreview] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [pending, startTransition] = useTransition();
  const [igPending, startIgTransition] = useTransition();

  const liveTitle = useMemo(() => {
    if (!currentSlug) return null;
    const entry = liveEntry?.slug === currentSlug ? liveEntry : null;
    const roman = entry
      ? cleverRomans.find((r) => r.id === entry.romanId)
      : null;
    return roman?.title ?? entry?.teaserHeadline ?? currentSlug;
  }, [cleverRomans, currentSlug, liveEntry]);

  const liveDays = daysSince(currentSlug ? liveSince : null);

  function loadEntryIntoForm(entry: BuchDerWocheEntry) {
    setRomanId(entry.romanId);
    setSlug(entry.slug);
    setTeaserHeadline(entry.teaserHeadline);
    setTeaserLead(entry.teaserLead);
    setIgPreview(entry.igImageDataUrl);
    setIgCaption(entry.igCaption);
  }

  function clearForm() {
    setRomanId("");
    setSlug("");
    setTeaserHeadline("");
    setTeaserLead("");
    setIgPreview("");
    setIgCaption("");
  }

  function onRomanChange(nextId: string) {
    if (!nextId) {
      clearForm();
      return;
    }
    setRomanId(nextId);
    const roman = cleverRomans.find((r) => r.id === nextId);
    if (!roman) return;
    const existing = entries.find((e) => e.romanId === nextId);
    if (existing) {
      loadEntryIntoForm(existing);
      return;
    }
    setSlug(slugifyBuchDerWocheTitle(roman.title));
    // Prefill from editorial marketing copy of the selected Clever book.
    setTeaserHeadline((roman.einzeiler || roman.title).slice(0, 160));
    const lead =
      roman.klappentext ||
      roman.einzeiler ||
      `Kurzgeschichten aus „${roman.title}“ — zum Mitfiebern und Verstehen.`;
    setTeaserLead(lead.slice(0, 400));
    setIgPreview("");
    setIgCaption("");
  }

  function save(setCurrent: boolean) {
    if (!canSave || pending) return;
    startTransition(async () => {
      const result = await saveBuchDerWocheEntryAction({
        slug,
        romanId,
        teaserHeadline,
        teaserLead,
        setCurrent,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setEntries((prev) => {
        const without = prev.filter((e) => e.slug !== result.data!.entry.slug);
        return [result.data!.entry, ...without];
      });
      setCurrentSlug(result.data.currentSlug);
      if (result.data.liveSince !== undefined) {
        setLiveSince(result.data.liveSince);
      }
      if (setCurrent || result.data.entry.slug === result.data.currentSlug) {
        setLiveEntry(result.data.entry);
      }
      setIgPreview(result.data.entry.igImageDataUrl || igPreview);
      setIgCaption(result.data.entry.igCaption || igCaption);
      toast.success(
        setCurrent
          ? "Gespeichert und als Buch der Woche übernommen."
          : "Gespeichert.",
      );
    });
  }

  function makeCurrent(nextSlug: string) {
    if (!canSave || pending) return;
    startTransition(async () => {
      const result = await setBuchDerWocheCurrentAction({ slug: nextSlug });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      setCurrentSlug(result.data.currentSlug);
      setLiveSince(result.data.liveSince);
      const entry = entries.find((e) => e.slug === nextSlug) ?? null;
      setLiveEntry(entry);
      toast.success("Als Buch der Woche übernommen.");
    });
  }

  function generateIg() {
    if (!canSave || igPending) return;
    startIgTransition(async () => {
      const result = await generateBuchDerWocheIgAction({ slug });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Generierung fehlgeschlagen.");
        return;
      }
      setIgPreview(result.data.imageDataUrl);
      setIgCaption(result.data.caption);
      toast.success("Instagram-Bild und Caption erzeugt.");
    });
  }

  function persistIg() {
    if (!canSave || pending || !igPreview.trim() || !igCaption.trim()) return;
    startTransition(async () => {
      const result = await saveBuchDerWocheIgAction({
        slug,
        igImageDataUrl: igPreview,
        igCaption,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "IG-Speichern fehlgeschlagen.");
        return;
      }
      setEntries((prev) => {
        const without = prev.filter((e) => e.slug !== result.data!.entry.slug);
        return [result.data!.entry, ...without];
      });
      if (result.data.entry.slug === currentSlug) {
        setLiveEntry(result.data.entry);
      }
      toast.success("Instagram-Post gespeichert.");
    });
  }

  function downloadIg() {
    if (!igPreview.startsWith("data:image/")) return;
    const link = document.createElement("a");
    link.href = igPreview;
    link.download = `buch-der-woche-${slug || "post"}-1024.png`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="space-y-8">
      {!canSave ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          Service-Role fehlt — Speichern und Generieren sind deaktiviert.
        </p>
      ) : null}

      <div className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-950 ring-1 ring-orange-200/80">
        {currentSlug && liveTitle ? (
          <p>
            Aktuell live:{" "}
            <span className="font-extrabold">{liveTitle}</span>
            <span className="text-orange-800/80"> ({currentSlug})</span>
            {liveDays !== null ? (
              <>
                {" "}
                — {formatDaysLive(liveDays)}
              </>
            ) : null}
            {" · "}
            <Link
              href="/buch-der-woche"
              className="font-extrabold text-orange-900 underline-offset-2 hover:underline"
            >
              /buch-der-woche
            </Link>
          </p>
        ) : (
          <p>Aktuell live: noch kein Buch der Woche gesetzt.</p>
        )}
      </div>

      <section className="rounded-[1.75rem] bg-white p-6 shadow-md ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-zinc-950">
              Diese Woche
            </h2>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              Neues Buch wählen oder bestehenden Eintrag laden — Felder starten
              leer.
            </p>
          </div>
          {currentSlug ? (
            <Link
              href={`/buch-der-woche/${currentSlug}`}
              className="text-sm font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              Permalink öffnen
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Clever-erzählt-Buch
            </span>
            <select
              value={romanId}
              onChange={(e) => onRomanChange(e.target.value)}
              disabled={!canSave || pending}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-950"
            >
              <option value="">
                {cleverRomans.length === 0
                  ? "Keine Clever-Bücher vorhanden"
                  : "Buch wählen …"}
              </option>
              {cleverRomans.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.hasCover ? "" : " (ohne Cover)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Slug
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={!canSave || pending}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-950"
              placeholder="hausaufgaben"
            />
          </label>

          <label className="block">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Teaser-Headline
            </span>
            <input
              value={teaserHeadline}
              onChange={(e) => setTeaserHeadline(e.target.value)}
              disabled={!canSave || pending}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-950"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Teaser-Lead (auch IG-Textzeilen)
            </span>
            <textarea
              value={teaserLead}
              onChange={(e) => setTeaserLead(e.target.value)}
              disabled={!canSave || pending}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-950"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canSave || pending || !romanId || !slug}
            onClick={() => save(false)}
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800",
              (!canSave || pending) && "opacity-70",
            )}
          >
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            Speichern
          </button>
          <button
            type="button"
            disabled={!canSave || pending || !romanId || !slug}
            onClick={() => save(true)}
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
              (!canSave || pending) && "opacity-70",
            )}
          >
            Speichern & als Buch der Woche
          </button>
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white p-6 shadow-md ring-1 ring-zinc-950/10 sm:p-8">
        <h2 className="text-xl font-extrabold text-zinc-950">
          Instagram-Werbepost
        </h2>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Aufbau wie live: Cover-Buch, Clever-Badge, Lead-Zeilen, Slogan „So
          spannend geht schlau“. Cover muss am Buch vorhanden sein.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canSave || igPending || !slug}
            onClick={generateIg}
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
              (!canSave || igPending) && "opacity-70",
            )}
          >
            {igPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            Bild + Caption generieren
          </button>
          <button
            type="button"
            disabled={!canSave || pending || !igPreview || !igCaption}
            onClick={persistIg}
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-70"
          >
            IG speichern
          </button>
          <button
            type="button"
            disabled={!igPreview.startsWith("data:image/")}
            onClick={downloadIg}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-70"
          >
            <Download className="size-4" aria-hidden />
            Bild laden
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-950/10">
            {igPreview.startsWith("data:image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview of generated data URL
              <img
                src={igPreview}
                alt="Instagram-Vorschau Buch der Woche"
                className="h-auto w-full"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center px-4 text-center text-sm font-semibold text-zinc-500">
                Noch kein Bild — Generieren starten.
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Caption
              </p>
              <button
                type="button"
                disabled={!igCaption.trim()}
                onClick={() => void copyText(igCaption)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-800 disabled:opacity-50"
              >
                <Copy className="size-3.5" aria-hidden />
                Kopieren
              </button>
            </div>
            <textarea
              value={igCaption}
              onChange={(e) => setIgCaption(e.target.value)}
              disabled={!canSave || pending}
              rows={14}
              className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold leading-relaxed text-zinc-900"
              placeholder="Caption erscheint nach der Generierung …"
            />
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white p-6 shadow-md ring-1 ring-zinc-950/10 sm:p-8">
        <h2 className="text-xl font-extrabold text-zinc-950">Bisherige Wochen</h2>
        <ul className="mt-4 divide-y divide-zinc-100">
          {entries.length === 0 ? (
            <li className="py-3 text-sm font-semibold text-zinc-500">
              Noch keine Einträge.
            </li>
          ) : (
            entries.map((entry) => (
              <li
                key={entry.slug}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-extrabold text-zinc-950">
                    {entry.slug}
                    {entry.slug === currentSlug ? (
                      <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-zinc-950 uppercase">
                        Live
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm font-semibold text-zinc-600">
                    {entry.teaserHeadline || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadEntryIntoForm(entry)}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-zinc-200"
                  >
                    Laden
                  </button>
                  {entry.slug !== currentSlug ? (
                    <button
                      type="button"
                      disabled={!canSave || pending}
                      onClick={() => makeCurrent(entry.slug)}
                      className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-900 hover:bg-orange-200 disabled:opacity-70"
                    >
                      Live schalten
                    </button>
                  ) : null}
                  <Link
                    href={`/buch-der-woche/${entry.slug}`}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50"
                  >
                    Öffnen
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
