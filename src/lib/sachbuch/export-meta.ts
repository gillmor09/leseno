/**
 * Marketing / Titelei for Sachbuch: Titel-Vorschlag, Untertitel, Klappentext,
 * 6 Schlagwörter + Vorsatz. Model: `SACHBUCH_MODEL_MARKETING`.
 */

import { z } from "zod";
import { parseModelJsonObjectWithRepair } from "@/lib/ai/repair-model-json";
import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_MARKETING } from "@/lib/sachbuch/agent-defaults";
import { getSachbuchBookType } from "@/lib/sachbuch/book-types";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import { sachbuchKapitelBodyText } from "@/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "@/lib/sachbuch/repository";
import {
  SACHBUCH_KEYWORD_COUNT,
  type SachbuchKontext,
} from "@/lib/sachbuch/types";
import {
  emptyVorsatz,
  parseVorsatzJson,
  ROMAN_DEFAULT_AUTHOR,
  ROMAN_DEFAULT_IMPRINT,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

export const sachbuchMarketingSchema = z.object({
  suggestedTitle: z.string().min(3).max(120),
  subtitle: z.string().default(""),
  summary: z.string().min(40),
  keywords: z.array(z.string().min(1)).min(6).max(6),
  motto: z.string().optional().default(""),
});

export type SachbuchMarketingCopy = z.infer<typeof sachbuchMarketingSchema>;

function manuscriptSample(book: SachbuchKontext, maxChars = 12_000): string {
  const parts = book.kapitel.map((k) => {
    const body = sachbuchKapitelBodyText(k);
    if (!body) return "";
    return `## ${k.title}\n${body.slice(0, 2_500)}`;
  });
  return parts.filter(Boolean).join("\n\n").slice(0, maxChars);
}

/**
 * Build title suggestion, subtitle, Klappentext, 6 keywords + Vorsatz.
 */
export async function generateSachbuchMarketingCopy(
  book: SachbuchKontext,
): Promise<
  SachbuchMarketingCopy & { vorsatz: RomanVorsatz; autorName: string }
> {
  const bookType = getSachbuchBookType(book.makro.bookTypeId);
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_MARKETING);
  const raw = await generateText({
    model,
    systemInstruction: `Du bist Lektor und Marketing-Texter für deutschsprachige Sachbücher.
Antworte NUR als JSON ohne Markdown-Fence.`,
    userText: `Erzeuge Marketing- und Titelei-Texte für dieses Sachbuch (Amazon/DACH Niche-Seller).

Aktueller Arbeitstitel: ${book.title}
Buchtyp: ${bookType?.shortLabel ?? bookType?.name ?? book.makro.typ}
Zielgruppe: ${
      book.zielgruppe.trim() ||
      "Ops/BizOps, Product Manager, digitale Teamleiter, mittelständische GF — nicht Juristen"
    }
UVP / These: ${book.idee.unpopularOpinion.trim() || "—"}
Briefing (Auszug): ${(book.idee.briefing || book.idee.refinedBriefing || "").trim().slice(0, 2_000) || "—"}

Regeln:
- suggestedTitle: kurz, markenfähig; starker Arbeitstitel darf bleiben oder nur leicht geschärft werden.
- subtitle: Kaufentscheidung in einer Zeile (Nutzen/Hebel), kein Rechtskommentar-Ton.
- summary: Problem → These → 3 Outcomes → für wen / nicht für wen; 120–180 Wörter.
- keywords: 6 Amazon-Suchintentionen (Prozesse/Lean/Business), keine Hashtags, keine Gesetzesnummern.
- Kein Spoiler der Fallstudien-Auflösung.

Antwort NUR als JSON:
{"suggestedTitle":"prägnanter Markttitel (deutsch, ohne Untertitel)","subtitle":"kurzer Untertitel oder leer","summary":"Klappentext 120–180 Wörter, konkret, spoilerarm, für Amazon/Klappe","keywords":["genau","sechs","Schlagwörter","ohne","Hashtags","amazon"],"motto":"optionales Motto/Epigraph oder leer"}

Manuskript-Auszug:
${manuscriptSample(book) || book.idee.briefing.trim() || book.idee.unpopularOpinion}`,
    preferJson: true,
    maxTokens: 4000,
    timeoutMs: 180_000,
  });

  const obj = await parseModelJsonObjectWithRepair({
    raw,
    model,
    schemaHint:
      '{"suggestedTitle":"","subtitle":"","summary":"","keywords":["a","b","c","d","e","f"],"motto":""}',
    errorLabel: "Marketing-Texte",
  });
  const keywordsIn = Array.isArray(obj.keywords)
    ? (obj.keywords as unknown[])
        .map((k) => String(k).trim())
        .filter(Boolean)
        .slice(0, SACHBUCH_KEYWORD_COUNT)
    : [];
  const parsed = sachbuchMarketingSchema.safeParse({
    ...obj,
    suggestedTitle:
      String(obj.suggestedTitle ?? obj.suggested_title ?? "").trim() ||
      book.title,
    keywords: keywordsIn,
  });
  if (!parsed.success) {
    throw new Error("Marketing-JSON ungültig.");
  }
  let keywords = parsed.data.keywords;
  while (keywords.length < SACHBUCH_KEYWORD_COUNT) {
    keywords = [...keywords, `Keyword ${keywords.length + 1}`];
  }
  keywords = keywords.slice(0, SACHBUCH_KEYWORD_COUNT);

  const year = String(new Date().getFullYear());
  const autor =
    book.export.autorName.trim() || ROMAN_DEFAULT_AUTHOR;
  const titleForVorsatz =
    parsed.data.suggestedTitle.trim() || book.title.trim();
  const base = emptyVorsatz();
  const vorsatz: RomanVorsatz = {
    ...base,
    titelseite: {
      titel: titleForVorsatz,
      untertitel: parsed.data.subtitle.trim(),
      autor,
      imprint: ROMAN_DEFAULT_IMPRINT,
    },
    impressum: {
      ...base.impressum,
      jahr: year,
      rechteinhaber: autor,
      hinweis: `© ${year} ${autor} · ${ROMAN_DEFAULT_IMPRINT}. Alle Rechte vorbehalten.`,
      disclaimer:
        "Dieses Sachbuch gibt Orientierung und Erfahrungswissen wieder. Keine Garantie für Vollständigkeit oder individuelle Ergebnisse. Bei Bedarf fachlichen Rat einholen.",
    },
    motto: parsed.data.motto?.trim() || "",
    widmung: "",
    // Keep an existing preface when regenerating marketing copy.
    vorwort: book.export.vorsatz.vorwort?.trim() || "",
  };

  return {
    suggestedTitle: parsed.data.suggestedTitle.trim(),
    subtitle: parsed.data.subtitle.trim(),
    summary: parsed.data.summary.trim(),
    keywords,
    motto: parsed.data.motto?.trim() || "",
    vorsatz: parseVorsatzJson(vorsatz),
    autorName: autor,
  };
}

/** Generate + persist marketing / Titelei (not book.title until apply). */
export async function runSachbuchMarketingGenerate(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "export");
  const copy = await generateSachbuchMarketingCopy(book);
  return upsertSachbuchExport({
    id: sachbuchId,
    suggestedTitle: copy.suggestedTitle,
    subtitle: copy.subtitle,
    summary: copy.summary,
    keywords: copy.keywords,
    autorName: copy.autorName,
    vorsatz: copy.vorsatz,
  });
}

/** Apply suggestedTitle to book.title + Vorsatz titelseite. */
export async function applySachbuchSuggestedTitle(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "export");
  const nextTitle =
    book.export.suggestedTitle.trim() || book.title.trim();
  if (nextTitle.length < 2) {
    throw new Error("Kein Titelforschlag vorhanden — zuerst Texte generieren.");
  }
  const vorsatz = {
    ...book.export.vorsatz,
    titelseite: {
      ...book.export.vorsatz.titelseite,
      titel: nextTitle,
    },
  };
  return upsertSachbuchExport({
    id: sachbuchId,
    title: nextTitle,
    vorsatz,
  });
}
