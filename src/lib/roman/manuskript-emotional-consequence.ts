/**
 * Book-wide emotional consequence / value-change pass on Manuskript prose.
 * After peaks & revelations, later chapters must show changed want, feeling,
 * and behavior — not an emotional reset. Runs before Opus content-freeze.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { applyRouteTarget } from "@/lib/roman/pipeline/apply";
import {
  formatManuskriptChapterHeading,
  parsePlotChapters,
  type PlotChapter,
} from "@/lib/roman/plot-chapters";
import {
  formatArcContractsForChapter,
  formatCentralArcsBlock,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

/** History marker — skip re-run inside the same Verbessern job. */
export const EMOTIONAL_CONSEQUENCE_DONE_DETAIL = "emotional-consequence-done";

const SAMPLE_CHARS = 780;
const AFTERMATH_HEAD = 500;
/** Cap Co-Autor rewrites. */
const MAX_REWRITE_CHAPTERS = 6;
/** Cap chapters sent to the auditor. */
const MAX_AUDIT_FOCUS = 12;

export type EmotionalConsequenceFinding = {
  kind: "value_change" | "aftermath" | "motivation";
  chapterNumbers: number[];
  summary: string;
  patchFocus: string;
};

export type EmotionalConsequencePassResult = {
  roman: RomanKontext;
  findings: EmotionalConsequenceFinding[];
  patchedChapters: number[];
  summary: string;
  skipped: boolean;
  skipReason?: string;
};

function clip(s: string, max: number): string {
  const t = s.replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function clipEnd(s: string, max: number): string {
  const t = s.replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return t;
  return `…${t.slice(-max).trim()}`;
}

function uniqueSortedChapters(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n >= 1))]
    .map((n) => Math.floor(n))
    .sort((a, b) => a - b);
}

/**
 * Peak/payoff/aftermath + high-tension + book anchors — where emotion must land.
 */
export function selectEmotionalFocusChapters(
  chapters: PlotChapter[],
  structured: RomanSzenenplotStructured | null | undefined,
): number[] {
  const filled = chapters.filter((c) => c.body.trim().length >= 80);
  if (filled.length === 0) return [];
  const valid = new Set(filled.map((c) => c.number));
  const focus = new Set<number>();

  for (const arc of structured?.centralArcs ?? []) {
    for (const n of [
      arc.setupChapter,
      arc.peakChapter,
      arc.peakChapter + 1,
      arc.payoffChapter,
      arc.payoffChapter + 1,
    ]) {
      if (valid.has(n)) focus.add(n);
    }
  }

  for (const ch of structured?.chapters ?? []) {
    if (!valid.has(ch.number)) continue;
    const hot = (ch.arcBeats ?? []).some((b) => b.tension >= 4);
    const hasValue = (ch.scenes ?? []).some(
      (s) => (s.dramaturgy?.outcome_value_change ?? "").trim().length >= 8,
    );
    if (hot || hasValue) focus.add(ch.number);
  }

  focus.add(filled[0]!.number);
  focus.add(filled[filled.length - 1]!.number);
  if (filled.length >= 3) {
    focus.add(filled[Math.floor(filled.length / 2)]!.number);
  }

  const sorted = uniqueSortedChapters([...focus]).filter((n) => valid.has(n));
  if (sorted.length <= MAX_AUDIT_FOCUS) return sorted;

  // Prefer arc peaks/payoffs when trimming.
  const priority = new Set<number>();
  for (const arc of structured?.centralArcs ?? []) {
    priority.add(arc.peakChapter);
    priority.add(arc.payoffChapter);
    priority.add(arc.peakChapter + 1);
  }
  const preferred = sorted.filter((n) => priority.has(n));
  const rest = sorted.filter((n) => !priority.has(n));
  return [...preferred, ...rest].slice(0, MAX_AUDIT_FOCUS);
}

function buildValueChangeHints(
  structured: RomanSzenenplotStructured | null | undefined,
  focusNums: number[],
): string {
  if (!structured?.chapters?.length) return "";
  const want = new Set(focusNums);
  const lines: string[] = [];
  for (const ch of structured.chapters) {
    if (!want.has(ch.number)) continue;
    const values = (ch.scenes ?? [])
      .map((s) => s.dramaturgy?.outcome_value_change?.trim())
      .filter((v): v is string => Boolean(v && v.length >= 6))
      .slice(0, 3);
    const beats = (ch.arcBeats ?? [])
      .filter((b) => b.mustShow.trim() || b.delta.trim())
      .slice(0, 3)
      .map(
        (b) =>
          `T${b.tension} ${b.arcId}: ${b.mustShow || b.delta}`.slice(0, 140),
      );
    if (!values.length && !beats.length) continue;
    lines.push(`### Kap.${ch.number} — ${ch.title || "—"}`);
    for (const v of values) {
      lines.push(`- Soll-Wertwechsel: ${v.slice(0, 160)}`);
    }
    for (const b of beats) {
      lines.push(`- Arc: ${b}`);
    }
  }
  return lines.join("\n").slice(0, 6_000);
}

function buildEmotionalSamples(
  chapters: PlotChapter[],
  focusNums: number[],
  structured: RomanSzenenplotStructured | null | undefined,
): string {
  const byNum = new Map(chapters.map((c) => [c.number, c] as const));
  const peakSet = new Set(
    (structured?.centralArcs ?? []).map((a) => a.peakChapter),
  );
  const lines: string[] = [];
  for (const num of focusNums) {
    const ch = byNum.get(num);
    if (!ch?.body.trim()) continue;
    lines.push(
      `### Kap.${ch.number} — ${ch.title.trim() || "—"}
${clip(ch.body, SAMPLE_CHARS)}`,
    );
    if (peakSet.has(num)) {
      const next = byNum.get(num + 1);
      if (next?.body.trim()) {
        lines.push(
          `### Nachwirkung nach Peak Kap.${num} → Anfang Kap.${next.number}
${clip(next.body, AFTERMATH_HEAD)}`,
        );
      }
    }
  }
  return lines.join("\n\n").slice(0, 26_000);
}

/**
 * Flash audit: missing value-change, flat aftermath, motivation reset.
 * Fail-soft → empty findings.
 */
export async function auditManuskriptEmotionalConsequence(input: {
  manuskriptText: string;
  structured: RomanSzenenplotStructured | null | undefined;
}): Promise<EmotionalConsequenceFinding[]> {
  const chapters = parsePlotChapters(input.manuskriptText).filter((c) =>
    c.body.trim(),
  );
  if (chapters.length < 2) return [];

  const focusNums = selectEmotionalFocusChapters(
    chapters,
    input.structured,
  );
  if (focusNums.length < 2) return [];

  const arcsOverview = formatCentralArcsBlock(
    input.structured?.centralArcs ?? [],
  );
  const valueHints = buildValueChangeHints(input.structured, focusNums);
  const samples = buildEmotionalSamples(
    chapters,
    focusNums,
    input.structured,
  );

  try {
    const model = await resolveRomanAssistModel();
    let raw = "";
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = (
          await generateText({
            model,
            systemInstruction: `Du bist Entwicklungslektor für emotionale Konsequenzen und Dramaturgie.
Prüfe NUR:
1) value_change: Hat das Kapitel einen spürbaren emotionalen/Wert-Wechsel (Wollen, Nähe, Schuld, Mut, Hoffnung) — nicht nur Plot-Ereignisse?
2) aftermath: Nach Peak/Verletzung/Enthüllung — handelt/fühlt die Figur im Folkapitel anders, oder emotionaler Reset?
3) motivation: Bleibt das Warum-jetzt kausal aus dem emotionalen Stand des Vorgängers?

Antworte NUR als JSON:
{"findings":[{"kind":"value_change"|"aftermath"|"motivation","chapterNumbers":[8,9],"summary":"…","patchFocus":"…"}]}
Max. 5 findings. Nur klare Schwächen. Wenn gut: leeres Array.
aftermath oft Peak + Folkapitel. Keine Stil-/Prosa-Kritik.`,
            userText: `# Zentrale Bögen
${arcsOverview || "(keine centralArcs)"}

# Soll-Wertwechsel / Arc-Beats (Gerüst)
${valueHints || "(keine strukturierten Hinweise)"}

# Stichproben Prosa (Fokuskapitel)
${samples}

Welche klaren emotionalen Schwächen? Max. 5.`,
            preferJson: true,
            maxTokens: 1_200,
            timeoutMs: 70_000,
            reasoningEffort: "low",
          })
        ).trim();
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
        if (attempt >= 1) break;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (lastErr || !raw) return [];

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Emotional-Consequence");
    } catch {
      return [];
    }
    if (!obj || typeof obj !== "object") return [];
    const list = Array.isArray((obj as { findings?: unknown }).findings)
      ? ((obj as { findings: unknown[] }).findings)
      : [];

    const findings: EmotionalConsequenceFinding[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const kindRaw = String(row.kind ?? "").trim().toLowerCase();
      const kind: EmotionalConsequenceFinding["kind"] =
        kindRaw === "aftermath"
          ? "aftermath"
          : kindRaw === "motivation"
            ? "motivation"
            : "value_change";
      const nums = Array.isArray(row.chapterNumbers)
        ? uniqueSortedChapters(row.chapterNumbers.map((n) => Number(n)))
        : [];
      const summary = String(row.summary ?? "").trim();
      const patchFocus = String(row.patchFocus ?? summary).trim();
      if (!nums.length || summary.length < 12) continue;
      findings.push({
        kind,
        chapterNumbers: nums.slice(0, 3),
        summary: summary.slice(0, 280),
        patchFocus: (patchFocus || summary).slice(0, 400),
      });
      if (findings.length >= 5) break;
    }
    return findings;
  } catch {
    return [];
  }
}

function buildPatchBriefForChapter(input: {
  chapterNumber: number;
  findings: EmotionalConsequenceFinding[];
  chapters: PlotChapter[];
  structured: RomanSzenenplotStructured | null | undefined;
}): string {
  const relevant = input.findings.filter((f) =>
    f.chapterNumbers.includes(input.chapterNumber),
  );
  const ch = input.chapters.find((c) => c.number === input.chapterNumber);
  const prev = input.chapters.find(
    (c) => c.number === input.chapterNumber - 1,
  );
  const next = input.chapters.find(
    (c) => c.number === input.chapterNumber + 1,
  );

  const focusLines = relevant
    .map((f) => `- [${f.kind}] ${f.patchFocus}`)
    .join("\n");

  const prevTail = prev?.body.trim()
    ? clipEnd(prev.body, 480)
    : "";
  const nextHead = next?.body.trim()
    ? clip(next.body, 360)
    : "";

  const arcContracts = formatArcContractsForChapter(
    input.structured,
    input.chapterNumber,
    2,
  );

  const structuredCh = input.structured?.chapters.find(
    (c) => c.number === input.chapterNumber,
  );
  const valueLines = (structuredCh?.scenes ?? [])
    .map((s) => s.dramaturgy?.outcome_value_change?.trim())
    .filter((v): v is string => Boolean(v && v.length >= 6))
    .slice(0, 4)
    .map((v) => `- ${v}`)
    .join("\n");

  return `ARBEITSAUFTRAG — Emotionale Konsequenzen Kap. ${input.chapterNumber}:
Schärfe NUR emotionale Tiefe, Wertwechsel und Nachwirkung. Keine neue Plot-Handlung erfinden, die das Gerüst bricht.
Behalte Beats/Fakten/Figuren — zeige, dass Ereignisse INNERLICH und im Verhalten etwas ändern.

HARTE REGELN:
- Spürbarer Wertwechsel (Wollen/Nähe/Schuld/Mut/Hoffnung) — nicht nur äußere Ereignisse.
- Nach Peak/Verletzung/Enthüllung: Figur handelt und fühlt anders als davor (kein emotionaler Reset).
- Motivation „warum jetzt“ muss aus dem emotionalen Stand des Vorgängers folgen.
- Keine Meta-Sätze, kein Psychojargon. Emotion in Handlung, Dialog, Körper, Entscheidung.
- Keine neuen Beats; gleiche Reihenfolge der Ereignisse.

# Befunde für dieses Kapitel
${focusLines || "- Wertwechsel / Nachwirkung lokal schärfen"}

${valueLines ? `# Soll-Wertwechsel (Gerüst)\n${valueLines}\n` : ""}
${prevTail ? `# Ende Vorgänger (emotionaler Stand) — Kap. ${prev!.number}\n${prevTail}\n` : ""}
${nextHead ? `# Anfang Nachfolger — darauf emotionale Residuen lassen\n${nextHead}\n` : ""}
${arcContracts ? `${arcContracts}\n` : ""}
# Kapitel-Meta
${ch ? formatManuskriptChapterHeading(ch) : `Kapitel ${input.chapterNumber}`}

Schreibe den vollständigen Kapitel-Body neu (gleiche Ereignisse, tiefere emotionale Konsequenz).`.slice(
    0,
    5_500,
  );
}

/**
 * Audit + selective Co-Autor rewrites. Fail-soft.
 * Skips clever_erzaehlt (no continuous emotional throughline).
 */
export async function runManuskriptEmotionalConsequencePass(input: {
  roman: RomanKontext;
  onProgress?: (label: string) => void | Promise<void>;
}): Promise<EmotionalConsequencePassResult> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp === "clever_erzaehlt") {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Emotionale Konsequenzen übersprungen (Clever erzählt).",
      skipped: true,
      skipReason: "clever_erzaehlt",
    };
  }

  const text = (editorial.manuskriptText ?? "").trim();
  if (!text) {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Emotionale Konsequenzen übersprungen (kein Manuskript).",
      skipped: true,
      skipReason: "empty",
    };
  }

  await input.onProgress?.(
    "Emotion · Wertwechsel & Nachwirkung prüfen …",
  );
  const findings = await auditManuskriptEmotionalConsequence({
    manuskriptText: text,
    structured: editorial.szenenplotStructured,
  });

  if (findings.length === 0) {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Emotion: keine klaren Konsequenz-/Wertwechsel-Schwächen.",
      skipped: false,
    };
  }

  const chapters = parsePlotChapters(text);
  const toPatch = uniqueSortedChapters(
    findings.flatMap((f) => f.chapterNumbers),
  ).slice(0, MAX_REWRITE_CHAPTERS);

  if (toPatch.length === 0) {
    return {
      roman: input.roman,
      findings,
      patchedChapters: [],
      summary: "Emotion: Befunde ohne gültige Kapitel.",
      skipped: false,
    };
  }

  await input.onProgress?.(
    `Emotion · ${toPatch.length} Kapitel nachziehen (Kap. ${toPatch.join(", ")}) …`,
  );

  const critiqueText = findings
    .map((f) => `[${f.kind}] Kap. ${f.chapterNumbers.join("+")}: ${f.summary}`)
    .join("\n");

  try {
    const applied = await applyRouteTarget({
      roman: input.roman,
      critiqueText,
      target: {
        stage: "manuskript",
        reason: "Emotionale-Konsequenzen-Pass",
        patchBrief: `Emotionale Konsequenzen — Wertwechsel und Nachwirkung schärfen (Kap. ${toPatch.join(", ")}).`,
        chapterNumbers: toPatch,
      },
      patchBriefForChapter: (chapterNumber) =>
        buildPatchBriefForChapter({
          chapterNumber,
          findings,
          chapters,
          structured: editorial.szenenplotStructured,
        }),
    });

    const patched = applied.patchedChapters ?? toPatch;
    return {
      roman: applied.roman,
      findings,
      patchedChapters: patched,
      summary:
        patched.length > 0
          ? `Emotion: Kap. ${patched.join(", ")} nachgezogen (${findings.length} Befunde).`
          : `Emotion: Befunde ohne sichtbare Patch-Wirkung (${findings.length}).`,
      skipped: false,
    };
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : "Emotionale Konsequenzen fehlgeschlagen";
    return {
      roman: input.roman,
      findings,
      patchedChapters: [],
      summary: `Emotion abgebrochen: ${msg.slice(0, 200)}`,
      skipped: false,
    };
  }
}

export function emotionalConsequenceAlreadyDone(
  events: Array<{ detail?: string }>,
): boolean {
  return events.some((e) => e.detail === EMOTIONAL_CONSEQUENCE_DONE_DETAIL);
}
