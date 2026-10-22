/**
 * Marketing / Titelei for greenfield novels: summary, subtitle, 6 keywords, vorsatz.
 * Lektor = Haiku Structured JSON.
 */

import { z } from "zod";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { formatCanonPrefix } from "@/lib/novel/context";
import {
  generateAsEditorJson,
  NOVEL_EDITOR_MODEL_SLUG,
} from "@/lib/novel/roles";
import type { NovelBundle } from "@/lib/novel/types";
import {
  emptyVorsatz,
  parseVorsatzJson,
  ROMAN_DEFAULT_AUTHOR,
  ROMAN_DEFAULT_IMPRINT,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

export const novelMarketingSchema = z.object({
  subtitle: z.string().default(""),
  summary: z.string().min(40),
  keywords: z.array(z.string().min(1)).min(6).max(6),
  motto: z.string().optional().default(""),
});

export type NovelMarketingCopy = z.infer<typeof novelMarketingSchema>;

/** Fixed count for greenfield novel marketing keywords. */
export const NOVEL_KEYWORD_COUNT = 6;

function manuscriptSample(bundle: NovelBundle, maxChars = 12_000): string {
  const parts = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((c) => {
      const body = (c.finalText || c.rawDraft).trim();
      if (!body) return "";
      return `## Kap. ${c.chapterNumber} ${c.title}\n${body.slice(0, 2_500)}`;
    })
    .filter(Boolean);
  return parts.join("\n\n").slice(0, maxChars);
}

/**
 * Build Klappentext / Amazon blurb, subtitle, exactly 6 keywords + optional motto.
 */
export async function generateNovelMarketingCopy(
  bundle: NovelBundle,
): Promise<NovelMarketingCopy & { vorsatz: RomanVorsatz }> {
  const genre = bundle.styleGuide?.genre ?? "";
  const raw = await generateAsEditorJson({
    cacheablePrefix: formatCanonPrefix(bundle),
    userText: `Erzeuge Marketing- und Titelei-Texte für diesen Roman.
Titel: ${bundle.novel.title}
Genre: ${genre}

Antwort NUR als JSON:
{"subtitle":"kurzer Untertitel oder leer","summary":"Klappentext 120–180 Wörter, spannend, spoilerarm, für Amazon/Klappe","keywords":["genau","sechs","Schlagwörter","ohne","Hashtags","amazon"],"motto":"optionales Motto/Epigraph oder leer"}

Manuskript-Auszug:
${manuscriptSample(bundle) || bundle.novel.highConceptIdea}`,
  });

  const model = await resolveRomanSchreibModel(NOVEL_EDITOR_MODEL_SLUG);
  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint:
      '{"subtitle":"","summary":"","keywords":["a","b","c","d","e","f"],"motto":""}',
    errorLabel: "Marketing-Texte",
  });
  const parsed = novelMarketingSchema.safeParse({
    ...obj,
    keywords: Array.isArray(obj.keywords)
      ? (obj.keywords as unknown[])
          .map((k) => String(k).trim())
          .filter(Boolean)
          .slice(0, NOVEL_KEYWORD_COUNT)
      : [],
  });
  if (!parsed.success) {
    throw new Error("Marketing-JSON ungültig.");
  }
  let keywords = parsed.data.keywords;
  while (keywords.length < NOVEL_KEYWORD_COUNT) {
    keywords = [...keywords, `Keyword ${keywords.length + 1}`];
  }
  keywords = keywords.slice(0, NOVEL_KEYWORD_COUNT);

  const year = String(new Date().getFullYear());
  const autor = bundle.novel.autorName?.trim() || ROMAN_DEFAULT_AUTHOR;
  const base = emptyVorsatz();
  const vorsatz: RomanVorsatz = {
    ...base,
    titelseite: {
      titel: bundle.novel.title,
      untertitel: parsed.data.subtitle.trim(),
      autor,
      imprint: ROMAN_DEFAULT_IMPRINT,
    },
    impressum: {
      ...base.impressum,
      jahr: year,
      rechteinhaber: autor,
      hinweis: `© ${year} ${autor} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`,
    },
    motto: parsed.data.motto?.trim() || "",
    widmung: "",
  };

  return {
    subtitle: parsed.data.subtitle.trim(),
    summary: parsed.data.summary.trim(),
    keywords,
    motto: parsed.data.motto?.trim() || "",
    vorsatz: parseVorsatzJson(vorsatz),
  };
}
