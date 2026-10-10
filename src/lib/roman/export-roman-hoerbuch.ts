/**
 * Roman → Hörbuch helpers: chapter plain text, language options, filenames.
 * Synthesis: `/api/admin/roman-hoerbuch/chapter` → Storage (`hoerbuch-storage.ts`).
 */

import { formatManuskriptChapterHeading } from "@/lib/roman/plot-chapters";
import type { RomanExportChapter } from "@/lib/roman/export-roman-pdf";

/** ISO 639-1 codes offered in the Export UI (Eleven v4: 90+; curation for DE market). */
export const ROMAN_HOERBUCH_LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "Englisch" },
  { code: "fr", label: "Französisch" },
  { code: "es", label: "Spanisch" },
  { code: "it", label: "Italienisch" },
  { code: "nl", label: "Niederländisch" },
  { code: "pl", label: "Polnisch" },
  { code: "pt", label: "Portugiesisch" },
  { code: "sv", label: "Schwedisch" },
  { code: "da", label: "Dänisch" },
  { code: "fi", label: "Finnisch" },
  { code: "cs", label: "Tschechisch" },
  { code: "ro", label: "Rumänisch" },
  { code: "hu", label: "Ungarisch" },
  { code: "tr", label: "Türkisch" },
  { code: "uk", label: "Ukrainisch" },
  { code: "ru", label: "Russisch" },
  { code: "ja", label: "Japanisch" },
  { code: "zh", label: "Chinesisch" },
  { code: "ko", label: "Koreanisch" },
  { code: "ar", label: "Arabisch" },
  { code: "hi", label: "Hindi" },
] as const;

export type RomanHoerbuchLanguageCode =
  (typeof ROMAN_HOERBUCH_LANGUAGES)[number]["code"];

export function isRomanHoerbuchLanguageCode(
  value: string,
): value is RomanHoerbuchLanguageCode {
  return ROMAN_HOERBUCH_LANGUAGES.some((l) => l.code === value);
}

/** Spoken chapter text: heading + body (+ Clever Abenteuer-Wissen; no image). */
export function romanChapterSpokenText(chapter: RomanExportChapter): string {
  const heading = formatManuskriptChapterHeading({
    number: chapter.number,
    title: chapter.title,
    body: "",
  });
  const body = chapter.body
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const fakten = (chapter.abenteuerWissenFakten ?? [])
    .map((f) => f.trim())
    .filter((f) => f.length >= 3);
  const wissen =
    fakten.length > 0
      ? `Abenteuer-Wissen.\n\n${fakten.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
      : "";
  const parts = [body, wissen].filter(Boolean);
  if (!parts.length) return "";
  return `${heading}.\n\n${parts.join("\n\n")}`;
}

function slugifyFilename(title: string): string {
  const base = title
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "roman";
}

export function romanHoerbuchZipFilename(title: string, lang: string): string {
  return `${slugifyFilename(title)}-hoerbuch-${lang}.zip`;
}

export function romanHoerbuchChapterFilename(
  chapter: Pick<RomanExportChapter, "number" | "title">,
): string {
  const n = String(chapter.number).padStart(2, "0");
  const slug = slugifyFilename(chapter.title || `kapitel-${chapter.number}`);
  return `${n}-${slug}.mp3`;
}
