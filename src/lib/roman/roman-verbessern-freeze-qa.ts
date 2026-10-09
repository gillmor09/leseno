/**
 * Post-Opus content-freeze QA for Roman Verbessern.
 * Rejects polish that breaks contracts, drops coverage, or invents/removes beats —
 * caller keeps the Manuskript body instead of persisting a bad polish.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import {
  validateManuskriptChapterAgainstContracts,
} from "@/lib/roman/manuskript-contract-validate";
import { validateManuskriptChapterCoverage } from "@/lib/roman/manuskript-coverage-validate";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

export type RomanFreezeQaResult = {
  ok: boolean;
  /** Short German reasons for history / failed[]. */
  reasons: string[];
};

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
      const contracts = validateManuskriptChapterAgainstContracts({
        prose: polished,
        chapter: ch,
      });
      if (!contracts.ok) {
        for (const v of contracts.violations.slice(0, 4)) {
          reasons.push(v.message);
        }
      }
    } catch {
      /* fail-soft — contract parse glitch must not block the chapter */
    }

    try {
      const coverage = await validateManuskriptChapterCoverage({
        prose: polished,
        chapter: ch,
        factContractsBlock: input.factContractsBlock,
      });
      if (!coverage.ok) {
        for (const v of coverage.violations.slice(0, 4)) {
          reasons.push(`Abdeckung: ${v.message}`);
        }
      }
    } catch {
      /* fail-soft — flaky coverage assist must not block the book */
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

  return { ok: reasons.length === 0, reasons };
}

/**
 * Flash: did polish invent/remove beats, facts, characters, or timeline?
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
            systemInstruction: `Du prüfst einen Stil-Pass: Inhalt muss eingefroren sein.
Vergleiche Entwurf (Manuskript) und Polish (Roman).
Verboten im Polish: neue Beats/Handlung, neue Infos/Fakten, neue/entfernte Figuren/Orte/Props, geänderte Zeitlinie, verratene Geheimnisse, weggelassene zentrale Ereignisse.
Erlaubt: bessere Wortwahl, Satzbau, sinnliche Details OHNE neue Infos.
Antwort NUR als JSON:
{"ok":true|false,"reasons":["…"]}`,
            userText: `# Kap. ${input.chapterNumber}

# Entwurf (Manuskript)
${draft.slice(0, 7_000)}

# Polish (Roman)
${polished.slice(0, 7_000)}

Gab es Inhaltsänderungen? Max. 4 kurze Gründe wenn ok=false.`,
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
      reasons.push(`Inhalt: ${message.slice(0, 220)}`);
      if (reasons.length >= 4) break;
    }
    if (!reasons.length) {
      reasons.push("Inhalt: Stil-Pass hat Beats/Fakten verändert");
    }
    return { ok: false, reasons };
  } catch {
    return { ok: true, reasons: [] };
  }
}
