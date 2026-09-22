"use client";

/**
 * Export tab: Cover, Amazon Klappentext + Einzeiler + Keywords, Manuskript PDF/EPUB.
 * Clever chapters: prose → Infografik → Abenteuer-Wissen.
 * After PDF export: keep blob for inline reopen via StoryPdfPreviewDialog.
 */

import { useEffect, useState } from "react";
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
import { normalizeAmazonKeywords } from "@/lib/roman/marketing-copy";
import {
  buildRomanExportDocument,
  buildRomanPdfBlob,
  collectExportChaptersFromEditorial,
  romanPdfFilename,
} from "@/lib/roman/export-roman-pdf";
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
  }) => void;
}) {
  const [klappentext, setKlappentext] = useState(editorial.klappentext ?? "");
  const [einzeiler, setEinzeiler] = useState(editorial.einzeiler ?? "");
  const [keywords, setKeywords] = useState(() =>
    padKeywordSlots(editorial.amazonKeywords ?? []),
  );
  const [pending, setPending] = useState<
    "generate" | "save" | "pdf" | "pdf-cover" | "epub" | null
  >(null);
  const [lastPdf, setLastPdf] = useState<LastPdfPreview | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  useEffect(() => {
    setKlappentext(editorial.klappentext ?? "");
    setEinzeiler(editorial.einzeiler ?? "");
    setKeywords(padKeywordSlots(editorial.amazonKeywords ?? []));
  }, [
    editorial.klappentext,
    editorial.einzeiler,
    editorial.amazonKeywords,
    roman.id,
  ]);

  useEffect(() => {
    return () => {
      if (lastPdf?.pdfUrl) URL.revokeObjectURL(lastPdf.pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  useEffect(() => {
    setLastPdf((prev) => {
      if (prev?.pdfUrl) URL.revokeObjectURL(prev.pdfUrl);
      return null;
    });
    setPdfPreviewOpen(false);
  }, [roman.id]);

  const busy = Boolean(disabled || pending);
  const chapters = collectExportChaptersFromEditorial(editorial);
  const hasManuskript = chapters.length > 0;
  const hasCover = Boolean(roman.coverImageDataUrl?.startsWith("data:image/"));

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
      onComplete?.({
        klappentext: result.data.klappentext,
        einzeiler: result.data.einzeiler,
        amazonKeywords: result.data.amazonKeywords,
      });
      toast.success("Klappentext, Einzeiler und Keywords erzeugt.");
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
      const next = {
        klappentext: klappentext.trim(),
        einzeiler: einzeiler.trim(),
        amazonKeywords,
      };
      const result = await saveRomanMarketingCopyAction({
        romanId: roman.id,
        ...next,
      });
      if (!result.success) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setKeywords(padKeywordSlots(amazonKeywords));
      onComplete?.(next);
      toast.success("Verkaufstexte gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runPdfExport(includeCover: boolean) {
    if (busy || !hasManuskript) return;
    const withCover = includeCover && hasCover;
    setPending(withCover ? "pdf-cover" : "pdf");
    try {
      const exportInput = {
        title: roman.title,
        chapters,
        coverImageDataUrl: withCover ? roman.coverImageDataUrl : undefined,
        vorsatz: roman.vorsatz,
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

  async function runEpubExport() {
    if (busy || !hasManuskript) return;
    setPending("epub");
    try {
      const blob = await buildRomanEpubBlob({
        title: roman.title,
        autorName: roman.autorName,
        chapters,
        vorsatz: roman.vorsatz,
      });
      downloadBlob(blob, romanEpubFilename(roman.title));
      toast.success("EPUB heruntergeladen (ohne Cover).");
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
        variant="pipeline-generate"
        title="Verkaufstexte werden geschrieben"
        progressLabel="Klappentext + Einzeiler + Keywords (Amazon) …"
      />
      <RomanSceneWaitDialog
        open={pending === "pdf" || pending === "pdf-cover" || pending === "epub"}
        variant="pipeline-generate"
        title={
          pending === "epub"
            ? "EPUB wird erzeugt"
            : "PDF wird erzeugt"
        }
        progressLabel={
          pending === "epub"
            ? "Manuskript als EPUB …"
            : pending === "pdf-cover"
              ? "Manuskript als PDF (mit Cover) …"
              : "Manuskript als PDF (ohne Cover) …"
        }
      />

      <StoryPdfPreviewDialog
        open={pdfPreviewOpen && lastPdf != null}
        previewHtml={lastPdf?.previewHtml ?? null}
        pdfUrl={lastPdf?.pdfUrl ?? null}
        downloadFileName={lastPdf?.fileName}
        heading={roman.title.trim() || "Manuskript"}
        onClose={() => setPdfPreviewOpen(false)}
      />

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-zinc-950">
            Manuskript herunterladen
          </h3>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            PDF als Taschenbuch 6×9 Zoll — mit oder ohne Cover
            {!hasCover ? " (oben zuerst ein Cover anlegen)" : ""}. EPUB ohne
            Buch-Cover; Clever-Infografiken und Abenteuer-Wissen gehören zum
            Kapitel (Geschichte → Infografik → Liste). Kapitel starten jeweils
            auf einer neuen Seite.
          </p>
        </div>

        {!hasManuskript ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
            Zuerst ein Manuskript im Tab Manuskript erzeugen.
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
              disabled={busy}
              onClick={() => void runEpubExport()}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
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
              {chapters.length} Kapitel
            </span>
          </div>
        )}
      </div>

      <div className="space-y-5 border-t border-zinc-200 pt-8">
        <p className="text-sm font-semibold text-zinc-600">
          Klappentext = Rückseite / Amazon-Beschreibung. Einzeiler = Untertitel /
          Eyecatcher. Keywords = die 7 KDP-Suchfelder (Backend). Alles speichern
          und später in KDP einfügen.
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
      </div>
    </div>
  );
}
