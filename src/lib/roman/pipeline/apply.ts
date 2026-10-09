/**
 * Apply router patch briefs to pipeline artifacts (auto, no author comment gate).
 * Manuskript chapter patches (Dim/Verbessern/Leser-Feedback): Co-Autor prose with
 * slim canon + Gemini chapter packet — not the full Spec/Recherche bible.
 * Kapitelgerüst + Szenenplot Verbessern: structured-first JSON patch
 * (`structured-stage-patch.ts`) then markdown remirror — not freeform bodies.
 * Continuity + Wissensgraph updated after. Manuskript craft also light-syncs
 * Szenenplot beats + graph retract (`manuskript-patch-sync.ts`).
 */

import { AI_LONG_PROSE_TIMEOUT_MS } from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import {
  countWords,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  formatWissensGraphForPrompt,
  withExposeText,
  type RomanBuchTyp,
  type RomanStoryState,
  type RomanWissensGraph,
} from "@/lib/roman/editorial";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  hasFrozenSchreibPrompts,
  resolveManuskriptChapterPacket,
} from "@/lib/roman/manuskript-chapter-packet";
import {
  CONTINUITY_PREV_TAIL_CHARS,
  CONTINUITY_PREV_TAIL_CHARS_FROZEN,
  extractManuskriptStoryState,
} from "@/lib/roman/manuskript-continuity";
import {
  formatPatchPriorityBanner,
  retractWissensGraphAfterPatch,
  syncAfterManuskriptCraftPatch,
} from "@/lib/roman/manuskript-patch-sync";
import {
  patchKapitelGeruestStructured,
  patchSzenenplotStructured,
} from "@/lib/roman/structured-stage-patch";
import {
  structuredKapitelGeruestToMarkdown,
  structuredSzenenplotToMarkdown,
} from "@/lib/roman/szenenplot-structured";
import {
  MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS,
  MANUSKRIPT_PATCH_WORD_FLOOR_PCT,
  manuskriptBookNearOrOverTarget,
  manuskriptChapterWordCount,
  manuskriptNeedsPromptBlock,
  manuskriptWordsPerChapter,
} from "@/lib/roman/manuskript-contracts";
import { buildRomanSlimCanon } from "@/lib/roman/prompt-prefix";
import {
  assertChapterStructure,
  patchChapterBodies,
} from "@/lib/roman/pipeline/structure-guard";
import type { RouteTarget } from "@/lib/roman/pipeline/critique-schema";
import {
  closeWissensGraphGaps,
  growWissensGraphFromChapterBodies,
} from "@/lib/roman/wissens-graph";
import {
  CLIP,
  ROMAN_EXCELLENCE_MANDATE,
  ROMAN_PROSE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import { invalidateDownstreamEditorial } from "@/lib/roman/pipeline/cascade";
import {
  isGeruestStage,
  isPlotStage,
  type PipelineStage,
} from "@/lib/roman/pipeline/stages";
import { resolvePipelineTask } from "@/lib/roman/pipeline/tasks";
import {
  MANUSKRIPT_CHAPTER_PROSE_RULES,
  assertRealManuskriptProse,
  formatChapterHeading,
  formatManuskriptChapterHeading,
  missingManuskriptChapterNumbers,
  normalizeManuskriptDocument,
  parsePlotChapters,
} from "@/lib/roman/plot-chapters";
import { upsertRomanKontext } from "@/lib/roman/repository";
import { weaveIdeeKurzFromCoAutorKritik } from "@/lib/roman/idea-qa";
import { refineCharaktere } from "@/lib/roman/suggest-charaktere";
import { weaveExposeFromLektorKritik } from "@/lib/roman/suggest-expose";
import { weaveWeltFromKritik } from "@/lib/roman/suggest-welt";
import type { RomanKontext } from "@/lib/roman/types";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import { buildWeaveSystemAddendum } from "@/lib/roman/weave-comment";

/** Max chapters patched in one apply (beat-sheet / manuskript upper bound). */
const MAX_CHAPTER_PATCHES = 24;

/** Default local craft patch when no chapter list is given. */
const DEFAULT_LOCAL_CHAPTER_PATCHES = 3;

/**
 * Detect Leser-Feedback einarbeiten (must not soft-skip; allow weave despite Ziel).
 */
export function isLeserFeedbackChapterPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return /leser-feedback|testleser-vorschlag|feedback einarbeiten/.test(blob);
}

/**
 * Detect Manuskript „Vereinfachen“ (register only — allow shortening).
 */
export function isManuskriptSimplifyPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return /vereinfachen|register-pass|sprachniveau/.test(blob);
}

/**
 * Detect Manuskript „Verbessern“ (style elevate — content frozen, Autor/Opus).
 */
export function isManuskriptVerbessernPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return (
    /manuskript verbessern|stil-pass|prosa-qualität|inhalt eingefroren/.test(
      blob,
    ) || /auftrag — verbessern \(stil-pass\)/.test(blob)
  );
}

/**
 * Detect Reifegrad-Dimension „Lesefluss“ einarbeiten.
 * Pacing/Klarheit often shortens chapters — must not hit the 95% floor revert.
 */
export function isLeseflussChapterPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return (
    /fokussierte nacharbeit:\s*lesefluss/.test(blob) ||
    /reifegrad-dimension\s*[„"']?lesefluss/.test(blob) ||
    /arbeitsauftrag\s*[—–-]\s*reifegrad-dimension\s*[„"']lesefluss/.test(blob)
  );
}

/**
 * Detect Reifegrad-Dimension / Verbessern einarbeiten.
 * Often deletes Duplikate — must not hit the 95% floor revert.
 */
export function isReifegradImproveChapterPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return (
    /fokussierte nacharbeit/.test(blob) ||
    /reifegrad-dimension/.test(blob) ||
    /arbeitsauftrag\s*[—–-]\s*reifegrad-dimension/.test(blob) ||
    /verbessern\s*[·•]/.test(blob) ||
    /verbessern einarbeiten/.test(blob)
  );
}

/**
 * Patch brief asks to delete / dedupe / trim — shortening is the success criterion.
 */
export function isShortenIntentPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return /duplikat|doppelung|doppelt|redundan|wiederhol|streich|bereinigen|entfernen|kürz|straffen|verdichten|überlapp|nochmals\s+(dieselbe|die\s+gleiche)|zweite\s+zustellung|doppelt\s+erzähl/.test(
    blob,
  );
}

/** Feedback / stage Verbessern apply — allow modest growth like Leser-Feedback. */
export function isCanonLogicChapterPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();
  return /logik-pass|canon-zeitschiene|arbeitsauftrag — logik-pass/.test(blob);
}

/**
 * Detect explicit Bedürfnis-repair passes (sample chapters book-wide).
 * Do NOT match craft reminders or Leser-Feedback-Einarbeiten.
 */
export function isNeedsFocusedChapterPatch(input: {
  patchBrief: string;
  reason?: string;
  critiqueText?: string;
}): boolean {
  if (
    isLeserFeedbackChapterPatch(input) ||
    isManuskriptSimplifyPatch(input) ||
    isLeseflussChapterPatch(input)
  ) {
    return false;
  }

  const blob = [
    input.reason ?? "",
    input.critiqueText ?? "",
    input.patchBrief,
  ]
    .join("\n")
    .toLowerCase();

  // Explicit contract / repair titles first.
  if (
    /bed(?:ü|ue)rfnis-contract|bed(?:ü|ue)rfnis-pass|notfall-bed(?:ü|ue)rfnis|bed(?:ü|ue)rfnis-nacharbeit|bed(?:ü|ue)rfnis-stichprobe/.test(
      blob,
    )
  ) {
    return true;
  }
  // Finding-style: „vernachlässigtes Bedürfnis … erfüllen“ as the patch goal.
  if (
    /vernachl[aä]ssig(?:tes)?\s+leserbed|vernachl[aä]ssig(?:tes)?\s+bed(?:ü|ue)rfnis/.test(
      blob,
    ) &&
    /erf[uü]llen|sichtbar|ein(?:schreib|arbeit)|beleg/.test(blob)
  ) {
    return true;
  }
  return false;
}

/** Evenly sample chapter numbers across the book (always includes first + last). */
export function sampleChapterNumbers(
  chapterNumbers: number[],
  max: number,
): number[] {
  const available = [...new Set(chapterNumbers)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (available.length <= max) return available;
  if (max <= 1) return available.slice(0, 1);
  const picked = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i * (available.length - 1)) / (max - 1));
    picked.add(available[idx]!);
  }
  return [...picked].sort((a, b) => a - b);
}

/**
 * Resolve which chapter numbers to patch.
 * Bedürfnis → evenly sampled (≤ NEEDS_PASS_MAX); otherwise lektor list or first 3.
 */
export function resolveChapterPatchNumbers(input: {
  chapterNumbers: number[];
  requested?: number[];
  needsFocused: boolean;
}): number[] {
  const available = [...new Set(input.chapterNumbers)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
    .slice(0, MAX_CHAPTER_PATCHES);
  if (available.length === 0) return [];

  if (input.needsFocused) {
    const availableSet = new Set(available);
    const requested = (input.requested ?? []).filter((n) => availableSet.has(n));
    if (requested.length > 0) {
      return [...new Set(requested)]
        .sort((a, b) => a - b)
        .slice(0, MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS);
    }
    return sampleChapterNumbers(
      available,
      MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS,
    );
  }

  const availableSet = new Set(available);
  const requested = (input.requested ?? []).filter((n) => availableSet.has(n));
  if (requested.length > 0) {
    return [...new Set(requested)]
      .sort((a, b) => a - b)
      .slice(0, MAX_CHAPTER_PATCHES);
  }

  return available.slice(
    0,
    Math.min(DEFAULT_LOCAL_CHAPTER_PATCHES, available.length),
  );
}
async function persistRoman(
  roman: RomanKontext,
  patch: Partial<{
    manuskriptRaw: string;
    charaktere: RomanKontext["charaktere"];
    weltSchauplaetze: string;
    weltRegeln: string;
    editorial: RomanKontext["editorial"];
  }>,
): Promise<RomanKontext> {
  const editorial = patch.editorial ?? roman.editorial ?? emptyRomanEditorial();
  const saved = await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: patch.manuskriptRaw ?? roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: patch.charaktere ?? roman.charaktere,
    weltSchauplaetze: patch.weltSchauplaetze ?? roman.weltSchauplaetze,
    weltRegeln: patch.weltRegeln ?? roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial,
  });
  return { ...saved, ideenChat: roman.ideenChat };
}

/**
 * Patch one chapter body via draft role; preserve heading from baseline.
 * Manuskript prose (Sonnet): slim canon + chapter packet — not full Spec dump.
 */
type ChapterDocStage =
  | "kapitelgeruest"
  | "grobgeruest"
  | "feingeruest"
  | "szenenplot"
  | "grobplot"
  | "feinplot"
  | "manuskript";

async function patchOneChapterBody(input: {
  stage: ChapterDocStage;
  chapterNumber: number;
  title: string;
  body: string;
  patchBrief: string;
  context: string;
  /** Slim canon for prompt-caching (not full Spec/Recherche). */
  cacheablePrefix?: string;
  /** Manuskript: refuse patches shorter than this. */
  wordFloor?: number;
  /** Manuskript: prefer not to exceed this (overshoot guard). */
  wordCeiling?: number;
  /** When true, never expand — prefer trim toward Ziel. */
  preferTighten?: boolean;
  /**
   * Leser-Feedback may delete Duplikate / Übergangs-Wiederholungen.
   * Keep visibly changed shorter bodies instead of silently reverting.
   */
  allowSubstantialShorten?: boolean;
  needsBlock?: string;
  /**
   * Gemini chapter packet (preferred for Manuskript Sonnet patches).
   * When set, skips dumping full context/bible into userText.
   */
  chapterPacket?: string;
  /** Legacy continuity buffer if no chapterPacket. */
  continuityBuffer?: string;
  /** Override writer role (e.g. `autor` for Manuskript Verbessern). */
  applyRoleKey?: string;
}): Promise<string> {
  const taskKey =
    input.stage === "kapitelgeruest" ||
    input.stage === "grobgeruest" ||
    input.stage === "feingeruest"
      ? "feingeruest.draft"
      : input.stage === "szenenplot" ||
          input.stage === "grobplot" ||
          input.stage === "feinplot"
        ? "feinplot.draft"
        : "manuskript.draft";
  const { resolveRomanKiRolle } = await import("@/lib/roman/roles");
  const resolved = input.applyRoleKey?.trim()
    ? await resolveRomanKiRolle(input.applyRoleKey.trim(), {
        allowProseModel: true,
      })
    : await resolvePipelineTask(taskKey);
  const rolle = resolved.rolle;
  const model = resolved.model;
  const heading =
    input.stage === "manuskript"
      ? formatManuskriptChapterHeading({
          number: input.chapterNumber,
          title: input.title,
          body: "",
        })
      : formatChapterHeading({
          number: input.chapterNumber,
          title: input.title,
          body: "",
        });
  const styleOnly =
    input.stage === "manuskript" &&
    isManuskriptVerbessernPatch({
      patchBrief: input.patchBrief,
    });
  const noHeadingHint =
    input.stage === "manuskript"
      ? "Gib NUR den neuen Body zurück — keine Kapitel-Überschrift („Kapitel N — …“), kein JSON."
      : "Gib NUR den neuen Body zurück — keine ## Kapitel-Zeile, kein JSON.";
  const structureHint =
    input.stage === "kapitelgeruest" ||
    input.stage === "grobgeruest" ||
    input.stage === "feingeruest"
      ? "Kapitelgerüst-Body: Kernsatz + Inhaltsskizze (1–3 Absätze), ggf. Props/Events/Threads — KEINE Einzelszenen (### Szene …)."
      : input.stage === "szenenplot" ||
          input.stage === "grobplot" ||
          input.stage === "feinplot"
        ? "Behalte oder stelle die Szenengliederung her: ### Szene N.M — Kurztitel mit Stichpunkten darunter (Ziel, Hindernis, Wendepunkt, Schreibprompt)."
        : "";
  const baselineWords = manuskriptChapterWordCount(input.body);
  const floor =
    input.wordFloor ??
    Math.max(1, Math.floor(baselineWords * MANUSKRIPT_PATCH_WORD_FLOOR_PCT));
  const ceiling = input.wordCeiling;
  const needs =
    input.stage === "manuskript" && input.needsBlock?.trim()
      ? `\n${input.needsBlock.trim()}\n`
      : "";
  const packet = input.chapterPacket?.trim() ?? "";
  const continuity = !packet && input.continuityBuffer?.trim()
    ? `\n# Context-Buffer (Continuity + Fokus)\n${input.continuityBuffer.trim().slice(0, 4_500)}\n`
    : "";
  const packetBlock = packet
    ? `\n# Kapitel-Paket (Continuity/Beats/Props — UNTER dem Patch-Brief)\n${packet.slice(0, 5_500)}\n`
    : "";
  const lengthRule =
    input.stage === "manuskript"
      ? input.preferTighten
        ? `\nLÄNGEN-CONTRACT: Buch ist schon am/über Ziel. Inhaltlich ändern laut Patch-Brief; höchstens leicht verdichten. Nicht aufblasen — Zielband bis ca. ${ceiling ?? baselineWords} Wörter (Baseline ${baselineWords}). Fertiger Body mind. ${floor} Wörter.`
        : input.allowSubstantialShorten
          ? `\nLÄNGEN-CONTRACT: Baseline ${baselineWords} Wörter. Patch-Brief hat Vorrang — Duplikate/Wiederholungen streichen ist erwünscht. Fertiger Body MUSS mind. ${floor} Wörter haben: gestrichene Doppelungen NICHT zurückholen; wo nötig woanders erweitern (Dialog, Sinneseindruck, Innenleben, klarer Beat). Soft-Untergrenze ohne Expand wäre zu kurz — ziele auf ≥${floor}.`
          : `\nLÄNGEN-CONTRACT: Zielband ${floor}–${ceiling ?? Math.round(floor * 1.25)} Wörter (Baseline ${baselineWords}). Nicht sinnlos aufblähen.`
      : "";
  const patchOverPacket =
    input.stage === "manuskript" && packet
      ? `\nPRIORITÄT: Patch-Brief > Kapitel-Paket. Was der Brief streicht/ersetzt, gilt — auch wenn Beats/Arc-/Fakten-Verträge im Paket es noch fordern. Gestrichene Motive nicht erneut einführen.`
      : "";

  async function generateOnce(extraHint: string): Promise<string> {
    const contextBlock = packet
      ? ""
      : `\n# Kontext\n${input.context.slice(0, CLIP.sharedContext)}\n`;
    const raw = await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${buildWeaveSystemAddendum({
  kind:
    input.stage === "kapitelgeruest" ||
    input.stage === "grobgeruest" ||
    input.stage === "feingeruest"
      ? "kapitelgeruest"
      : input.stage === "szenenplot" ||
          input.stage === "grobplot" ||
          input.stage === "feinplot"
        ? "szenenplot"
        : "manuskript",
  outputFormatHint:
    "Nur den Kapitel-BODY ohne Überschrift. Die Heading-Zeile setzt der Server.",
})}

Du erhältst GENAU ein Kapitel. Ändere den Body laut Patch-Brief — SICHTBAR und ENTSCHIEDEN.
${
  input.stage === "kapitelgeruest" ||
  input.stage === "grobgeruest" ||
  input.stage === "feingeruest" ||
  input.stage === "szenenplot" ||
  input.stage === "grobplot" ||
  input.stage === "feinplot"
    ? `${structureHint}
Analytisch präzise (Entwicklungslektor): Dramaturgie/Logik laut Brief schärfen — keine Manuskript-Prosa schreiben.`
    : `${MANUSKRIPT_CHAPTER_PROSE_RULES}
Buchdruck: Überschriften setzt das System (ohne Rauten). Erzähle Kapitel ${input.chapterNumber} („${input.title}“) als echte Prosa — keine Streich-/Meta-Notizen.${lengthRule}
Continuity: Ende des Vorgängers ist BEREITS geschrieben — am Kapitelanfang nicht wiederholen oder paraphrasieren, nur organisch fortsetzen. Harte Fakten einhalten.
${
  styleOnly
    ? "Stil-Pass: gleiche Beats/Fakten/Dialogbedeutung — nur Wortwahl und Satzbau verbessern."
    : "Wenn der Patch-Brief Duplikate/Doppelungen/Wiederholungen nennt: die überzählige Passage MUSS im fertigen Body komplett fehlen (nicht umschreiben und behalten)."
}${patchOverPacket}`
}
${noHeadingHint}`,
      cacheablePrefix: input.cacheablePrefix?.trim() || undefined,
      userText: `# Patch-Brief (verbindlich — höchste Priorität, jede Anweisung umsetzen)
${input.patchBrief}
${needs}${packetBlock}${continuity}${contextBlock}${extraHint}
# Kapitel (Meta unveränderlich)
${heading}

# Bisheriger Body
${input.body.slice(0, CLIP.chapterBody)}

Schreibe den vollständigen neuen Body.
HARTE ERFOLGSKRITERIEN:
${
  styleOnly
    ? `- Bessere Prosa (Wortwahl/Satzbau) bei IDENTISCHEM Inhalt — keine neuen Beats.
- Der Text darf sich stilistisch klar unterscheiden; Handlung und Infos bleiben gleich.`
    : `- Der Text MUSS sich klar vom bisherigen unterscheiden (konkrete Änderungen laut Patch-Brief) — keine reine Kosmetik, kein Umformulieren ohne Inhaltsschwenk.`
}
- Was der Brief streichen/bereinigen/entdoppeln will, darf im neuen Body NICHT mehr vorkommen.
- Keine Meta-Sätze („hier wurde gestrichen“). Nur erzählende Prosa.${
        input.stage === "manuskript"
          ? ` Nur DIESES Kapitel; niemals behaupten, das Kapitel entfalle. Wortzahl mind. ${floor}${ceiling != null ? `, max. ca. ${ceiling}` : ""}${input.allowSubstantialShorten ? " (Duplikate streichen OK — Länge woanders nachziehen)." : "."}`
          : ""
      }`,
      preferJson: false,
      // Full chapter rewrite — same floor as Co-Autor drafts (no mid-sentence cut).
      maxTokens: ROMAN_PROSE_MAX_TOKENS,
      timeoutMs: AI_LONG_PROSE_TIMEOUT_MS,
      reasoningEffort: "none",
    });
    return raw.trim();
  }

  let body = await generateOnce("");
  if (input.stage === "manuskript") {
    assertRealManuskriptProse(body, input.chapterNumber, input.title);
    let words = manuskriptChapterWordCount(body);
    const changedFromBaseline =
      normalizeWhitespace(body) !== normalizeWhitespace(input.body);

    // Weak / no-op first pass → one hard retry (especially Duplikat-Patches).
    if (!changedFromBaseline) {
      body = await generateOnce(
        `\n# Nacharbeit Pflicht\nDein erster Entwurf war praktisch unverändert. Setze den Patch-Brief JETZT sichtbar um. Wenn Duplikate/Doppelungen genannt sind: eine der beiden Passagen komplett entfernen — nicht nur umformulieren.\n`,
      );
      assertRealManuskriptProse(body, input.chapterNumber, input.title);
      words = manuskriptChapterWordCount(body);
    }

    // Under floor → expand (also after Duplikat-Straffung). Never re-insert
    // deleted doubles; grow elsewhere so chapter min holds.
    if (!input.preferTighten && words < floor) {
      body = await generateOnce(
        `\n# Expand-Pflicht\nNur ${words} Wörter — erneut mit mindestens ${floor} und höchstens ${ceiling ?? floor * 2} Wörtern. Gelöschte Duplikate/Wiederholungen NICHT wieder einfügen; wo nötig woanders erweitern (andere Szene/Dialog/Innenleben), nicht die gestrichene Doppelung zurückholen.\n`,
      );
      assertRealManuskriptProse(body, input.chapterNumber, input.title);
      words = manuskriptChapterWordCount(body);
    }

    // Second expand if still under chapter floor after craft shorten.
    if (
      !input.preferTighten &&
      words < floor &&
      input.allowSubstantialShorten
    ) {
      body = await generateOnce(
        `\n# Expand-Pflicht 2\nImmer noch nur ${words} Wörter (Minimum ${floor}). Erweitere SICHTBAR ohne die gestrichenen Doppelungen zurückzuholen. Neue Beats/Dialoge an anderer Stelle im Kapitel.\n`,
      );
      assertRealManuskriptProse(body, input.chapterNumber, input.title);
      words = manuskriptChapterWordCount(body);
    }

    // Still under floor → accept craft shorten only if ≥85% of chapterMin; else baseline.
    if (words < floor) {
      const acceptSoft = Math.floor(floor * 0.85);
      if (
        input.allowSubstantialShorten &&
        normalizeWhitespace(body) !== normalizeWhitespace(input.body) &&
        words >= acceptSoft
      ) {
        return body;
      }
      return input.body;
    }

    // Over hard ceiling → keep shorter of new vs baseline (allow trim when over).
    if (ceiling != null && words > ceiling) {
      if (baselineWords <= ceiling) {
        // Prefer changed shorter/equal body over silent revert when craft asked to cut.
        if (
          input.allowSubstantialShorten &&
          normalizeWhitespace(body) !== normalizeWhitespace(input.body) &&
          words <= baselineWords
        ) {
          return body;
        }
        return input.body;
      }
      return words < baselineWords ? body : input.body;
    }
    // Tighten: reject only strong growth (small inserts for craft/Bedürfnis OK).
    if (
      input.preferTighten &&
      words > Math.round(baselineWords * 1.08) &&
      words > baselineWords + 80
    ) {
      return input.body;
    }
  }
  return body;
}

async function applyChapterDoc(input: {
  stage: ChapterDocStage;
  baseline: string;
  target: RouteTarget;
  context: string;
  /** Slim canon for Sonnet/Flash prompt-caching. */
  cacheablePrefix?: string;
  critiqueText?: string;
  /** Book target for chapter min floor on manuskript patches. */
  zielWortzahlRoman?: number | null;
  zielWortzahlSzeneMax?: number | null;
  needsBlock?: string;
  /** Running continuity memory (Manuskript Verbessern / Feedback). */
  storyState?: RomanStoryState | null;
  /** Durable knowledge graph — carried into patches and updated after. */
  wissensGraph?: RomanWissensGraph | null;
  /** Structured Gerüst for chapter packets (Manuskript). */
  szenenplotStructured?: RomanSzenenplotStructured | null;
  /** Character bias block for chapter packets. */
  autorBias?: string;
  /** Optional per-chapter patch brief (Leser-Feedback: local + book-wide split). */
  patchBriefForChapter?: (chapterNumber: number) => string;
  /** Override writer role (Autor for style Verbessern). */
  applyRoleKey?: string;
}): Promise<{
  text: string;
  summary: string;
  patchedChapters: number[];
  storyState?: RomanStoryState | null;
  wissensGraph?: RomanWissensGraph | null;
  /** Updated Gerüst after Manuskript craft sync (null = unchanged / cleared). */
  szenenplotStructured?: RomanSzenenplotStructured | null;
}> {
  const chapters = parsePlotChapters(input.baseline);
  let liveStructured = input.szenenplotStructured ?? null;
  if (chapters.length < 1) {
    throw new Error(
      `${input.stage}: keine Kapitelstruktur — bitte zuerst erzeugen.`,
    );
  }

  const needsFocused = isNeedsFocusedChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const leserFeedbackPatch = isLeserFeedbackChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const simplifyPatch = isManuskriptSimplifyPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const leseflussPatch = isLeseflussChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const reifegradImprovePatch = isReifegradImproveChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const shortenIntentPatch = isShortenIntentPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const canonLogicPatch = isCanonLogicChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const allowGrowthPatch =
    leserFeedbackPatch ||
    simplifyPatch ||
    leseflussPatch ||
    reifegradImprovePatch ||
    canonLogicPatch;
  // Dim/Verbessern may delete Duplikate — first pass may shrink, but wordFloor
  // stays at chapterMin so expand restores length elsewhere (not the doubles).
  const allowSubstantialShorten =
    leserFeedbackPatch ||
    simplifyPatch ||
    leseflussPatch ||
    reifegradImprovePatch ||
    shortenIntentPatch ||
    canonLogicPatch;
  const toPatch = resolveChapterPatchNumbers({
    chapterNumbers: chapters.map((c) => c.number),
    requested: input.target.chapterNumbers,
    needsFocused,
  });

  if (toPatch.length === 0) {
    throw new Error(`${input.stage}: keine Kapitel zum Patchen gefunden.`);
  }

  const { min: chapterMin, max: chapterMax } = manuskriptWordsPerChapter(
    input.zielWortzahlRoman ?? null,
    chapters.length,
    input.zielWortzahlSzeneMax,
  );
  const bookWords =
    input.stage === "manuskript"
      ? countWords(input.baseline)
      : 0;
  // Leser-Feedback / Verbessern must weave visible changes even when book is at Ziel.
  const preferTighten =
    input.stage === "manuskript" &&
    !allowGrowthPatch &&
    manuskriptBookNearOrOverTarget(
      bookWords,
      input.zielWortzahlRoman ?? null,
    );

  let liveStoryState: RomanStoryState | null | undefined =
    input.stage === "manuskript" ? (input.storyState ?? null) : undefined;
  let liveGraph: RomanWissensGraph | null = input.wissensGraph ?? null;

  const patches: Array<{ chapterNumber: number; body: string }> = [];
  let rejectedShort = 0;
  for (const num of toPatch) {
    const ch = chapters.find((c) => c.number === num)!;
    const baselineWords = manuskriptChapterWordCount(ch.body);
    // Always hold chapterMin after patches (incl. Duplikat-Straffung). Soft
    // baseline floor still applies when not craft-shortening.
    const wordFloor =
      input.stage === "manuskript"
        ? preferTighten && !allowSubstantialShorten
          ? Math.max(
              chapterMin,
              Math.floor(baselineWords * MANUSKRIPT_PATCH_WORD_FLOOR_PCT),
            )
          : allowSubstantialShorten
            ? chapterMin
            : Math.max(
                chapterMin,
                Math.floor(baselineWords * MANUSKRIPT_PATCH_WORD_FLOOR_PCT),
              )
        : undefined;
    // Soft ceiling when over Ziel: allow small inserts (~8%), never force chapterMax when baseline already over.
    // Leser-Feedback / Verbessern: allow modest growth so weave is not discarded when ceiling == baseline.
    const wordCeiling =
      input.stage === "manuskript"
        ? allowGrowthPatch
          ? Math.max(
              chapterMax,
              Math.round(baselineWords * 1.15),
              baselineWords + 120,
            )
          : preferTighten
            ? Math.max(
                Math.round(baselineWords * 1.08),
                baselineWords + 80,
              )
            : Math.max(chapterMax, baselineWords)
        : undefined;

    let chapterPacket: string | undefined;
    let continuityBuffer: string | undefined;
    const patchBrief =
      input.patchBriefForChapter?.(num) ?? input.target.patchBrief;
    const graphSnippet = formatWissensGraphForPrompt(liveGraph, {
      throughChapter: num,
      maxChars: 2_200,
    });
    if (input.stage === "manuskript") {
      const prev = chapters.find((c) => c.number === num - 1);
      const frozen = hasFrozenSchreibPrompts(liveStructured);
      const prevTailChars = frozen
        ? CONTINUITY_PREV_TAIL_CHARS_FROZEN
        : CONTINUITY_PREV_TAIL_CHARS;
      const previousTail = prev?.body.trim().slice(-prevTailChars) ?? "";
      const { packet } = await resolveManuskriptChapterPacket({
        storyState: liveStoryState ?? null,
        chapter: ch,
        allChapters: chapters,
        previousTail,
        lektorBrief: patchBrief,
        wissensGraph: liveGraph,
        szenenplotStructured: liveStructured,
        autorBias: frozen ? undefined : input.autorBias,
        slimCanonSnippet: input.cacheablePrefix,
      });
      chapterPacket = [
        formatPatchPriorityBanner(patchBrief),
        packet,
        "## Patch-Übergang (verbindlich)",
        "Das Ende des Vorgänger-Kapitels ist BEREITS im Buch.",
        "Am Anfang DIESES Kapitels: nichts davon erneut erzählen, paraphrasieren oder als Dialog wiederholen — organisch danach ansetzen.",
      ].join("\n");
    } else if (graphSnippet) {
      continuityBuffer = [
        graphSnippet,
        "## Patch-Regeln",
        "Wissensgraph und hardInvariants einhalten; keine doppelten Kapitel-Beats erzeugen.",
      ].join("\n");
    }

    const body = await patchOneChapterBody({
      stage: input.stage,
      chapterNumber: ch.number,
      title: ch.title,
      body: ch.body,
      patchBrief,
      context: input.context,
      cacheablePrefix: input.cacheablePrefix,
      wordFloor,
      wordCeiling,
      preferTighten,
      allowSubstantialShorten,
      needsBlock: input.needsBlock,
      chapterPacket,
      continuityBuffer,
      applyRoleKey: input.applyRoleKey,
    });
    if (
      input.stage === "manuskript" &&
      wordFloor != null &&
      manuskriptChapterWordCount(body) < wordFloor &&
      normalizeWhitespace(body) === normalizeWhitespace(ch.body)
    ) {
      rejectedShort += 1;
    }
    patches.push({ chapterNumber: num, body });
  }

  const docFormat = input.stage === "manuskript" ? "manuskript" : "plot";
  const guarded = patchChapterBodies(input.baseline, patches, docFormat);
  if (!guarded.ok) {
    throw new Error(guarded.error);
  }
  // Ensure headings present (belt + suspenders)
  const check = assertChapterStructure(input.baseline, guarded.text, {
    format: docFormat,
  });
  if (!check.ok) throw new Error(check.error);

  const beforeNorm = normalizeWhitespace(input.baseline);
  const afterNorm = normalizeWhitespace(check.text);
  if (beforeNorm === afterNorm) {
    if (needsFocused) {
      return {
        text: input.baseline,
        summary: `Bedürfnis-Stichprobe: keine sichtbare Änderung in Kap. ${toPatch.join(", ")} (übersprungen).`,
        patchedChapters: [],
        storyState: liveStoryState,
        wissensGraph: liveGraph,
      };
    }
    throw new Error(
      rejectedShort > 0
        ? `${input.stage}: Patch verkürzte Kapitel unter die Mindestlänge und wurde verworfen. Bitte Verbessern erneut.`
        : `${input.stage}: ${
            input.stage === "manuskript" ? "Co-Autor" : "Entwicklungslektor"
          } hat Kapitel ${toPatch.join(", ")} nicht verändert. Bitte Verbessern erneut oder Gegenlese konkretisieren.`,
    );
  }

  // How many patched chapters actually differ from baseline bodies?
  const changed = patches.filter((p) => {
    const base = chapters.find((c) => c.number === p.chapterNumber);
    return (
      base &&
      normalizeWhitespace(base.body) !== normalizeWhitespace(p.body)
    );
  });
  if (changed.length === 0) {
    if (needsFocused) {
      return {
        text: input.baseline,
        summary: `Bedürfnis-Stichprobe: keine sichtbare Änderung in Kap. ${toPatch.join(", ")} (übersprungen).`,
        patchedChapters: [],
        storyState: liveStoryState,
        wissensGraph: liveGraph,
      };
    }
    throw new Error(
      `${input.stage}: Patch lieferte keinen sichtbaren Textunterschied in Kapitel ${toPatch.join(", ")}.`,
    );
  }

  // Refresh continuity memory from successfully changed chapters (order).
  if (input.stage === "manuskript") {
    const afterChapters = parsePlotChapters(check.text);
    for (const p of [...changed].sort(
      (a, b) => a.chapterNumber - b.chapterNumber,
    )) {
      const ch = afterChapters.find((c) => c.number === p.chapterNumber);
      if (!ch) continue;
      liveStoryState = await extractManuskriptStoryState({
        previous: liveStoryState ?? null,
        chapterNumber: ch.number,
        chapterTitle: ch.title,
        chapterBody: ch.body,
      });
    }
  }

  // Persist knowledge-graph updates from patched chapters (all stages).
  const afterChapters = parsePlotChapters(check.text);
  const changedBodies = changed
    .map((p) => afterChapters.find((c) => c.number === p.chapterNumber))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ number: c.number, title: c.title, body: c.body }));

  const syncNotes: string[] = [];
  if (liveGraph && changedBodies.length > 0) {
    let grew = false;
    for (let attempt = 0; attempt < 2 && !grew; attempt += 1) {
      try {
        liveGraph = await growWissensGraphFromChapterBodies({
          previous: liveGraph,
          // Grow API: gerüst patches count as structure (szenenplot source tag).
          stage: input.stage === "manuskript" ? "manuskript" : "szenenplot",
          chapters: changedBodies,
          patchBrief: input.target.patchBrief,
        });
        grew = true;
      } catch {
        if (attempt === 1) {
          syncNotes.push("Graph-Grow fehlgeschlagen");
        }
      }
    }
  }

  // Light Sync: structured beats + graph retract (MS + Szenenplot structured).
  let syncedStructured = false;
  if (
    (input.stage === "manuskript" || input.stage === "szenenplot") &&
    changedBodies.length > 0 &&
    liveStructured
  ) {
    const synced = await syncAfterManuskriptCraftPatch({
      structured: liveStructured,
      graph: liveGraph,
      patchBrief: input.target.patchBrief,
      changedChapters: changedBodies,
    });
    if (synced.structured) {
      liveStructured = synced.structured;
      syncedStructured = true;
    }
    liveGraph = synced.graph;
    syncNotes.push(...synced.warnings);
  } else if (input.stage === "manuskript" && changedBodies.length > 0) {
    // No structured — still retract graph themes from the patch brief.
    const synced = await syncAfterManuskriptCraftPatch({
      structured: null,
      graph: liveGraph,
      patchBrief: input.target.patchBrief,
      changedChapters: changedBodies,
    });
    liveGraph = synced.graph;
    syncNotes.push(...synced.warnings);
  }

  const scope = needsFocused
    ? `Bedürfnis-Stichprobe: ${changed.length} Kapitel (${changed.map((c) => c.chapterNumber).join(", ")})`
    : `Kapitel ${changed.map((c) => c.chapterNumber).join(", ")}`;
  const notesSuffix = syncNotes.length
    ? ` · Hinweis: ${syncNotes.slice(0, 2).join("; ")}`
    : "";
  const actor =
    input.stage === "manuskript" ? "Co-Autor" : "Entwicklungslektor";
  return {
    text: check.text,
    summary: `${scope} gepatcht (${input.stage} · ${actor})${preferTighten ? " · Straffen-Modus" : ""}${input.stage === "manuskript" ? " · Slim-Paket" : " · Flash"}${liveGraph ? " · Wissensgraph" : ""}${syncedStructured ? " · Structured-Sync" : ""}${rejectedShort > 0 ? ` · ${rejectedShort} Kürzung(en) verworfen` : ""}${notesSuffix}.`,
    patchedChapters: changed.map((c) => c.chapterNumber),
    storyState: liveStoryState,
    wissensGraph: liveGraph,
    szenenplotStructured: liveStructured,
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Apply one route target onto the roman; returns updated roman + summary.
 */
export async function applyRouteTarget(input: {
  roman: RomanKontext;
  target: RouteTarget;
  critiqueText: string;
  /** Optional per-chapter brief override (e.g. Leser-Feedback). */
  patchBriefForChapter?: (chapterNumber: number) => string;
  /** Override writer role (e.g. `autor` for Manuskript Verbessern). */
  applyRoleKey?: string;
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters?: number[];
}> {
  const roman = input.roman;
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const buchTyp = (editorial.buchTyp ?? "unbekannt") as RomanBuchTyp;
  const ideeKurz = editorial.ideeKurz ?? "";
  /** Slim canon for chapter patches — full Spec/Recherche stays out of Sonnet. */
  const cacheablePrefix = buildRomanSlimCanon({
    buchTyp,
    title: roman.title,
    genre: roman.genre,
    ideeKurz,
    rechercheDossier: editorial.rechercheDossier ?? "",
    tonalitaet: roman.tonalitaet,
    grobRegeln: editorial.grobRegeln ?? "",
    editorial,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    wissensGraph: editorial.wissensGraph,
  });
  // Live deltas only — chapter packet carries Gerüst/Graph per chapter.
  const autorBias = formatAutorBiasFromCharaktere(roman.charaktere);
  const context = [
    autorBias,
    formatWissensGraphForPrompt(editorial.wissensGraph, {
      maxChars: 2_800,
    }),
  ]
    .filter(Boolean)
    .join("\n\n");

  const stage: PipelineStage = input.target.stage;

  if (stage === "idee") {
    const woven = await weaveIdeeKurzFromCoAutorKritik({
      buchTyp,
      ideeKurz,
      critique: input.critiqueText,
      authorComment: input.target.patchBrief,
    });
    const nextEd = { ...editorial, ideeKurz: woven.ideeKurz };
    const saved = await persistRoman(roman, { editorial: nextEd });
    return {
      roman: saved,
      summary: `Idee angepasst (${woven.modelLabel}).`,
    };
  }

  if (stage === "charaktere") {
    const refined = await refineCharaktere({
      buchTyp,
      ideeKurz,
      grobRegeln: `${editorial.grobRegeln ?? ""}\n\nPatch-Brief:\n${input.target.patchBrief}`,
      existing: roman.charaktere,
    });
    const saved = await persistRoman(roman, {
      charaktere: refined.charaktere,
    });
    return {
      roman: saved,
      summary: `Charaktere angepasst (${refined.modelLabel}).`,
    };
  }

  if (stage === "welt") {
    const woven = await weaveWeltFromKritik({
      buchTyp,
      ideeKurz,
      welt: {
        weltSchauplaetze: roman.weltSchauplaetze,
        weltRegeln: roman.weltRegeln,
      },
      critique: input.critiqueText,
      authorComment: input.target.patchBrief,
    });
    const saved = await persistRoman(roman, {
      weltSchauplaetze: woven.weltSchauplaetze,
      weltRegeln: woven.weltRegeln,
    });
    return {
      roman: saved,
      summary: `Welt angepasst (${woven.modelLabel}).`,
    };
  }

  if (stage === "expose") {
    const existing = exposeTextFromEditorial(editorial);
    const woven = await weaveExposeFromLektorKritik({
      buchTyp,
      ideeKurz,
      expose: existing,
      critique: input.critiqueText,
      authorComment: input.target.patchBrief,
    });
    const nextEd = withExposeText(
      invalidateDownstreamEditorial(editorial, "expose"),
      woven.expose,
    );
    const saved = await persistRoman(roman, {
      manuskriptRaw: "",
      editorial: nextEd,
    });
    return {
      roman: saved,
      summary: `Exposé angepasst (${woven.modelLabel}). Downstream veraltet.`,
    };
  }

  if (isGeruestStage(stage)) {
    const structured = editorial.kapitelGeruestStructured;
    if (!structured?.chapters.length) {
      throw new Error(
        "Kapitelgerüst-JSON fehlt — bitte Gerüst neu erzeugen (Structured erforderlich für Verbessern).",
      );
    }
    const requested = input.target.chapterNumbers;
    const available = structured.chapters.map((c) => c.number);
    const chapterNumbers =
      requested?.length && requested.length > 0
        ? [...new Set(requested)]
            .filter((n) => available.includes(n))
            .sort((a, b) => a - b)
        : available;
    if (!chapterNumbers.length) {
      throw new Error(
        requested?.length
          ? `Kapitelgerüst: angeforderte Kapitel (${requested.join(", ")}) nicht gefunden.`
          : "Kapitelgerüst: keine Kapitel zum Patchen.",
      );
    }

    // One chapter per model call so patchBriefForChapter cannot leak across Kap.
    let live = structured;
    let remirror = "";
    const allChanged: number[] = [];
    for (const num of chapterNumbers) {
      const brief =
        input.patchBriefForChapter?.(num) ?? input.target.patchBrief;
      const patched = await patchKapitelGeruestStructured({
        structured: live,
        chapterNumbers: [num],
        patchBrief: brief,
        critiqueText: input.critiqueText,
      });
      live = patched.structured;
      remirror = patched.markdown;
      allChanged.push(...patched.changedChapters);
    }
    if (!remirror) {
      remirror = structuredKapitelGeruestToMarkdown(live);
    }

    let nextGraph = editorial.wissensGraph ?? null;
    const changedBodies = [...new Set(allChanged)].map((n) => {
      const ch = live.chapters.find((c) => c.number === n)!;
      return {
        number: ch.number,
        title: ch.title,
        body: `${ch.kernsatz}\n\n${ch.inhaltKurz}`,
      };
    });
    if (nextGraph && changedBodies.length) {
      try {
        const retracted = await retractWissensGraphAfterPatch({
          graph: nextGraph,
          patchBrief: input.target.patchBrief,
          changedChapters: changedBodies,
        });
        nextGraph = retracted.graph;
      } catch {
        /* keep graph */
      }
      try {
        nextGraph = await growWissensGraphFromChapterBodies({
          previous: nextGraph,
          stage: "szenenplot",
          chapters: changedBodies,
          patchBrief: input.target.patchBrief,
        });
      } catch {
        /* keep retract */
      }
    }
    if (
      nextGraph &&
      changedBodies.length >= 2 &&
      editorial.szenenplotStructured?.chapters.length
    ) {
      try {
        nextGraph = await closeWissensGraphGaps({
          graph: nextGraph,
          structured: editorial.szenenplotStructured,
          ideeKurz,
          rechercheDossier: editorial.rechercheDossier ?? "",
          tonalitaet: roman.tonalitaet ?? "",
        });
      } catch {
        /* keep */
      }
    }
    const cleared = invalidateDownstreamEditorial(
      editorial,
      isGeruestStage(stage) ? (stage as PipelineStage) : "feingeruest",
    );
    const nextEd = {
      ...cleared,
      kapitelGeruestRaw: remirror,
      kapitelGeruestStructured: live,
      wissensGraph: nextGraph,
    };
    const saved = await persistRoman(roman, {
      manuskriptRaw: "",
      editorial: nextEd,
    });
    const changed = [...new Set(allChanged)].sort((a, b) => a - b);
    return {
      roman: saved,
      summary: `Kapitelgerüst structured gepatcht (Kap. ${changed.join(", ")}) · Szenenplot/Manuskript veraltet.`,
      patchedChapters: changed,
    };
  }

  if (isPlotStage(stage)) {
    const structured = editorial.szenenplotStructured;
    if (!structured?.chapters.length) {
      throw new Error(
        "Szenenplot-JSON fehlt — bitte Plot neu erzeugen (Structured erforderlich für Verbessern).",
      );
    }
    const requested = input.target.chapterNumbers;
    const available = structured.chapters.map((c) => c.number);
    const chapterNumbers =
      requested?.length && requested.length > 0
        ? [...new Set(requested)]
            .filter((n) => available.includes(n))
            .sort((a, b) => a - b)
        : available;
    if (!chapterNumbers.length) {
      throw new Error(
        requested?.length
          ? `Szenenplot: angeforderte Kapitel (${requested.join(", ")}) nicht gefunden.`
          : "Szenenplot: keine Kapitel zum Patchen.",
      );
    }

    let live = structured;
    let remirror = "";
    const allChanged: number[] = [];
    for (const num of chapterNumbers) {
      const brief =
        input.patchBriefForChapter?.(num) ?? input.target.patchBrief;
      const patched = await patchSzenenplotStructured({
        structured: live,
        chapterNumbers: [num],
        patchBrief: brief,
        critiqueText: input.critiqueText,
      });
      live = patched.structured;
      remirror = patched.markdown;
      allChanged.push(...patched.changedChapters);
    }
    if (!remirror) {
      remirror = structuredSzenenplotToMarkdown(live);
    }

    let nextGraph = editorial.wissensGraph ?? null;
    const changedBodies = [...new Set(allChanged)].map((n) => {
      const ch = live.chapters.find((c) => c.number === n)!;
      const sceneBits = ch.scenes
        .map((s) => `${s.heading}: ${s.summary}`)
        .join("\n");
      return {
        number: ch.number,
        title: ch.title,
        body: `${ch.kernsatz}\n\n${sceneBits}`,
      };
    });
    if (nextGraph && changedBodies.length) {
      try {
        const retracted = await retractWissensGraphAfterPatch({
          graph: nextGraph,
          patchBrief: input.target.patchBrief,
          changedChapters: changedBodies,
        });
        nextGraph = retracted.graph;
      } catch {
        /* keep */
      }
      try {
        nextGraph = await growWissensGraphFromChapterBodies({
          previous: nextGraph,
          stage: "szenenplot",
          chapters: changedBodies,
          patchBrief: input.target.patchBrief,
        });
      } catch {
        /* keep */
      }
    }
    if (nextGraph && changedBodies.length >= 2) {
      try {
        nextGraph = await closeWissensGraphGaps({
          graph: nextGraph,
          structured: live,
          ideeKurz,
          rechercheDossier: editorial.rechercheDossier ?? "",
          tonalitaet: roman.tonalitaet ?? "",
        });
      } catch {
        /* keep */
      }
    }
    const cleared = invalidateDownstreamEditorial(
      editorial,
      isPlotStage(stage) ? (stage as PipelineStage) : "feinplot",
    );
    const nextEd = {
      ...cleared,
      szenenplotStructured: live,
      wissensGraph: nextGraph,
    };
    const saved = await persistRoman(roman, {
      manuskriptRaw: remirror,
      editorial: nextEd,
    });
    const changed = [...new Set(allChanged)].sort((a, b) => a - b);
    return {
      roman: saved,
      summary: `Szenenplot structured gepatcht (Kap. ${changed.join(", ")}).`,
      patchedChapters: changed,
    };
  }

  if (stage === "manuskript") {
    const baseline = editorial.manuskriptText ?? "";
    const plot = roman.manuskriptRaw ?? "";
    const {
      text,
      summary,
      patchedChapters,
      storyState,
      wissensGraph,
      szenenplotStructured,
    } = await applyChapterDoc({
      stage: "manuskript",
      baseline,
      target: input.target,
      context,
      cacheablePrefix,
      critiqueText: input.critiqueText,
      zielWortzahlRoman: editorial.zielWortzahlRoman,
      zielWortzahlSzeneMax: editorial.zielWortzahlSzeneMax,
      needsBlock: manuskriptNeedsPromptBlock(),
      storyState: editorial.storyState ?? null,
      wissensGraph: editorial.wissensGraph ?? null,
      szenenplotStructured: editorial.szenenplotStructured,
      autorBias,
      patchBriefForChapter: input.patchBriefForChapter,
      applyRoleKey: input.applyRoleKey,
    });
    const sealed = normalizeManuskriptDocument(text, {
      requiredFromPlot: plot,
    });
    const missing = missingManuskriptChapterNumbers(plot, sealed);
    if (missing.length > 0) {
      throw new Error(
        `Manuskript unvollständig nach Patch — fehlende Kapitel aus dem Szenenplot: ${missing.join(", ")}. Bitte Manuskript neu erzeugen.`,
      );
    }
    const nextEd = {
      ...editorial,
      manuskriptText: sealed,
      storyState: storyState ?? editorial.storyState ?? null,
      wissensGraph: wissensGraph ?? editorial.wissensGraph ?? null,
      szenenplotStructured:
        szenenplotStructured !== undefined
          ? szenenplotStructured
          : editorial.szenenplotStructured,
    };
    const saved = await persistRoman(roman, { editorial: nextEd });
    return { roman: saved, summary, patchedChapters };
  }

  throw new Error(`Unbekannte Stufe „${stage}“.`);
}
