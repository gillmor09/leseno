/**
 * Erstlese-Silbenhilfe: server-side two-color syllable markup after layout.
 * The LLM writes normal German; we wrap syllables with `.silbe--a` / `.silbe--b`.
 */

import { hyphenateHTMLSync } from "hyphen/de";

/**
 * When Silbenhilfe is on: remind the model to use normal German capitalization
 * and NOT emit syllable spans (post-processing adds them).
 */
export function buildSyllableHelpPromptBlock(enabled: boolean): string {
  if (!enabled) {
    return "";
  }

  return [
    "Silbenhilfe ist EIN — aber du markierst KEINE Silben im HTML.",
    "Schreibe normales Deutsch mit korrekter Groß- und Kleinschreibung:",
    "- Groß nur: Satzanfänge, Namen, übliche Substantive.",
    "- Nicht jedes Wort großschreiben (kein Title Case).",
    "- Keine <span class=\"silbe …\"> und keine Farb-Klassen einfügen.",
    "Die Silben-Zweifarbmarkierung wird serverseitig nachträglich gesetzt.",
  ].join("\n");
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Wraps a hyphenated word (`Son|ne`) as alternating silbe spans.
 * Preserves the letters as produced by hyphenation (same casing as input HTML).
 */
function wrapHyphenatedWord(word: string): string {
  const parts = word.split("|").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return word;
  }
  return parts
    .map((part, index) => {
      const tone = index % 2 === 0 ? "a" : "b";
      return `<span class="silbe silbe--${tone}">${escapeHtmlText(part)}</span>`;
    })
    .join("");
}

/**
 * Text segments only (outside tags): turn words into silbe spans.
 * One-syllable words (no `|`) get a single silbe--a span.
 */
function wrapSyllablesInTextSegment(text: string): string {
  return text.replace(/[A-Za-zÄÖÜäöüß|]+/g, (word) => {
    if (!word.includes("|") && word.length === 0) {
      return word;
    }
    if (!word.includes("|")) {
      return `<span class="silbe silbe--a">${escapeHtmlText(word)}</span>`;
    }
    return wrapHyphenatedWord(word);
  });
}

/** Remove leftover model-generated silbe spans before re-applying markup. */
function stripSilbeSpans(html: string): string {
  let previous = "";
  let current = html;
  while (previous !== current) {
    previous = current;
    current = current.replace(
      /<span\b[^>]*\bclass=(["'])[^"']*\bsilbe\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi,
      "$2",
    );
  }
  return current;
}

/**
 * Applies Erstlese syllable coloring to story HTML (text nodes only).
 * Uses German hyphenation patterns; safe around tags/attributes.
 */
export function applySyllableHelpMarkup(html: string): string {
  const cleaned = stripSilbeSpans(html);
  const hyphenated = hyphenateHTMLSync(cleaned, { hyphenChar: "|" });

  return hyphenated.replace(
    /([^<]+)|(<[^>]+>)/g,
    (_segment: string, text: string | undefined, tag: string | undefined) => {
      if (tag) {
        return tag;
      }
      return wrapSyllablesInTextSegment(text ?? "");
    },
  );
}
