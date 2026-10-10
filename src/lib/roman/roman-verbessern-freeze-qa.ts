/**
 * Post-Opus content-freeze QA for Roman Verbessern.
 * Rejects polish that invents beats / drifts measures / newly breaks contracts —
 * caller keeps the Manuskript body instead of persisting a bad polish.
 *
 * Stil-Pass rule: only fail on deltas vs the Manuskript draft. Secrets already
 * narrated in the draft must not block polish (false „Geheimnis geleakt“).
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import { novelContractViolations } from "@/lib/roman/manuskript-contract-validate";
import { validateManuskriptChapterCoverage } from "@/lib/roman/manuskript-coverage-validate";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";
import {
  freezeMetricFactsFromChapters,
  validateProseAgainstMetricFacts,
} from "@/lib/roman/wissens-metric-facts";

export type RomanFreezeQaResult = {
  ok: boolean;
  /** Short German reasons for history / failed[]. */
  reasons: string[];
};

function normalizeHay(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coverageKey(message: string): string {
  return normalizeHay(message).slice(0, 160);
}

/**
 * Soft-Repair only for hard deltas (Maß / neu geleaktes Verbot / Abdeckung /
 * klarer neuer Beat). Bloßes Flash-„Inhalt“-Rauschen → kein zweiter Opus-Call.
 */
export function shouldSoftRepairFreezeReasons(reasons: string[]): boolean {
  return reasons.some(
    (r) =>
      /^Maß:/i.test(r) ||
      /geleakt|Verbotenes Motiv/i.test(r) ||
      /^Abdeckung:/i.test(r) ||
      (/^Inhalt:/i.test(r) &&
        /neu(er|e|es)?\b|Beat|gestrichen|erfund|fehl(t|en)|umgeordnet/i.test(
          r,
        )),
  );
}

/** Remaining soft Flash nits after filters — stil-pass keeps the polish. */
export function isSoftOnlyFreezeNoise(reasons: string[]): boolean {
  return reasons.length > 0 && !shouldSoftRepairFreezeReasons(reasons);
}

/**
 * Drop Freeze reasons that already apply to the Manuskript draft
 * (quoted secret phrase tokens present in draft).
 */
export function filterDraftSharedFreezeReasons(
  draftBody: string,
  reasons: string[],
): string[] {
  const draftHay = normalizeHay(draftBody);
  if (draftHay.length < 40) return reasons;
  return reasons.filter((reason) => {
    if (!/geleakt|Geheimnis|Verbotenes Motiv/i.test(reason)) return true;
    const quoted =
      reason.match(/[„"]([^"„”]{8,100})/)?.[1] ??
      reason.match(/\(([^)]{8,100})\)/)?.[1];
    if (!quoted) return true;
    const tokens = quoted
      .split(/[^\p{L}\p{N}]+/u)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 4)
      .slice(0, 6);
    if (tokens.length < 2) return true;
    const hits = tokens.filter((t) => draftHay.includes(t)).length;
    // Same secret already in draft → not a stil-pass regression.
    return hits < Math.min(2, tokens.length);
  });
}

/**
 * Run contract + coverage + draft-vs-polish freeze checks on a polished body.
 * Fail-soft on assist errors (treat as ok) so a flaky Flash does not block the book.
 */
export async function assertRomanChapterContentFrozen(input: {
  draftBody: string;
  polishedBody: string;
  chapterNumber: number;
  structuredChapter: RomanSzenenplotChapterNode | null | undefined;
  factContractsBlock?: string;
  wissensGraph?: RomanWissensGraph | null;
}): Promise<RomanFreezeQaResult> {
  const reasons: string[] = [];
  const polished = input.polishedBody.trim();
  const draft = input.draftBody.trim();
  if (polished.length < 40) {
    return { ok: false, reasons: ["Polish zu kurz / leer"] };
  }

  const ch = input.structuredChapter ?? null;
  if (ch) {
    try {
      const novel = novelContractViolations({
        draftProse: draft,
        polishedProse: polished,
        chapter: ch,
      });
      for (const v of novel.slice(0, 4)) {
        reasons.push(v.message);
      }
    } catch {
      /* fail-soft — contract parse glitch must not block the chapter */
    }

    try {
      // Only coverage gaps that the draft does not already share.
      const [polishCov, draftCov] = await Promise.all([
        validateManuskriptChapterCoverage({
          prose: polished,
          chapter: ch,
          factContractsBlock: input.factContractsBlock,
        }),
        validateManuskriptChapterCoverage({
          prose: draft,
          chapter: ch,
          factContractsBlock: input.factContractsBlock,
        }),
      ]);
      if (!polishCov.ok) {
        const draftKeys = new Set(
          draftCov.violations.map((v) => coverageKey(v.message)),
        );
        for (const v of polishCov.violations) {
          if (draftKeys.has(coverageKey(v.message))) continue;
          // Soft match: same Pflicht N mentioned in draft gaps.
          const pflicht = v.message.match(/Pflicht\s+(\d+)/i)?.[1];
          if (
            pflicht &&
            draftCov.violations.some((d) =>
              new RegExp(`Pflicht\\s+${pflicht}\\b`, "i").test(d.message),
            )
          ) {
            continue;
          }
          reasons.push(`Abdeckung: ${v.message}`);
          if (reasons.filter((r) => r.startsWith("Abdeckung:")).length >= 3) {
            break;
          }
        }
      }
    } catch {
      /* fail-soft — flaky coverage assist must not block the book */
    }
  }

  if (input.wissensGraph) {
    try {
      // Freeze measures from the draft first so polish cannot silently drift
      // even when the graph had not yet captured the MASS invariant.
      const graphWithDraftFreeze = freezeMetricFactsFromChapters(
        input.wissensGraph,
        [
          {
            number: input.chapterNumber,
            title: `Kap. ${input.chapterNumber}`,
            body: draft,
          },
        ],
      );
      const metrics = validateProseAgainstMetricFacts({
        prose: polished,
        graph: graphWithDraftFreeze,
      });
      if (!metrics.ok) {
        for (const v of metrics.violations.slice(0, 4)) {
          reasons.push(`Maß: ${v.message}`);
        }
      }
    } catch {
      /* fail-soft */
    }
  }

  const freeze = await checkContentFreezeDraftVsPolish({
    draftBody: draft,
    polishedBody: polished,
    chapterNumber: input.chapterNumber,
  });
  if (!freeze.ok) {
    reasons.push(...freeze.reasons);
  }

  const filtered = filterDraftSharedFreezeReasons(draft, reasons);
  return { ok: filtered.length === 0, reasons: filtered };
}

/**
 * Flash: did polish invent/remove beats vs the Manuskript draft?
 * Only NEW content relative to the draft — not secrets the draft already states.
 */
async function checkContentFreezeDraftVsPolish(input: {
  draftBody: string;
  polishedBody: string;
  chapterNumber: number;
}): Promise<RomanFreezeQaResult> {
  const draft = input.draftBody.trim();
  const polished = input.polishedBody.trim();
  if (draft.length < 80 || polished.length < 80) {
    return { ok: true, reasons: [] };
  }

  try {
    const model = await resolveRomanAssistModel();
    let raw = "";
    let lastGenError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        raw = (
          await generateText({
            model,
            systemInstruction: `Du prüfst einen Stil-Pass: Inhalt muss gegenüber dem ENTWURF eingefroren sein.
Vergleiche NUR Entwurf (Manuskript) und Polish (Roman).

ok=false NUR wenn der Polish klar NEUES oder WEGGELASSENES gegenüber dem Entwurf hat:
- neuer Handlungs-Beat / neue Entscheidung / neue Info, die im Entwurf fehlt
- Figur/Ort/Prop/Zeitlinie geändert, erfunden oder gestrichen
- zentrales Ereignis des Entwurfs fehlt

ok=true (KEIN Fehler) wenn:
- nur Wortwahl, Satzbau, Rhythmus, sinnliche Schärfung
- dasselbe Geheimnis / Verschweigen wie im Entwurf (auch umformuliert)
- dieselben Beats in anderer Formulierung

Geheimnisse aus dem Plot-Vertrag zählen NICHT — nur Diff Entwurf↔Polish.
Antwort NUR als JSON:
{"ok":true|false,"reasons":["…"]}`,
            userText: `# Kap. ${input.chapterNumber}

# Entwurf (Manuskript) — verbindlicher Inhalt
${draft.slice(0, 7_000)}

# Polish (Roman) — nur Stil erlaubt
${polished.slice(0, 7_000)}

Gab es Inhaltsänderungen GEGENÜBER DEM ENTWURF? Max. 3 kurze Gründe wenn ok=false. Sonst ok=true.`,
            preferJson: true,
            maxTokens: 700,
            timeoutMs: 45_000,
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
    if (lastGenError || !raw) {
      return { ok: true, reasons: [] };
    }

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Content-Freeze");
    } catch {
      return { ok: true, reasons: [] };
    }
    if (!obj || typeof obj !== "object") {
      return { ok: true, reasons: [] };
    }
    const row = obj as Record<string, unknown>;
    const ok = row.ok !== false && row.ok !== "false";
    if (ok) return { ok: true, reasons: [] };

    const list = Array.isArray(row.reasons) ? (row.reasons as unknown[]) : [];
    const reasons: string[] = [];
    for (const item of list) {
      const message =
        typeof item === "string"
          ? item.trim()
          : item && typeof item === "object"
            ? String(
                (item as Record<string, unknown>).message ??
                  (item as Record<string, unknown>).text ??
                  "",
              ).trim()
            : "";
      if (message.length < 8) continue;
      // Flash often re-labels draft secrets as leaks — drop those.
      if (/geheimnis|geleakt|spoiler|verrat/i.test(message)) {
        const tokens = message
          .split(/[^\p{L}\p{N}]+/u)
          .map((t) => t.toLowerCase())
          .filter((t) => t.length >= 5)
          .slice(0, 8);
        const draftHay = normalizeHay(draft);
        const hits = tokens.filter((t) => draftHay.includes(t)).length;
        if (hits >= 2) continue;
      }
      reasons.push(`Inhalt: ${message.slice(0, 220)}`);
      if (reasons.length >= 3) break;
    }
    if (!reasons.length) {
      // Ambiguous Flash "ok=false" without usable reasons → fail-open for stil-pass.
      return { ok: true, reasons: [] };
    }
    const filtered = filterDraftSharedFreezeReasons(draft, reasons);
    return { ok: filtered.length === 0, reasons: filtered };
  } catch {
    return { ok: true, reasons: [] };
  }
}
