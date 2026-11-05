"use client";

/**
 * Export tab: Titel-Vorschlag, Marketing/Titelei, Cover (Gemini 3 Pro Image),
 * PDF-Innendatei (Titelseite + Tolino-Impressum) / ePub.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  applySachbuchSuggestedTitleAction,
  generateSachbuchCoverAction,
  generateSachbuchMarketingAction,
  getSachbuchCoverImageAction,
  saveSachbuchExportAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { romanCoverSizeLabel } from "@/lib/roman/cover-size";
import {
  SACHBUCH_KEYWORD_COUNT,
  type SachbuchKontext,
} from "@/lib/sachbuch/types";
import { SACHBUCH_COVER_MODEL_SLUG } from "@/lib/sachbuch/agent-defaults";
import {
  SACHBUCH_DEFAULT_IMPRINT,
  SACHBUCH_HERAUSGEBER_ANSCHRIFT,
  SACHBUCH_HERAUSGEBER_EMAIL,
  SACHBUCH_HERAUSGEBER_NAME,
  SACHBUCH_HERAUSGEBER_WEBSITE,
} from "@/lib/sachbuch/impressum";
import {
  SACHBUCH_WAIT_EXPORT_COVER,
  SACHBUCH_WAIT_EXPORT_META,
  sachbuchModelLabel,
  sachbuchWaitAgentCover,
  sachbuchWaitAgentMarketing,
} from "@/lib/sachbuch/wait-presets";

function padKeywords(list: string[]): string[] {
  const next = [...list.slice(0, SACHBUCH_KEYWORD_COUNT)];
  while (next.length < SACHBUCH_KEYWORD_COUNT) next.push("");
  return next;
}

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

export function SachbuchExportPanel({
  book,
  canSave,
  onBookUpdate,
}: {
  book: SachbuchKontext;
  canSave: boolean;
  onBookUpdate: (book: SachbuchKontext) => void;
}) {
  const exp = book.export;
  const [suggestedTitle, setSuggestedTitle] = useState(exp.suggestedTitle);
  const [subtitle, setSubtitle] = useState(exp.subtitle);
  const [summary, setSummary] = useState(exp.summary);
  const [keywords, setKeywords] = useState(() => padKeywords(exp.keywords));
  const [autorName, setAutorName] = useState(exp.autorName);
  const [motto, setMotto] = useState(exp.vorsatz.motto);
  const [vorwort, setVorwort] = useState(exp.vorsatz.vorwort ?? "");
  const [pending, setPending] = useState<
    | "meta"
    | "cover"
    | "save"
    | "apply-title"
    | "pdf"
    | "epub"
    | "epub-cover"
    | null
  >(null);
  const [coverPreview, setCoverPreview] = useState(
    () =>
      exp.coverImageDataUrl?.startsWith("data:image/")
        ? exp.coverImageDataUrl
        : "",
  );
  const [coverLoading, setCoverLoading] = useState(false);

  useEffect(() => {
    setSuggestedTitle(exp.suggestedTitle);
    setSubtitle(exp.subtitle);
    setSummary(exp.summary);
    setKeywords(padKeywords(exp.keywords));
    setAutorName(exp.autorName);
    setMotto(exp.vorsatz.motto);
    setVorwort(exp.vorsatz.vorwort ?? "");
    if (exp.coverImageDataUrl?.startsWith("data:image/")) {
      setCoverPreview(exp.coverImageDataUrl);
    }
  }, [
    book.id,
    exp.suggestedTitle,
    exp.subtitle,
    exp.summary,
    exp.keywords,
    exp.autorName,
    exp.vorsatz.motto,
    exp.vorsatz.vorwort,
    exp.coverImageDataUrl,
  ]);

  // Admin page strips multi-MB cover URLs; reload pixels when flag says cover exists.
  useEffect(() => {
    if (!exp.hasCoverImage) return;
    if (exp.coverImageDataUrl?.startsWith("data:image/")) {
      setCoverPreview(exp.coverImageDataUrl);
      return;
    }
    let cancelled = false;
    setCoverLoading(true);
    void getSachbuchCoverImageAction({ id: book.id }).then((result) => {
      if (cancelled) return;
      setCoverLoading(false);
      if (result.success && result.data?.coverImageDataUrl) {
        setCoverPreview(result.data.coverImageDataUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [book.id, exp.hasCoverImage, exp.coverImageDataUrl]);

  const busy = Boolean(pending) || !canSave;
  const hasCover =
    coverPreview.startsWith("data:image/") || Boolean(exp.hasCoverImage);
  const titelei = exp.vorsatz.titelseite;

  async function onGenerateMeta() {
    if (busy) return;
    setPending("meta");
    try {
      const result = await generateSachbuchMarketingAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Texte fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success(
        "Titel-Vorschlag, Untertitel, Klappentext und Schlagwörter erzeugt.",
      );
    } finally {
      setPending(null);
    }
  }

  async function onGenerateCover() {
    if (busy) return;
    setPending("cover");
    try {
      const result = await generateSachbuchCoverAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Cover fehlgeschlagen.");
        return;
      }
      const next = result.data.book;
      if (next.export.coverImageDataUrl?.startsWith("data:image/")) {
        setCoverPreview(next.export.coverImageDataUrl);
      }
      onBookUpdate({
        ...next,
        export: { ...next.export, hasCoverImage: true },
      });
      toast.success(`Cover ${romanCoverSizeLabel()} (JPG) erzeugt.`);
    } finally {
      setPending(null);
    }
  }

  async function onSave() {
    if (busy) return;
    setPending("save");
    try {
      const result = await saveSachbuchExportAction({
        id: book.id,
        suggestedTitle,
        subtitle,
        summary,
        keywords: keywords
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, SACHBUCH_KEYWORD_COUNT),
        autorName,
        motto,
        vorwort,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Export-Texte gespeichert.");
    } finally {
      setPending(null);
    }
  }

  async function onApplyTitle() {
    if (busy) return;
    if (!suggestedTitle.trim()) {
      toast.error("Kein Titelforschlag — zuerst Texte generieren oder eingeben.");
      return;
    }
    setPending("apply-title");
    try {
      const saved = await saveSachbuchExportAction({
        id: book.id,
        suggestedTitle,
        subtitle,
        summary,
        keywords: keywords
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, SACHBUCH_KEYWORD_COUNT),
        autorName,
        motto,
        vorwort,
      });
      if (!saved.success || !saved.data) {
        toast.error(saved.error ?? "Zwischenspeichern fehlgeschlagen.");
        return;
      }
      onBookUpdate(saved.data.book);
      const result = await applySachbuchSuggestedTitleAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Titel übernehmen fehlgeschlagen.");
        return;
      }
      onBookUpdate(result.data.book);
      toast.success("Titel übernommen.");
    } finally {
      setPending(null);
    }
  }

  async function downloadExport(
    kind: "pdf" | "epub",
    options: { includeCover?: boolean } = {},
  ): Promise<void> {
    const res = await fetch(`/api/admin/sachbuch/export-${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sachbuchId: book.id,
        ...(kind === "epub"
          ? { includeCover: Boolean(options.includeCover) }
          : {}),
      }),
    });
    if (!res.ok) {
      let message = kind === "pdf" ? "PDF-Export fehlgeschlagen." : "ePub-Export fehlgeschlagen.";
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error?.trim()) message = data.error.trim();
      } catch {
        /* binary or empty */
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/i.exec(disposition);
    const fallback =
      kind === "pdf"
        ? "sachbuch.pdf"
        : options.includeCover
          ? "sachbuch-mit-Cover.epub"
          : "sachbuch.epub";
    downloadBlob(blob, match?.[1] || fallback);
  }

  async function onPdf() {
    if (busy) return;
    setPending("pdf");
    try {
      await downloadExport("pdf");
      toast.success(
        "PDF heruntergeladen (Titelseite · Impressum S.2 · Kapitel; Cover separat).",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function onEpub(includeCover: boolean) {
    if (busy) return;
    setPending(includeCover ? "epub-cover" : "epub");
    try {
      await downloadExport("epub", { includeCover });
      toast.success(
        includeCover
          ? "ePub heruntergeladen (mit Cover)."
          : "ePub heruntergeladen (ohne Cover — Veröffentlichung).",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ePub-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="text-lg font-extrabold text-zinc-950">Export</h2>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Titel-Vorschlag, Untertitel, Titelei mit Tolino-Impressum, Klappentext,
          6 Schlagwörter, Cover ({romanCoverSizeLabel()}). PDF-Innendatei ohne
          Cover (S.1 Titelseite, S.2 Impressum); Cover separat hochladen. ePub
          ohne Cover für die Veröffentlichung, optional zusätzlich mit Cover.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerateMeta()}
          className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending === "meta" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Texte generieren
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerateCover()}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending === "cover" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Cover erzeugen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "save" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Speichern
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPdf()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "pdf" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          PDF
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEpub(false)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "epub" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          ePub (ohne Cover)
        </button>
        <button
          type="button"
          disabled={busy || !hasCover}
          title={
            hasCover
              ? "ePub inkl. Cover-Bild"
              : "Zuerst Cover erzeugen"
          }
          onClick={() => void onEpub(true)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "epub-cover" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          ePub (mit Cover)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="font-bold text-zinc-700">Titelforschlag</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              value={suggestedTitle}
              onChange={(e) => setSuggestedTitle(e.target.value)}
              disabled={busy}
              placeholder="KI-Vorschlag für den Markttitel"
              className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
            />
            <button
              type="button"
              disabled={busy || !suggestedTitle.trim()}
              onClick={() => void onApplyTitle()}
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending === "apply-title" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "Als Buchtitel übernehmen"
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Aktueller Buchtitel: {book.title || "—"}
          </p>
        </label>

        <label className="block">
          <span className="font-bold text-zinc-700">Autor</span>
          <input
            value={autorName}
            onChange={(e) => setAutorName(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
          />
        </label>
        <label className="block">
          <span className="font-bold text-zinc-700">Untertitel</span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
          />
        </label>
      </div>

      <label className="block">
        <span className="font-bold text-zinc-700">
          Klappentext (Amazon / Klappe)
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={busy}
          rows={6}
          className="mt-1 max-h-[30vh] w-full resize-y overflow-y-auto rounded-xl bg-gray-50 px-3 py-2 leading-relaxed ring-1 ring-zinc-950/10"
        />
      </label>

      <div>
        <p className="font-bold text-zinc-700">6 Schlagwörter</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {keywords.map((kw, i) => (
            <input
              key={`kw-${i}`}
              value={kw}
              onChange={(e) => {
                const next = [...keywords];
                next[i] = e.target.value;
                setKeywords(next);
              }}
              disabled={busy}
              placeholder={`Schlagwort ${i + 1}`}
              className="rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="font-bold text-zinc-700">Motto (optional)</span>
        <textarea
          value={motto}
          onChange={(e) => setMotto(e.target.value)}
          disabled={busy}
          rows={2}
          className="mt-1 w-full resize-y rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
        />
      </label>

      <label className="block">
        <span className="font-bold text-zinc-700">Vorwort</span>
        <p className="mt-0.5 text-xs text-zinc-500">
          Erwartungsmanagement vor Kapitel 1 (PDF/ePub).
        </p>
        <textarea
          value={vorwort}
          onChange={(e) => setVorwort(e.target.value)}
          disabled={busy}
          rows={10}
          className="mt-1 max-h-[40vh] w-full resize-y overflow-y-auto rounded-xl bg-gray-50 px-3 py-2 leading-relaxed ring-1 ring-zinc-950/10"
        />
      </label>

      <section className="space-y-2 rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/5">
        <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Titelei (Vorsatz)
        </p>
        <p className="font-extrabold text-zinc-950">
          {titelei.titel || suggestedTitle || book.title || "—"}
        </p>
        {titelei.untertitel || subtitle ? (
          <p className="text-sm font-semibold text-zinc-700">
            {titelei.untertitel || subtitle}
          </p>
        ) : null}
        <p className="text-sm text-zinc-600">
          {titelei.autor || autorName} ·{" "}
          {titelei.imprint || SACHBUCH_DEFAULT_IMPRINT}
        </p>
        <div className="border-t border-zinc-200 pt-2">
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Impressum (PDF S.2 / ePub)
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-800">
            {SACHBUCH_HERAUSGEBER_NAME}
          </p>
          <p className="text-sm text-zinc-600">
            {SACHBUCH_HERAUSGEBER_ANSCHRIFT}
          </p>
          <p className="text-sm text-zinc-600">
            {SACHBUCH_HERAUSGEBER_EMAIL}
          </p>
          <p className="text-sm text-zinc-600">
            {SACHBUCH_HERAUSGEBER_WEBSITE}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-700">
            1. Auflage
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            inkl. KI-Hinweis (Tolino) · Print: oben 5 cm / unten 3 cm freigehalten
          </p>
        </div>
      </section>

      <div>
        <p className="font-bold text-zinc-700">Cover</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {romanCoverSizeLabel()}, RGB, JPG · Modell{" "}
          {sachbuchModelLabel(SACHBUCH_COVER_MODEL_SLUG)} · Motiv aus
          Klappentext / UVP; Titel und Untertitel als Typografie auf dem Cover.
        </p>
        {coverPreview.startsWith("data:image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverPreview}
            alt="Cover"
            className="mt-2 max-h-[40vh] w-auto rounded-xl ring-1 ring-zinc-950/10"
          />
        ) : coverLoading || (hasCover && !coverPreview) ? (
          <p className="mt-2 inline-flex items-center gap-2 text-zinc-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Cover-Vorschau wird geladen …
          </p>
        ) : (
          <p className="mt-2 text-zinc-500">
            Noch kein Cover — zuerst Texte, dann Cover erzeugen.
          </p>
        )}
      </div>

      <SachbuchWaitDialog
        open={pending === "meta"}
        title="Marketing-Texte werden erzeugt"
        steps={SACHBUCH_WAIT_EXPORT_META}
        agentInfo={sachbuchWaitAgentMarketing()}
      />
      <SachbuchWaitDialog
        open={pending === "cover"}
        title="Cover wird erzeugt"
        steps={SACHBUCH_WAIT_EXPORT_COVER}
        agentInfo={sachbuchWaitAgentCover()}
        footer="Fenster offen lassen — Bildgenerierung kann einige Minuten dauern."
      />
    </div>
  );
}
