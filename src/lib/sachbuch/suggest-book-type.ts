/**
 * Infer / rank gängige Sachbuchtypen from Idee/Konzept (LLM).
 * Does not persist — caller applies via patch on confirm.
 */

import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_ARCHITECT } from "@/lib/sachbuch/agent-defaults";
import {
  formatSachbuchBookTypesCatalogForPrompt,
  getSachbuchBookType,
  SACHBUCH_BOOK_TYPES,
  type SachbuchBookType,
} from "@/lib/sachbuch/book-types";
import { resolveSachbuchAgentModel } from "@/lib/sachbuch/resolve-agent";
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "@/lib/sachbuch/repository";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import { emptyMakroStages, type SachbuchKontext } from "@/lib/sachbuch/types";

export type SachbuchBookTypeSuggestion = {
  bookTypeId: string;
  name: string;
  shortLabel: string;
  confidence: number;
  reason: string;
};

export type SachbuchBookTypeSuggestResult = {
  primary: SachbuchBookTypeSuggestion;
  alternatives: SachbuchBookTypeSuggestion[];
  rawNote: string;
};

function ideaCorpus(book: SachbuchKontext): string {
  const parts = [
    book.idee.unpopularOpinion.trim(),
    book.idee.briefing.trim(),
    book.idee.caseStudies.map((c) => `- ${c}`).join("\n"),
    book.title.trim(),
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 12_000);
}

function fallbackHeuristic(book: SachbuchKontext): SachbuchBookTypeSuggestResult {
  const text = ideaCorpus(book).toLowerCase();
  const scored = SACHBUCH_BOOK_TYPES.map((t) => {
    const hints = t.matchHints.toLowerCase().split(/,\s*/);
    let hits = 0;
    for (const h of hints) {
      const token = h.trim();
      if (token.length >= 4 && text.includes(token)) hits += 1;
    }
    return { t, hits };
  }).sort((a, b) => b.hits - a.hits);

  const top = scored[0]?.t ?? SACHBUCH_BOOK_TYPES[0]!;
  const alts = scored
    .slice(1, 3)
    .filter((s) => s.hits > 0)
    .map((s) => s.t);

  const toSug = (
    t: SachbuchBookType,
    confidence: number,
    reason: string,
  ): SachbuchBookTypeSuggestion => ({
    bookTypeId: t.id,
    name: t.name,
    shortLabel: t.shortLabel,
    confidence,
    reason,
  });

  return {
    primary: toSug(
      top,
      scored[0]?.hits ? 0.55 : 0.35,
      scored[0]?.hits
        ? "Keyword-Nähe zum Konzept (ohne LLM-Ranking)."
        : "Kein klarer Treffer — Default-Vorschlag aus dem Katalog.",
    ),
    alternatives: alts.map((t, i) =>
      toSug(t, Math.max(0.2, 0.45 - i * 0.1), "Weitere Keyword-Nähe."),
    ),
    rawNote: "heuristic",
  };
}

function parseSuggestions(raw: string): SachbuchBookTypeSuggestResult | null {
  try {
    const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      rankings?: Array<{
        id?: string;
        confidence?: number;
        reason?: string;
      }>;
      note?: string;
    };
    const rankings = Array.isArray(parsed.rankings) ? parsed.rankings : [];
    const mapped: SachbuchBookTypeSuggestion[] = [];
    for (const row of rankings) {
      const id = String(row.id ?? "").trim();
      const t = getSachbuchBookType(id);
      if (!t) continue;
      const confidence = Math.max(
        0,
        Math.min(1, Number(row.confidence) || 0.5),
      );
      mapped.push({
        bookTypeId: t.id,
        name: t.name,
        shortLabel: t.shortLabel,
        confidence,
        reason: String(row.reason ?? "").trim() || "Passt zum Konzept.",
      });
    }
    if (mapped.length === 0) return null;
    return {
      primary: mapped[0]!,
      alternatives: mapped.slice(1, 3),
      rawNote: String(parsed.note ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Rank catalog types against the book's Idee/Konzept.
 * Prefer LLM; fall back to keyword heuristic.
 */
export async function suggestSachbuchBookType(
  sachbuchId: string,
): Promise<SachbuchBookTypeSuggestResult> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "book_type");
  const corpus = ideaCorpus(book);
  if (corpus.length < 40) {
    throw new Error(
      "Idee/Konzept zu dünn — bitte zuerst Idee ausarbeiten oder einfügen.",
    );
  }

  const slot = {
    ...book.agents.architect,
    modelSlug: SACHBUCH_MODEL_ARCHITECT,
  };
  const model = await resolveSachbuchAgentModel(slot);

  try {
    const raw = await generateText({
      model,
      systemInstruction: `Du bist Lektor für deutschsprachige Sachbücher.
Ordne ein Buchkonzept dem passendsten gängigen Sachbuchtyp zu.
Antworte NUR als JSON ohne Markdown-Fence:
{
  "rankings": [
    { "id": "<catalog-id>", "confidence": 0.0-1.0, "reason": "1–2 Sätze auf Deutsch" }
  ],
  "note": "optional kurz"
}
Regeln:
- Nur ids aus dem Katalog verwenden.
- Genau 3 Rankings, bestes zuerst.
- confidence ehrlich (kein Alles-0.99).
- Begründung: warum dieser Typ zum Konzept passt, nicht die Typ-Beschreibung wiederholen.`,
      userText: `Titel: ${book.title}

Konzept / Idee:
${corpus}

Katalog:
${formatSachbuchBookTypesCatalogForPrompt()}`,
      preferJson: true,
      maxTokens: 2000,
      timeoutMs: 120_000,
    });
    const parsed = parseSuggestions(raw);
    if (parsed) return parsed;
  } catch {
    /* heuristic below */
  }

  return fallbackHeuristic(book);
}

/**
 * Persist chosen Sachbuchtyp: sets makro.bookTypeId + makro.typ (stages reset if typ changes).
 */
export async function applySachbuchBookType(input: {
  sachbuchId: string;
  bookTypeId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "book_type");
  const t = getSachbuchBookType(input.bookTypeId);
  if (!t) throw new Error("Unbekannter Sachbuchtyp.");

  const typChanged = book.makro.typ !== t.makroTyp;
  return patchSachbuchBook(input.sachbuchId, {
    makro: {
      ...book.makro,
      bookTypeId: t.id,
      typ: t.makroTyp,
      stages: typChanged ? emptyMakroStages(t.makroTyp) : book.makro.stages,
      parts: typChanged ? [] : book.makro.parts ?? [],
      status: typChanged ? "empty" : book.makro.status,
      kapitelGenerated: typChanged ? false : book.makro.kapitelGenerated,
    },
    idee: {
      ...book.idee,
      guide: {
        ...book.idee.guide,
        currentStep: "evidenz",
      },
    },
  });
}
