"use client";

/**
 * Export tab: Cover, Amazon Klappentext + Einzeiler + Keywords, Titelei
 * (Titelseite / Copyright / Motto), Manuskript PDF/EPUB.
 * Hörbuch lives in its own tab (`roman-hoerbuch-panel.tsx`).
 * Clever chapters: prose → Infografik → Abenteuer-Wissen.
 * After PDF export: keep blob for inline reopen via StoryPdfPreviewDialog.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  generateRomanMarketingCopyAction,
  saveRomanMarketingCopyAction,
} from "@/app/actions/roman-marketing-admin";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { StoryPdfPreviewDialog } from "@/components/features/stories/story-pdf-preview-dialog";
import type { RomanEditorial } from "@/lib/roman/editorial";
import {
  buildRomanEpubBlob,
  romanEpubFilename,
} from "@/lib/roman/export-roman-epub";
import {
  ROMAN_DEFAULT_AUTHOR,
  ROMAN_DEFAULT_IMPRINT,
  emptyVorsatz,
  mergeVorsatzFromUiFields,
  vorsatzToUiFields,
  type RomanVorsatz,
  type RomanVorsatzUiFields,
} from "@/lib/roman/front-matter";
import { normalizeAmazonKeywords } from "@/lib/roman/marketing-copy";
import {
  buildRomanExportDocument,
  buildRomanPdfBlob,
  collectExportChaptersFromEditorial,
  romanPdfFilename,
  type RomanExportProseSource,
} from "@/lib/roman/export-roman-pdf";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Always 7 slots for Amazon KDP keyword fields. */
function padKeywordSlots(list: string[]): string[] {
  const next = [...list.slice(0, 7)];
  while (next.length < 7) next.push("");
  return next;
}

function initialVorsatzUi(
  roman: RomanKontext,
): RomanVorsatzUiFields {
  return vorsatzToUiFields(roman.vorsatz ?? emptyVorsatz(), roman.title);
}

type LastPdfPreview = {
  pdfUrl: string;
  previewHtml: string;
  fileName: string;
  withCover: boolean;
};

export function RomanExportMarketingPanel({
  roman,
  editorial,
  canSave,
  disabled,
  onComplete,
}: {
  roman: RomanKontext;
  editorial: RomanEditorial;
  canSave: boolean;
  disabled?: boolean;
  onComplete?: (patch: {
    klappentext: string;
    einzeiler: string;
    amazonKeywords: string[];
    autorName?: string;
    vorsatz?: RomanVorsatz;
  }) => void;
}) {
  const [klappentext, setKlappentext] = useState(editorial.klappentext ?? "");
  const [einzeiler, setEinzeiler] = useState(editorial.einzeiler ?? "");
  const [keywords, setKeywords] = useState(() =>
    padKeywordSlots(editorial.amazonKeywords ?? []),
  );
  const [vorsatzUi, setVorsatzUi] = useState(() => initialVorsatzUi(roman));
  const [pending, setPending] = useState<
    "generate" | "save" | "pdf" | "pdf-cover" | "epub" | "epub-cover" | null
  >(null);
  const [lastPdf, setLastPdf] = useState<LastPdfPreview | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const isClever = editorial.buchTyp === "clever_erzaehlt";
  const hasRomanProse = hasFilledManuskript(editorial.romanText ?? "");
  const hasManuskriptProse = hasFilledManuskript(editorial.manuskriptText ?? "");
  const [proseSource, setProseSource] = useState<RomanExportProseSource>(() =>
    !isClever && hasRomanProse ? "roman" : "manuskript",
  );

  const marketingSyncKey = [
    roman.id,
    editorial.klappentext ?? "",
    editorial.einzeiler ?? "",
    JSON.stringify(editorial.amazonKeywords ?? []),
    JSON.stringify(roman.vorsatz ?? null),
    roman.autorName ?? "",
  ].join("\0");
  const [syncedMarketingKey, setSyncedMarketingKey] =
    useState(marketingSyncKey);
  if (marketingSyncKey !== syncedMarketingKey) {
    setSyncedMarketingKey(marketingSyncKey);
    setKlappentext(editorial.klappentext ?? "");
    setEinzeiler(editorial.einzeiler ?? "");
    setKeywords(padKeywordSlots(editorial.amazonKeywords ?? []));
    setVorsatzUi(initialVorsatzUi(roman));
  }

  useEffect(() => {
    return () => {
      if (lastPdf?.pdfUrl) URL.revokeObjectURL(lastPdf.pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLastPdf((prev) => {
        if (prev?.pdfUrl) URL.revokeObjectURL(prev.pdfUrl);
        return null;
      });
      setPdfPreviewOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roman.id]);

  const busy = Boolean(disabled || pending);
  const effectiveSource: RomanExportProseSource = isClever
    ? "manuskript"
    : proseSource === "roman" && hasRomanProse
      ? "roman"
      : "manuskript";
  const chapters = useMemo(
    () =>
      collectExportChaptersFromEditorial(editorial, {
        source: effectiveSource,
      }),
    [
      editorial.buchTyp,
      editorial.manuskriptText,
      editorial.romanText,
      editorial.cleverUnterthemen,
      effectiveSource,
    ],
  );
  const hasExportProse = chapters.length > 0;
  const hasCover = Boolean(roman.coverImageDataUrl?.startsWith("data:image/"));
  const proseLabel =
    effectiveSource === "roman" ? "Roman" : "Manuskript";

  function replaceLastPdf(next: LastPdfPreview | null) {
    setLastPdf((prev) => {
      if (prev?.pdfUrl) URL.revokeObjectURL(prev.pdfUrl);
      return next;
    });
  }

  function setKeywordAt(index: number, value: string) {
    setKeywords((prev) => {
      const next = [...prev];
      next[index] = value.slice(0, 50);
      return next;
    });
  }

  function patchVorsatzUi(patch: Partial<RomanVorsatzUiFields>) {
    setVorsatzUi((prev) => ({ ...prev, ...patch }));
  }

  function buildVorsatzFromUi(): RomanVorsatz {
    return mergeVorsatzFromUiFields(
      roman.vorsatz ?? emptyVorsatz(),
      vorsatzUi,
    );
  }

  async function runGenerate() {
    if (!canSave || busy) return;
    setPending("generate");
    try {
      const result = await generateRomanMarketingCopyAction({
        romanId: roman.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Texte erzeugen fehlgeschlagen.");
        return;
      }
      setKlappentext(result.data.klappentext);
      setEinzeiler(result.data.einzeiler);
      setKeywords(padKeywordSlots(result.data.amazonKeywords));
      setVorsatzUi(result.data.vorsatz);
      const vorsatz = mergeVorsatzFromUiFields(
        roman.vorsatz ?? emptyVorsatz(),
        result.data.vorsatz,
      );
      onComplete?.({
        klappentext: result.data.klappentext,
        einzeiler: result.data.einzeiler,
        amazonKeywords: result.data.amazonKeywords,
        autorName: result.data.autorName,
        vorsatz,
      });
      if (result.data.keywordsWarning) {
        toast.error(result.data.keywordsWarning);
      } else {
        toast.success(
          "Verkaufstexte und Titelei (Titelseite, Copyright, Motto) erzeugt.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Texte erzeugen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runSave() {
    if (!canSave || busy) return;
    setPending("save");
    try {
      const amazonKeywords = normalizeAmazonKeywords(keywords);
      const vorsatzPayload = {
        titel: vorsatzUi.titel.trim(),
        untertitel: vorsatzUi.untertitel.trim(),
        autor: vorsatzUi.autor.trim() || ROMAN_DEFAULT_AUTHOR,
        imprint: vorsatzUi.imprint.trim() || ROMAN_DEFAULT_IMPRINT,
        copyrightHinweis: vorsatzUi.copyrightHinweis.trim(),
        motto: vorsatzUi.motto.trim(),
      };
      const next = {
        klappentext: klappentext.trim(),
        einzeiler: einzeiler.trim(),
        amazonKeywords,
      };
      const result = await saveRomanMarketingCopyAction({
        romanId: roman.id,
        ...next,
        vorsatz: vorsatzPayload,
      });
      if (!result.success) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setKeywords(padKeywordSlots(amazonKeywords));
      const nextVorsatzUi = { ...vorsatzUi, ...vorsatzPayload };
      setVorsatzUi(nextVorsatzUi);
      onComplete?.({
        ...next,
        autorName: vorsatzPayload.autor,
        vorsatz: mergeVorsatzFromUiFields(
          roman.vorsatz ?? emptyVorsatz(),
          nextVorsatzUi,
        ),
      });
      toast.success("Verkaufstexte und Titelei gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runPdfExport(includeCover: boolean) {
    if (busy || !hasExportProse) return;
    const withCover = includeCover && hasCover;
    setPending(withCover ? "pdf-cover" : "pdf");
    try {
      const exportInput = {
        title: roman.title,
        chapters,
        coverImageDataUrl: withCover ? roman.coverImageDataUrl : undefined,
        vorsatz: roman.vorsatz ?? buildVorsatzFromUi(),
        typography: {
          zielAlterMin: editorial.zielAlterMin,
          zielAlterMax: editorial.zielAlterMax,
          buchTyp: editorial.buchTyp,
        },
      };
      const previewHtml = buildRomanExportDocument(exportInput);
      const blob = await buildRomanPdfBlob(exportInput);
      const fileName = romanPdfFilename(roman.title);
      const pdfUrl = URL.createObjectURL(blob);
      replaceLastPdf({ pdfUrl, previewHtml, fileName, withCover });
      downloadBlob(blob, fileName);
      setPdfPreviewOpen(true);
      toast.success(
        withCover
          ? "PDF erzeugt (mit Cover) — Vorschau geöffnet."
          : "PDF erzeugt (ohne Cover) — Vorschau geöffnet.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runEpubExport(includeCover: boolean) {
    if (busy || !hasExportProse) return;
    const withCover = includeCover && hasCover;
    if (includeCover && !hasCover) {
      toast.error("Zuerst ein Cover anlegen.");
      return;
    }
    setPending(withCover ? "epub-cover" : "epub");
    try {
      const blob = await buildRomanEpubBlob({
        title: roman.title,
        autorName: roman.autorName || vorsatzUi.autor || ROMAN_DEFAULT_AUTHOR,
        chapters,
        vorsatz: roman.vorsatz ?? buildVorsatzFromUi(),
        coverImageDataUrl: withCover
          ? roman.coverImageDataUrl
          : undefined,
      });
      downloadBlob(blob, romanEpubFilename(roman.title));
      toast.success(
        withCover
          ? "EPUB heruntergeladen (mit Cover)."
          : "EPUB heruntergeladen (ohne Cover).",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "EPUB-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function copyKeywords() {
    const filled = normalizeAmazonKeywords(keywords);
    if (filled.length === 0) {
      toast.error("Keine Keywords zum Kopieren.");
      return;
    }
    try {
      await navigator.clipboard.writeText(filled.join("\n"));
      toast.success("Keywords kopiert (eine Zeile je Slot).");
    } catch {
      toast.error("Zwischenablage nicht verfügbar.");
    }
  }

  return (
    <div className="space-y-8">
      <RomanSceneWaitDialog
        open={pending === "generate"}
        variant="export-copy"
        contextLabel="Export · Verkaufstexte"
        title="Verkaufstexte & Titelei schreiben"
        progressLabel="Klappentext, Keywords, Titelseite, Copyright, Motto …"
        agentInfo={{
          roleLabel: "Verkaufstexte",
          modelLabel: "Gemini (Story-Default)",
        }}
      />
      <RomanSceneWaitDialog
        open={
          pending === "pdf" ||
          pending === "pdf-cover" ||
          pending === "epub" ||
          pending === "epub-cover"
        }
        variant="export-file"
        contextLabel={
          pending === "epub" || pending === "epub-cover"
            ? "Export · EPUB"
            : "Export · PDF"
        }
        title={
          pending === "epub" || pending === "epub-cover"
            ? "EPUB erzeugen"
            : "PDF erzeugen"
        }
        progressLabel={
          pending === "epub-cover"
            ? `${proseLabel} als EPUB (mit Cover) …`
            : pending === "epub"
              ? `${proseLabel} als EPUB (ohne Cover) …`
              : pending === "pdf-cover"
                ? `${proseLabel} als PDF (mit Cover) …`
                : `${proseLabel} als PDF (ohne Cover) …`
        }
      />

      <StoryPdfPreviewDialog
        open={pdfPreviewOpen && lastPdf != null}
        previewHtml={lastPdf?.previewHtml ?? null}
        pdfUrl={lastPdf?.pdfUrl ?? null}
        downloadFileName={lastPdf?.fileName}
        heading={roman.title.trim() || proseLabel}
        onClose={() => setPdfPreviewOpen(false)}
      />

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-zinc-950">
            Buch herunterladen
          </h3>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            PDF als Taschenbuch 6×9 Zoll — mit oder ohne Cover
            {!hasCover ? " (oben zuerst ein Cover anlegen)" : ""}. EPUB mit oder
            ohne Cover; Titelei als drei eigene Seiten (Titelseite, Copyright,
            Motto). Clever-Infografiken und Abenteuer-Wissen gehören zum Kapitel
            (Geschichte → Infografik → Liste).
          </p>
        </div>

        {!isClever ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-extrabold text-zinc-950">
              Quelle
            </legend>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                <input
                  type="radio"
                  name="export-prose-source"
                  checked={proseSource === "manuskript"}
                  disabled={busy || !hasManuskriptProse}
                  onChange={() => setProseSource("manuskript")}
                  className="accent-orange-700"
                />
                Manuskript
                {!hasManuskriptProse ? " (leer)" : ""}
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                <input
                  type="radio"
                  name="export-prose-source"
                  checked={proseSource === "roman"}
                  disabled={busy || !hasRomanProse}
                  onChange={() => setProseSource("roman")}
                  className="accent-orange-700"
                />
                Roman
                {!hasRomanProse ? " (noch kein Feinschliff)" : ""}
              </label>
            </div>
          </fieldset>
        ) : null}

        {!hasExportProse ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
            {isClever
              ? "Zuerst Geschichten im Tab Geschichten erzeugen."
              : proseSource === "roman"
                ? "Zuerst im Tab Roman verbessern — oder Manuskript als Quelle wählen."
                : "Zuerst ein Manuskript im Tab Manuskript erzeugen."}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !hasCover}
              onClick={() => void runPdfExport(true)}
              className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {pending === "pdf-cover" ? "PDF …" : "PDF mit Cover"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPdfExport(false)}
              className="rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending === "pdf" ? "PDF …" : "PDF ohne Cover"}
            </button>
            <button
              type="button"
              disabled={busy || !hasCover}
              onClick={() => void runEpubExport(true)}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {pending === "epub-cover" ? "EPUB …" : "EPUB mit Cover"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runEpubExport(false)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
            >
              {pending === "epub" ? "EPUB …" : "EPUB ohne Cover"}
            </button>
            {lastPdf ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPdfPreviewOpen(true)}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50"
              >
                PDF öffnen
                {lastPdf.withCover ? " (mit Cover)" : " (ohne Cover)"}
              </button>
            ) : null}
            <span className="text-xs font-semibold text-zinc-500">
              {proseLabel} · {chapters.length} Kapitel
            </span>
          </div>
        )}

      </div>

      <div className="space-y-5 border-t border-zinc-200 pt-8">
        <p className="text-sm font-semibold text-zinc-600">
          Klappentext = Rückseite / Amazon-Beschreibung. Einzeiler = Untertitel /
          Eyecatcher. Keywords = die 7 KDP-Suchfelder. Titelei = Titelseite,
          Copyright und Motto für PDF/EPUB. „Texte erzeugen“ füllt alles;
          Autor standardmäßig {ROMAN_DEFAULT_AUTHOR}, Imprint{" "}
          {ROMAN_DEFAULT_IMPRINT}.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runGenerate()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {pending === "generate" ? "Erzeugen …" : "Texte erzeugen"}
          </button>
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runSave()}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending === "save" ? "Speichern …" : "Speichern"}
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Einzeiler (Amazon-Untertitel / Eyecatcher)
          </span>
          <input
            type="text"
            value={einzeiler}
            maxLength={120}
            disabled={busy}
            onChange={(e) => setEinzeiler(e.target.value)}
            className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
            placeholder="Kurzer Appetitmacher …"
          />
          <span className="text-xs font-semibold text-zinc-400">
            {einzeiler.length}/120
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Klappentext / Amazon-Beschreibung
          </span>
          <textarea
            value={klappentext}
            disabled={busy}
            rows={10}
            onChange={(e) => setKlappentext(e.target.value)}
            className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
            placeholder="Rückseitentext …"
          />
        </label>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Amazon-Keywords (7 KDP-Felder)
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void copyKeywords()}
              className="text-xs font-bold text-orange-800 hover:underline disabled:opacity-50"
            >
              Alle kopieren
            </button>
          </div>
          <p className="text-xs font-semibold text-zinc-500">
            Je Feld max. 50 Zeichen — Suchphrasen, kein Buchtitel.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {keywords.map((kw, i) => (
              <label key={i} className="block space-y-1">
                <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                  Keyword {i + 1}
                </span>
                <input
                  type="text"
                  value={kw}
                  maxLength={50}
                  disabled={busy}
                  onChange={(e) => setKeywordAt(i, e.target.value)}
                  className="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                  placeholder={`Suchphrase ${i + 1} …`}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-5 border-t border-zinc-200 pt-6">
          <div>
            <h4 className="text-sm font-extrabold text-zinc-950">Titelei</h4>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Für PDF/EPUB vor Kapitel 1: Titelseite, Copyright-Hinweis und ein
              Motto, das den Kern des Buches trifft.
            </p>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Titelseite
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                  Titel
                </span>
                <input
                  type="text"
                  value={vorsatzUi.titel}
                  maxLength={300}
                  disabled={busy}
                  onChange={(e) => patchVorsatzUi({ titel: e.target.value })}
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                  placeholder="Buchtitel …"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                  Untertitel
                </span>
                <input
                  type="text"
                  value={vorsatzUi.untertitel}
                  maxLength={400}
                  disabled={busy}
                  onChange={(e) =>
                    patchVorsatzUi({ untertitel: e.target.value })
                  }
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                  placeholder="Optional …"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                  Autor
                </span>
                <input
                  type="text"
                  value={vorsatzUi.autor}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => patchVorsatzUi({ autor: e.target.value })}
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                  placeholder={ROMAN_DEFAULT_AUTHOR}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">
                  Imprint
                </span>
                <input
                  type="text"
                  value={vorsatzUi.imprint}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => patchVorsatzUi({ imprint: e.target.value })}
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
                  placeholder={ROMAN_DEFAULT_IMPRINT}
                />
              </label>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Copyright
            </span>
            <textarea
              value={vorsatzUi.copyrightHinweis}
              disabled={busy}
              rows={3}
              maxLength={2_000}
              onChange={(e) =>
                patchVorsatzUi({ copyrightHinweis: e.target.value })
              }
              className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
              placeholder={`© ${new Date().getFullYear()} ${ROMAN_DEFAULT_AUTHOR} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Motto
            </span>
            <textarea
              value={vorsatzUi.motto}
              disabled={busy}
              rows={3}
              maxLength={1_200}
              onChange={(e) => patchVorsatzUi({ motto: e.target.value })}
              className="w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-50"
              placeholder="Kurzes Zitat zum Kern des Buches …"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
