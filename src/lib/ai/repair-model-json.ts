/**
 * One-shot LLM repair when a structured call returns prose/markdown
 * instead of a JSON object (common with role prompts that bias to German lists).
 */

import { AI_FETCH_TIMEOUT_MS } from "@/lib/ai/fetch-timeout";
import {
  parseModelJsonObject,
  tryParseModelJsonObject,
} from "@/lib/ai/parse-model-json";
import { generateText } from "@/lib/ai/provider";
import type { AiModelConfig } from "@/lib/prompts/catalog";

const REPAIR_DRAFT_MAX_CHARS = 100_000;

/**
 * Parse model text as a JSON object; if that fails, ask the model once to
 * convert the draft into schema-conformant JSON.
 */
export async function parseModelJsonObjectWithRepair(input: {
  raw: string;
  model: AiModelConfig;
  schemaHint: string;
  errorLabel?: string;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const label = input.errorLabel ?? "Antwort";
  const first = tryParseModelJsonObject(input.raw);
  if (first) return first;

  const draft = input.raw.trim().slice(0, REPAIR_DRAFT_MAX_CHARS);
  if (draft.length < 12) {
    return parseModelJsonObject(input.raw, label);
  }

  const repaired = await generateText({
    model: input.model,
    preferJson: true,
    systemInstruction: `Du bist ein strikter JSON-Konverter.
Aufgabe: fehlerhaften Entwurf (Markdown, Bullet-Listen, Prosaskizze, kaputtes oder ABGESCHNITTENES JSON) in EIN gültiges JSON-Objekt umwandeln.
Regeln:
- Nur das JSON-Objekt ausgeben — keine Markdown-Fences, keine Erklärungen, keine Bullet-Listen.
- Inhalt bewahren. Bei Abbruch mitten in einem Objekt: unvollständiges letztes Element STREICHEN und JSON sauber schließen.
- Schema strikt einhalten (Feldnamen, Typen, Verschachtelung). Lieber weniger vollständige Szenen als kaputtes JSON.
- Keine echten Zeilenumbrüche innerhalb von JSON-Strings (\\n verwenden).`,
    userText: `Schema (verbindlich):
${input.schemaHint}

# Fehlerhafter Entwurf
${draft}

Gib ein parsebares Objekt gemäß Schema zurück (bei Truncation: unvollständige Trailing-Szene weglassen).`,
    maxTokens: input.maxTokens ?? 12_000,
    timeoutMs: input.timeoutMs ?? AI_FETCH_TIMEOUT_MS,
  });

  return parseModelJsonObject(repaired, label);
}
