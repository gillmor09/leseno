/**
 * Roman „Verbessern“ (Stil-Pass): chapter-wise prose quality up — content frozen.
 * Source = `editorial.manuskriptText` (draft, untouched). Target = `editorial.romanText`.
 * KI-Rolle `autor` (Claude Opus 5.5) via Anthropic Message Batches (~50%).
 * Each finished chapter is persisted to `romanText` as soon as its batch result
 * is applied (Message Batches deliver results when the whole batch ends).
 *
 * Flow: `startManuskriptVerbessern` → `runManuskriptVerbessernJob` (API `after`).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import {
  createClaudeMessageBatch,
  fetchClaudeMessageBatchResults,
  formatClaudeBatchProgress,
  waitForClaudeMessageBatch,
  type ClaudeBatchRequest,
} from "@/lib/ai/claude-batches";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  emptyRomanEditorial,
  formatFactContractsForChapter,
  formatWissensGraphForPrompt,
  type RomanBuchTyp,
  type RomanEditorial,
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
  getPipelineHistoryRun,
  historyEvent,
  listPipelineHistory,
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
import {
  assessStageReifegrad,
  editorialWithReifegrad,
} from "@/lib/roman/reifegrad";
import { formatCraftScoresLineForAssessKey } from "@/lib/roman/reifegrad-craft";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import {
  buildCrossChapterStyleAnchor,
  buildVerbessernCacheableExtras,
  selectStyleAnchorChapters,
} from "@/lib/roman/roman-verbessern-context";
import { assertRomanChapterContentFrozen } from "@/lib/roman/roman-verbessern-freeze-qa";
import { assertManuskriptReadyForRoman } from "@/lib/roman/roman-verbessern-preflight";
import { checkRomanBookVoice } from "@/lib/roman/roman-verbessern-voice-check";
import {
  EMOTIONAL_CONSEQUENCE_DONE_DETAIL,
  emotionalConsequenceAlreadyDone,
  runManuskriptEmotionalConsequencePass,
} from "@/lib/roman/manuskript-emotional-consequence";
import {
  runManuskriptSeamPayoffPass,
  SEAM_PAYOFF_DONE_DETAIL,
  seamPayoffAlreadyDone,
} from "@/lib/roman/manuskript-seam-payoff";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";
import { buildWeaveSystemAddendum } from "@/lib/roman/weave-comment";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";
import type { AiTokenUsage } from "@/lib/ai/usage-types";
import { sumAiUsages } from "@/lib/ai/usage-types";

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
/** Seam lookahead: next chapter head so Opus does not soften hooks. */
const NEXT_CHAPTER_HEAD_CHARS = 400;
/** Wave 1 establishes polished voice; Wave 2 uses it as Stilanker + prev. */
const WAVE1_CHAPTER_COUNT = 2;
/** Prevents double `after()` workers on the same runId. */
const JOB_LOCK_DETAIL = "verbessern-job-lock";
/** Persisted in history.detail so a crashed worker can resume a Batch. */
const BATCH_META_PREFIX = "BATCH_META:";
/** Re-attach to this run instead of spawning a second worker. */
const ACTIVE_VERBESSERN_MS = 90 * 60_000;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry transient DB/network failures (upsert, batch submit). */
async function withRetries<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i + 1 >= attempts) break;
      await sleepMs(600 * (i + 1));
    }
  }
  throw last instanceof Error
    ? last
    : new Error(`${label} fehlgeschlagen nach ${attempts} Versuchen.`);
}

/** Thrown when a newer start abandoned this run — stop without overwriting history. */
class VerbessernAbortedError extends Error {
  constructor() {
    super("Verbessern-Lauf wurde beendet (Neustart).");
    this.name = "VerbessernAbortedError";
  }
}

async function assertVerbessernRunStillActive(
  romanId: string,
  runId: string,
): Promise<void> {
  try {
    const run = await getPipelineHistoryRun(romanId, runId);
    if (!run || run.status === "ok" || run.status === "error") {
      throw new VerbessernAbortedError();
    }
  } catch (error) {
    if (error instanceof VerbessernAbortedError) throw error;
    /* fail-soft on poll DB blips — keep working */
  }
}

function formatBatchMeta(input: {
  wave: string;
  batchId: string;
  chapters: number[];
}): string {
  return `${BATCH_META_PREFIX}wave=${encodeURIComponent(input.wave)};id=${input.batchId};chapters=${input.chapters.join(",")}`;
}

function parseBatchMeta(
  detail: string | undefined,
): { wave: string; batchId: string; chapters: number[] } | null {
  const raw = (detail ?? "").trim();
  if (!raw.startsWith(BATCH_META_PREFIX)) return null;
  const body = raw.slice(BATCH_META_PREFIX.length);
  const parts = Object.fromEntries(
    body.split(";").map((p) => {
      const i = p.indexOf("=");
      if (i < 0) return [p, ""];
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const batchId = String(parts.id ?? "").trim();
  const wave = decodeURIComponent(String(parts.wave ?? "").trim());
  const chapters = String(parts.chapters ?? "")
    .split(",")
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));
  if (!batchId || chapters.length === 0) return null;
  return { wave, batchId, chapters };
}

/**
 * True when Roman body already differs from Manuskript — skip on resume
 * (abort mid-book / re-kick should not re-bill polished chapters).
 */
function chapterAlreadyPolished(
  draft: PlotChapter,
  romanBody: string | undefined,
): boolean {
  const polished = (romanBody ?? "").trim();
  if (polished.length < 80) return false;
  if (normalizeWhitespace(polished) === normalizeWhitespace(draft.body)) {
    return false;
  }
  // Require a real stil delta, not tiny whitespace/noise.
  const a = normalizeWhitespace(draft.body);
  const b = normalizeWhitespace(polished);
  if (a.length < 40) return polished.length >= 80;
  const overlap = Math.min(a.length, b.length);
  let same = 0;
  for (let i = 0; i < overlap; i += 1) {
    if (a[i] === b[i]) same += 1;
  }
  return same / Math.max(a.length, b.length) < 0.97;
}

function findResumableBatch(
  events: PipelineHistoryEvent[],
  waveLabel: string,
): { batchId: string; chapters: number[] } | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = parseBatchMeta(events[i]?.detail);
    if (!meta) continue;
    if (meta.wave !== waveLabel) continue;
    return { batchId: meta.batchId, chapters: meta.chapters };
  }
  return null;
}

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
  try {
    await updatePipelineHistoryRun({ runId, status: "running", events });
  } catch {
    /* fail-soft — progress poll may lag; job continues */
  }
}

async function upsertRomanEditorial(
  roman: RomanKontext,
  editorial: RomanEditorial,
): Promise<RomanKontext> {
  return withRetries("Roman speichern", () =>
    upsertRomanKontext({
      ...persistFields(roman),
      editorial,
    }),
  );
}

function verbessernSystemInstruction(rolleSystemPrompt: string): string {
  return `${rolleSystemPrompt}

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
Stimme: Cross-Chapter-Stilanker + Tonalität + Regeln aus dem Cache-Prefix sind verbindlich — Register und Satzrhythmus ans Buch angleichen, Inhalt nicht ändern.
Gib NUR den neuen Body zurück — keine Kapitel-Überschrift („Kapitel N — …“), kein JSON.`;
}

/**
 * Build one Claude Batch request per chapter. Continuity prefers polished
 * `romanChapters` prev-tail when present; next-chapter head is Manuskript only.
 */
async function buildVerbessernBatchRequests(input: {
  waveChapters: PlotChapter[];
  manuskriptChapters: PlotChapter[];
  romanChapters: PlotChapter[];
  cacheablePrefix: string;
  systemInstruction: string;
  modelSlug: string;
  reasoningEffort: ReturnType<typeof resolveReasoningEffort>;
  autorBias: string;
  liveStructured: RomanEditorial["szenenplotStructured"];
  liveStoryState: RomanEditorial["storyState"];
  liveGraph: RomanEditorial["wissensGraph"];
}): Promise<ClaudeBatchRequest[]> {
  const frozen = hasFrozenSchreibPrompts(input.liveStructured);
  const prevTailChars = frozen
    ? CONTINUITY_PREV_TAIL_CHARS_FROZEN
    : CONTINUITY_PREV_TAIL_CHARS;
  const batchRequests: ClaudeBatchRequest[] = [];

  for (const ch of input.waveChapters) {
    const heading = formatManuskriptChapterHeading({
      number: ch.number,
      title: ch.title,
      body: "",
    });
    const prevRoman = input.romanChapters.find(
      (c) => c.number === ch.number - 1,
    );
    const prevMs = input.manuskriptChapters.find(
      (c) => c.number === ch.number - 1,
    );
    const prevBody =
      (prevRoman?.body.trim().length ?? 0) >= 40
        ? prevRoman!.body
        : (prevMs?.body ?? "");
    const previousTail = prevBody.trim().slice(-prevTailChars);

    const nextMs = input.manuskriptChapters.find(
      (c) => c.number === ch.number + 1,
    );
    const nextHead = nextMs?.body.trim().slice(0, NEXT_CHAPTER_HEAD_CHARS) ?? "";

    const { packet } = await resolveManuskriptChapterPacket({
      storyState: input.liveStoryState,
      chapter: ch,
      allChapters: input.manuskriptChapters,
      previousTail,
      lektorBrief: MANUSKRIPT_VERBESSERN_BRIEF,
      wissensGraph: input.liveGraph,
      szenenplotStructured: input.liveStructured,
      autorBias: frozen ? undefined : input.autorBias,
      slimCanonSnippet: input.cacheablePrefix,
    });
    const chapterPacket = [
      formatPatchPriorityBanner(MANUSKRIPT_VERBESSERN_BRIEF),
      packet,
      "## Patch-Übergang (verbindlich)",
      "Das Ende des Vorgänger-Kapitels ist BEREITS im Buch.",
      "Am Anfang DIESES Kapitels: nichts davon erneut erzählen — organisch danach ansetzen.",
    ].join("\n");

    const graphSnippet = formatWissensGraphForPrompt(input.liveGraph, {
      throughChapter: ch.number,
      maxChars: 1_600,
    });

    const nextBlock = nextHead
      ? `\n# Nächstes Kapitel (Kopf — nur Seam halten, nicht umschreiben)
Kap. ${(nextMs?.number ?? ch.number + 1)}: Cliffhanger/Hook dieses Kapitels muss organisch auf den folgenden Anfang passen — Inhalt hier nicht vorwegnehmen.
${nextHead}\n`
      : "";

    const userText = `# Patch-Brief (verbindlich — höchste Priorität)
${MANUSKRIPT_VERBESSERN_BRIEF}

# Kapitel-Paket (Continuity/Beats — UNTER dem Patch-Brief)
${chapterPacket.slice(0, 5_500)}
${graphSnippet ? `\n# Wissensgraph (Kurz)\n${graphSnippet}\n` : ""}${nextBlock}
# Kapitel (Meta unveränderlich)
${heading}

# Bisheriger Body
${ch.body.slice(0, CLIP.chapterBody)}

Schreibe den vollständigen neuen Body.
HARTE ERFOLGSKRITERIEN:
- Bessere Prosa (Wortwahl/Satzbau) bei IDENTISCHEM Inhalt — keine neuen Beats.
- Stimme/Register wie Stilanker + Tonalität; Regeln und Leserversprechen nicht brechen.
- Der Text darf sich stilistisch klar unterscheiden; Handlung und Infos bleiben gleich.
- Keine Meta-Sätze. Nur erzählende Prosa. Nur DIESES Kapitel.`;

    batchRequests.push({
      customId: chapterCustomId(ch.number),
      params: {
        modelSlug: input.modelSlug,
        systemInstruction: input.systemInstruction,
        cacheablePrefix: input.cacheablePrefix,
        cacheTtl: "1h",
        userText,
        maxTokens: ROMAN_PROSE_MAX_TOKENS,
        reasoningEffort: input.reasoningEffort,
      },
    });
  }

  return batchRequests;
}

type ApplyWaveResult = {
  liveRomanText: string;
  roman: RomanKontext;
  patched: number[];
  failed: string[];
};

/**
 * One sync Opus retry: keep stil gains, undo content drift named in Freeze-QA.
 */
async function softRepairFrozenPolish(input: {
  chapter: PlotChapter;
  failedPolish: string;
  reasons: string[];
  systemInstruction: string;
  cacheablePrefix: string;
  modelSlug: string;
  reasoningEffort: ReturnType<typeof resolveReasoningEffort>;
}): Promise<string | null> {
  const reasons = input.reasons.slice(0, 4).join("\n- ");
  try {
    const model = await resolveRomanSchreibModel(input.modelSlug);
    const heading = formatManuskriptChapterHeading({
      number: input.chapter.number,
      title: input.chapter.title,
      body: "",
    });
    const raw = (
      await withRetries("Soft-Repair", () =>
        generateText({
          model: {
            ...model,
            reasoningEffort: input.reasoningEffort,
          },
          systemInstruction: input.systemInstruction,
          cacheablePrefix: input.cacheablePrefix,
          userText: `# Soft-Repair (Content-Freeze)
Der Stil-Pass hat Inhaltsfehler. Behalte die bessere Prosa, korrigiere NUR die genannten Freeze-Probleme.
Inhalt muss wieder dem Entwurf entsprechen (gleiche Beats/Fakten/Figuren/Reihenfolge).

# Freeze-Probleme
- ${reasons}

# Entwurf (verbindlicher Inhalt)
${input.chapter.body.slice(0, CLIP.chapterBody)}

# Fehlgeschlagener Polish (Stil ok, Inhalt falsch — als Ausgangspunkt)
${input.failedPolish.slice(0, CLIP.chapterBody)}

# Kapitel (Meta)
${heading}

Schreibe den vollständigen korrigierten Body (Stil behalten, Inhalt wie Entwurf). Nur Body, keine Überschrift.`,
          maxTokens: ROMAN_PROSE_MAX_TOKENS,
          timeoutMs: 180_000,
        }),
        2,
      )
    ).trim();
    if (!raw || raw.length < 40) return null;
    const body = scrubManuskriptChapterBody(
      stripLeadingChapterHeadings(raw, input.chapter.number),
    );
    assertRealManuskriptProse(body, input.chapter.number, input.chapter.title);
    return body;
  } catch {
    return null;
  }
}

/**
 * Apply batch results chapter-wise with Content-Freeze-QA;
 * one soft-repair retry on fail, then Manuskript fallback.
 */
async function applyVerbessernWaveResults(input: {
  waveChapters: PlotChapter[];
  results: Awaited<
    ReturnType<typeof fetchClaudeMessageBatchResults>
  >["results"];
  liveRomanText: string;
  roman: RomanKontext;
  editorial: RomanEditorial;
  baseline: string;
  plot: string;
  runId: string;
  events: PipelineHistoryEvent[];
  patchedSoFar: number;
  totalChapters: number;
  repair?: {
    systemInstruction: string;
    cacheablePrefix: string;
    modelSlug: string;
    reasoningEffort: ReturnType<typeof resolveReasoningEffort>;
  };
}): Promise<ApplyWaveResult> {
  let { liveRomanText, roman } = input;
  const failed: string[] = [];
  const patched: number[] = [];
  const liveStructured = input.editorial.szenenplotStructured ?? null;
  const liveGraph = input.editorial.wissensGraph ?? null;
  const liveStoryState = input.editorial.storyState ?? null;

  for (const ch of input.waveChapters) {
    const customId = chapterCustomId(ch.number);
    const hit = input.results.find((r) => r.customId === customId);
    let body = ch.body;
    let accepted = false;

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
    } else {
      body = scrubManuskriptChapterBody(
        stripLeadingChapterHeadings(hit.text, ch.number),
      );
      try {
        assertRealManuskriptProse(body, ch.number, ch.title);
        if (normalizeWhitespace(body) === normalizeWhitespace(ch.body)) {
          body = ch.body;
          accepted = true;
        } else {
          const structuredCh =
            liveStructured?.chapters.find((c) => c.number === ch.number) ??
            null;
          const factContractsBlock = formatFactContractsForChapter(
            liveGraph,
            ch.number,
            { storyState: liveStoryState },
          );
          await reportLiveProgress(
            input.runId,
            input.events,
            `Roman · Kap. ${ch.number}: Content-Freeze-QA …`,
          );
          let freeze = await assertRomanChapterContentFrozen({
            draftBody: ch.body,
            polishedBody: body,
            chapterNumber: ch.number,
            structuredChapter: structuredCh,
            factContractsBlock,
          });
          if (!freeze.ok && input.repair) {
            await reportLiveProgress(
              input.runId,
              input.events,
              `Roman · Kap. ${ch.number}: Soft-Repair …`,
            );
            const repaired = await softRepairFrozenPolish({
              chapter: ch,
              failedPolish: body,
              reasons: freeze.reasons,
              ...input.repair,
            });
            if (repaired) {
              freeze = await assertRomanChapterContentFrozen({
                draftBody: ch.body,
                polishedBody: repaired,
                chapterNumber: ch.number,
                structuredChapter: structuredCh,
                factContractsBlock,
              });
              if (freeze.ok) {
                body = repaired;
                accepted = true;
              }
            }
          } else if (freeze.ok) {
            accepted = true;
          }
          if (!accepted) {
            failed.push(
              `Kap. ${ch.number}: Freeze-QA — ${freeze.reasons.slice(0, 2).join("; ")}`,
            );
            body = ch.body;
          }
        }
      } catch (err) {
        failed.push(
          `Kap. ${ch.number}: ${
            err instanceof Error ? err.message : "ungültige Prosa"
          }`,
        );
        body = ch.body;
      }
    }

    liveRomanText = replaceManuskriptChapterBody(
      liveRomanText,
      input.plot || input.baseline,
      ch.number,
      body,
    );
    liveRomanText = normalizeManuskriptDocument(liveRomanText, {
      requiredFromPlot: input.plot || input.baseline,
    });
    const edNow = roman.editorial ?? input.editorial;
    try {
      roman = await upsertRomanEditorial(roman, {
        ...edNow,
        manuskriptText: input.baseline,
        romanText: liveRomanText,
      });
    } catch (err) {
      failed.push(
        `Kap. ${ch.number}: Speichern — ${
          err instanceof Error ? err.message : "DB-Fehler"
        }`,
      );
      continue;
    }
    if (accepted) patched.push(ch.number);
    await reportLiveProgress(
      input.runId,
      input.events,
      `Roman · Kap. ${ch.number} gespeichert (${input.patchedSoFar + patched.length}/${input.totalChapters})`,
    );
  }

  return { liveRomanText, roman, patched, failed };
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
  assertManuskriptReadyForRoman({ editorial });

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

  // Re-attach / abandon: one active Verbessern per book (avoids dual workers).
  const recent = await listPipelineHistory(roman.id, 25);
  const now = Date.now();
  const active = recent.find((r) => {
    if (r.trigger !== "manuskript_verbessern" || r.status !== "running") {
      return false;
    }
    const age = now - new Date(r.createdAt).getTime();
    return Number.isFinite(age) && age >= 0 && age < ACTIVE_VERBESSERN_MS;
  });
  if (active) {
    return {
      runId: active.id,
      originalSaved: false,
      chapterCount: chapters.length,
    };
  }
  for (const r of recent) {
    if (r.trigger !== "manuskript_verbessern" || r.status !== "running") {
      continue;
    }
    try {
      await updatePipelineHistoryRun({
        runId: r.id,
        status: "error",
        events: [
          ...r.events.filter((e) => e.detail !== LIVE_PROGRESS),
          historyEvent({
            type: "error",
            stage: "manuskript",
            summary:
              "Verbessern abgebrochen (Neustart nach Timeout / hängendem Lauf).",
          }),
        ],
      });
    } catch {
      /* best-effort */
    }
  }

  const runId = await startPipelineHistoryRun({
    romanId: roman.id,
    trigger: "manuskript_verbessern",
    originStage: "manuskript",
    firstEvent: historyEvent({
      type: "info",
      stage: "manuskript",
      summary: `Roman Verbessern · ${chapters.length} Kapitel (Seam/Payoff → Emotion → 2 Wellen · Freeze-QA)`,
      detail: MANUSKRIPT_VERBESSERN_BRIEF.slice(0, 2_000),
    }),
  });

  return { runId, originalSaved, chapterCount: chapters.length };
}

/**
 * Background job: submit one Claude Messages request per chapter as a Batch,
 * poll to completion, write each finished chapter into `romanText` immediately.
 * Idempotent on re-kick: skips ok/error runs, resumes unfinished batches,
 * skips already polished chapters after abort.
 */
export async function runManuskriptVerbessernJob(input: {
  romanId: string;
  runId: string;
}): Promise<void> {
  const existing = await getPipelineHistoryRun(input.romanId, input.runId);
  if (!existing) {
    return;
  }
  if (existing.status === "ok" || existing.status === "error") {
    return;
  }

  // Another after()-worker already claimed this run (double kick).
  const hasLock = existing.events.some((e) => e.detail === JOB_LOCK_DETAIL);
  const events: PipelineHistoryEvent[] = [...existing.events];
  if (hasLock) {
    // Allow resume only if lock is stale (>45 min without progress) — otherwise no-op.
    const lockEv = [...existing.events]
      .reverse()
      .find((e) => e.detail === JOB_LOCK_DETAIL);
    const lockStamp = lockEv?.at || existing.createdAt;
    const lockAgeMs = lockStamp
      ? Date.now() - new Date(lockStamp).getTime()
      : 0;
    if (Number.isFinite(lockAgeMs) && lockAgeMs > 0 && lockAgeMs < 45 * 60_000) {
      return;
    }
  } else {
    events.push(
      historyEvent({
        type: "info",
        stage: "manuskript",
        summary: "Verbessern · Worker gestartet",
        detail: JOB_LOCK_DETAIL,
      }),
    );
  }

  events.push(
    historyEvent({
      type: "info",
      stage: "manuskript",
      summary: "Verbessern · Batch vorbereiten …",
      detail: LIVE_PROGRESS,
    }),
  );

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
      let editorial = roman.editorial ?? emptyRomanEditorial();
      let baseline = (editorial.manuskriptText ?? "").trim();
      if (!hasFilledManuskript(baseline)) {
        throw new Error("Zuerst ein Manuskript anlegen.");
      }

      let chapters = parsePlotChapters(baseline).filter((c) => c.body.trim());
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
        roman = await upsertRomanEditorial(roman, {
          ...editorial,
          romanText: liveRomanText,
        });
        editorial = roman.editorial ?? editorial;
      }

      const romanByNumPre = new Map(
        parsePlotChapters(liveRomanText).map((c) => [c.number, c] as const),
      );
      const alreadyDonePre = chapters.filter((c) =>
        chapterAlreadyPolished(c, romanByNumPre.get(c.number)?.body),
      );
      const hasOpenBatch = events.some((e) =>
        Boolean(e.detail?.startsWith("BATCH_META:")),
      );
      // Craft passes before content-freeze — skip on Opus resume (would desync draft).
      const skipCraftPasses = alreadyDonePre.length > 0 || hasOpenBatch;

      const syncBaselineAfterCraft = async (patchedChapters: number[]) => {
        editorial = roman.editorial ?? editorial;
        baseline = (editorial.manuskriptText ?? "").trim();
        chapters = parsePlotChapters(baseline).filter((c) => c.body.trim());
        liveRomanText = ensureRomanSkeleton(
          chapters,
          editorial.romanText ?? liveRomanText,
        );
        if (patchedChapters.length === 0) return;
        const byDraft = new Map(chapters.map((c) => [c.number, c] as const));
        for (const num of patchedChapters) {
          const draft = byDraft.get(num);
          if (!draft) continue;
          liveRomanText = replaceManuskriptChapterBody(
            liveRomanText,
            plot || baseline,
            num,
            draft.body,
          );
        }
        liveRomanText = normalizeManuskriptDocument(liveRomanText, {
          requiredFromPlot: plot || baseline,
        });
        roman = await upsertRomanEditorial(roman, {
          ...(roman.editorial ?? editorial),
          manuskriptText: baseline,
          romanText: liveRomanText,
        });
        editorial = roman.editorial ?? editorial;
      };

      if (!skipCraftPasses && !seamPayoffAlreadyDone(events)) {
        await reportLiveProgress(
          input.runId,
          events,
          "Verbessern · Seam/Payoff (Nähte & Bögen) …",
        );
        const seam = await runManuskriptSeamPayoffPass({
          roman,
          onProgress: (label) =>
            reportLiveProgress(input.runId, events, label),
        });
        roman = seam.roman;
        await syncBaselineAfterCraft(seam.patchedChapters);
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: seam.summary,
            detail: SEAM_PAYOFF_DONE_DETAIL,
          }),
        );
        if (seam.findings.length > 0) {
          events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              summary: `Seam/Payoff-Befunde · ${seam.findings.length}`,
              detail: seam.findings
                .map(
                  (f) =>
                    `[${f.kind}] Kap. ${f.chapterNumbers.join("+")}: ${f.summary}`,
                )
                .join("\n")
                .slice(0, 2_000),
            }),
          );
        }
      }

      if (!skipCraftPasses && !emotionalConsequenceAlreadyDone(events)) {
        await reportLiveProgress(
          input.runId,
          events,
          "Verbessern · Emotionale Konsequenzen …",
        );
        const emo = await runManuskriptEmotionalConsequencePass({
          roman,
          onProgress: (label) =>
            reportLiveProgress(input.runId, events, label),
        });
        roman = emo.roman;
        await syncBaselineAfterCraft(emo.patchedChapters);
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: emo.summary,
            detail: EMOTIONAL_CONSEQUENCE_DONE_DETAIL,
          }),
        );
        if (emo.findings.length > 0) {
          events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              summary: `Emotion-Befunde · ${emo.findings.length}`,
              detail: emo.findings
                .map(
                  (f) =>
                    `[${f.kind}] Kap. ${f.chapterNumbers.join("+")}: ${f.summary}`,
                )
                .join("\n")
                .slice(0, 2_000),
            }),
          );
        }
      }

      const romanByNum = new Map(
        parsePlotChapters(liveRomanText).map((c) => [c.number, c] as const),
      );
      const alreadyDone = chapters.filter((c) =>
        chapterAlreadyPolished(c, romanByNum.get(c.number)?.body),
      );
      const pendingChapters = chapters.filter(
        (c) => !chapterAlreadyPolished(c, romanByNum.get(c.number)?.body),
      );
      if (alreadyDone.length > 0) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Resume · ${alreadyDone.length} Kap. bereits poliert (übersprungen)`,
            detail: `Kap. ${alreadyDone.map((c) => c.number).join(", ")}`,
          }),
        );
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
      const slimCanon = buildRomanSlimCanon({
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
      const systemInstruction = verbessernSystemInstruction(rolle.systemPrompt);
      const reasoningEffort = resolveReasoningEffort(
        model.modelSlug,
        rolle.reasoningEffort || "medium",
      );

      /** Wave 1 = Stilanker-Kapitel (längste unter den ersten vier), not blind 1–2. */
      const wave1Anchors = selectStyleAnchorChapters(chapters);
      const wave1Nums = new Set(
        (wave1Anchors.length > 0
          ? wave1Anchors
          : chapters.slice(0, WAVE1_CHAPTER_COUNT)
        ).map((c) => c.number),
      );
      const pendingSet = new Set(pendingChapters.map((c) => c.number));
      const wave1 = chapters.filter(
        (c) => wave1Nums.has(c.number) && pendingSet.has(c.number),
      );
      const wave2 = chapters.filter(
        (c) => !wave1Nums.has(c.number) && pendingSet.has(c.number),
      );
      const allFailed: string[] = [];
      const allPatched: number[] = alreadyDone.map((c) => c.number);
      const batchIds: string[] = [];
      let batchUsageAcc: AiTokenUsage | undefined;

      const runWave = async (
        waveChapters: PlotChapter[],
        waveLabel: string,
        preferredAnchor: PlotChapter[] | undefined,
      ) => {
        if (waveChapters.length === 0) return;

        const verbessernExtras = buildVerbessernCacheableExtras({
          roman,
          editorial,
          manuskriptChapters: chapters,
          preferredAnchorChapters: preferredAnchor,
        });
        const cacheablePrefix = `${slimCanon}\n\n${verbessernExtras}`.trim();
        const romanChapters = parsePlotChapters(liveRomanText);

        await reportLiveProgress(
          input.runId,
          events,
          `Verbessern · ${waveLabel}: ${waveChapters.length} Pakete …`,
        );

        const resumable = findResumableBatch(events, waveLabel);
        const resumeNums = new Set(resumable?.chapters ?? []);
        const canResume =
          Boolean(resumable) &&
          waveChapters.every((c) => resumeNums.has(c.number)) &&
          resumeNums.size === waveChapters.length;

        let finishedBatchId = resumable?.batchId ?? "";
        let results: Awaited<
          ReturnType<typeof fetchClaudeMessageBatchResults>
        >["results"] = [];

        if (canResume && resumable) {
          events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              summary: `${waveLabel}: Batch fortsetzen · ${resumable.batchId}`,
            }),
          );
          await reportLiveProgress(
            input.runId,
            events,
            `${waveLabel}: wartend auf Batch ${resumable.batchId} …`,
          );
          const finished = await waitForClaudeMessageBatch({
            batchId: resumable.batchId,
            timeoutMs: 50 * 60_000,
            pollIntervalMs: 20_000,
            onProgress: async (batch) => {
              await assertVerbessernRunStillActive(input.romanId, input.runId);
              await reportLiveProgress(
                input.runId,
                events,
                `${waveLabel}: ${formatClaudeBatchProgress(batch, waveChapters.length)}`,
              );
            },
          });
          finishedBatchId = finished.id;
          const fetched = await withRetries("Batch-Ergebnisse", () =>
            fetchClaudeMessageBatchResults(finished),
          );
          results = fetched.results;
          if (fetched.usage) {
            batchUsageAcc = batchUsageAcc
              ? sumAiUsages([batchUsageAcc, fetched.usage])
              : fetched.usage;
          }
        } else {
          const batchRequests = await buildVerbessernBatchRequests({
            waveChapters,
            manuskriptChapters: chapters,
            romanChapters,
            cacheablePrefix,
            systemInstruction,
            modelSlug: model.modelSlug,
            reasoningEffort,
            autorBias,
            liveStructured,
            liveStoryState,
            liveGraph,
          });

          await reportLiveProgress(
            input.runId,
            events,
            `Verbessern · ${waveLabel}: Claude Batch (${waveChapters.length} Kap.) …`,
          );

          const submitted = await withRetries("Claude Batch anlegen", () =>
            createClaudeMessageBatch(batchRequests),
          );
          finishedBatchId = submitted.id;
          batchIds.push(submitted.id);
          events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              roleKey: "autor",
              modelLabel: model.label || model.modelSlug,
              summary: `${waveLabel} gestartet · ${submitted.id}`,
              detail: formatBatchMeta({
                wave: waveLabel,
                batchId: submitted.id,
                chapters: waveChapters.map((c) => c.number),
              }),
            }),
          );
          try {
            await updatePipelineHistoryRun({
              runId: input.runId,
              status: "running",
              events,
            });
          } catch {
            /* fail-soft */
          }

          const finished = await waitForClaudeMessageBatch({
            batchId: submitted.id,
            timeoutMs: 50 * 60_000,
            pollIntervalMs: 20_000,
            onProgress: async (batch) => {
              await assertVerbessernRunStillActive(input.romanId, input.runId);
              await reportLiveProgress(
                input.runId,
                events,
                `${waveLabel}: ${formatClaudeBatchProgress(batch, waveChapters.length)}`,
              );
            },
          });

          await reportLiveProgress(
            input.runId,
            events,
            `${waveLabel}: Ergebnisse laden / Freeze-QA …`,
          );

          const fetched = await withRetries("Batch-Ergebnisse", () =>
            fetchClaudeMessageBatchResults(finished),
          );
          results = fetched.results;
          if (fetched.usage) {
            batchUsageAcc = batchUsageAcc
              ? sumAiUsages([batchUsageAcc, fetched.usage])
              : fetched.usage;
          }
        }

        if (finishedBatchId && !batchIds.includes(finishedBatchId)) {
          batchIds.push(finishedBatchId);
        }

        const applied = await applyVerbessernWaveResults({
          waveChapters,
          results,
          liveRomanText,
          roman,
          editorial,
          baseline,
          plot,
          runId: input.runId,
          events,
          patchedSoFar: allPatched.length,
          totalChapters: chapters.length,
          repair: {
            systemInstruction,
            cacheablePrefix,
            modelSlug: model.modelSlug,
            reasoningEffort,
          },
        });
        liveRomanText = applied.liveRomanText;
        roman = applied.roman;
        allPatched.push(...applied.patched);
        allFailed.push(...applied.failed);
      };

      const runWaveSafe = async (
        waveChapters: PlotChapter[],
        waveLabel: string,
        preferredAnchor: PlotChapter[] | undefined,
      ) => {
        try {
          await runWave(waveChapters, waveLabel, preferredAnchor);
        } catch (waveErr) {
          if (waveErr instanceof VerbessernAbortedError) throw waveErr;
          const msg =
            waveErr instanceof Error
              ? waveErr.message
              : `${waveLabel} fehlgeschlagen`;
          allFailed.push(`${waveLabel}: ${msg}`);
          events.push(
            historyEvent({
              type: "error",
              stage: "manuskript",
              summary: `${waveLabel} abgebrochen — ${msg.slice(0, 240)}`,
            }),
          );
          await reportLiveProgress(
            input.runId,
            events,
            `${waveLabel}: Fehler — fahre fort …`,
          );
        }
      };

      // Wave 1: polish Stilanker chapters first (voice lock for the book).
      await runWaveSafe(
        wave1,
        "Welle 1",
        wave1Anchors.length ? wave1Anchors : undefined,
      );

      // Prefer polished Wave-1 chapters as Stilanker for the rest of the book.
      const polishedAnchors = selectStyleAnchorChapters(
        chapters,
        parsePlotChapters(liveRomanText).filter((c) =>
          wave1Nums.has(c.number) && c.body.trim().length >= 80,
        ),
      );

      await runWaveSafe(
        wave2,
        "Welle 2",
        polishedAnchors.length ? polishedAnchors : undefined,
      );

      const romanFilled = parsePlotChapters(liveRomanText).filter(
        (c) => c.body.trim().length >= 40,
      ).length;
      const newlyPatched = allPatched.filter(
        (n) => !alreadyDone.some((c) => c.number === n),
      );
      if (newlyPatched.length === 0 && alreadyDone.length === 0 && romanFilled === 0) {
        throw new Error(
          "Autor hat keine Roman-Kapitel geliefert — Verbessern ohne Wirkung. Bitte erneut versuchen." +
            (allFailed.length
              ? ` (${allFailed.slice(0, 3).join("; ")})`
              : ""),
        );
      }

      // Soft book-wide voice audit (warnings only) — never abort the job.
      try {
        await reportLiveProgress(
          input.runId,
          events,
          "Verbessern · Stimmen-Check …",
        );
        const styleAnchor = buildCrossChapterStyleAnchor(
          chapters,
          polishedAnchors.length ? polishedAnchors : undefined,
        );
        const voiceFindings = await checkRomanBookVoice({
          romanChapters: parsePlotChapters(liveRomanText),
          styleAnchor,
        });
        for (const f of voiceFindings) {
          events.push(
            historyEvent({
              type: "info",
              stage: "manuskript",
              summary: `Stimmen-Hinweis Kap. ${f.chapterNumber}`,
              detail: f.message,
            }),
          );
        }
      } catch (voiceErr) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Stimmen-Check übersprungen: ${
              voiceErr instanceof Error
                ? voiceErr.message
                : "Prüfung fehlgeschlagen"
            }`,
          }),
        );
      }

      // Auto Reifegrad on romanText — fail-soft.
      await reportLiveProgress(
        input.runId,
        events,
        "Verbessern · Roman-Reifegrad messen …",
      );
      try {
        const { score } = await assessStageReifegrad({
          roman,
          stage: "roman",
          focusChapterNumbers: allPatched.slice(0, 8),
          previous: roman.editorial?.reifegrade?.roman ?? null,
          changeSummary: `Stil-Pass (Opus Batch) · Kap. ${allPatched.join(", ")}`,
        });
        const edScored = editorialWithReifegrad(
          roman.editorial ?? editorial,
          "roman",
          score,
        );
        roman = await upsertRomanEditorial(roman, {
          ...edScored,
          manuskriptText: baseline,
          romanText: liveRomanText,
        });
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Roman-Reifegrad ${score.gesamtPct}% · Logik ${score.regelnPct}% · ${formatCraftScoresLineForAssessKey("roman", score)}`,
          }),
        );
      } catch (assessErr) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Roman-Reifegrad übersprungen: ${
              assessErr instanceof Error
                ? assessErr.message
                : "Bewertung fehlgeschlagen"
            }`,
          }),
        );
      }

      return {
        roman,
        patched: [...new Set(allPatched)].sort((a, b) => a - b),
        failed: allFailed,
        batchId: batchIds.join(" + ") || "—",
        batchUsage: batchUsageAcc,
        modelLabel: model.label || model.modelSlug,
        skipped: alreadyDone.map((c) => c.number),
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
    const skipNote =
      result.skipped.length > 0
        ? ` · ${result.skipped.length} Kap. Resume übersprungen`
        : "";
    events.push(
      historyEvent({
        type: "apply",
        stage: "manuskript",
        roleKey: "autor",
        modelLabel: result.modelLabel,
        summary: `Roman verbessert (Claude Batch · ${result.patched.length} Kapitel)${failNote}${skipNote}`,
        detail: `Batch ${result.batchId} · Kap. ${result.patched.join(", ")}${
          result.skipped.length
            ? `\nResume: ${result.skipped.join(", ")}`
            : ""
        }${
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
        summary: `Roman Verbessern fertig · ${result.patched.length} Kapitel${
          result.failed.length ? ` · ${result.failed.length} Hinweise` : ""
        }`,
      }),
    );
    await updatePipelineHistoryRun({
      runId: input.runId,
      status: "ok",
      events,
    });
    revalidateRomanAdmin(input.romanId);
  } catch (error) {
    if (error instanceof VerbessernAbortedError) {
      revalidateRomanAdmin(input.romanId);
      return;
    }
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
    const reifegrade = { ...(editorial.reifegrade ?? {}) };
    delete reifegrade.roman;
    const nextEd = {
      ...editorial,
      romanText: sealed,
      reifegrade,
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
