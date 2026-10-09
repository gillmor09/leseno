/**
 * Post-draft German grammar / valency check for Manuskript chapters.
 * Catches broken Rektion (e.g. „einen Tag erinnern“ statt „an einen Tag erinnern“).
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";

export type ManuskriptGrammarViolation = {
  code: "grammar";
  message: string;
};

/**
 * Flash assist: flag clear German grammar / case / Rektion errors.
 * Fail-soft — never blocks manuscript generation on assist errors.
 */
export async function validateManuskriptChapterGrammar(input: {
  prose: string;
}): Promise<{ ok: boolean; violations: ManuskriptGrammarViolation[] }> {
  if (input.prose.trim().length < 80) {
    return { ok: true, violations: [] };
  }

  try {
    const model = await resolveRomanAssistModel();
    const raw = (
      await generateText({
        model,
        systemInstruction: `Du bist Korrektor:in für literarisches Deutsch (Belletristik).
Prüfe die Prosa NUR auf klare Sprachfehler:
- falsche Rektion / Präposition (z. B. „einen Tag erinnern“ statt „sich an einen Tag erinnern“ / „an den … erinnern“),
- Kasus-/Kongruenzfehler (Artikel, Adjektiv, Relativpronomen),
- falsche Verbformen / Konjunktiv, die den Satz ungrammatisch machen,
- offensichtliche Wortstellungsbrüche.
KEINE Stil-, Geschmacks- oder Plot-Kritik. Keine „könnte eleganter“-Hinweise.
Nur echte Fehler. Wenn nichts Klares: leeres violations-Array.
Pro Fehler: kurzes Zitat + korrekte Form.
Antwort NUR als JSON:
{"violations":[{"message":"„…“ → besser: „…“ (Grund kurz)"}]}`,
        userText: `# Kapitel-Prosa
${input.prose.slice(0, 14_000)}

Nur klare Grammatik-/Rektionsfehler melden (max. 5).`,
        preferJson: true,
        maxTokens: 900,
        timeoutMs: 45_000,
        reasoningEffort: "none",
      })
    ).trim();

    let obj: unknown = null;
    try {
      obj = parseModelJsonObject(raw, "Grammar-Check");
    } catch {
      return { ok: true, violations: [] };
    }
    if (!obj || typeof obj !== "object") {
      return { ok: true, violations: [] };
    }
    const row = obj as Record<string, unknown>;
    const list = Array.isArray(row.violations) ? row.violations : [];
    const violations: ManuskriptGrammarViolation[] = [];
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
      if (message.length < 12) continue;
      violations.push({
        code: "grammar",
        message: message.slice(0, 320),
      });
      if (violations.length >= 5) break;
    }
    return { ok: violations.length === 0, violations };
  } catch {
    return { ok: true, violations: [] };
  }
}

/** Patch brief for Co-Autor rewrite after grammar violations. */
export function formatGrammarViolationRewriteBrief(
  violations: ManuskriptGrammarViolation[],
): string {
  if (!violations.length) return "";
  return [
    "## Sprachkorrektur (verbindlich — Grammatik/Rektion)",
    "Der Entwurf enthält klare deutsche Sprachfehler. Schreibe das Kapitel neu, behalte Handlung/Ton, korrigiere:",
    ...violations.map((v, i) => `${i + 1}. ${v.message}`),
    "Korrekte Rektion und Kasus (z. B. sich an etwas erinnern). Keine neuen Plot-Stränge. Keine Meta-Kommentare.",
  ].join("\n");
}
