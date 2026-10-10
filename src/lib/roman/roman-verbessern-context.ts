/**
 * Stable context for Roman Verbessern (Claude Batch / Opus Stil-Pass).
 * Cross-chapter voice anchor + Regeln/Tonalität — byte-identical across
 * ALL chapters and BOTH waves so Anthropic prompt-cache (1h) can reuse the
 * system prefix. Polished Wave-1 voice hints go in userText only (uncached).
 */

import {
  formatRichtungenLabel,
  normalizeRichtungen,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import type { PlotChapter } from "@/lib/roman/plot-chapters";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

/** Larger Stilanker → more shared cacheable tokens across the batch. */
const ANCHOR_CHAPTER_CHARS = 2_200;
/** Uncached Wave-2 voice hint (polished Welle-1) — keep modest. */
const VOICE_LOCK_CHAPTER_CHARS = 900;
/** Stil-Pass seam: short prev tail (content is in the chapter body). */
export const STIL_PASS_PREV_TAIL_CHARS = 800;
/** Stil-Pass next-chapter hook peek. */
export const STIL_PASS_NEXT_HEAD_CHARS = 280;
const TON_CHARS = 1_800;
const REGELN_CHARS = 2_400;
const STILBIBEL_CHARS = 1_200;
const KI_REGELN_CHARS = 1_000;

function clipBody(body: string, maxChars: number): string {
  const t = stabilizeCacheText(body);
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.55);
  const tail = maxChars - head - 20;
  return `${t.slice(0, head).trim()}\n\n[…]\n\n${t.slice(-tail).trim()}`;
}

/**
 * Byte-stable text for cache prefixes: LF only, no trailing spaces per line,
 * single trailing newline stripped (callers join with `\n\n`).
 */
export function stabilizeCacheText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pick two longest chapters among the first four filled — avoids anchoring on
 * a thin Kap. 1 when Kap. 2–3 already carry the real book voice.
 * Pass `preferred` only for uncached voice-lock samples — never for the
 * cacheable Stilanker (would bust the prefix between waves).
 */
export function selectStyleAnchorChapters(
  chapters: PlotChapter[],
  preferred?: PlotChapter[],
): PlotChapter[] {
  if (preferred?.length) {
    const filled = preferred.filter((c) => c.body.trim().length >= 80);
    if (filled.length >= 1) return filled.slice(0, 2);
  }
  const filled = chapters.filter((c) => c.body.trim().length >= 80);
  if (filled.length === 0) return [];
  const pool = filled.slice(0, Math.min(4, filled.length));
  return [...pool]
    .sort((a, b) => b.body.trim().length - a.body.trim().length)
    .slice(0, 2)
    .sort((a, b) => a.number - b.number);
}

/**
 * Sample voice/register anchor for the **cacheable** system prefix.
 * Always from Manuskript chapters — never polished Wave-1 (wave-stable).
 */
export function buildCrossChapterStyleAnchor(
  manuskriptChapters: PlotChapter[],
  /** @deprecated ignored for cache stability — use {@link buildWaveVoiceLockAddendum} */
  _preferred?: PlotChapter[],
): string {
  void _preferred;
  const samples = selectStyleAnchorChapters(manuskriptChapters);
  if (samples.length === 0) {
    return `# Cross-Chapter-Stilanker
(noch keine Manuskript-Kapitel — Stimme aus Tonalität/Regeln ableiten)`;
  }
  const blocks = samples.map((ch) => {
    const title = ch.title.trim() || `Kapitel ${ch.number}`;
    return `## Anker Kap. ${ch.number} — ${title}
${clipBody(ch.body, ANCHOR_CHAPTER_CHARS)}`;
  });

  return stabilizeCacheText(`# Cross-Chapter-Stilanker (MUSS — Stimme/Register über Kapitelgrenzen)
Gleiche Erzählstimme, gleiches Register, vergleichbarer Satzrhythmus wie in diesen Anker-Kapiteln.
Nicht kopieren/paraphrasieren — nur als Maßstab für Wortwahl und Ton. Inhalt der Zielkapitel bleibt eingefroren.

${blocks.join("\n\n")}`);
}

/**
 * Uncached userText addendum for Wave 2: polished Welle-1 voice samples.
 * Same string for every Wave-2 chapter (byte-identical within the wave).
 */
export function buildWaveVoiceLockAddendum(
  polishedAnchorChapters: PlotChapter[],
): string {
  const samples = selectStyleAnchorChapters([], polishedAnchorChapters);
  if (samples.length === 0) return "";
  const blocks = samples.map((ch) => {
    const title = ch.title.trim() || `Kapitel ${ch.number}`;
    return `## Kap. ${ch.number} — ${title}
${clipBody(ch.body, VOICE_LOCK_CHAPTER_CHARS)}`;
  });
  return stabilizeCacheText(`# Stimme nach Welle 1 (Orientierung — uncached)
Register/Rhythmus an diesen polierten Ankern ausrichten. Inhalt DIESES Kapitels bleibt eingefroren (Manuskript-Beats).

${blocks.join("\n\n")}`);
}

/**
 * Regeln + Tonalität + optional Stilbibel / KI-Regelwerk for Opus Stil-Pass.
 */
export function buildVerbessernRulesAndTone(input: {
  roman: Pick<
    RomanKontext,
    "tonalitaet" | "stilbibel" | "kiRegelwerk" | "genre"
  >;
  editorial: RomanEditorial;
}): string {
  const ton = (input.roman.tonalitaet ?? "").trim();
  const stilbibel = (input.roman.stilbibel ?? "").trim();
  const ki = (input.roman.kiRegelwerk ?? "").trim();
  const grob = (input.editorial.grobRegeln ?? "").trim();
  const harte = (input.editorial.harteRegeln ?? [])
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 16);
  const richtungen = normalizeRichtungen(input.editorial.richtungen);
  const genre = (input.roman.genre ?? "").trim();

  const parts: string[] = [
    `# Sprache & Tonalität (MUSS — in jedem Kapitel spürbar)
Genre: ${genre || "—"}
${ton.slice(0, TON_CHARS) || "(Tonalität leer — aus Genre/Spec ableiten, aber konsistent bleiben)"}`,
  ];

  if (richtungen.length) {
    parts.push(
      `# Leserversprechen / Richtung (MUSS nicht brechen)
${formatRichtungenLabel(richtungen)}`,
    );
  }

  const regelLines: string[] = [];
  if (grob) {
    regelLines.push(`Basis-Regeln:\n${grob.slice(0, REGELN_CHARS)}`);
  }
  if (harte.length) {
    regelLines.push(
      `Harte Verlagsregeln:\n${harte.map((r) => `– ${r}`).join("\n")}`,
    );
  }
  if (ki) {
    regelLines.push(`KI-Regelwerk:\n${ki.slice(0, KI_REGELN_CHARS)}`);
  }
  parts.push(
    `# Regeln (MUSS einhalten — Stil-Pass ändert Inhalt nicht, darf Regeln nicht verletzen)
${regelLines.join("\n\n") || "(keine expliziten Regeln hinterlegt)"}`,
  );

  if (stilbibel.length >= 40) {
    parts.push(
      `# Stilbibel (Orientierung)
${stilbibel.slice(0, STILBIBEL_CHARS)}`,
    );
  }

  return stabilizeCacheText(parts.join("\n\n"));
}

/**
 * Cacheable prefix addendum for Verbessern batches (after slim canon).
 * Manuskript Stilanker only — identical for Welle 1 and Welle 2.
 */
export function buildVerbessernCacheableExtras(input: {
  roman: Pick<
    RomanKontext,
    "tonalitaet" | "stilbibel" | "kiRegelwerk" | "genre"
  >;
  editorial: RomanEditorial;
  manuskriptChapters: PlotChapter[];
  /** Ignored — kept for call-site compat; cache always uses Manuskript anchors. */
  preferredAnchorChapters?: PlotChapter[];
}): string {
  void input.preferredAnchorChapters;
  return stabilizeCacheText(
    [
      buildVerbessernRulesAndTone({
        roman: input.roman,
        editorial: input.editorial,
      }),
      buildCrossChapterStyleAnchor(input.manuskriptChapters),
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

/**
 * Full system cache prefix for one Verbessern run (both waves).
 */
export function buildVerbessernRunCachePrefix(input: {
  slimCanon: string;
  roman: Pick<
    RomanKontext,
    "tonalitaet" | "stilbibel" | "kiRegelwerk" | "genre"
  >;
  editorial: RomanEditorial;
  manuskriptChapters: PlotChapter[];
}): string {
  const extras = buildVerbessernCacheableExtras({
    roman: input.roman,
    editorial: input.editorial,
    manuskriptChapters: input.manuskriptChapters,
  });
  return stabilizeCacheText(`${input.slimCanon.trim()}\n\n${extras}`);
}

/**
 * Slim uncached chapter context for Stil-Pass.
 * Avoids the fat Manuskript chapter packet (story state / full contracts /
 * graph) — Beats leben im Kapitel-Body; nur Seam + Secret/Ban-Stichworte.
 */
export function buildStilPassChapterContext(input: {
  previousTail: string;
  structured: RomanSzenenplotStructured | null | undefined;
  chapterNumber: number;
}): string {
  const parts: string[] = [
    `# Continuity (kurz)
Inhalt = Manuskript-Body unten (eingefroren). Nur Naht zum Vorgänger halten.`,
  ];
  const tail = input.previousTail.trim();
  if (tail) {
    parts.push(`## Ende Vorgänger (anschließen, nicht wiederholen)\n${tail}`);
  } else {
    parts.push("## Ende Vorgänger\n(Kapitel 1 — kein Vorgänger)");
  }

  const ch = input.structured?.chapters?.find(
    (c) => c.number === input.chapterNumber,
  );
  if (ch) {
    const secrets: string[] = [];
    for (const scene of ch.scenes ?? []) {
      const secret = scene.information_flow?.kept_secret?.trim() ?? "";
      if (!secret || /^(keins?|none|—|-)$/i.test(secret)) continue;
      secrets.push(
        `- ${scene.scene_id || "Szene"}: ${secret.slice(0, 120)}`,
      );
      if (secrets.length >= 6) break;
    }
    if (secrets.length) {
      parts.push(`# Geheimnisse halten (nicht explizit ausplaudern)\n${secrets.join("\n")}`);
    }
    const bans = (ch.mustNotRepeat ?? [])
      .map((b) => b.trim())
      .filter((b) => b.length >= 8)
      .slice(0, 6)
      .map((b) => `- ${b.slice(0, 100)}`);
    if (bans.length) {
      parts.push(`# Nicht wiederholen\n${bans.join("\n")}`);
    }
  }

  return stabilizeCacheText(parts.join("\n\n"));
}
