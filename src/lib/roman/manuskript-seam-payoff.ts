/**
 * Book-wide Seam / Payoff pass on Manuskript prose — before Opus content-freeze.
 * Audits chapter endings→next openings and centralArc setup/peak/payoff in prose,
 * then selectively rewrites only weak chapters via Co-Autor (`applyRouteTarget`).
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
  type RomanSzenenplotCentralArc,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

/** History / progress marker — skip re-run inside the same Verbessern job. */
export const SEAM_PAYOFF_DONE_DETAIL = "seam-payoff-done";

const SEAM_TAIL_CHARS = 520;
const SEAM_HEAD_CHARS = 420;
/** Cap Co-Autor rewrites so the pass stays focused and affordable. */
const MAX_REWRITE_CHAPTERS = 6;

export type SeamPayoffFinding = {
  kind: "seam" | "payoff";
  /** Chapters to patch (often N and/or N+1 for seams). */
  chapterNumbers: number[];
  summary: string;
  /** Concrete rewrite focus for the patch brief. */
  patchFocus: string;
};

export type SeamPayoffPassResult = {
  roman: RomanKontext;
  findings: SeamPayoffFinding[];
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

function buildSeamSamples(chapters: PlotChapter[]): string {
  const lines: string[] = [];
  for (let i = 0; i < chapters.length - 1; i += 1) {
    const a = chapters[i]!;
    const b = chapters[i + 1]!;
    if (a.body.trim().length < 80 || b.body.trim().length < 80) continue;
    lines.push(
      `### Naht Kap.${a.number} → Kap.${b.number}
# Ende Kap.${a.number} — ${a.title.trim() || "—"}
${clipEnd(a.body, SEAM_TAIL_CHARS)}

# Anfang Kap.${b.number} — ${b.title.trim() || "—"}
${clip(b.body, SEAM_HEAD_CHARS)}`,
    );
  }
  return lines.join("\n\n").slice(0, 28_000);
}

function buildArcRoleSamples(
  chapters: PlotChapter[],
  arcs: RomanSzenenplotCentralArc[],
): string {
  if (!arcs.length) return "";
  const byNum = new Map(chapters.map((c) => [c.number, c] as const));
  const lines: string[] = [];
  for (const arc of arcs.slice(0, 8)) {
    lines.push(
      `### Arc ${arc.id} — ${arc.label}
Setup Kap.${arc.setupChapter} · Peak Kap.${arc.peakChapter} · Payoff Kap.${arc.payoffChapter}${
        arc.notes ? ` · ${arc.notes}` : ""
      }${arc.parties.length ? ` · Parteien: ${arc.parties.join(", ")}` : ""}`,
    );
    for (const role of [
      ["Setup", arc.setupChapter],
      ["Peak", arc.peakChapter],
      ["Payoff", arc.payoffChapter],
    ] as const) {
      const ch = byNum.get(role[1]);
      if (!ch?.body.trim()) {
        lines.push(`# ${role[0]} Kap.${role[1]}: (fehlt / leer)`);
        continue;
      }
      lines.push(
        `# ${role[0]} Kap.${ch.number} — ${ch.title.trim() || "—"}
${clip(ch.body, 700)}`,
      );
    }
  }
  return lines.join("\n\n").slice(0, 18_000);
}

/**
 * Flash audit: weak seams + missing/soft arc setup/peak/payoff in prose.
 * Fail-soft → empty findings on assist errors.
 */
export async function auditManuskriptSeamAndPayoff(input: {
  manuskriptText: string;
  structured: RomanSzenenplotStructured | null | undefined;
}): Promise<SeamPayoffFinding[]> {
  const chapters = parsePlotChapters(input.manuskriptText).filter((c) =>
    c.body.trim(),
  );
  if (chapters.length < 2) return [];

  const arcs = input.structured?.centralArcs ?? [];
  const seamBlock = buildSeamSamples(chapters);
  const arcBlock = buildArcRoleSamples(chapters, arcs);
  const arcsOverview = formatCentralArcsBlock(arcs);

  try {
    const model = await resolveRomanAssistModel();
    let raw = "";
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = (
          await generateText({
            model,
            systemInstruction: `Du bist Entwicklungslektor für Roman-Nähte und Spannungsbögen.
Prüfe NUR:
1) Nähte: Ende Kap.N → Anfang Kap.N+1 — verdient der Anfang die Fortsetzung? Reset/Exposition-Dump/Tonbruch/verlorene Bewegung?
2) Payoffs: Sind Setup / Peak / Payoff der zentralen Bögen in der Prosa spürbar (nicht nur im Plan)?

Antworte NUR als JSON:
{"findings":[{"kind":"seam"|"payoff","chapterNumbers":[12,13],"summary":"…","patchFocus":"…"}]}
Max. 5 findings. Nur klare Schwächen. Wenn gut: leeres Array.
kind=seam → chapterNumbers oft [N,N+1] oder eines davon.
kind=payoff → Setup/Peak/Payoff-Kapitelnummern.`,
            userText: `# Zentrale Bögen
${arcsOverview || "(keine centralArcs — nur Nähte prüfen)"}

# Nähte (Ende → Anfang)
${seamBlock || "(keine Nähte)"}

# Arc-Rollen Stichproben
${arcBlock || "(keine Arc-Stichproben)"}

Welche klaren Schwächen? Max. 5.`,
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
      obj = parseModelJsonObject(raw, "Seam-Payoff");
    } catch {
      return [];
    }
    if (!obj || typeof obj !== "object") return [];
    const list = Array.isArray((obj as { findings?: unknown }).findings)
      ? ((obj as { findings: unknown[] }).findings)
      : [];

    const findings: SeamPayoffFinding[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const kindRaw = String(row.kind ?? "").trim().toLowerCase();
      const kind: "seam" | "payoff" =
        kindRaw === "payoff" ? "payoff" : "seam";
      const nums = Array.isArray(row.chapterNumbers)
        ? uniqueSortedChapters(
            row.chapterNumbers.map((n) => Number(n)),
          )
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
  findings: SeamPayoffFinding[];
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
    ? clipEnd(prev.body, SEAM_TAIL_CHARS)
    : "";
  const nextHead = next?.body.trim()
    ? clip(next.body, SEAM_HEAD_CHARS)
    : "";

  const arcContracts = formatArcContractsForChapter(
    input.structured,
    input.chapterNumber,
    2,
  );

  return `ARBEITSAUFTRAG — Seam/Payoff-Pass Kap. ${input.chapterNumber}:
Schärfe NUR Übergänge und Spannungs-Payoffs. Keine neue Handlung erfinden, die das Gerüst bricht.
Behalte Beats/Fakten/Figuren — ändere Anfang und/oder Ende so, dass die Naht verdient ist und Arc-MUSS spürbar wird.

HARTE REGELN:
- Ende des Kapitels muss den nächsten Anfang verdienen (Hook, offene Bewegung, emotionale Residuen).
- Anfang muss sich wie natürliche Fortsetzung des Vorgängers anfühlen — kein Reset, kein Exposition-Dump.
- Setup/Peak/Payoff der zentralen Bögen in DIESEM Kapitel nur wenn vorgesehen — nicht vorwegnehmen.
- Keine Meta-Sätze. Nur erzählende Prosa.

# Befunde für dieses Kapitel
${focusLines || "- Naht/Payoff lokal schärfen"}

${prevTail ? `# Ende Vorgänger (Kap. ${prev!.number}) — daran anschließen\n${prevTail}\n` : ""}
${nextHead ? `# Anfang Nachfolger (Kap. ${next!.number}) — darauf zulaufen\n${nextHead}\n` : ""}
${arcContracts ? `${arcContracts}\n` : ""}
# Kapitel-Meta
${ch ? formatManuskriptChapterHeading(ch) : `Kapitel ${input.chapterNumber}`}

Schreibe den vollständigen Kapitel-Body neu (gleiche Ereignisse, bessere Naht/Payoff).`.slice(
    0,
    5_500,
  );
}

/**
 * Audit + selective Co-Autor rewrites. Fail-soft: returns unchanged roman on audit empty/errors.
 * Skips clever_erzaehlt (independent Kurzgeschichten, no novel seams).
 */
export async function runManuskriptSeamPayoffPass(input: {
  roman: RomanKontext;
  onProgress?: (label: string) => void | Promise<void>;
}): Promise<SeamPayoffPassResult> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  if (editorial.buchTyp === "clever_erzaehlt") {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Seam/Payoff übersprungen (Clever erzählt).",
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
      summary: "Seam/Payoff übersprungen (kein Manuskript).",
      skipped: true,
      skipReason: "empty",
    };
  }

  await input.onProgress?.("Seam/Payoff · Nähte & Bögen prüfen …");
  const findings = await auditManuskriptSeamAndPayoff({
    manuskriptText: text,
    structured: editorial.szenenplotStructured,
  });

  if (findings.length === 0) {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Seam/Payoff: keine klaren Naht-/Payoff-Schwächen.",
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
      summary: "Seam/Payoff: Befunde ohne gültige Kapitel.",
      skipped: false,
    };
  }

  await input.onProgress?.(
    `Seam/Payoff · ${toPatch.length} Kapitel nachziehen (Kap. ${toPatch.join(", ")}) …`,
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
        reason: "Seam/Payoff-Pass",
        patchBrief: `Seam/Payoff-Pass — Nähte und Arc-Payoffs schärfen (Kap. ${toPatch.join(", ")}).`,
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
          ? `Seam/Payoff: Kap. ${patched.join(", ")} nachgezogen (${findings.length} Befunde).`
          : `Seam/Payoff: Befunde ohne sichtbare Patch-Wirkung (${findings.length}).`,
      skipped: false,
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Seam/Payoff fehlgeschlagen";
    return {
      roman: input.roman,
      findings,
      patchedChapters: [],
      summary: `Seam/Payoff abgebrochen: ${msg.slice(0, 200)}`,
      skipped: false,
    };
  }
}

/** True when Verbessern history already recorded a seam pass for this run. */
export function seamPayoffAlreadyDone(
  events: Array<{ detail?: string }>,
): boolean {
  return events.some((e) => e.detail === SEAM_PAYOFF_DONE_DETAIL);
}
