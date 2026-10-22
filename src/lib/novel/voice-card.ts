/**
 * Voice card: positive style target + short few-shot lines from the idea.
 * Drives draft/rewrite; detectors stay QA-only.
 */

import { z } from "zod";
import type { NovelBundle, NovelVoiceCard } from "@/lib/novel/types";

const SAMPLE_MAX = 280;

function clipList(
  raw: unknown,
  maxItems: number,
  maxLen: number,
  minLen: number,
): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= minLen)
    .map((s) =>
      s.length > maxLen ? `${s.slice(0, maxLen - 1).trimEnd()}…` : s,
    )
    .slice(0, maxItems);
}

export const novelVoiceCardSchema = z.object({
  toneLabel: z.string().min(2).max(120),
  traits: z.preprocess(
    (r) => clipList(r, 10, 160, 2),
    z.array(z.string().min(2).max(160)).min(4).max(10),
  ),
  doWrite: z.preprocess(
    (r) => clipList(r, 8, 200, 2),
    z.array(z.string().min(2).max(200)).min(3).max(8),
  ),
  /** Short original lines in the target voice (not copied from published books). */
  sampleLines: z.preprocess(
    (r) => clipList(r, 4, SAMPLE_MAX, 8),
    z.array(z.string().min(8).max(SAMPLE_MAX + 1)).min(2).max(4),
  ),
  endingRotation: z.preprocess(
    (r) => clipList(r, 6, 40, 2),
    z.array(z.string().min(2).max(40)).min(3).max(6),
  ),
});

export type NovelVoiceCardParsed = z.infer<typeof novelVoiceCardSchema>;

export function emptyVoiceCard(): NovelVoiceCard {
  return {
    toneLabel: "",
    traits: [],
    doWrite: [],
    sampleLines: [],
    endingRotation: ["Handlung", "Dialog", "sinnlich", "offen"],
  };
}

export function parseVoiceCard(raw: unknown): NovelVoiceCard | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = novelVoiceCardSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    toneLabel: parsed.data.toneLabel.trim(),
    traits: parsed.data.traits.map((t) => t.trim()).filter(Boolean),
    doWrite: parsed.data.doWrite.map((t) => t.trim()).filter(Boolean),
    sampleLines: parsed.data.sampleLines.map((t) => t.trim()).filter(Boolean),
    endingRotation: parsed.data.endingRotation
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export function getVoiceCard(bundle: NovelBundle): NovelVoiceCard | null {
  const rules = bundle.styleGuide?.styleRules;
  if (!rules) return null;
  return parseVoiceCard(rules.voiceCard);
}

/** Ending type for this chapter index (0-based rotation). */
export function voiceEndingHint(
  card: NovelVoiceCard | null,
  chapterNumber: number,
): string {
  const rot =
    card?.endingRotation?.length
      ? card.endingRotation
      : ["Handlung", "Dialog", "sinnlich", "offen"];
  const idx = Math.max(0, chapterNumber - 1) % rot.length;
  return rot[idx] ?? "Handlung";
}

/**
 * Author-facing block: positive voice + few-shot samples (no ban templates).
 */
export function formatVoiceCardForAuthor(
  card: NovelVoiceCard | null,
  chapterNumber?: number,
): string {
  if (!card || (!card.toneLabel && card.traits.length === 0)) {
    return `# Zielstimme
(noch keine Stimmkarte — schreib konkret, uneben, in der Tonalität der Idee.)`;
  }
  const ending =
    chapterNumber != null
      ? `\nKapitelende-Typ diese Runde: ${voiceEndingHint(card, chapterNumber)}`
      : "";
  return `# Zielstimme — ${card.toneLabel || "aus der Idee"}
## Harte Merkmale
${card.traits.map((t) => `- ${t}`).join("\n") || "- —"}
## So schreiben
${card.doWrite.map((t) => `- ${t}`).join("\n") || "- —"}
## Klangproben (Richtung, nicht wörtlich kopieren)
${card.sampleLines.map((s) => `> ${s}`).join("\n") || "> —"}
${ending}

Schreibe in dieser Stimme: außergewöhnlich im Rahmen der Tonalität, nicht Mittelmaß.`;
}
