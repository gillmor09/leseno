/**
 * Soft book-wide voice audit after Roman Verbessern.
 * Samples start / middle / end against the Stilanker — warnings only, no revert.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type { PlotChapter } from "@/lib/roman/plot-chapters";

const SAMPLE_CHARS = 900;

function clip(s: string, max: number): string {
  const t = s.replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function pickSamples(chapters: PlotChapter[]): PlotChapter[] {
  const filled = chapters.filter((c) => c.body.trim().length >= 80);
  if (filled.length === 0) return [];
  if (filled.length <= 3) return filled;
  const mid = filled[Math.floor(filled.length / 2)]!;
  return [filled[0]!, mid, filled[filled.length - 1]!];
}

export type RomanVoiceCheckFinding = {
  chapterNumber: number;
  message: string;
};

/**
 * Flash Stichprobe: Register/Stimme Anfang–Mitte–Ende vs. Stilanker.
 * Fail-soft: empty findings on assist errors.
 */
export async function checkRomanBookVoice(input: {
  romanChapters: PlotChapter[];
  styleAnchor: string;
}): Promise<RomanVoiceCheckFinding[]> {
  const samples = pickSamples(input.romanChapters);
  const anchor = input.styleAnchor.trim();
  if (samples.length < 2 || anchor.length < 40) return [];

  try {
    const model = await resolveRomanAssistModel();
    const blocks = samples
      .map(
        (ch) =>
          `## Kap. ${ch.number} — ${ch.title.trim() || "—"}\n${clip(ch.body, SAMPLE_CHARS)}`,
      )
      .join("\n\n");

    let raw = "";
    let lastGenError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = (
          await generateText({
            model,
            systemInstruction: `Du prüfst buchweite Stimmenkonsistenz nach einem Stil-Pass.
Vergleiche Stichproben (Anfang/Mitte/Ende) mit dem Stilanker.
Melde NUR klare Brüche: anderes Register, Humor-Niveau, Distanz, Satzrhythmus, Ton.
Keine Plot-Kritik. Keine Mikro-Stilnörgelei.
Antwort NUR als JSON:
{"findings":[{"chapterNumber":12,"message":"…"}]}`,
            userText: `# Stilanker (Maßstab)
${anchor.slice(0, 3_500)}

# Stichproben
${blocks}

Welche Kapitel brechen klar die Buchstimme? Max. 5. Wenn konsistent: leeres Array.`,
            preferJson: true,
            maxTokens: 800,
            timeoutMs: 50_000,
            reasoningEffort: "none",
          })
        ).trim();
        lastGenError = null;
        break;
      } catch (error) {
        lastGenError = error;
        if (attempt >= 1) break;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (lastGenError || !raw) return [];

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Stimmen-Check");
    } catch {
      return [];
    }
    if (!obj || typeof obj !== "object") return [];
    const list = Array.isArray((obj as Record<string, unknown>).findings)
      ? ((obj as Record<string, unknown>).findings as unknown[])
      : [];
    const findings: RomanVoiceCheckFinding[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const n = Number(row.chapterNumber);
      const message = String(row.message ?? "").trim();
      if (!Number.isFinite(n) || n < 1 || message.length < 12) continue;
      findings.push({
        chapterNumber: Math.floor(n),
        message: message.slice(0, 280),
      });
      if (findings.length >= 5) break;
    }
    return findings;
  } catch {
    return [];
  }
}
