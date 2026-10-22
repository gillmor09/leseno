/**
 * Top-Down Roman agent roles.
 * Architect/Auditor = Luna (JSON). Draft/Style = Haiku (prose).
 */

import {
  AI_FETCH_TIMEOUT_MAX_MS,
  AI_LONG_PROSE_TIMEOUT_MS,
  isAiAbortError,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

export const NOVEL_AUTHOR_MODEL_SLUG = "claude-haiku-5-5" as const;
export const NOVEL_EDITOR_MODEL_SLUG = "gpt-6-luna" as const;

export const NOVEL_AUTHOR_DRAFT_TEMPERATURE = 0.55;
export const NOVEL_AUTHOR_STYLE_TEMPERATURE = 0.4;
/** @deprecated alias */
export const NOVEL_AUTHOR_REVISE_TEMPERATURE = NOVEL_AUTHOR_STYLE_TEMPERATURE;

export const NOVEL_AUTHOR_TIMEOUT_MS = AI_FETCH_TIMEOUT_MAX_MS;
export const NOVEL_EDITOR_TIMEOUT_MS = AI_LONG_PROSE_TIMEOUT_MS;

const ARCHITECT_SYSTEM = `Du bist der Architekt dieses Romans. Du planst Struktur, nicht Prosa.
Du lieferst nur strukturiertes JSON laut Schema — keine Markdown-Fences, keine Fließtext-Kapitel.
Skelett und Szenen-Manifeste sind Schnittstellen: konkret, prüfbar, ohne Stil-Anweisungen.`;

const AUDITOR_SYSTEM = `Du bist der Logik-Auditor. Du prüfst Rohtext streng gegen Szenen-Manifest und State-Slice.
Du bewertest nur Struktur: Wissen, Kausalität, mustShow/mustNot, Ort/Zeit.
Du änderst keinen Stil und schreibst keine Prosa. Antwort nur als JSON.`;

const EDITOR_SYSTEM = `Du bist der Lektor (Luna). Du antwortest präzise auf Deutsch, bevorzugt als JSON laut Auftrag.
Keine Markdown-Fences ums JSON.`;

const DRAFT_SYSTEM = `Du bist der Szenen-Draft-Agent. Du übersetzt genau EIN Szenen-Manifest in Rohprosa (Deutsch).
Regeln: keine Plot-Änderungen, kein Voraus- oder Zurückgreifen, keine Stil-Politur.
Nur die Handlung dieser Szene. Vollständige Prosa ohne Meta und ohne Überschriften.
Länge: Zielband einhalten (siehe User-Prompt) — lieber etwas länger als zu dünn.`;

const STYLE_SYSTEM = `Du bist der Stilist. Du polierst geprüfte Szenenprosa auf Satz- und Wortebene.
Regeln: Handlung, Fakten, Wissen und Reihenfolge bleiben unverändert.
Nur: Show don't tell, Rhythmus, Satzlängen, sensorische Details, tonale Konsistenz, Stimme.
Keine neuen Plot-Ereignisse, keine neuen Zusagen, keine Wissenssprünge.
WICHTIG: Textlänge nicht verkürzen — mindestens so viele Wörter wie der Rohtext; eher leicht erweitern (sinnliche Details), nie verdichten/kürzen.`;

const IDEA_SYSTEM = `Du bist Ideen-Partner für High-Concept-Romane. Du schreibst klares Deutsch, keine Kapitelpläne.`;

async function withOneAbortRetry<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isAiAbortError(error)) throw error;
    console.warn(`[novel/${label}] Timeout/Abort — ein Retry…`);
    await new Promise((r) => setTimeout(r, 2_000));
    return run();
  }
}

async function generateJson(input: {
  label: string;
  system: string;
  userText: string;
  systemExtra?: string;
  maxTokens?: number;
}): Promise<string> {
  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  return withOneAbortRetry(input.label, () =>
    generateText({
      model,
      systemInstruction: `${input.system}${
        input.systemExtra ? `\n\n${input.systemExtra}` : ""
      }`,
      userText: input.userText,
      preferJson: true,
      timeoutMs: NOVEL_EDITOR_TIMEOUT_MS,
      maxTokens: input.maxTokens,
    }),
  );
}

async function generateProse(input: {
  label: string;
  system: string;
  userText: string;
  temperature?: number | null;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high" | null;
}): Promise<string> {
  const model = await resolveRomanSchreibModel(NOVEL_AUTHOR_MODEL_SLUG);
  return withOneAbortRetry(input.label, () =>
    generateText({
      model,
      systemInstruction: input.system,
      userText: input.userText,
      timeoutMs: NOVEL_AUTHOR_TIMEOUT_MS,
      maxTokens: input.maxTokens ?? 8_192,
      temperature: input.temperature,
      reasoningEffort: input.reasoningEffort ?? "high",
      thinkingMode: "adaptive",
    }),
  );
}

/** Luna — architect / auditor / generic editor JSON. */
export async function generateAsEditorJson(input: {
  userText: string;
  systemExtra?: string;
  cacheablePrefix?: string;
  maxTokens?: number;
  reasoningEffort?: string | null;
  /** architect | auditor | editor — picks system voice. */
  role?: "architect" | "auditor" | "editor";
}): Promise<string> {
  const system =
    input.role === "auditor"
      ? AUDITOR_SYSTEM
      : input.role === "architect"
        ? ARCHITECT_SYSTEM
        : EDITOR_SYSTEM;
  void input.cacheablePrefix;
  void input.reasoningEffort;
  return generateJson({
    label: input.role ?? "editor",
    system,
    userText: input.userText,
    systemExtra: input.systemExtra,
    maxTokens: input.maxTokens,
  });
}

/** Haiku — scene draft (raw action). */
export async function generateAsAuthor(input: {
  userText: string;
  systemExtra?: string;
  cacheablePrefix?: string;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high" | null;
  temperature?: number | null;
  thinkingMode?: "adaptive" | "disabled" | "between_tools" | "auto" | null;
}): Promise<string> {
  void input.cacheablePrefix;
  void input.thinkingMode;
  return generateProse({
    label: "draft",
    system: `${DRAFT_SYSTEM}${input.systemExtra ? `\n\n${input.systemExtra}` : ""}`,
    userText: input.userText,
    temperature: input.temperature ?? NOVEL_AUTHOR_DRAFT_TEMPERATURE,
    maxTokens: input.maxTokens,
    reasoningEffort: input.reasoningEffort ?? "high",
  });
}

/** Haiku — idea interview / freeform prose (not scene draft). */
export async function generateAsIdeaPartner(input: {
  userText: string;
  maxTokens?: number;
}): Promise<string> {
  return generateProse({
    label: "idea",
    system: IDEA_SYSTEM,
    userText: input.userText,
    temperature: 0.6,
    maxTokens: input.maxTokens ?? 4_096,
    reasoningEffort: "medium",
  });
}

/** Haiku — style polish only (no plot changes). */
export async function generateAsStylist(input: {
  userText: string;
  maxTokens?: number;
}): Promise<string> {
  return generateProse({
    label: "style",
    system: STYLE_SYSTEM,
    userText: input.userText,
    temperature: NOVEL_AUTHOR_STYLE_TEMPERATURE,
    maxTokens: input.maxTokens ?? 8_192,
    reasoningEffort: "medium",
  });
}
