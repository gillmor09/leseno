/**
 * Manuskript continuity: story_state after each chapter + compact context buffer
 * before Co-Autor writes. Uses Bewerter model (fast/cheap) with custom prompts —
 * no new KI role. Fail-soft: keep previous state / deterministic buffer on errors.
 */

import { generateText } from "@/lib/ai/provider";
import {
  formatStoryStateForPrompt,
  parseRomanStoryState,
  type RomanStoryState,
} from "@/lib/roman/editorial";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import {
  formatChapterHeading,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";

/** Tail of previous prose for transition (not full book). */
export const CONTINUITY_PREV_TAIL_CHARS = 3_500;

/** Max assembled buffer passed to Co-Autor. */
export const CONTINUITY_BUFFER_MAX_CHARS = 4_500;

function stringList(raw: unknown, max: number, len: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, max)
    .map((s) => s.slice(0, len));
}

/**
 * Deterministic context buffer when AI assembly fails or is skipped.
 */
export function buildDeterministicChapterContextBuffer(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  previousTail: string;
  lektorBriefSnippet?: string;
}): string {
  const parts: string[] = [];
  const stateBlock = formatStoryStateForPrompt(input.storyState);
  if (stateBlock) parts.push(stateBlock);
  parts.push(
    `## Fokus dieses Kapitels\n${formatChapterHeading(input.chapter)}\n${input.chapter.body.trim().slice(0, 1_200) || "(nur Titel)"}`,
  );
  const tail = input.previousTail.trim();
  if (tail) {
    parts.push(
      `## Übergang — Ende des Vorgängers (nahtlos anschließen)\n${tail.slice(-CONTINUITY_PREV_TAIL_CHARS)}`,
    );
  } else {
    parts.push("## Übergang\n(Dies ist Kapitel 1 — kein Vorgänger.)");
  }
  if (input.lektorBriefSnippet?.trim()) {
    parts.push(
      `## Lektor-Prioritäten (kurz)\n${input.lektorBriefSnippet.trim().slice(0, 800)}`,
    );
  }
  parts.push(
    "## Continuity-Regeln\n- Harte Fakten und offene Fäden nicht vergessen oder widersprechen.\n- Keine Figuren/Orte/Gegenstände „neu erfinden“, die dem State widersprechen.",
  );
  return parts.join("\n\n").slice(0, CONTINUITY_BUFFER_MAX_CHARS);
}

/**
 * Compresses state + chapter focus + prev tail into a short writer buffer.
 * Uses Bewerter model slot; falls back to deterministic buffer.
 */
export async function assembleManuskriptChapterContext(input: {
  storyState: RomanStoryState | null;
  chapter: PlotChapter;
  previousTail: string;
  sharedContextSnippet?: string;
  lektorBriefSnippet?: string;
}): Promise<{ buffer: string; modelLabel: string | null }> {
  const fallback = buildDeterministicChapterContextBuffer(input);
  try {
    const { model } = await resolveRomanKiRolle("bewerter");
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du bereitest den Schreib-Kontext für EIN Manuskript-Kapitel vor.
Antworte auf Deutsch als knappes Markdown (keine Code-Fences, kein JSON).
Nur das, was der Co-Autor JETZT braucht: Continuity, Fokus, Übergang, Verbote.
Maximal ~350 Wörter. Keine Prosa schreiben.`,
        userText: `# Bisheriger Continuity-State
${formatStoryStateForPrompt(input.storyState) || "(noch leer — Kapitelanfang)"}

# Shared Setup (Ausschnitt)
${(input.sharedContextSnippet ?? "").slice(0, 2_500) || "(leer)"}

# Lektor-Brief (Ausschnitt)
${(input.lektorBriefSnippet ?? "").slice(0, 1_000) || "(leer)"}

# Dieses Kapitel (Gerüst)
${formatChapterHeading(input.chapter)}
${input.chapter.body.slice(0, 1_500)}

# Ende Vorgänger-Kapitel
${input.previousTail.trim().slice(-CONTINUITY_PREV_TAIL_CHARS) || "(Kapitel 1)"}

Erstelle den Context-Buffer mit Überschriften:
## Continuity
## Fokus dieses Kapitels
## Übergang
## Verbote / nicht widersprechen`,
        preferJson: false,
        maxTokens: 1_200,
        timeoutMs: 45_000,
        reasoningEffort: "none",
      })
    ).trim();
    const cleaned = raw
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (cleaned.length < 80) {
      return { buffer: fallback, modelLabel: model.label };
    }
    return {
      buffer: cleaned.slice(0, CONTINUITY_BUFFER_MAX_CHARS),
      modelLabel: model.label,
    };
  } catch {
    return { buffer: fallback, modelLabel: null };
  }
}

/**
 * Extract / merge continuity state after a chapter was written.
 * Fail-soft: returns previous state (or null) on parse/model errors.
 */
export async function extractManuskriptStoryState(input: {
  previous: RomanStoryState | null;
  chapterNumber: number;
  chapterTitle: string;
  chapterBody: string;
}): Promise<RomanStoryState | null> {
  try {
    const { model } = await resolveRomanKiRolle("bewerter");
    const prevBlock = formatStoryStateForPrompt(input.previous) || "(leer)";
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du pflegst die Continuity-Memory eines Romans.
Extrahiere den aktualisierten State NACH dem gelieferten Kapitel.
Antworte NUR als JSON (keine Markdown-Fences):
{
  "location": "aktueller Ort",
  "presentCharacters": ["Name", ...],
  "openThreads": ["…"],
  "secretsAndKnowledge": ["Wer weiß was"],
  "inventoryAndProps": ["Gegenstand / Status"],
  "relationshipNotes": ["A↔B: …"],
  "hardFacts": ["unverrückbare Fakten aus dem Text"],
  "mood": "kurze Stimmung"
}
Regeln: Vorherigen State mergen (überholte Orte/Gegenstände ersetzen, offene Fäden aktualisieren). Kurz halten (Stichpunkte). Nur belegbare Fakten aus dem Kapitel + sinnvollem Carry-over.`,
        userText: `# Bisheriger State
${prevBlock}

# Gerade geschrieben: Kapitel ${input.chapterNumber} — ${input.chapterTitle}
${input.chapterBody.slice(0, 12_000)}

Aktualisiere den State nach diesem Kapitel.`,
        preferJson: true,
        maxTokens: 1_500,
        timeoutMs: 60_000,
        reasoningEffort: "none",
      })
    ).trim();

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let obj: unknown = null;
    try {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice =
        start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      obj = JSON.parse(slice);
    } catch {
      return input.previous;
    }
    if (!obj || typeof obj !== "object") return input.previous;

    const row = obj as Record<string, unknown>;
    const merged = parseRomanStoryState({
      updatedAt: new Date().toISOString(),
      afterChapter: input.chapterNumber,
      location: row.location ?? input.previous?.location ?? "",
      presentCharacters:
        stringList(row.presentCharacters, 12, 80).length > 0
          ? row.presentCharacters
          : input.previous?.presentCharacters ?? [],
      openThreads:
        stringList(row.openThreads, 12, 240).length > 0
          ? row.openThreads
          : input.previous?.openThreads ?? [],
      secretsAndKnowledge:
        stringList(row.secretsAndKnowledge, 12, 240).length > 0
          ? row.secretsAndKnowledge
          : input.previous?.secretsAndKnowledge ?? [],
      inventoryAndProps:
        stringList(row.inventoryAndProps, 12, 160).length > 0
          ? row.inventoryAndProps
          : input.previous?.inventoryAndProps ?? [],
      relationshipNotes:
        stringList(row.relationshipNotes, 10, 200).length > 0
          ? row.relationshipNotes
          : input.previous?.relationshipNotes ?? [],
      hardFacts:
        stringList(row.hardFacts, 16, 240).length > 0
          ? row.hardFacts
          : input.previous?.hardFacts ?? [],
      mood: row.mood ?? input.previous?.mood ?? "",
    });
    return merged ?? input.previous;
  } catch {
    return input.previous;
  }
}
