"use client";

/**
 * Export tab: Amazon Klappentext + Einzeiler, plus Manuskript PDF (mit Cover)
 * und EPUB (ohne Cover).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  generateRomanMarketingCopyAction,
  saveRomanKontextAction,
} from "@/app/actions/roman-admin";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import type { RomanEditorial } from "@/lib/roman/editorial";
import {
  buildRomanEpubBlob,
  romanEpubFilename,
} from "@/lib/roman/export-roman-epub";
import {
  buildRomanPdfBlob,
  collectManuskriptExportChapters,
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
  onComplete?: (roman: RomanKontext) => void;
}) {
  const [klappentext, setKlappentext] = useState(editorial.klappentext ?? "");
  const [einzeiler, setEinzeiler] = useState(editorial.einzeiler ?? "");
  const [pending, setPending] = useState<
    "generate" | "save" | "pdf" | "pdf-cover" | "epub" | null
  >(null);

  useEffect(() => {
    setKlappentext(editorial.klappentext ?? "");
    setEinzeiler(editorial.einzeiler ?? "");
  }, [editorial.klappentext, editorial.einzeiler, roman.id]);

  const busy = Boolean(disabled || pending);
  const chapters = collectManuskriptExportChapters(
    editorial.manuskriptText ?? "",
  );
  const hasManuskript = chapters.length > 0;
  const hasCover = Boolean(roman.coverImageDataUrl?.startsWith("data:image/"));

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
      onComplete?.(result.data.roman);
      toast.success("Klappentext und Einzeiler erzeugt.");
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
      const nextEditorial: RomanEditorial = {
        ...editorial,
        klappentext: klappentext.trim(),
        einzeiler: einzeiler.trim(),
      };
      const result = await saveRomanKontextAction({
        id: roman.id,
        title: roman.title,
        manuskriptRaw: roman.manuskriptRaw,
        stilbibel: roman.stilbibel,
        genre: roman.genre,
        praemisse: roman.praemisse,
        perspektive: roman.perspektive,
        zeitform: roman.zeitform,
        tonalitaet: roman.tonalitaet,
        charaktere: roman.charaktere,
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
        szenenRaster: roman.szenenRaster,
        kiRegelwerk: roman.kiRegelwerk,
        fanPersonaName: roman.fanPersonaName,
        fanPersonaProfil: roman.fanPersonaProfil,
        editorial: nextEditorial,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onComplete?.(result.data.roman);
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
      const blob = await buildRomanPdfBlob({
        title: roman.title,
        chapters,
        coverImageDataUrl: withCover ? roman.coverImageDataUrl : undefined,
        vorsatz: roman.vorsatz,
      });
      downloadBlob(blob, romanPdfFilename(roman.title));
      toast.success(
        withCover
          ? "PDF heruntergeladen (mit Cover)."
          : "PDF heruntergeladen (ohne Cover).",
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

  return (
    <div className="space-y-8">
      <RomanSceneWaitDialog
        open={pending === "generate"}
        variant="pipeline-generate"
        title="Verkaufstexte werden geschrieben"
        progressLabel="Klappentext + Einzeiler (Amazon) …"
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

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-zinc-950">
            Manuskript herunterladen
          </h3>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            PDF im eBook-Seitenformat — mit oder ohne Cover
            {!hasCover ? " (Cover zuerst im Tab Bilder anlegen)" : ""}. EPUB
            immer ohne Cover. Kapitel starten jeweils auf einer neuen Seite;
            Überschrift eine Stufe größer und fett.
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
            <span className="text-xs font-semibold text-zinc-500">
              {chapters.length} Kapitel
            </span>
          </div>
        )}
      </div>

      <div className="space-y-5 border-t border-zinc-200 pt-8">
        <p className="text-sm font-semibold text-zinc-600">
          Klappentext = Rückseite / Amazon-Beschreibung. Einzeiler = Untertitel /
          Eyecatcher in der Suche. Beide Texte speicherst du hier und kannst sie
          später in KDP einfügen.
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
      </div>
    </div>
  );
}
