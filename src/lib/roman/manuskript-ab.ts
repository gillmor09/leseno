/**
 * A/B beat choice for key Manuskript chapters (Anti-Klischee).
 * Path B (unconventional) is forced; no new KI role — uses Co-Autor.
 */

import { generateText } from "@/lib/ai/provider";
import type { PlotChapter } from "@/lib/roman/plot-chapters";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

const MAX_KEY_CHAPTERS = 4;

const KEYWORD_RE =
  /wendepunkt|entscheid|wahl|bruch|umkehr|opfer|verrat|konflikt|finale|schluss|beginn|einstieg|haken/i;

/**
 * Pick Schlüsselkapitel: first + last + Wendepunkt-ish + mid if needed (max 4).
 */
export function pickKeyChapterNumbers(chapters: PlotChapter[]): number[] {
  if (chapters.length < 2) return chapters.map((c) => c.number);
  const byNum = [...chapters].sort((a, b) => a.number - b.number);
  const picked = new Set<number>();
  picked.add(byNum[0]!.number);
  picked.add(byNum[byNum.length - 1]!.number);

  for (const ch of byNum) {
    if (picked.size >= MAX_KEY_CHAPTERS) break;
    const blob = `${ch.title}\n${ch.body}`;
    if (KEYWORD_RE.test(blob)) picked.add(ch.number);
  }

  if (picked.size < 3 && byNum.length >= 3) {
    const mid = byNum[Math.floor(byNum.length / 2)]!;
    picked.add(mid.number);
  }

  return [...picked].sort((a, b) => a - b).slice(0, MAX_KEY_CHAPTERS);
}

/**
 * Force unconventional beat (Pfad B) for one key chapter.
 * Returns empty string on failure (caller writes without A/B).
 */
export async function chooseUnconventionalChapterBeat(input: {
  chapter: PlotChapter;
  sharedContext: string;
  needsHint?: string;
}): Promise<string> {
  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const kern = input.chapter.body.trim().slice(0, 800) || "(kein Kernsatz)";
  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

Zusatzauftrag Anti-Klischee A/B:
Du entwirfst zwei kurze Handlungswege für EIN Kapitel und wählst Pfad B.
Antworte NUR mit dem gewählten Pfad B (3–6 Sätze), keine Meta-Liste, kein „Pfad A“.`,
    userText: `${input.sharedContext.slice(0, 6_000)}

# Kapitel ${input.chapter.number} — ${input.chapter.title}
Kernsatz / Gerüst:
${kern}

${input.needsHint?.trim() ? `# Leserbedürfnisse\n${input.needsHint.trim().slice(0, 1_500)}\n` : ""}
Aufgabe:
1) Pfad A (nur denken): konventioneller Genre-Verlauf.
2) Pfad B (schreiben): unkonventioneller Break — überraschend, aber logisch zu Spec/Figuren/Kernsatz; altersgerecht; erfüllt ggf. vernachlässigtes Bedürfnis.
Liefere NUR Pfad B als verbindliche Beat-Anweisung für den Co-Autor (was passiert, wie Figuren reagieren, welcher Twist).`,
    preferJson: false,
    maxTokens: 700,
    timeoutMs: 60_000,
    reasoningEffort: "none",
  });

  const beat = raw
    .trim()
    .replace(/^```[\s\S]*?```$/m, (m) => m.replace(/```\w*/g, "").trim())
    .replace(/^(Pfad\s*B|Path\s*B)\s*[:\-–—]\s*/i, "")
    .trim();
  if (beat.length < 40) return "";
  return beat.slice(0, 1_200);
}

/** Prompt block for the chapter writer. */
export function formatPathBBlock(beat: string): string {
  const t = beat.trim();
  if (!t) return "";
  return `## Handlungsentscheidung — Pfad B (verbindlich, Anti-Klischee)
Schreibe DIESES Kapitel entlang dieses unkonventionellen Beats (nicht den naheliegenden Genre-Default):
${t}`;
}
