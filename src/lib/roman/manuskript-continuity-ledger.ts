/**
 * Book-wide continuity ledger for Manuskript prose: timeline (dates / clock
 * times), money (amounts / bookings / balances) and knowledge state (who
 * learns what in which chapter) — the three things that drift when chapters
 * are drafted one at a time with limited look-back.
 *
 * Two LLM stages, both Assist (Flash), no rewrite:
 *  1. Per chapter: extract the facts the prose actually states (Ist).
 *  2. One reconcile call: Ist ledger (all chapters) vs Soll from the
 *     structured Szenenplot (`information_flow`, `kept_secret`) → findings.
 *
 * Findings flow into the Manuskript Freigabe audit as `source: "ledger"`
 * (see `src/app/actions/roman-manuskript-freigabe.ts`).
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
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanKontext } from "@/lib/roman/types";

export type ContinuityLedgerKind = "timeline" | "money" | "knowledge";

export type ContinuityLedgerFinding = {
  kind: ContinuityLedgerKind;
  chapterNumbers: number[];
  summary: string;
  /** Short verbatim quote from the prose that shows the break (optional). */
  quote?: string;
};

/** Facts one chapter states — extracted by the model, kept compact. */
export type ChapterContinuityFacts = {
  chapter: number;
  /** Explicit dates / weekdays / clock times, in reading order. */
  zeitanker: string[];
  /** Amounts, bookings, balances, invoices with their context. */
  geld: string[];
  /** `Figur: erfährt/weiß … (wie)` — new knowledge gained in this chapter. */
  wissen: string[];
  /** `Figur: spricht über …` — things a figure references as already known. */
  bezug: string[];
};

const EXTRACT_CONCURRENCY = 4;
const EXTRACT_MAX_CHAPTER_CHARS = 60_000;
const SOLL_MAX_CHARS = 45_000;
const IST_MAX_CHARS = 90_000;
const MAX_FINDINGS = 12;
/** Cap Co-Autor rewrites per pass (same budget idea as Seam/Payoff). */
const MAX_REWRITE_CHAPTERS = 6;
const MAX_REWRITE_CHAPTERS_SEEDED = 2;

const LEDGER_KIND_LABEL: Record<ContinuityLedgerKind, string> = {
  timeline: "Zeit",
  money: "Geld",
  knowledge: "Wissensstand",
};

function uniqueSortedChapters(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n >= 1))]
    .map((n) => Math.floor(n))
    .sort((a, b) => a - b);
}

function asStringList(raw: unknown, max: number, maxLen = 220): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2)
    .slice(0, max)
    .map((s) => s.slice(0, maxLen));
}

/**
 * Soll ledger from the Szenenplot: per chapter what figures learn, what stays
 * secret, and the planned state after. Empty string when no structured plan.
 */
export function formatPlannedContinuityLedger(
  structured: RomanSzenenplotStructured | null | undefined,
  maxChars = SOLL_MAX_CHARS,
): string {
  if (!structured?.chapters?.length) return "";
  const lines: string[] = [];
  for (const ch of structured.chapters) {
    lines.push(`## Kap. ${ch.number} — ${ch.title.trim() || "—"}`);
    if (ch.events.length) lines.push(`Events: ${ch.events.join(" · ")}`);
    for (const sc of ch.scenes) {
      const flow = sc.information_flow;
      const learn = flow?.revealed_to_characters?.trim();
      const secret = flow?.kept_secret?.trim();
      if (!learn && !secret) continue;
      lines.push(
        `- ${sc.scene_id}${learn ? ` | Figuren erfahren: ${learn}` : ""}${
          secret ? ` | Geheim bleibt: ${secret}` : ""
        }`,
      );
    }
    lines.push("");
  }
  const text = lines.join("\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}

async function extractChapterFacts(
  chapter: PlotChapter,
  model: Awaited<ReturnType<typeof resolveRomanAssistModel>>,
): Promise<ChapterContinuityFacts> {
  const body = chapter.body.trim().slice(0, EXTRACT_MAX_CHAPTER_CHARS);
  const raw = (
    await generateText({
      model,
      systemInstruction: `Du bist Kontinuitäts-Lektor. Du extrahierst NUR Fakten, die im Kapiteltext explizit stehen — nichts interpretieren, nichts ergänzen.
Antworte NUR als JSON:
{"zeitanker":["…"],"geld":["…"],"wissen":["Figur: erfährt … (wie/von wem)"],"bezug":["Figur: spricht über / setzt voraus …"]}
- zeitanker: jedes explizite Datum, jeder Wochentag, jede Uhrzeit, jede relative Zeitangabe („drei Tage später“, „im November“) in Lesereihenfolge, mit 3–6 Wörtern Kontext.
- geld: jeder Betrag, jede Abbuchung, Rechnung, Buchungsnummer, jeder Kontostand mit Kontext (wer, wofür, Status: angekündigt / abgebucht / storniert).
- wissen: was eine Figur in DIESEM Kapitel neu erfährt oder entdeckt (konkret), inkl. Quelle.
- bezug: was eine Figur in diesem Kapitel als bereits bekannt voraussetzt oder anspricht (z. B. „Eva: streitet über Zusatzabbuchungen auf ihrem Konto“).
Max. 12 Einträge je Liste. Leere Listen sind erlaubt.`,
      userText: `# Kapitel ${chapter.number} — ${chapter.title.trim() || "—"}\n\n${body}`,
      preferJson: true,
      maxTokens: 2_000,
      timeoutMs: 90_000,
      reasoningEffort: "low",
    })
  ).trim();
  const obj = parseModelJsonObject(raw, `Ledger Kap. ${chapter.number}`);
  return {
    chapter: chapter.number,
    zeitanker: asStringList(obj.zeitanker, 12),
    geld: asStringList(obj.geld, 12),
    wissen: asStringList(obj.wissen, 12),
    bezug: asStringList(obj.bezug, 12),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Ist ledger as compact text for the reconcile prompt. */
export function formatExtractedLedger(
  facts: ChapterContinuityFacts[],
  maxChars = IST_MAX_CHARS,
): string {
  const lines: string[] = [];
  for (const f of facts) {
    lines.push(`## Kap. ${f.chapter}`);
    if (f.zeitanker.length) lines.push(`Zeit: ${f.zeitanker.join(" | ")}`);
    if (f.geld.length) lines.push(`Geld: ${f.geld.join(" | ")}`);
    if (f.wissen.length) lines.push(`Erfährt: ${f.wissen.join(" | ")}`);
    if (f.bezug.length) lines.push(`Setzt voraus: ${f.bezug.join(" | ")}`);
    lines.push("");
  }
  const text = lines.join("\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}

function parseFindings(raw: string): ContinuityLedgerFinding[] {
  const obj = parseModelJsonObject(raw, "Kontinuitäts-Ledger");
  const list = Array.isArray(obj.findings) ? (obj.findings as unknown[]) : [];
  const findings: ContinuityLedgerFinding[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kindRaw = String(row.kind ?? "").trim().toLowerCase();
    const kind: ContinuityLedgerKind | null =
      kindRaw === "timeline" || kindRaw === "zeit"
        ? "timeline"
        : kindRaw === "money" || kindRaw === "geld"
          ? "money"
          : kindRaw === "knowledge" || kindRaw === "wissen"
            ? "knowledge"
            : null;
    const nums = Array.isArray(row.chapterNumbers)
      ? uniqueSortedChapters(row.chapterNumbers.map((n) => Number(n)))
      : [];
    const summary = String(row.summary ?? "").replace(/\s+/g, " ").trim();
    if (!kind || !nums.length || summary.length < 12) continue;
    const quote = String(row.quote ?? "").replace(/\s+/g, " ").trim();
    findings.push({
      kind,
      chapterNumbers: nums.slice(0, 4),
      summary: summary.slice(0, 320),
      ...(quote ? { quote: quote.slice(0, 200) } : {}),
    });
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}

export type ContinuityLedgerAuditResult = {
  findings: ContinuityLedgerFinding[];
  /** Per-chapter Ist facts (kept for debugging / UI drill-down). */
  facts: ChapterContinuityFacts[];
};

/**
 * Extract per-chapter facts, then reconcile against the Szenenplot Soll.
 * `strict` → model/transport failures throw; otherwise empty findings.
 */
export async function auditManuskriptContinuityLedger(input: {
  manuskriptText: string;
  structured: RomanSzenenplotStructured | null | undefined;
  strict?: boolean;
  onProgress?: (label: string) => void | Promise<void>;
}): Promise<ContinuityLedgerAuditResult> {
  const chapters = parsePlotChapters(input.manuskriptText).filter(
    (c) => c.body.trim().length >= 200,
  );
  if (chapters.length < 2) return { findings: [], facts: [] };

  try {
    const model = await resolveRomanAssistModel();
    await input.onProgress?.(
      `Kontinuitäts-Ledger · Fakten aus ${chapters.length} Kapiteln ziehen …`,
    );
    const facts = await mapWithConcurrency(chapters, EXTRACT_CONCURRENCY, (ch) =>
      extractChapterFacts(ch, model),
    );
    const ist = formatExtractedLedger(facts);
    const soll = formatPlannedContinuityLedger(input.structured);

    await input.onProgress?.("Kontinuitäts-Ledger · Soll/Ist abgleichen …");
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du bist Kontinuitäts-Lektor für einen Roman. Du bekommst ein IST-Ledger (was die Kapitel explizit sagen: Zeitanker, Geld, Wissensstand) und ein SOLL (Szenenplan: wer erfährt wann was, was geheim bleibt).
Finde NUR echte Brüche:
1) timeline: Daten/Uhrzeiten/relative Angaben widersprechen sich zwischen Kapiteln oder laufen rückwärts ohne markierten Rückblick.
2) money: Beträge, Buchungsnummern, Status (angekündigt/abgebucht/storniert) oder Kontostände widersprechen sich zwischen Kapiteln.
3) knowledge: Eine Figur setzt in Kap. N etwas voraus oder spricht darüber, das sie laut IST erst in Kap. M > N erfährt — oder das laut SOLL zu diesem Zeitpunkt noch geheim ist. Ebenso: Figur erfährt im IST etwas, das laut SOLL erst viel später enthüllt wird.
Antworte NUR als JSON:
{"findings":[{"kind":"timeline"|"money"|"knowledge","chapterNumbers":[6,10],"summary":"Was widerspricht sich, mit beiden Stellen","quote":"kurzes Zitat aus dem IST"}]}
Max. ${MAX_FINDINGS} findings, wichtigste zuerst. Keine Stilkritik, keine Vermutungen ohne zwei belegbare Stellen. Wenn konsistent: leeres Array.`,
        userText: `# SOLL (Szenenplan — Wissensfluss)
${soll || "(kein strukturierter Szenenplan — nur IST intern prüfen)"}

# IST (aus der Prosa extrahiert)
${ist}

Welche echten Brüche (timeline / money / knowledge)?`,
        preferJson: true,
        maxTokens: 3_000,
        timeoutMs: 120_000,
        reasoningEffort: "medium",
      })
    ).trim();
    return { findings: parseFindings(raw), facts };
  } catch (error) {
    if (input.strict) {
      throw error instanceof Error
        ? error
        : new Error("Kontinuitäts-Ledger fehlgeschlagen.");
    }
    return { findings: [], facts: [] };
  }
}

/**
 * Pick the chapter to patch per finding: for knowledge breaks the EARLIER
 * chapter is wrong (figure knows too much too early); for timeline / money
 * the later chapter usually drifted. Falls back to the first listed chapter.
 */
function patchChapterForFinding(f: ContinuityLedgerFinding): number {
  if (f.kind === "knowledge") return f.chapterNumbers[0]!;
  return f.chapterNumbers[f.chapterNumbers.length - 1]!;
}

function buildLedgerPatchBrief(input: {
  chapterNumber: number;
  findings: ContinuityLedgerFinding[];
  chapters: PlotChapter[];
  facts: ChapterContinuityFacts[];
}): string {
  const relevant = input.findings.filter(
    (f) => patchChapterForFinding(f) === input.chapterNumber,
  );
  const ch = input.chapters.find((c) => c.number === input.chapterNumber);
  const focusLines = relevant
    .map(
      (f) =>
        `- [${LEDGER_KIND_LABEL[f.kind]} · Kap. ${f.chapterNumbers.join("↔")}] ${f.summary}${
          f.quote ? ` — Stelle: „${f.quote}“` : ""
        }`,
    )
    .join("\n");
  // Give the writer the surrounding ledger so the fix matches the book, not
  // just removes the sentence.
  const context = input.facts
    .filter(
      (x) =>
        x.chapter !== input.chapterNumber &&
        relevant.some((f) => f.chapterNumbers.includes(x.chapter)),
    )
    .map(
      (x) =>
        `Kap. ${x.chapter}: ${[...x.zeitanker.slice(0, 4), ...x.geld.slice(0, 4), ...x.wissen.slice(0, 4)].join(" | ")}`,
    )
    .join("\n");

  return `ARBEITSAUFTRAG — Kontinuitäts-Ledger-Pass Kap. ${input.chapterNumber}:
Behebe NUR die unten genannten Brüche in Zeit, Geld oder Wissensstand. Keine neue Handlung, kein Umbau der Szenen.
Minimal-invasiv: Sätze umformulieren, Zeitangaben/Beträge korrigieren, Wissen entfernen, das die Figur hier noch nicht haben kann (oder durch eine zulässige Vermutung/Frage ersetzen).

HARTE REGELN:
- Zeitanker dieses Kapitels müssen zur Buch-Zeitlinie passen (siehe Referenz unten).
- Beträge, Buchungsnummern und Status (angekündigt / abgebucht / storniert) exakt wie in den Referenzkapiteln.
- Eine Figur darf nichts aussprechen oder voraussetzen, was sie laut Buch erst später erfährt.
- Alles andere (Beats, Dialogführung, Ton, Länge) bleibt wie es ist.
- Vorhandene Szenentrenner \`* * *\` beibehalten.
- Keine Meta-Sätze. Nur erzählende Prosa.

# Brüche für dieses Kapitel
${focusLines || "- (keine spezifischen Befunde — Kapitel unverändert lassen)"}

${context ? `# Referenz aus den Gegenkapiteln (so steht es dort)\n${context}\n` : ""}
# Kapitel-Meta
${ch ? formatManuskriptChapterHeading(ch) : `Kapitel ${input.chapterNumber}`}

Schreibe den vollständigen Kapitel-Body mit den minimalen Korrekturen zurück.`.slice(
    0,
    5_500,
  );
}

export type ContinuityLedgerPassResult = {
  roman: RomanKontext;
  findings: ContinuityLedgerFinding[];
  patchedChapters: number[];
  summary: string;
};

/**
 * Audit + selective Co-Autor fixes for ledger breaks. Fail-soft on the
 * patch step (returns the audited findings with unchanged roman).
 */
export async function runManuskriptContinuityLedgerPass(input: {
  roman: RomanKontext;
  onProgress?: (label: string) => void | Promise<void>;
  /**
   * Findings from a prior Freigabe-Check — patch even when a fresh audit
   * misses them (Assist audit is not stable across calls).
   */
  seedFindings?: ContinuityLedgerFinding[];
}): Promise<ContinuityLedgerPassResult> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const text = (editorial.manuskriptText ?? "").trim();
  if (!text || editorial.buchTyp === "clever_erzaehlt") {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Kontinuitäts-Ledger übersprungen.",
    };
  }

  const audited = await auditManuskriptContinuityLedger({
    manuskriptText: text,
    structured: editorial.szenenplotStructured,
    onProgress: input.onProgress,
    strict: false,
  });
  const findings = [...audited.findings];
  const facts = audited.facts;
  for (const seed of input.seedFindings ?? []) {
    const key = `${seed.kind}:${seed.chapterNumbers.join(",")}`;
    const covered = findings.some(
      (f) =>
        `${f.kind}:${f.chapterNumbers.join(",")}` === key ||
        (f.kind === seed.kind &&
          f.summary.slice(0, 80) === seed.summary.slice(0, 80)),
    );
    if (!covered && seed.chapterNumbers.length && seed.summary.trim()) {
      findings.push(seed);
    }
  }
  if (findings.length === 0) {
    return {
      roman: input.roman,
      findings: [],
      patchedChapters: [],
      summary: "Kontinuitäts-Ledger: Zeit, Geld und Wissensstand konsistent.",
    };
  }

  const chapters = parsePlotChapters(text);
  const rewriteCap =
    (input.seedFindings?.length ?? 0) > 0
      ? MAX_REWRITE_CHAPTERS_SEEDED
      : MAX_REWRITE_CHAPTERS;
  const seedChapters: number[] = [];
  const seedSeen = new Set<number>();
  for (const seed of input.seedFindings ?? []) {
    const n = patchChapterForFinding(seed);
    if (!Number.isFinite(n) || n < 1 || seedSeen.has(n)) continue;
    seedSeen.add(n);
    seedChapters.push(n);
    if (seedChapters.length >= rewriteCap) break;
  }
  const findingChapters = uniqueSortedChapters(
    findings.map(patchChapterForFinding),
  );
  const toPatch = (
    seedChapters.length > 0 ? seedChapters : findingChapters
  ).slice(0, rewriteCap);
  await input.onProgress?.(
    `Kontinuitäts-Ledger · Kap. ${toPatch.join(", ")} nachziehen …`,
  );

  try {
    const applied = await applyRouteTarget({
      roman: input.roman,
      critiqueText: findings
        .map(
          (f) =>
            `[${LEDGER_KIND_LABEL[f.kind]}] Kap. ${f.chapterNumbers.join("↔")}: ${f.summary}`,
        )
        .join("\n"),
      target: {
        stage: "manuskript",
        reason: "Kontinuitäts-Ledger-Pass",
        patchBrief: `Kontinuitäts-Ledger — Zeit/Geld/Wissensstand angleichen (Kap. ${toPatch.join(", ")}).`,
        chapterNumbers: toPatch,
      },
      patchBriefForChapter: (chapterNumber) =>
        buildLedgerPatchBrief({ chapterNumber, findings, chapters, facts }),
    });
    const patched = applied.patchedChapters ?? toPatch;
    return {
      roman: applied.roman,
      findings,
      patchedChapters: patched,
      summary: `Kontinuitäts-Ledger: Kap. ${patched.join(", ")} nachgezogen (${findings.length} Brüche).`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ledger-Pass fehlgeschlagen";
    return {
      roman: input.roman,
      findings,
      patchedChapters: [],
      summary: `Kontinuitäts-Ledger abgebrochen: ${msg.slice(0, 200)}`,
    };
  }
}
