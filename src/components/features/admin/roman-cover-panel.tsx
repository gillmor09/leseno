"use client";

/**
 * Export: cover (KI → Bild → Titel-Overlay).
 * Clever erzählt: Art-Director-Rolle → Bild → Serien-/leseno-Logos → Typograf-Rolle → Titel.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  clearRomanCoverAction,
  generateRomanCoverAction,
  saveRomanCoverAction,
} from "@/app/actions/roman-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

export function RomanCoverPanel({
  romanId,
  title,
  coverImageDataUrl,
  coverPrompt,
  canSave,
  disabled,
  isCleverErzaehlt,
  onComplete,
}: {
  romanId: string;
  title: string;
  coverImageDataUrl: string | null;
  coverPrompt: string | null;
  canSave: boolean;
  disabled?: boolean;
  /** Clever-Serie: feste Logo-Overlays + eigene KI-Rollen. */
  isCleverErzaehlt?: boolean;
  onComplete?: (patch: {
    id: string;
    coverImageDataUrl: string | null;
    coverPrompt: string | null;
  }) => void;
}) {
  const [pending, setPending] = useState<"generate" | "save" | "clear" | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const shownUrl = previewUrl ?? coverImageDataUrl;
  const busy = Boolean(disabled || pending);

  async function runGenerate() {
    if (!canSave || busy) return;
    setPending("generate");
    try {
      const result = await generateRomanCoverAction({
        romanId,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Cover-Erzeugung fehlgeschlagen.");
        return;
      }
      setPreviewUrl(result.data.dataUrl);
      setPreviewPrompt(result.data.promptUsed);
      toast.success("Cover erzeugt — bitte speichern, wenn es passt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Cover-Erzeugung fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runSave() {
    if (!canSave || busy || !previewUrl) return;
    setPending("save");
    try {
      const result = await saveRomanCoverAction({
        romanId,
        coverPrompt: previewPrompt ?? coverPrompt ?? "",
      });
      if (!result.success) {
        toast.error(result.error ?? "Cover speichern fehlgeschlagen.");
        return;
      }
      onComplete?.({
        id: romanId,
        coverImageDataUrl: previewUrl,
        coverPrompt: previewPrompt ?? coverPrompt ?? "",
      });
      setPreviewUrl(null);
      setPreviewPrompt(null);
      toast.success("Cover gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Cover speichern fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function runClear() {
    if (!canSave || busy) return;
    setPending("clear");
    try {
      const result = await clearRomanCoverAction({ romanId });
      if (!result.success) {
        toast.error(result.error ?? "Cover löschen fehlgeschlagen.");
        return;
      }
      setPreviewUrl(null);
      setPreviewPrompt(null);
      setClearOpen(false);
      onComplete?.({
        id: romanId,
        coverImageDataUrl: null,
        coverPrompt: null,
      });
      toast.success("Cover entfernt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Cover löschen fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <RomanSceneWaitDialog
        open={pending === "generate"}
        variant="pipeline-generate"
        title="Cover wird erzeugt"
        progressLabel={
          isCleverErzaehlt
            ? "Cover-Art-Director → Bild → Logos → Cover-Typograf → Titel …"
            : "Art Direction → Bild → Typografie (Verleger) → Overlay …"
        }
      />
      <ConfirmDeleteDialog
        open={clearOpen}
        title="Cover löschen?"
        description="Das gespeicherte Cover-Bild und der Prompt werden entfernt. Verkaufstexte und Exporte bleiben."
        confirmLabel="Cover löschen"
        pending={pending === "clear"}
        onCancel={() => {
          if (pending === "clear") return;
          setClearOpen(false);
        }}
        onConfirm={() => void runClear()}
      />

      <p className="text-sm font-semibold text-zinc-600">
        {isCleverErzaehlt ? (
          <>
            Ablauf: Cover-Art-Director (KI-Rolle) → Bild → Serien-Badge oben
            mittig + leseno-Logo unten rechts → Cover-Typograf (KI-Rolle) →
            Buchtitel mittig. Rollen unter KI-Rollen anpassbar. Format{" "}
            {ROMAN_COVER_SIZE.width}×{ROMAN_COVER_SIZE.height} px.
          </>
        ) : (
          <>
            Motiv ohne Text (Profi-Grafik). Titel wird danach nach
            Designer-/Verleger-Vorgabe gesetzt: Zone, Ausrichtung, Größe, Ton,
            Scrim — als sauberes Overlay. Format{" "}
            {ROMAN_COVER_SIZE.width}×{ROMAN_COVER_SIZE.height} px.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => void runGenerate()}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending === "generate" ? "Erzeugen …" : "Cover erzeugen"}
        </button>
        {previewUrl ? (
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void runSave()}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending === "save" ? "Speichern …" : "Übernehmen"}
          </button>
        ) : null}
        {coverImageDataUrl ? (
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => setClearOpen(true)}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-red-800 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Cover löschen
          </button>
        ) : null}
      </div>

      {shownUrl ? (
        <div className="overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-950/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shownUrl}
            alt={`Cover: ${title || "Buch"}`}
            className="mx-auto h-auto w-full max-w-sm object-contain"
          />
        </div>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-4 py-8 text-center text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/8">
          Noch kein Cover — {ROMAN_COVER_SIZE.width}×{ROMAN_COVER_SIZE.height}{" "}
          für eBook.
        </p>
      )}

      {previewUrl ? (
        <p className="text-xs font-semibold text-orange-900">
          Vorschau noch nicht gespeichert — „Übernehmen“ sichert das Cover.
        </p>
      ) : null}
    </div>
  );
}
