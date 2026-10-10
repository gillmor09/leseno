/**
 * Roman „Verbessern“ (Lesefluss-Feinschliff): chapter-wise — content frozen.
 * Source = `editorial.manuskriptText` (draft, untouched). Target = `editorial.romanText`.
 * KI-Rolle `autor` (GPT-6 Luna) via `generateText` (per chapter).
 * Each finished chapter is persisted to `romanText` immediately.
 *
 * Flow: `startManuskriptVerbessern` → `runManuskriptVerbessernJob` (API `after`).
 */

import { generateText } from "@/lib/ai/provider";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import { runWithAiUsageCollector } from "@/lib/ai/usage-collector";
import { resolveRomanSchreibModel } from "@/lib/roman/model";
import {
  emptyRomanEditorial,
  formatFactContractsForChapter,
  isRomanKapitelFertig,
  withRomanKapitelFertig,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  getPipelineHistoryRun,
  historyEvent,
  listPipelineHistory,
  startPipelineHistoryRun,
  updatePipelineHistoryRun,
  type PipelineHistoryEvent,
} from "@/lib/roman/pipeline/history";
import {
  ROMAN_EXCELLENCE_MANDATE,
  ROMAN_STIL_PASS_MAX_TOKENS,
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
  buildStilPassChapterContext,
  buildVerbessernRunCachePrefix,
  buildWaveVoiceLockAddendum,
  selectStyleAnchorChapters,
  stabilizeCacheText,
  STIL_PASS_NEXT_HEAD_CHARS,
  STIL_PASS_PREV_TAIL_CHARS,
} from "@/lib/roman/roman-verbessern-context";
import {
  assertRomanChapterContentFrozen,
  isSoftOnlyFreezeNoise,
  shouldSoftRepairFreezeReasons,
} from "@/lib/roman/roman-verbessern-freeze-qa";
import { assertManuskriptReadyForRoman } from "@/lib/roman/roman-verbessern-preflight";
import { checkRomanBookVoice } from "@/lib/roman/roman-verbessern-voice-check";
import { EMOTIONAL_CONSEQUENCE_DONE_DETAIL } from "@/lib/roman/manuskript-emotional-consequence";
import { SEAM_PAYOFF_DONE_DETAIL } from "@/lib/roman/manuskript-seam-payoff";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import type { RomanKontext } from "@/lib/roman/types";
import { buildWeaveSystemAddendum } from "@/lib/roman/weave-comment";
import { revalidateRomanAdmin } from "@/lib/roman/revalidate-admin";

/** Shared patch brief — classic Feinschliff (Lesefluss + Orthografie/Grammatik), content locked. */
export const MANUSKRIPT_VERBESSERN_BRIEF = `ARBEITSAUFTRAG — Verbessern (klassischer Feinschliff):
Nur Sprache und Form DIESES Kapitels — Lesefluss, Rechtschreibung, Grammatik. Sonst nichts.

ERLAUBT:
- klarere, geschmeidigere Sätze; Stolperstellen und Schachtelsätze glätten
- Rechtschreibfehler korrigieren (Orthografie, Getrennt-/Zusammenschreibung, Groß-/Kleinschreibung)
- grammatikalische Korrektheit prüfen und richten (Rektion, Kasus, Kongruenz, Tempus, Zeichensetzung)
- leichte Wortwahl-Korrekturen, wenn sie den Fluss verbessern (Bedeutung gleich)
- Dialoge sprachlich glätten — gleiche Aussage, gleicher Inhalt

STRENG VERBOTEN:
- keine neue Handlung, keine neuen Beats, Entschlüsse oder Infos
- keine Figuren, Orte, Gegenstände, Zeitlinien oder Fakten ändern/erfinden/streichen
- keine Szenen umordnen, weglassen, kürzen oder hinzufügen
- keine „sinnliche Schärfung“ oder Subtext-Erfindung, die Inhalt verändert
- keine Geheimnisse verraten, die im Entwurf noch gehalten sind
- keine Kapitelüberschrift ändern; keine Meta-Kommentare

Schreibe den VOLLSTÄNDIGEN Kapitel-Body neu — gleiche Ereignisse in derselben Reihenfolge, annähernd gleiche Länge, nur sprachlich sauberer und flüssiger. Nicht abschneiden.`;

const LIVE_PROGRESS = "live-progress";
const CUSTOM_ID_PREFIX = "kap-";
/** Wave 1 establishes polished voice; Wave 2 uses it as Stilanker + prev. */
const WAVE1_CHAPTER_COUNT = 2;
/** Full chapter body for stil-pass (must not truncate mid-prose for typical caps). */
const STIL_PASS_BODY_CHARS = 48_000;
/** Prevents double `after()` workers on the same runId. */
const JOB_LOCK_DETAIL = "verbessern-job-lock";
/** Re-attach to this run instead of spawning a second worker. */
const ACTIVE_VERBESSERN_MS = 90 * 60_000;
/**
 * Only re-attach when the worker still looks alive (live-progress / lock).
 * Older zombies were falsely finished by the Erzeugen-Watchdog — then a
 * re-kick looked like „Verbessern sofort fertig“ without new history.
 */
const VERBESSERN_LIVE_MS = 5 * 60_000;

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

/**
 * True when Roman chapter is fertig (Autor accepted) or body already differs
 * from Manuskript — skip on resume (abort mid-book / re-kick).
 */
function chapterAlreadyPolished(
  draft: PlotChapter,
  romanBody: string | undefined,
  editorial?: RomanEditorial | null,
): boolean {
  if (isRomanKapitelFertig(editorial, draft.number)) return true;
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
  return stabilizeCacheText(`${rolleSystemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${buildWeaveSystemAddendum({
  kind: "manuskript",
  outputFormatHint:
    "Nur den Kapitel-BODY ohne Überschrift. Die Heading-Zeile setzt der Server.",
})}

Du erhältst GENAU ein Kapitel. Ändere den Body laut Patch-Brief — klassischer Feinschliff.
${MANUSKRIPT_CHAPTER_PROSE_RULES}
Buchdruck: Überschriften setzt das System (ohne Rauten). Erzähle als echte Prosa — keine Streich-/Meta-Notizen.
Feinschliff: gleiche Beats/Fakten/Dialogbedeutung/Länge — Lesefluss glätten; Rechtschreibung und Grammatik korrigieren.
Stimme: Cross-Chapter-Stilanker + Tonalität + Regeln aus dem Cache-Prefix sind verbindlich — Register angleichen, Inhalt nicht ändern.
Gib NUR den vollständigen neuen Body zurück — keine Kapitel-Überschrift („Kapitel N — …“), kein JSON.`);
}

/**
 * Build stil-pass user prompt for one chapter.
 * Continuity prefers polished `romanChapters` prev-tail; next head = Manuskript.
 */
function buildVerbessernChapterUserText(input: {
  chapter: PlotChapter;
  manuskriptChapters: PlotChapter[];
  romanChapters: PlotChapter[];
  voiceLockAddendum?: string;
  liveStructured: RomanEditorial["szenenplotStructured"];
}): string {
  const ch = input.chapter;
  const heading = formatManuskriptChapterHeading({
    number: ch.number,
    title: ch.title,
    body: "",
  });
  const prevRoman = input.romanChapters.find((c) => c.number === ch.number - 1);
  const prevMs = input.manuskriptChapters.find(
    (c) => c.number === ch.number - 1,
  );
  const prevBody =
    (prevRoman?.body.trim().length ?? 0) >= 40
      ? prevRoman!.body
      : (prevMs?.body ?? "");
  const previousTail = prevBody.trim().slice(-STIL_PASS_PREV_TAIL_CHARS);

  const nextMs = input.manuskriptChapters.find(
    (c) => c.number === ch.number + 1,
  );
  const nextHead = nextMs?.body.trim().slice(0, STIL_PASS_NEXT_HEAD_CHARS) ?? "";

  const slimContext = buildStilPassChapterContext({
    previousTail,
    structured: input.liveStructured,
    chapterNumber: ch.number,
  });

  const nextBlock = nextHead
    ? `\n# Nächstes Kapitel (Kopf — Seam halten, nicht vorwegnehmen)
${nextHead}\n`
    : "";

  const voiceLock = input.voiceLockAddendum?.trim()
    ? `\n${input.voiceLockAddendum.trim()}\n`
    : "";

  return `# Patch-Brief (verbindlich)
${MANUSKRIPT_VERBESSERN_BRIEF}
${voiceLock}
${slimContext}
${nextBlock}
# Kapitel (Meta unveränderlich)
${heading}

# Bisheriger Body (Inhalt eingefroren — Feinschliff)
${ch.body.slice(0, STIL_PASS_BODY_CHARS)}

Schreibe den vollständigen neuen Body (nicht kürzen, nicht abschneiden).
HARTE ERFOLGSKRITERIEN:
- Flüssigerer Lesefluss + korrekte Rechtschreibung/Grammatik bei IDENTISCHEM Inhalt — keine neuen Beats, keine Szenenverluste.
- Stimme wie Stilanker + Tonalität im Cache-Prefix.
- Keine Meta-Sätze. Nur erzählende Prosa. Nur DIESES Kapitel.`;
}

type VerbessernChapterResult = {
  customId: string;
  type: "succeeded" | "errored" | "expired" | "canceled";
  text?: string;
  error?: string;
};

type ApplyWaveResult = {
  liveRomanText: string;
  roman: RomanKontext;
  patched: number[];
  failed: string[];
};

/**
 * One sync retry: keep stil gains, undo content drift named in Freeze-QA.
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
Der Lesefluss-Pass hat Inhaltsfehler. Behalte den flüssigeren Stil, korrigiere NUR die genannten Freeze-Probleme.
Inhalt muss wieder dem Entwurf entsprechen (gleiche Beats/Fakten/Figuren/Reihenfolge/volle Länge).

# Freeze-Probleme
- ${reasons}

# Entwurf (verbindlicher Inhalt)
${input.chapter.body.slice(0, STIL_PASS_BODY_CHARS)}

# Fehlgeschlagener Polish (Lesefluss ok, Inhalt falsch — als Ausgangspunkt)
${input.failedPolish.slice(0, STIL_PASS_BODY_CHARS)}

# Kapitel (Meta)
${heading}

Schreibe den vollständigen korrigierten Body (Lesefluss behalten, Inhalt wie Entwurf, nicht kürzen). Nur Body, keine Überschrift.`,
          maxTokens: ROMAN_STIL_PASS_MAX_TOKENS,
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
 * Apply chapter results with soft Freeze-QA;
 * one soft-repair retry on hard fail, then Manuskript fallback.
 */
async function applyVerbessernWaveResults(input: {
  waveChapters: PlotChapter[];
  results: VerbessernChapterResult[];
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

    if (!hit || hit.type !== "succeeded" || !hit.text?.trim()) {
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
            `Roman · Kap. ${ch.number}: Freeze-QA …`,
          );
          let freeze = await assertRomanChapterContentFrozen({
            draftBody: ch.body,
            polishedBody: body,
            chapterNumber: ch.number,
            structuredChapter: structuredCh,
            factContractsBlock,
            wissensGraph: liveGraph,
          });
          if (
            !freeze.ok &&
            input.repair &&
            shouldSoftRepairFreezeReasons(freeze.reasons)
          ) {
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
                wissensGraph: liveGraph,
              });
              if (freeze.ok) {
                body = repaired;
                accepted = true;
              }
            }
          } else if (freeze.ok || isSoftOnlyFreezeNoise(freeze.reasons)) {
            // Soft Flash nits after draft-delta filters → keep stil-pass polish.
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
      const nextEd = accepted
        ? withRomanKapitelFertig(
            {
              ...edNow,
              manuskriptText: input.baseline,
              romanText: liveRomanText,
            },
            [ch.number],
          )
        : {
            ...edNow,
            manuskriptText: input.baseline,
            romanText: liveRomanText,
          };
      roman = await upsertRomanEditorial(roman, nextEd);
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
      accepted
        ? `Roman · Kap. ${ch.number} fertig (${input.patchedSoFar + patched.length}/${input.totalChapters})`
        : `Roman · Kap. ${ch.number} gespeichert (${input.patchedSoFar + patched.length}/${input.totalChapters})`,
    );
  }

  return { liveRomanText, roman, patched, failed };
}

/**
 * True when a running Verbessern still has recent lock / live-progress
 * (or was just opened and has no worker claim yet).
 */
function verbessernRunLooksLive(
  run: { createdAt: string; events: PipelineHistoryEvent[] },
  nowMs: number = Date.now(),
): boolean {
  let latestClaim = 0;
  for (const e of run.events) {
    if (e.detail !== LIVE_PROGRESS && e.detail !== JOB_LOCK_DETAIL) continue;
    const t = e.at ? Date.parse(e.at) : Number.NaN;
    if (Number.isFinite(t) && t > latestClaim) latestClaim = t;
  }
  if (latestClaim > 0) {
    return nowMs - latestClaim < VERBESSERN_LIVE_MS;
  }
  // Brand-new run (start just wrote first event, kick not yet claimed).
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created < 2 * 60_000;
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

  // Re-attach / abandon: one live Verbessern per book (avoids dual workers).
  const recent = await listPipelineHistory(roman.id, 25);
  const now = Date.now();
  const activeRunning = recent.filter((r) => {
    if (r.trigger !== "manuskript_verbessern" || r.status !== "running") {
      return false;
    }
    const age = now - new Date(r.createdAt).getTime();
    return Number.isFinite(age) && age >= 0 && age < ACTIVE_VERBESSERN_MS;
  });
  const live = activeRunning.find((r) => verbessernRunLooksLive(r, now));
  if (live) {
    return {
      runId: live.id,
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
      summary: `Roman Verbessern · ${chapters.length} Kapitel (Feinschliff · Luna)`,
      detail: MANUSKRIPT_VERBESSERN_BRIEF.slice(0, 2_000),
    }),
  });

  return { runId, originalSaved, chapterCount: chapters.length };
}

/**
 * Background job: Autor/Luna Feinschliff per chapter; write into `romanText`
 * immediately. Idempotent on re-kick: skips ok/error runs and already polished
 * chapters after abort.
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

      // Seam/Payoff + Emotion: Manuskript-Freigabe (Assist), not Opus Verbessern.
      if (!events.some((e) => e.detail === SEAM_PAYOFF_DONE_DETAIL)) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary:
              "Seam/Payoff + Emotion gehören zur Manuskript-Freigabe — hier nur Stil-Pass.",
            detail: SEAM_PAYOFF_DONE_DETAIL,
          }),
        );
      }
      if (!events.some((e) => e.detail === EMOTIONAL_CONSEQUENCE_DONE_DETAIL)) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: "Emotion-Pass: siehe Manuskript „fertig“ (nicht Opus).",
            detail: EMOTIONAL_CONSEQUENCE_DONE_DETAIL,
          }),
        );
      }

      const romanByNum = new Map(
        parsePlotChapters(liveRomanText).map((c) => [c.number, c] as const),
      );
      const alreadyDone = chapters.filter((c) =>
        chapterAlreadyPolished(
          c,
          romanByNum.get(c.number)?.body,
          editorial,
        ),
      );
      const pendingChapters = chapters.filter(
        (c) =>
          !chapterAlreadyPolished(
            c,
            romanByNum.get(c.number)?.body,
            editorial,
          ),
      );
      if (alreadyDone.length > 0) {
        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            summary: `Resume · ${alreadyDone.length} Kap. fertig / poliert (übersprungen)`,
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
      const liveStructured = editorial.szenenplotStructured ?? null;
      const systemInstruction = verbessernSystemInstruction(rolle.systemPrompt);
      const reasoningEffort = resolveReasoningEffort(
        model.modelSlug,
        rolle.reasoningEffort || "low",
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

      // One cache prefix for the whole run (both waves) — Manuskript Stilanker only.
      const cacheablePrefix = buildVerbessernRunCachePrefix({
        slimCanon,
        roman,
        editorial,
        manuskriptChapters: chapters,
      });

      const runWave = async (
        waveChapters: PlotChapter[],
        waveLabel: string,
        voiceLockAddendum: string | undefined,
      ) => {
        if (waveChapters.length === 0) return;

        events.push(
          historyEvent({
            type: "info",
            stage: "manuskript",
            roleKey: "autor",
            modelLabel: model.label || model.modelSlug,
            summary: `${waveLabel} gestartet · ${waveChapters.length} Kap. (Luna)`,
            detail: `Kap. ${waveChapters.map((c) => c.number).join(", ")}`,
          }),
        );

        for (const ch of waveChapters) {
          await assertVerbessernRunStillActive(input.romanId, input.runId);
          const romanChapters = parsePlotChapters(liveRomanText);
          // Mid-wave resume: skip chapters already accepted this run / prior.
          if (
            chapterAlreadyPolished(
              ch,
              romanChapters.find((c) => c.number === ch.number)?.body,
              roman.editorial ?? editorial,
            )
          ) {
            if (!allPatched.includes(ch.number)) {
              allPatched.push(ch.number);
            }
            continue;
          }

          await reportLiveProgress(
            input.runId,
            events,
            `Verbessern · ${waveLabel}: Kap. ${ch.number} …`,
          );

          const userText = buildVerbessernChapterUserText({
            chapter: ch,
            manuskriptChapters: chapters,
            romanChapters,
            voiceLockAddendum,
            liveStructured,
          });

          let result: VerbessernChapterResult;
          try {
            const raw = (
              await withRetries(`Kap. ${ch.number} Lesefluss`, () =>
                generateText({
                  model: {
                    ...model,
                    reasoningEffort,
                  },
                  systemInstruction,
                  cacheablePrefix,
                  userText,
                  maxTokens: ROMAN_STIL_PASS_MAX_TOKENS,
                  timeoutMs: 180_000,
                }),
                2,
              )
            ).trim();
            result = {
              customId: chapterCustomId(ch.number),
              type: "succeeded",
              text: raw,
            };
          } catch (genErr) {
            result = {
              customId: chapterCustomId(ch.number),
              type: "errored",
              error:
                genErr instanceof Error
                  ? genErr.message
                  : "Generate fehlgeschlagen",
            };
          }

          const applied = await applyVerbessernWaveResults({
            waveChapters: [ch],
            results: [result],
            liveRomanText,
            roman,
            editorial: roman.editorial ?? editorial,
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
        }
      };

      const runWaveSafe = async (
        waveChapters: PlotChapter[],
        waveLabel: string,
        voiceLockAddendum: string | undefined,
      ) => {
        try {
          await runWave(waveChapters, waveLabel, voiceLockAddendum);
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

      // Wave 1: polish Stilanker chapters first (same cache prefix as Wave 2).
      await runWaveSafe(wave1, "Welle 1", undefined);

      // Polished Welle-1 voice → uncached userText only (keeps system cache hits).
      const polishedAnchors = selectStyleAnchorChapters(
        chapters,
        parsePlotChapters(liveRomanText).filter(
          (c) => wave1Nums.has(c.number) && c.body.trim().length >= 80,
        ),
      );
      const wave2VoiceLock = polishedAnchors.length
        ? buildWaveVoiceLockAddendum(polishedAnchors)
        : undefined;

      await runWaveSafe(wave2, "Welle 2", wave2VoiceLock);

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
        const styleAnchor = buildCrossChapterStyleAnchor(chapters);
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
          changeSummary: `Feinschliff (Luna) · Kap. ${allPatched.join(", ")}`,
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
        summary: `Roman verbessert (Luna Feinschliff · ${result.patched.length} Kapitel)${failNote}${skipNote}`,
        detail: `Kap. ${result.patched.join(", ")}${
          result.skipped.length
            ? `\nResume: ${result.skipped.join(", ")}`
            : ""
        }${
          result.failed.length
            ? `\nHinweise: ${result.failed.slice(0, 22).join("; ")}`
            : ""
        }`,
        usage,
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
    summary: `Roman verbessert (Luna Feinschliff)${
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
    // 1:1 copy: Manuskript is content-fertig — inherit its score (Roman = prose only).
    // Clear Kapitel-fertig: Autor has not optimized these copies yet.
    const reifegrade = { ...(editorial.reifegrade ?? {}) };
    if (reifegrade.manuskript) {
      reifegrade.roman = {
        ...reifegrade.manuskript,
        assessedAt: new Date().toISOString(),
        modelLabel: `${reifegrade.manuskript.modelLabel || "bewerter"} · 1:1 Manuskript`,
      };
    } else {
      delete reifegrade.roman;
    }
    const nextEd = {
      ...editorial,
      romanText: sealed,
      romanKapitelFertig: null,
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
