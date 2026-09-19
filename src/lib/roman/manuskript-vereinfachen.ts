/**
 * Manuskript „Vereinfachen“: one register step easier — content frozen.
 * Snapshots `manuskriptOriginalText` before the first pass for restore.
 */

import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";
import { upsertRomanKontext } from "@/lib/roman/repository";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";

/** Shared patch brief — content lock + register-only changes. */
export const MANUSKRIPT_VEREINFACHEN_BRIEF = `ARBEITSAUFTRAG — Vereinfachen (Register-Pass):
Senke das Sprachniveau DIESES Kapitels um etwa eine Stufe — NUR Sprache.

ERLAUBT:
- schwere / seltene Wörter durch geläufigere ersetzen
- Fremdwörter durch klare deutsche Entsprechungen (Bedeutung bleibt)
- Schachtelsätze und komplizierte Erklärungen in kürzere, klarere Sätze teilen
- etwas kürzer werden, wenn das die Klarheit erhöht

STRENG VERBOTEN (Inhalt unverändert):
- keine neue Handlung, keine neuen Beats, Dialog-Inhalte, Entschlüsse
- keine Figuren, Orte, Gegenstände, Zeitlinien oder Fakten ändern/erfinden/streichen
- keine Szenen umordnen, weglassen oder hinzufügen
- keine Kapitelüberschrift ändern; keine Meta-Kommentare
- Ton der Figurenstimmen behalten (nur Wortwahl/Satzbau erleichtern)

Schreibe den vollständigen Kapitel-Body neu — gleiche Ereignisse in derselben Reihenfolge, nur leichter lesbar.`;

function persistFields(roman: RomanKontext) {
  return {
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
  };
}

/**
 * Snapshot current manuskript (once), then rewrite every chapter one register step easier.
 */
export async function vereinfacheManuskript(input: {
  roman: RomanKontext;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
  originalSaved: boolean;
}> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const text = (editorial.manuskriptText ?? "").trim();
  if (!hasFilledManuskript(text)) {
    throw new Error("Zuerst ein Manuskript anlegen.");
  }

  const chapters = parsePlotChapters(text).filter((c) => c.body.trim());
  if (chapters.length < 1) {
    throw new Error("Keine Manuskript-Kapitel zum Vereinfachen gefunden.");
  }
  const chapterNumbers = chapters.map((c) => c.number);

  let roman = input.roman;
  let ed = editorial;
  let originalSaved = false;

  if (!ed.manuskriptOriginalText.trim()) {
    ed = {
      ...ed,
      manuskriptOriginalText: text,
      manuskriptOriginalSavedAt: new Date().toISOString(),
    };
    roman = await upsertRomanKontext({
      ...persistFields(roman),
      editorial: ed,
    });
    originalSaved = true;
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_vereinfachen",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: originalSaved
        ? `Vereinfachen · Original gesichert · ${chapterNumbers.length} Kapitel`
        : `Vereinfachen · ${chapterNumbers.length} Kapitel (Original bereits gesichert)`,
      detail: MANUSKRIPT_VEREINFACHEN_BRIEF.slice(0, 2_000),
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Vereinfachen · Kap. ${chapterNumbers.join(", ")}`,
    }),
  );

  try {
    const { result: applied, usage } = await runWithAiUsageCollector(() =>
      applyRouteTarget({
        roman,
        critiqueText: "Vereinfachen — Sprachniveau eine Stufe leichter.",
        target: {
          stage: "manuskript",
          reason: "Manuskript Vereinfachen (Register-Pass)",
          patchBrief: MANUSKRIPT_VEREINFACHEN_BRIEF,
          chapterNumbers,
        },
      }),
    );

    roman = applied.roman;
    // Keep original snapshot even if applyRouteTarget rewrote editorial.
    const afterEd = roman.editorial ?? emptyRomanEditorial();
    if (
      ed.manuskriptOriginalText.trim() &&
      !afterEd.manuskriptOriginalText.trim()
    ) {
      roman = await upsertRomanKontext({
        ...persistFields(roman),
        editorial: {
          ...afterEd,
          manuskriptOriginalText: ed.manuskriptOriginalText,
          manuskriptOriginalSavedAt: ed.manuskriptOriginalSavedAt,
        },
      });
    }

    const patched = applied.patchedChapters ?? [];
    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: "co_autor",
        summary: applied.summary,
        detail: `Vereinfacht: Kap. ${patched.join(", ") || "—"}`,
        usage,
      }),
    );

    if (patched.length === 0) {
      const message =
        "Co-Autor hat keine Kapitel geändert — Vereinfachen ohne Wirkung. Bitte erneut versuchen.";
      events.push(
        historyEvent({
          type: "error",
          stage: "manuskript",
          summary: message,
        }),
      );
      await updatePipelineHistoryRun({ runId, status: "error", events });
      throw new Error(message);
    }

    events.push(
      historyEvent({
        type: "info",
        stage: "manuskript",
        summary: `Vereinfachen fertig · ${patched.length} Kapitel`,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman,
      summary: `Sprachniveau vereinfacht (${patched.length} Kapitel)${
        originalSaved ? " · Original gesichert" : ""
      }.`,
      patchedChapters: patched,
      runId,
      originalSaved,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Vereinfachen fehlgeschlagen.";
    if (!events.some((e) => e.type === "error" && e.summary === message)) {
      events.push(
        historyEvent({
          type: "error",
          stage: "manuskript",
          summary: message,
        }),
      );
    }
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * Restore `manuskriptText` from the saved original snapshot.
 */
export async function restoreManuskriptOriginal(input: {
  roman: RomanKontext;
}): Promise<{ roman: RomanKontext; summary: string; runId: string }> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const original = editorial.manuskriptOriginalText.trim();
  if (!original) {
    throw new Error("Kein gesichertes Original vorhanden.");
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.roman.id,
    trigger: "manuskript_original_restore",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Original-Manuskript wiederherstellen",
      detail: editorial.manuskriptOriginalSavedAt
        ? `Snapshot: ${editorial.manuskriptOriginalSavedAt}`
        : undefined,
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Original-Manuskript wiederherstellen",
    }),
  );

  try {
    const nextEd = {
      ...editorial,
      manuskriptText: original,
      // Keep snapshot so user can simplify again and still restore this baseline.
    };
    const roman = await upsertRomanKontext({
      ...persistFields(input.roman),
      editorial: nextEd,
    });

    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        summary: "Original wiederhergestellt",
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman,
      summary: "Original-Manuskript wiederhergestellt.",
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Wiederherstellen fehlgeschlagen.";
    events.push(
      historyEvent({
        type: "error",
        stage: "manuskript",
        summary: message,
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "error", events });
    throw error instanceof Error ? error : new Error(message);
  }
}
