/**
 * Apply router patch briefs to pipeline artifacts (auto, no author comment gate).
 * New text is always written by Co-Autor (same as Erzeugen / draft).
 * Chapter docs are patched body-only and reassembled with structure-guard.
 * Manuskript patches use Continuity Buffer + update `editorial.storyState`.
 *
 * Bedürfnis-Findings: sample evenly across the book (cap `MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS`)
 * so market needs show up without rewriting every chapter (runtime + overshoot).
 */

import { AI_LONG_PROSE_TIMEOUT_MS } from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import {
  countWords,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  withExposeText,
  type RomanBuchTyp,
  type RomanStoryState,
} from "@/lib/roman/editorial";
import { formatAutorBiasFromCharaktere } from "@/lib/roman/autor-bias";
import {
  assembleManuskriptChapterContext,
  CONTINUITY_PREV_TAIL_CHARS,
  extractManuskriptStoryState,
} from "@/lib/roman/manuskript-continuity";
import {
  MANUSKRIPT_NEEDS_PASS_MAX_CHAPTERS,
  MANUSKRIPT_PATCH_WORD_FLOOR_PCT,
  manuskriptBookNearOrOverTarget,
  manuskriptChapterWordCount,
  manuskriptNeedsPromptBlock,
  manuskriptWordsPerChapter,
} from "@/lib/roman/manuskript-contracts";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  assertChapterStructure,
  patchChapterBodies,
} from "@/lib/roman/pipeline/structure-guard";
import type { RouteTarget } from "@/lib/roman/pipeline/critique-schema";
import {
  CLIP,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
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
import { refineCharaktereWithFachberater } from "@/lib/roman/suggest-charaktere";
import { weaveExposeFromLektorKritik } from "@/lib/roman/suggest-expose";
import { weaveWeltFromFachberaterKritik } from "@/lib/roman/suggest-welt";
import type { RomanKontext } from "@/lib/roman/types";
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
 */
async function patchOneChapterBody(input: {
  stage: "szenenplot" | "manuskript";
  chapterNumber: number;
  title: string;
  body: string;
  patchBrief: string;
  context: string;
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
  /** Compact continuity buffer (Memory light). */
  continuityBuffer?: string;
}): Promise<string> {
  const taskKey =
    input.stage === "szenenplot" ? "szenenplot.draft" : "manuskript.draft";
  const { rolle, model } = await resolvePipelineTask(taskKey);
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
  const noHeadingHint =
    input.stage === "manuskript"
      ? "Gib NUR den neuen Body zurück — keine Kapitel-Überschrift („Kapitel N — …“), kein JSON."
      : "Gib NUR den neuen Body zurück — keine ## Kapitel-Zeile, kein JSON.";
  const baselineWords = manuskriptChapterWordCount(input.body);
  const floor =
    input.wordFloor ??
    Math.max(1, Math.floor(baselineWords * MANUSKRIPT_PATCH_WORD_FLOOR_PCT));
  const ceiling = input.wordCeiling;
  const needs =
    input.stage === "manuskript" && input.needsBlock?.trim()
      ? `\n${input.needsBlock.trim()}\n`
      : "";
  const continuity = input.continuityBuffer?.trim()
    ? `\n# Context-Buffer (Continuity + Fokus)\n${input.continuityBuffer.trim().slice(0, 4_500)}\n`
    : "";
  const lengthRule =
    input.stage === "manuskript"
      ? input.preferTighten
        ? `\nLÄNGEN-CONTRACT: Buch ist schon am/über Ziel. Inhaltlich ändern laut Patch-Brief; höchstens leicht verdichten. Nicht aufblasen — Zielband bis ca. ${ceiling ?? baselineWords} Wörter (Baseline ${baselineWords}).`
        : input.allowSubstantialShorten
          ? `\nLÄNGEN-CONTRACT: Baseline ${baselineWords} Wörter. Patch-Brief hat Vorrang — straffen, Duplikate streichen und kürzer werden für Klarheit/Lesefluss ist erwünscht. Soft-Ziel ab ca. ${floor} Wörtern, aber sichtbare Änderungen nicht rückgängig machen.`
          : `\nLÄNGEN-CONTRACT: Zielband ${floor}–${ceiling ?? Math.round(floor * 1.25)} Wörter (Baseline ${baselineWords}). Nicht sinnlos aufblähen.`
      : "";

  async function generateOnce(extraHint: string): Promise<string> {
    const raw = await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${buildWeaveSystemAddendum({
  kind: input.stage === "szenenplot" ? "szenenplot" : "manuskript",
  outputFormatHint:
    "Nur den Kapitel-BODY ohne Überschrift. Die Heading-Zeile setzt der Server.",
})}

Du erhältst GENAU ein Kapitel. Ändere nur den Body laut Patch-Brief.
${
  input.stage === "szenenplot"
    ? "Behalte oder stelle die Szenengliederung her: ### Szene N.M — Kurztitel mit Stichpunkten darunter."
    : `${MANUSKRIPT_CHAPTER_PROSE_RULES}
Buchdruck: Überschriften setzt das System (ohne Rauten). Erzähle Kapitel ${input.chapterNumber} („${input.title}“) als echte Prosa — keine Streich-/Meta-Notizen.${lengthRule}
Continuity: Ende des Vorgängers ist BEREITS geschrieben — am Kapitelanfang nicht wiederholen oder paraphrasieren, nur organisch fortsetzen. Harte Fakten einhalten.`
}
${noHeadingHint}`,
      userText: `# Patch-Brief (verbindlich)
${input.patchBrief}
${needs}${continuity}${extraHint}
# Kontext
${input.context.slice(0, CLIP.sharedContext)}

# Kapitel (Meta unveränderlich)
${heading}

# Bisheriger Body
${input.body.slice(0, CLIP.chapterBody)}

Schreibe den vollständigen neuen Body. Der Text MUSS sich klar vom bisherigen unterscheiden (konkrete Änderungen laut Patch-Brief) — keine reine Kosmetik.${
        input.stage === "manuskript"
          ? ` Nur erzählende Prosa für DIESES Kapitel; niemals behaupten, das Kapitel entfalle. Wortzahl im Band ${floor}${ceiling != null ? `–${ceiling}` : "+"}.`
          : ""
      }`,
      preferJson: false,
      maxTokens: 8_000,
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

    // Under floor and not in tighten mode → one expand retry
    // (skip when Leser-Feedback already shortened visibly — Duplikat-Streichungen).
    if (
      !input.preferTighten &&
      words < floor &&
      !(input.allowSubstantialShorten && changedFromBaseline)
    ) {
      body = await generateOnce(
        `\n# Expand-Pflicht\nNur ${words} Wörter — erneut mit mindestens ${floor} und höchstens ${ceiling ?? floor * 2} Wörtern. Gelöschte Duplikate/Wiederholungen NICHT wieder einfügen; wo nötig woanders verdichten.\n`,
      );
      assertRealManuskriptProse(body, input.chapterNumber, input.title);
      words = manuskriptChapterWordCount(body);
    }

    // Still under floor → keep baseline, unless Leser-Feedback visibly shortened.
    if (words < floor) {
      if (
        input.allowSubstantialShorten &&
        normalizeWhitespace(body) !== normalizeWhitespace(input.body)
      ) {
        return body;
      }
      return input.body;
    }

    // Over hard ceiling → keep shorter of new vs baseline (allow trim when over).
    if (ceiling != null && words > ceiling) {
      if (baselineWords <= ceiling) return input.body;
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
  stage: "szenenplot" | "manuskript";
  baseline: string;
  target: RouteTarget;
  context: string;
  critiqueText?: string;
  /** Book target for chapter min floor on manuskript patches. */
  zielWortzahlRoman?: number | null;
  zielWortzahlSzeneMax?: number | null;
  needsBlock?: string;
  /** Running continuity memory (Manuskript Verbessern / Feedback). */
  storyState?: RomanStoryState | null;
  /** Optional per-chapter patch brief (Leser-Feedback: local + book-wide split). */
  patchBriefForChapter?: (chapterNumber: number) => string;
}): Promise<{
  text: string;
  summary: string;
  patchedChapters: number[];
  storyState?: RomanStoryState | null;
}> {
  const chapters = parsePlotChapters(input.baseline);
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
  const canonLogicPatch = isCanonLogicChapterPatch({
    patchBrief: input.target.patchBrief,
    reason: input.target.reason,
    critiqueText: input.critiqueText,
  });
  const allowGrowthPatch =
    leserFeedbackPatch ||
    simplifyPatch ||
    leseflussPatch ||
    canonLogicPatch;
  const allowSubstantialShorten =
    leserFeedbackPatch || simplifyPatch || leseflussPatch;
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

  const patches: Array<{ chapterNumber: number; body: string }> = [];
  let rejectedShort = 0;
  for (const num of toPatch) {
    const ch = chapters.find((c) => c.number === num)!;
    const baselineWords = manuskriptChapterWordCount(ch.body);
    // Leser-Feedback / Vereinfachen / Lesefluss must be allowed to cut (often >5% of a chapter).
    // The default 95% floor silently reverted such patches.
    const wordFloor =
      input.stage === "manuskript"
        ? allowSubstantialShorten
          ? Math.max(
              120,
              Math.floor(baselineWords * 0.55),
              Math.floor(chapterMin * 0.45),
            )
          : preferTighten
            ? Math.max(
                1,
                Math.floor(baselineWords * MANUSKRIPT_PATCH_WORD_FLOOR_PCT),
              )
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

    let continuityBuffer: string | undefined;
    const patchBrief =
      input.patchBriefForChapter?.(num) ?? input.target.patchBrief;
    if (input.stage === "manuskript") {
      const prev = chapters.find((c) => c.number === num - 1);
      const previousTail = prev?.body.trim().slice(-CONTINUITY_PREV_TAIL_CHARS) ?? "";
      const assembled = await assembleManuskriptChapterContext({
        storyState: liveStoryState ?? null,
        chapter: ch,
        previousTail,
        sharedContextSnippet: input.context,
        lektorBriefSnippet: patchBrief,
      });
      continuityBuffer = [
        assembled.buffer,
        "## Patch-Übergang (verbindlich)",
        "Das Ende des Vorgänger-Kapitels ist BEREITS im Buch.",
        "Am Anfang DIESES Kapitels: nichts davon erneut erzählen, paraphrasieren oder als Dialog wiederholen — organisch danach ansetzen.",
      ].join("\n");
    }

    const body = await patchOneChapterBody({
      stage: input.stage,
      chapterNumber: ch.number,
      title: ch.title,
      body: ch.body,
      patchBrief,
      context: input.context,
      wordFloor,
      wordCeiling,
      preferTighten,
      allowSubstantialShorten,
      needsBlock: input.needsBlock,
      continuityBuffer,
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
      };
    }
    throw new Error(
      rejectedShort > 0
        ? `${input.stage}: Patch verkürzte Kapitel unter die Mindestlänge und wurde verworfen. Bitte Verbessern erneut.`
        : `${input.stage}: Co-Autor hat Kapitel ${toPatch.join(", ")} nicht verändert. Bitte Verbessern erneut oder Gegenlese konkretisieren.`,
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

  const scope = needsFocused
    ? `Bedürfnis-Stichprobe: ${changed.length} Kapitel (${changed.map((c) => c.chapterNumber).join(", ")})`
    : `Kapitel ${changed.map((c) => c.chapterNumber).join(", ")}`;
  return {
    text: check.text,
    summary: `${scope} gepatcht (${input.stage})${preferTighten ? " · Straffen-Modus" : ""}${input.stage === "manuskript" ? " · Continuity" : ""}${rejectedShort > 0 ? ` · ${rejectedShort} Kürzung(en) verworfen` : ""}.`,
    patchedChapters: changed.map((c) => c.chapterNumber),
    storyState: liveStoryState,
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
}): Promise<{
  roman: RomanKontext;
  summary: string;
  patchedChapters?: number[];
}> {
  const roman = input.roman;
  const editorial = roman.editorial ?? emptyRomanEditorial();
  const buchTyp = (editorial.buchTyp ?? "unbekannt") as RomanBuchTyp;
  const ideeKurz = editorial.ideeKurz ?? "";
  const context = [
    `Idee:\n${ideeKurz.slice(0, CLIP.idee)}`,
    `Basis-Regeln:\n${(editorial.grobRegeln ?? "").slice(0, CLIP.grob)}`,
    `Charaktere:\n${formatCharaktere(roman.charaktere).slice(0, CLIP.charaktere)}`,
    formatAutorBiasFromCharaktere(roman.charaktere),
    `Welt:\n${roman.weltSchauplaetze.slice(0, CLIP.weltSchau)}\n${roman.weltRegeln.slice(0, CLIP.weltRegeln)}`,
    `Exposé:\n${exposeTextFromEditorial(editorial).slice(0, CLIP.expose)}`,
    `Szenenplot:\n${(roman.manuskriptRaw ?? "").slice(0, CLIP.szenenplot)}`,
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
    const refined = await refineCharaktereWithFachberater({
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
    const woven = await weaveWeltFromFachberaterKritik({
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
    const nextEd = withExposeText(editorial, woven.expose);
    const saved = await persistRoman(roman, { editorial: nextEd });
    return {
      roman: saved,
      summary: `Exposé angepasst (${woven.modelLabel}).`,
    };
  }

  if (stage === "szenenplot") {
    const { text, summary, patchedChapters } = await applyChapterDoc({
      stage: "szenenplot",
      baseline: roman.manuskriptRaw ?? "",
      target: input.target,
      context,
      critiqueText: input.critiqueText,
    });
    // Markdown patch may diverge from dramaturgy JSON — clear so Manuskript
    // falls back to the updated markdown until next Erzeugen.
    const nextEd = {
      ...(roman.editorial ?? emptyRomanEditorial()),
      szenenplotStructured: null,
    };
    const saved = await persistRoman(roman, {
      manuskriptRaw: text,
      editorial: nextEd,
    });
    return { roman: saved, summary, patchedChapters };
  }

  if (stage === "manuskript") {
    const baseline = editorial.manuskriptText ?? "";
    const plot = roman.manuskriptRaw ?? "";
    const { text, summary, patchedChapters, storyState } = await applyChapterDoc({
      stage: "manuskript",
      baseline,
      target: input.target,
      context,
      critiqueText: input.critiqueText,
      zielWortzahlRoman: editorial.zielWortzahlRoman,
      zielWortzahlSzeneMax: editorial.zielWortzahlSzeneMax,
      needsBlock: manuskriptNeedsPromptBlock(editorial),
      storyState: editorial.storyState ?? null,
      patchBriefForChapter: input.patchBriefForChapter,
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
    };
    const saved = await persistRoman(roman, { editorial: nextEd });
    return { roman: saved, summary, patchedChapters };
  }

  throw new Error(`Unbekannte Stufe „${stage}“.`);
}
