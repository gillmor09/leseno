/**
 * Drop critique / Leser-Feedback prompts that cite text not present in the
 * artifact — classic hallucination (“finish the truncated sentence …” when
 * the sentence is already complete in the manuscript).
 *
 * Truncation-finish claims need a harder bar: a mid-word stump like
 * »Entschuldigung. Fami« must not ground against »…Familie…« (prefix match).
 * On Gerüst/Plot: also drop prose-finish / abrunden and unknown scene_id/Kapitel.
 */

import type { RomanAenderungsPrompt } from "@/lib/roman/editorial";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";

/** Min chars for a quoted snippet to be grounding-checked. */
const MIN_QUOTE_CHARS = 10;

/** German guillemets + typographic + ASCII quotes. */
const QUOTE_RE =
  /[«»„“”"']([^«»„“”"'\n]{8,220})[«»„“”"']|\((['"])([^'"\n]{8,220})\2\)/g;

/** „Satz/Replik zu Ende führen“ — Behrens / Alufolie / Fami failure mode. */
const TRUNCATION_FINISH_RE =
  /zu\s+Ende\s+f[uü]hren|f[uü]hre\s+.{0,60}?zu\s+Ende|vollst[aä]ndig(?:e[rn])?\s+zu\s+Ende|fragmentarisch|mitten\s+im\s+Satz|abgebrochen(?:e[rn])?\s+(?:Satz|Replik|Dialog|Zeile)|abbrechende\s+Replik|Satz\s+zu\s+Ende|Replik\s+.{0,40}?zu\s+Ende|Stumpf|abbrechen(?:d|de)?\s+(?:mit|bei)/i;

/** Manuskript-style “round off the chapter/scene” — invalid on structured stages. */
const PROSE_ROUNDING_RE =
  /abrunden|formal\s+sauber\s+ab(?:schlie|\b)|abschlie\w*.{0,40}?Kapitel|Kapitel.{0,40}?abschlie|Szene\s+runden|Replik\s+vollst/i;

const SCENE_ID_RE = /\b(SZ[_-]?\d{1,3})\b/gi;
const CHAPTER_REF_RE = /\bKap(?:itel)?\.?\s*(\d{1,2})\b/gi;

function normalizeGroundingText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function isStructureStage(stage: PipelineStage | undefined): boolean {
  return stage === "kapitelgeruest" || stage === "szenenplot";
}

/**
 * Extract quoted fragments from an instruction (German/typographic quotes).
 */
export function extractGroundingQuotes(text: string): string[] {
  const out: string[] = [];
  const src = text ?? "";
  QUOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_RE.exec(src))) {
    const inner = (m[1] ?? m[3] ?? "").trim();
    if (inner.length >= MIN_QUOTE_CHARS) out.push(inner);
  }
  const loose = src.matchAll(
    /['"„«»]([^'"“”«»\n]{6,120}?(?:\.\.\.|…))['"“”«»]?/g,
  );
  for (const hit of loose) {
    const inner = hit[1]?.trim() ?? "";
    if (inner.length >= MIN_QUOTE_CHARS) out.push(inner);
  }
  return Array.from(new Set(out)).slice(0, 8);
}

/** True if the prompt claims the artifact truncates mid-sentence / mid-reply. */
export function isTruncationFinishClaim(text: string): boolean {
  return TRUNCATION_FINISH_RE.test(text ?? "");
}

/** True if the prompt asks to “finish/round” prose (Manuskript work). */
export function isProseRoundingClaim(text: string): boolean {
  return (
    PROSE_ROUNDING_RE.test(text ?? "") || isTruncationFinishClaim(text ?? "")
  );
}

/**
 * True if the quote appears verbatim (whitespace-normalized) in the artifact.
 */
export function quoteGroundedInArtifact(
  quote: string,
  artifact: string,
): boolean {
  const q = normalizeGroundingText(quote);
  const hay = normalizeGroundingText(artifact);
  if (q.length < MIN_QUOTE_CHARS || !hay) return false;
  if (hay.includes(q)) return true;
  return false;
}

/**
 * For truncation-finish claims: the quoted stump must appear as a real cut
 * boundary in the artifact — not as a prefix of a longer continuing word/sentence.
 */
export function quoteIsTruncationEvidenceInArtifact(
  quote: string,
  artifact: string,
): boolean {
  const qRaw = normalizeGroundingText(quote);
  const hay = normalizeGroundingText(artifact);
  if (qRaw.length < MIN_QUOTE_CHARS || !hay) return false;

  const q = qRaw.replace(/(?:\.\.\.|…)\s*$/u, "").trim();
  if (q.length < MIN_QUOTE_CHARS) return false;

  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(q, from);
    if (idx < 0) break;
    const after = hay.slice(idx + q.length);
    if (!after || /^\s*$/.test(after)) return true;
    if (/^\s*(?:\.\.\.|…)/.test(after)) return true;
    if (/^\p{L}/u.test(after)) {
      from = idx + 1;
      continue;
    }
    const rest = after.replace(/^\s+/, "");
    if (!rest || /^(?:\.\.\.|…)/.test(rest)) return true;
    from = idx + 1;
  }
  return false;
}

/** scene_id tokens cited in the prompt that are missing from the artifact. */
export function missingSceneIdsInArtifact(
  text: string,
  artifact: string,
): string[] {
  const hay = artifact.toLowerCase();
  const missing: string[] = [];
  SCENE_ID_RE.lastIndex = 0;
  for (const m of text.matchAll(SCENE_ID_RE)) {
    const id = m[1]!;
    if (!hay.includes(id.toLowerCase())) missing.push(id);
  }
  return [...new Set(missing)];
}

/** Kapitel numbers cited in the prompt that are missing from the artifact. */
export function missingChapterRefsInArtifact(
  text: string,
  artifact: string,
): number[] {
  const hay = normalizeGroundingText(artifact);
  const missing: number[] = [];
  CHAPTER_REF_RE.lastIndex = 0;
  for (const m of text.matchAll(CHAPTER_REF_RE)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) continue;
    // Accept „Kapitel 3“, „Kap. 3“, or heading markers already remirrored.
    const ok =
      hay.includes(`Kapitel ${n}`) ||
      hay.includes(`Kap. ${n}`) ||
      hay.includes(`Kap ${n}`) ||
      new RegExp(`(?:^|\\n)#+\\s*Kapitel\\s+${n}\\b`).test(artifact);
    if (!ok) missing.push(n);
  }
  return [...new Set(missing)];
}

export type GroundingFilterOptions = {
  /** When set, structure stages get stricter prose-finish / id checks. */
  stage?: PipelineStage;
};

/**
 * Filter prompts that contain ungrounded quotes. Prompts without quotes pass
 * — except truncation-finish claims, which need a grounded cut stump.
 * On Gerüst/Plot: drop abrunden/Satz-zu-Ende and unknown scene_id/Kapitel.
 */
export function filterAenderungsPromptsByGrounding(
  prompts: RomanAenderungsPrompt[],
  artifact: string,
  options?: GroundingFilterOptions,
): { kept: RomanAenderungsPrompt[]; dropped: RomanAenderungsPrompt[] } {
  const kept: RomanAenderungsPrompt[] = [];
  const dropped: RomanAenderungsPrompt[] = [];
  const hay = artifact.slice(0, 400_000);
  const structure = isStructureStage(options?.stage);

  for (const p of prompts) {
    const blob = `${p.titel}\n${p.anweisung}`;
    const truncationClaim = isTruncationFinishClaim(blob);
    const quotes = extractGroundingQuotes(blob);

    if (structure && isProseRoundingClaim(blob)) {
      // On structured stages: prose-finish is never valid (even with a cut stump).
      dropped.push(p);
      continue;
    }

    if (structure) {
      if (missingSceneIdsInArtifact(blob, hay).length > 0) {
        dropped.push(p);
        continue;
      }
      if (missingChapterRefsInArtifact(blob, hay).length > 0) {
        dropped.push(p);
        continue;
      }
    }

    if (truncationClaim) {
      if (!quotes.length) {
        dropped.push(p);
        continue;
      }
      const allOk = quotes.every((q) =>
        quoteIsTruncationEvidenceInArtifact(q, hay),
      );
      if (allOk) kept.push(p);
      else dropped.push(p);
      continue;
    }

    if (!quotes.length) {
      kept.push(p);
      continue;
    }
    const allOk = quotes.every((q) => quoteGroundedInArtifact(q, hay));
    if (allOk) kept.push(p);
    else dropped.push(p);
  }
  return { kept, dropped };
}
