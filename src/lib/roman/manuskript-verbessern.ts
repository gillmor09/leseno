/**
 * Roman „Verbessern“ (Stil-Pass): chapter-wise prose quality up — content frozen.
 * Source = `editorial.manuskriptText` (draft, untouched). Target = `editorial.romanText`.
 * KI-Rolle `autor` (Claude Opus 5.5) via Anthropic Message Batches (~50%).
 * Each finished chapter is persisted to `romanText` as soon as its batch result
 * is applied (Message Batches deliver results when the whole batch ends).
 *
 * Flow: `startManuskriptVerbessern` → `runManuskriptVerbessernJob` (API `after`).
 */

import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import {
  createClaudeMessageBatch,
  fetchClaudeMessageBatchResults,
  formatClaudeBatchProgress,
  waitForClaudeMessageBatch,
  type ClaudeBatchRequest,
} from "@/lib/ai/claude-batches";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  emptyRomanEditorial,
  formatWissensGraphForPrompt,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import {
  hasFrozenSchreibPrompts,
  resolveManuskriptChapterPacket,
} from "@/lib/roman/manuskript-chapter-packet";
import {
  CONTINUITY_PREV_TAIL_CHARS,
  CONTINUITY_PREV_TAIL_CHARS_FROZEN,
} from "@/lib/roman/manuskript-continuity";
import { formatPatchPriorityBanner } from "@/lib/roman/manuskript-patch-sync";
import {
  historyEvent,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import {
  CLIP,
  ROMAN_EXCELLENCE_MANDATE,
  ROMAN_PROSE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import {
  assertRealManuskriptProse,
  formatManuskriptChapterHeading,
  MANUSKRIPT_CHAPTER_PROSE_RULES,
  normalizeManuskriptDocument,
  parsePlotChapters,
  replaceManuskriptChapterBody,
  scrubManuskriptChapterBody,
  serializeManuskriptChapters,
  stripLeadingChapterHeadings,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import { buildRomanSlimCanon } from "@/lib/roman/prompt-prefix";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";
import { buildWeaveSystemAddendum } from "@/lib/roman/weave-comment";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";

/** Shared patch brief — content lock + style-only elevation. */
export const MANUSKRIPT_VERBESSERN_BRIEF = `ARBEITSAUFTRAG — Verbessern (Stil-Pass):
Erhöhe die Prosa-Qualität DIESES Kapitels — NUR Sprache und Form.

ERLAUBT:
- präzisere, lebendigere Wortwahl (ohne Bedeutung zu ändern)
- klarerer, rhythmischer Satzbau; Schachtelsätze glätten wenn nötig
- sinnliche Details und Subtext in bestehender Handlung schärfen
- Dialoge sprachlich schärfen — gleiche Aussage, bessere Stimme

STRENG VERBOTEN (Inhalt unverändert):
- keine neue Handlung, keine neuen Beats, Entschlüsse oder Infos
- keine Figuren, Orte, Gegenstände, Zeitlinien oder Fakten ändern/erfinden/streichen
- keine Szenen umordnen, weglassen oder hinzufügen
- keine Geheimnisse verraten, die im Entwurf noch gehalten sind
- keine Kapitelüberschrift ändern; keine Meta-Kommentare

Schreibe den vollständigen Kapitel-Body neu — gleiche Ereignisse in derselben Reihenfolge, nur bessere Prosa.`;

const LIVE_PROGRESS = "live-progress";
const CUSTOM_ID_PREFIX = "kap-";

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

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function chapterCustomId(chapterNumber: number): string {
  return `${CUSTOM_ID_PREFIX}${chapterNumber}`;
}

/**
 * Ensure Roman has the same chapter slots as the Manuskript draft
 * (empty bodies for missing chapters; keep already polished bodies).
 */
function ensureRomanSkeleton(
  manuskriptChapters: PlotChapter[],
  existingRomanText: string,
): string {
  const existing = parsePlotChapters(existingRomanText);
  const byNum = new Map(existing.map((c) => [c.number, c]));
  const slots = manuskriptChapters.map((src) => ({
    number: src.number,
    title: src.title,
    body: byNum.get(src.number)?.body ?? "",
  }));
  return serializeManuskriptChapters(slots);
}

async function reportLiveProgress(
  runId: string,
  events: PipelineHistoryEvent[],
  label: string,
): Promise<void> {
  const next = events.filter((e) => e.detail !== LIVE_PROGRESS);
  next.push(
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: label,
      detail: LIVE_PROGRESS,
    }),
  );
  events.length = 0;
  events.push(...next);
  await updatePipelineHistoryRun({ runId, status: "running", events });
}

/**
 * Validate Manuskript source + seed empty Roman chapter slots + open history run.
 * Client then kicks `runManuskriptVerbessernJob` via API `after`.
 */
export async function startManuskriptVerbessern(input: {
  roman: RomanKontext;
}): Promise<{
  runId: string;
  /** True when Roman skeleton was newly seeded (empty or structure-only). */
  originalSaved: boolean;
  chapterCount: number;
}> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const text = (editorial.manuskriptText ?? "").trim();
  if (!hasFilledManuskript(text)) {
    throw new Error("Zuerst ein Manuskript anlegen.");
  }

  const chapters = parsePlotChapters(text).filter((c) => c.body.trim());
  if (chapters.length < 1) {
    throw new Error("Keine Manuskript-Kapitel zum Verbessern gefunden.");
  }

  let roman = input.roman;
  let ed = editorial;
  const skeleton = ensureRomanSkeleton(chapters, ed.romanText ?? "");
  const hadRomanProse = parsePlotChapters(ed.romanText ?? "").some((c) =>
    c.body.trim(),
  );
  let originalSaved = false;
  if (skeleton !== (ed.romanText ?? "").trim() || !hadRomanProse) {
    ed = { ...ed, romanText: skeleton };
    roman = await upsertRomanKontext({
      ...persistFields(roman),
      editorial: ed,
    });
    originalSaved = !hadRomanProse;
  }

  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_verbessern",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Roman Verbessern · ${chapters.length} Kapitel (Claude Batch)`,
      detail: MANUSKRIPT_VERBESSERN_BRIEF.slice(0, 2_000),
    }),
  });

  return { runId, originalSaved, chapterCount: chapters.length };
}

/**
 * Background job: submit one Claude Messages request per chapter as a Batch,
 * poll to completion, write each finished chapter into `romanText` immediately.
 */
export async function runManuskriptVerbessernJob(input: {
  romanId: string;
  runId: string;
}): Promise<void> {
  const events: PipelineHistoryEvent[] = [
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Verbessern · Batch vorbereiten …",
      detail: LIVE_PROGRESS,
    }),
  ];

  try {
    await updatePipelineHistoryRun({
      runId: input.runId,
      status: "running",
      events,
    });

    const roman0 = await getRomanKontext(input.romanId);
    if (!roman0) {
      throw new Error("Buch nicht gefunden.");
    }

    const { result, usage } = await runWithAiUsageCollector(async () => {
      let roman = roman0;
      const editorial = roman.editorial ?? emptyRomanEditorial();
      const baseline = (editorial.manuskriptText ?? "").trim();
      if (!hasFilledManuskript(baseline)) {
        throw new Error("Zuerst ein Manuskript anlegen.");
      }

      const chapters = parsePlotChapters(baseline).filter((c) => c.body.trim());
      if (chapters.length < 1) {
        throw new Error("Keine Manuskript-Kapitel zum Verbessern gefunden.");
      }

      const plot = roman.manuskriptRaw ?? "";
      let liveRomanText = ensureRomanSkeleton(
        chapters,
        editorial.romanText ?? "",
      );
      // Seed empty Roman slots before the batch so the tab already shows structure.
      if (liveRomanText !== (editorial.romanText ?? "").trim()) {
        roman = await upsertRomanKontext({
          ...persistFields(roman),
          editorial: { ...editorial, romanText: liveRomanText },
        });
      }

      await reportLiveProgress(
        input.runId,
        events,
        `Verbessern · Autor-Rolle laden · ${chapters.length} Kapitel …`,
      );

      const resolved = await resolveRomanKiRolle("autor", {
        allowProseModel: true,
      });
      const rolle = resolved.rolle;
      const model = resolved.model;
      if (!model.isActive) {
        throw new Error(
          `Das Modell „${model.label}“ für Rolle Autor ist deaktiviert.`,
        );
      }
      const provider = model.provider.trim().toLowerCase();
      if (provider !== "claude") {
        throw new Error(
          `Rolle Autor muss ein Claude-Modell nutzen (aktuell: ${model.provider} / ${model.modelSlug}). Bitte KI-Rollen prüfen.`,
        );
      }

      const buchTyp = (editorial.buchTyp ?? "unbekannt") as RomanBuchTyp;
      const cacheablePrefix = buildRomanSlimCanon({
        buchTyp,
        title: roman.title,
        genre: roman.genre,
        ideeKurz: editorial.ideeKurz ?? "",
        rechercheDossier: editorial.rechercheDossier ?? "",
        tonalitaet: roman.tonalitaet,
        grobRegeln: editorial.grobRegeln ?? "",
        editorial,
        charaktere: roman.charaktere,
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
        wissensGraph: editorial.wissensGraph,
      });
      const autorBias = formatAutorBiasFromCharaktere(roman.charaktere);
      const liveStructured = editorial.szenenplotStructured ?? null;
      const liveStoryState = editorial.storyState ?? null;
      const liveGraph = editorial.wissensGraph ?? null;

      const systemInstruction = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${buildWeaveSystemAddendum({
  kind: "manuskript",
  outputFormatHint:
    "Nur den Kapitel-BODY ohne Überschrift. Die Heading-Zeile setzt der Server.",
})}

Du erhältst GENAU ein Kapitel. Ändere den Body laut Patch-Brief — SICHTBAR und ENTSCHIEDEN.
${MANUSKRIPT_CHAPTER_PROSE_RULES}
Buchdruck: Überschriften setzt das System (ohne Rauten). Erzähle als echte Prosa — keine Streich-/Meta-Notizen.
Stil-Pass: gleiche Beats/Fakten/Dialogbedeutung — nur Wortwahl und Satzbau verbessern.
Gib NUR den neuen Body zurück — keine Kapitel-Überschrift („Kapitel N — …“), kein JSON.`;

      const reasoningEffort = resolveReasoningEffort(
        model.modelSlug,
        rolle.reasoningEffort || "medium",
      );

      await reportLiveProgress(
        input.runId,
        events,
        `Verbessern · ${chapters.length} Kapitel-Pakete bauen …`,
      );

      const batchRequests: ClaudeBatchRequest[] = [];
      for (const ch of chapters) {
        const heading = formatManuskriptChapterHeading({
          number: ch.number,
          title: ch.title,
          body: "",
        });
        const prev = chapters.find((c) => c.number === ch.number - 1);
        const frozen = hasFrozenSchreibPrompts(liveStructured);
        const prevTailChars = frozen
          ? CONTINUITY_PREV_TAIL_CHARS_FROZEN
          : CONTINUITY_PREV_TAIL_CHARS;
        const previousTail = prev?.body.trim().slice(-prevTailChars) ?? "";
        const { packet } = await resolveManuskriptChapterPacket({
          storyState: liveStoryState,
          chapter: ch,
          allChapters: chapters,
          previousTail,
          lektorBrief: MANUSKRIPT_VERBESSERN_BRIEF,
          wissensGraph: liveGraph,
          szenenplotStructured: liveStructured,
          autorBias: frozen ? undefined : autorBias,
          slimCanonSnippet: cacheablePrefix,
        });
        const chapterPacket = [
          formatPatchPriorityBanner(MANUSKRIPT_VERBESSERN_BRIEF),
          packet,
          "## Patch-Übergang (verbindlich)",
          "Das Ende des Vorgänger-Kapitels ist BEREITS im Buch.",
          "Am Anfang DIESES Kapitels: nichts davon erneut erzählen — organisch danach ansetzen.",
        ].join("\n");

        const graphSnippet = formatWissensGraphForPrompt(liveGraph, {
          throughChapter: ch.number,
          maxChars: 1_600,
        });

        const userText = `# Patch-Brief (verbindlich — höchste Priorität)
${MANUSKRIPT_VERBESSERN_BRIEF}

# Kapitel-Paket (Continuity/Beats — UNTER dem Patch-Brief)
${chapterPacket.slice(0, 5_500)}
${graphSnippet ? `\n# Wissensgraph (Kurz)\n${graphSnippet}\n` : ""}
# Kapitel (Meta unveränderlich)
${heading}

# Bisheriger Body
${ch.body.slice(0, CLIP.chapterBody)}

Schreibe den vollständigen neuen Body.
HARTE ERFOLGSKRITERIEN:
- Bessere Prosa (Wortwahl/Satzbau) bei IDENTISCHEM Inhalt — keine neuen Beats.
- Der Text darf sich stilistisch klar unterscheiden; Handlung und Infos bleiben gleich.
- Keine Meta-Sätze. Nur erzählende Prosa. Nur DIESES Kapitel.`;

        batchRequests.push({
          customId: chapterCustomId(ch.number),
          params: {
            modelSlug: model.modelSlug,
            systemInstruction,
            cacheablePrefix,
            cacheTtl: "1h",
            userText,
            maxTokens: ROMAN_PROSE_MAX_TOKENS,
            reasoningEffort,
          },
        });
      }

      await reportLiveProgress(
        input.runId,
        events,
        `Verbessern · Claude Batch einreichen (${chapters.length} Kap.) …`,
      );

      const submitted = await createClaudeMessageBatch(batchRequests);
      events.push(
        historyEvent({
          type: "info",
          stage: "manuskript",
          roleKey: "autor",
          modelLabel: model.label || model.modelSlug,
          summary: `Claude Batch gestartet · ${submitted.id}`,
          detail: `Kapitel: ${chapters.map((c) => c.number).join(", ")}`,
        }),
      );
      await updatePipelineHistoryRun({
        runId: input.runId,
        status: "running",
        events,
      });

      const finished = await waitForClaudeMessageBatch({
        batchId: submitted.id,
        timeoutMs: 50 * 60_000,
        pollIntervalMs: 20_000,
        onProgress: async (batch) => {
          await reportLiveProgress(
            input.runId,
            events,
            formatClaudeBatchProgress(batch, chapters.length),
          );
        },
      });

      await reportLiveProgress(
        input.runId,
        events,
        "Verbessern · Batch-Ergebnisse laden …",
      );

      const { results, usage: batchUsage } =
        await fetchClaudeMessageBatchResults(finished);

      const failed: string[] = [];
      const patched: number[] = [];
      // Apply in chapter order; persist each success immediately to romanText.
      for (const ch of chapters) {
        const customId = chapterCustomId(ch.number);
        const hit = results.find((r) => r.customId === customId);
        if (!hit || hit.type !== "succeeded" || !hit.text.trim()) {
          failed.push(
            `Kap. ${ch.number}: ${
              hit && hit.type !== "succeeded"
                ? hit.type === "errored"
                  ? hit.error ?? hit.type
                  : hit.type
                : "kein Text"
            }`,
          );
          continue;
        }
        let body = scrubManuskriptChapterBody(
          stripLeadingChapterHeadings(hit.text, ch.number),
        );
        try {
          assertRealManuskriptProse(body, ch.number, ch.title);
        } catch (err) {
          failed.push(
            `Kap. ${ch.number}: ${
              err instanceof Error ? err.message : "ungültige Prosa"
            }`,
          );
          continue;
        }
        if (normalizeWhitespace(body) === normalizeWhitespace(ch.body)) {
          // Still write — Roman gets the (unchanged) draft body as filled slot.
          body = ch.body;
        }

        liveRomanText = replaceManuskriptChapterBody(
          liveRomanText,
          plot || baseline,
          ch.number,
          body,
        );
        liveRomanText = normalizeManuskriptDocument(liveRomanText, {
          requiredFromPlot: plot || baseline,
        });
        const edNow = roman.editorial ?? editorial;
        roman = await upsertRomanKontext({
          ...persistFields(roman),
          editorial: {
            ...edNow,
            // Manuskript draft stays frozen; only Roman grows.
            manuskriptText: baseline,
            romanText: liveRomanText,
          },
        });
        patched.push(ch.number);
        await reportLiveProgress(
          input.runId,
          events,
          `Roman · Kap. ${ch.number} gespeichert (${patched.length}/${chapters.length})`,
        );
      }

      if (patched.length === 0) {
        throw new Error(
          "Autor hat keine Roman-Kapitel geliefert — Verbessern ohne Wirkung. Bitte erneut versuchen." +
            (failed.length
              ? ` (${failed.slice(0, 3).join("; ")})`
              : ""),
        );
      }

      return {
        roman,
        patched,
        failed,
        batchId: finished.id,
        batchUsage,
        modelLabel: model.label || model.modelSlug,
      };
    });

    // Drop live-progress before permanent events.
    const cleaned = events.filter((e) => e.detail !== LIVE_PROGRESS);
    events.length = 0;
    events.push(...cleaned);

    const failNote =
      result.failed.length > 0
        ? ` · ${result.failed.length} Kap. unverändert/Fehler`
        : "";
    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: "autor",
        modelLabel: result.modelLabel,
        summary: `Roman verbessert (Claude Batch · ${result.patched.length} Kapitel)${failNote}`,
        detail: `Batch ${result.batchId} · Kap. ${result.patched.join(", ")}${
          result.failed.length
            ? `\nHinweise: ${result.failed.slice(0, 8).join("; ")}`
            : ""
        }`,
        usage: usage ?? result.batchUsage,
      }),
    );
    events.push(
      historyEvent({
        type: "info",
        stage: "manuskript",
        summary: `Roman Verbessern fertig · ${result.patched.length} Kapitel`,
      }),
    );
    await updatePipelineHistoryRun({
      runId: input.runId,
      status: "ok",
      events,
    });
    revalidateRomanAdmin(input.romanId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verbessern fehlgeschlagen.";
    const cleaned = events.filter((e) => e.detail !== LIVE_PROGRESS);
    cleaned.push(
      historyEvent({
        type: "error",
        stage: "manuskript",
        summary: message,
      }),
    );
    try {
      await updatePipelineHistoryRun({
        runId: input.runId,
        status: "error",
        events: cleaned,
      });
    } catch {
      /* best-effort */
    }
    revalidateRomanAdmin(input.romanId);
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * @deprecated Prefer start + job; kept for direct/sync callers.
 * Runs Verbessern end-to-end (still uses Batch API under the hood).
 */
export async function verbessereManuskript(input: {
  roman: RomanKontext;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters: number[];
  runId: string;
  originalSaved: boolean;
}> {
  const started = await startManuskriptVerbessern({ roman: input.roman });
  await runManuskriptVerbessernJob({
    romanId: input.roman.id,
    runId: started.runId,
  });
  const roman = await getRomanKontext(input.roman.id);
  if (!roman) {
    throw new Error("Buch nach Verbessern nicht gefunden.");
  }
  return {
    roman,
    summary: `Roman verbessert (Claude Batch)${
      started.originalSaved ? " · Kapitelstruktur angelegt" : ""
    }.`,
    patchedChapters: [],
    runId: started.runId,
    originalSaved: started.originalSaved,
  };
}

/**
 * Copy Manuskript draft into `romanText` (reset polish / seed for compare).
 * Manuskript itself is never modified by Verbessern.
 */
export async function restoreManuskriptOriginal(input: {
  roman: RomanKontext;
}): Promise<{ roman: RomanKontext; summary: string; runId: string }> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const source = (editorial.manuskriptText ?? "").trim();
  if (!hasFilledManuskript(source)) {
    throw new Error("Kein Manuskript zum Übernehmen vorhanden.");
  }

  const events: PipelineHistoryEvent[] = [];
  const runId = await startPipelineHistoryRun({
    romanId: input.roman.id,
    trigger: "manuskript_original_restore",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Roman aus Manuskript übernehmen",
    }),
  });
  events.push(
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Roman aus Manuskript übernehmen",
    }),
  );

  try {
    const sealed = normalizeManuskriptDocument(source, {
      requiredFromPlot: input.roman.manuskriptRaw ?? "",
    });
    const nextEd = {
      ...editorial,
      romanText: sealed,
    };
    const roman = await upsertRomanKontext({
      ...persistFields(input.roman),
      editorial: nextEd,
    });

    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        summary: "Roman aus Manuskript übernommen",
      }),
    );
    await updatePipelineHistoryRun({ runId, status: "ok", events });

    return {
      roman,
      summary: "Roman aus Manuskript übernommen.",
      runId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Übernehmen fehlgeschlagen.";
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
