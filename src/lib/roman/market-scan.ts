/**
 * Competitive market scan for Basics: top books + worst/best review themes.
 * Uses Gemini + Google Search grounding via KI-Rolle `marktanalyst`.
 */

import { generateWithGemini } from "@/lib/ai/gemini";
import {
  BUCHTYP_LABELS,
  ROMAN_ALTER_PRESETS,
  formatRichtungenLabel,
  normalizeRichtungen,
  richtungenLabels,
  type RomanBuchTyp,
  type RomanMarktanalyse,
  type RomanMarktanalyseBuch,
} from "@/lib/roman/editorial";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

const JSON_SHAPE = `{
  "books": [
    {
      "title": "Buchtitel",
      "author": "Autor:in",
      "whyPopular": "kurz warum aktuell stark gelesen",
      "worstReviewsConsidered": 20,
      "critiquePoints": ["Kritik 1", "Kritik 2", "Kritik 3"],
      "bestReviewsConsidered": 20,
      "strengthPoints": ["Stärke 1", "Stärke 2", "Stärke 3"]
    }
  ],
  "topCritiqueThemes": ["übergreifendes Kritik-Thema 1", "…"],
  "neglectedNeed": "Welches Leserbedürfnis vernachlässigen aktuelle Bücher?",
  "topStrengthThemes": ["übergreifendes Stärken-Thema 1", "…"],
  "fulfilledNeed": "Welches Leserbedürfnis erfüllen die besten Rezensionen bereits gut?"
}`;

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(raw: string): unknown {
  const cleaned = stripFence(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Marktanalyse lieferte kein JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length >= 3)
    .slice(0, max);
}

function asReviewCount(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(20, Math.round(n));
}

function parseBooks(raw: unknown): RomanMarktanalyseBuch[] {
  if (!Array.isArray(raw)) return [];
  const books: RomanMarktanalyseBuch[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    const author = String(row.author ?? "").trim();
    if (!title) continue;
    const critiquePoints = asStringList(row.critiquePoints, 5);
    const strengthPoints = asStringList(row.strengthPoints, 5);
    if (critiquePoints.length < 2 && strengthPoints.length < 2) continue;
    books.push({
      title: title.slice(0, 200),
      author: (author || "unbekannt").slice(0, 120),
      whyPopular: String(row.whyPopular ?? "")
        .trim()
        .slice(0, 500),
      critiquePoints: critiquePoints.map((c) => c.slice(0, 400)),
      strengthPoints: strengthPoints.map((c) => c.slice(0, 400)),
      worstReviewsConsidered: asReviewCount(row.worstReviewsConsidered),
      bestReviewsConsidered: asReviewCount(row.bestReviewsConsidered),
    });
  }
  return books;
}

/**
 * Run live market scan for genre + age band (German book market focus).
 */
export async function runMarktanalyseScan(input: {
  buchTyp: RomanBuchTyp;
  genre: string;
  alterPresetId: string;
  richtungen?: string[];
  zielAlterMin?: number | null;
  zielAlterMax?: number | null;
  lesestufe?: string;
}): Promise<RomanMarktanalyse> {
  const genre = input.genre.trim();
  if (genre.length < 2) {
    throw new Error("Zuerst ein Genre wählen.");
  }

  const alter = ROMAN_ALTER_PRESETS.find((p) => p.id === input.alterPresetId);
  const zielgruppe =
    alter?.label ||
    [
      input.lesestufe?.trim(),
      input.zielAlterMin != null || input.zielAlterMax != null
        ? `${input.zielAlterMin ?? "?"}-${input.zielAlterMax ?? "?"} Jahre`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") ||
    "nicht spezifiziert";

  if (!alter && !input.lesestufe?.trim() && input.zielAlterMin == null) {
    throw new Error("Zuerst eine Altersgruppe wählen.");
  }

  const richtungen = normalizeRichtungen(input.richtungen);
  const richtungLabels = richtungenLabels(richtungen);
  const richtungLine = richtungLabels.length
    ? richtungLabels.join(" · ")
    : "(keine Extra-Richtung — breites Genre-Segment)";

  const { rolle, model } = await resolveRomanKiRolle("marktanalyst");
  if (model.provider.trim().toLowerCase() !== "gemini") {
    throw new Error(
      "Marktanalyst braucht ein Gemini-Modell (Google Search). Bitte unter KI-Rollen anpassen.",
    );
  }

  const typLabel =
    input.buchTyp === "unbekannt"
      ? "Belletristik oder Sachbuch"
      : BUCHTYP_LABELS[input.buchTyp];

  const segmentHint = richtungLabels.length
    ? `/dieser Richtung („${formatRichtungenLabel(richtungen)}“)`
    : "";

  const userText = `Agiere als KI-Literaturagent und Marktanalyst ausschließlich für den Buchmarkt in DEUTSCHLAND (nicht weltweit, nicht US/UK-Rankings als Primärquelle).

Target Genre: ${genre}
Richtung / Leserversprechen: ${richtungLine}
Zielgruppe/Altersgruppe: ${zielgruppe}
Buchtyp: ${typLabel}

GEO-FOKUS (verbindlich):
- Die 5 Titel müssen zu den aktuell meistgelesenen / meistverkauften / meistbesprochenen in DEUTSCHLAND in diesem Segment gehören.
- Primärquellen: deutsche Bestsellerlisten (z. B. Spiegel-Bestseller, buchreport), Amazon.de, LovelyBooks, deutsche Presse/Feuilletons, deutsche Leserforen.
- Internationale Titel nur, wenn sie in Deutschland nachweislich stark gelesen werden (DE-Listen/DE-Rezensionen) — nicht weil sie weltweit berühmt sind.
- whyPopular: kurz begründen mit DE-Bezug (Liste, Plattform, Resonanz in DE).

Aufgaben:
1. Identifiziere die 5 aktuell meistgelesenen Werke in diesem Segment in Deutschland (inkl. Autor:in). Nutze aktuelle DE-Suchergebnisse.
${
  richtungLabels.length
    ? `   WICHTIG: Bevorzuge Titel, die zur Richtung „${formatRichtungenLabel(richtungen)}“ passen (Ton/Leserversprechen), nicht nur zum Genre-Label.`
    : ""
}
2. Für JEDEN Titel — NEGATIV-Analyse:
   - Suche und berücksichtige bis zu 20 der schlechtesten / kritischsten Rezensionen (bevorzugt deutschsprachig: Amazon.de, LovelyBooks, DE-Blogs; sonst DE-leserrelevante Quellen).
   - Filtere reine Wut ohne Substanz heraus; gewichte wiederkehrende, begründete Kritik höher.
   - Extrahiere 3–5 häufigste Kritikpunkte (Tropes, Pacing, Schreibstil, Plot Holes, Figuren, Klischees …).
   - Setze worstReviewsConsidered auf die Zahl der wirklich einbezogenen Negativ-Rezensionen (max. 20).
3. Für JEDEN Titel — POSITIV-Analyse (gleiches Schema, umgekehrt):
   - Suche und berücksichtige bis zu 20 der besten / enthusiastischsten Rezensionen (5★, „Lieblingsbuch“, starke Empfehlungen).
   - Extrahiere 3–5 größte Stärken, die Leser:innen immer wieder loben.
   - Setze bestReviewsConsidered entsprechend (max. 20).
4. Übergreifend über alle Titel:
   - topCritiqueThemes: 3–5 gemeinsame Kritik-Muster.
   - neglectedNeed: Welches Leserbedürfnis vernachlässigen aktuelle Bücher in diesem Genre${segmentHint}/dieser Altersgruppe auf dem deutschen Markt? (wird später MUSS für unseren Entwurf)
   - topStrengthThemes: 3–5 gemeinsame Stärken-Muster.
   - fulfilledNeed: Welches Leserbedürfnis erfüllen die besten Rezensionen bereits gut? (wird später ebenfalls MUSS — Leser erwarten diese Belohnung)

Antwort AUSSCHLIESSLICH als JSON (kein Markdown außerhalb), Schema:
${JSON_SHAPE}

Regeln:
- Maximal 5 books; jedes Buch braucht critiquePoints UND strengthPoints (je 3–5).
- Kritik und Stärken: konkret, aus Rezensionen abgeleitet — keine leeren Superlative.
- neglectedNeed und fulfilledNeed müssen sich sinnvoll unterscheiden (Lücke vs. bereits bedient) und als klare MUSS-Formulierungen taugen.
- Deutsch.
- Keine erfundenen Bestseller ohne Suchbezug; bei Unsicherheit die bestbelegte DE-Alternative wählen und whyPopular ehrlich halten.
- Nutze Google Search aktiv, priorisiert DE-Quellen (Spiegel-Bestseller, buchreport, Amazon.de, LovelyBooks, deutsche Literaturblogs/Presse).`;

  const result = await generateWithGemini({
    modelSlug: model.modelSlug,
    systemInstruction: rolle.systemPrompt,
    userText,
    googleSearch: true,
    thinkingLevel: model.reasoningEffort ?? "high",
    maxTokens: 12_000,
    timeoutMs: 240_000,
  });

  let parsed: unknown;
  try {
    parsed = extractJsonObject(result.text);
  } catch {
    throw new Error(
      "Marktanalyse konnte die Antwort nicht als JSON lesen. Bitte erneut versuchen.",
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const books = parseBooks(obj.books);
  if (books.length < 3) {
    throw new Error(
      "Marktanalyse fand zu wenige belegte Titel. Bitte Genre/Altersgruppe prüfen und erneut versuchen.",
    );
  }

  const topCritiqueThemes = asStringList(obj.topCritiqueThemes, 5).map((t) =>
    t.slice(0, 400),
  );
  const topStrengthThemes = asStringList(obj.topStrengthThemes, 5).map((t) =>
    t.slice(0, 400),
  );
  const neglectedNeed = String(obj.neglectedNeed ?? "")
    .trim()
    .slice(0, 2_000);
  const fulfilledNeed = String(obj.fulfilledNeed ?? "")
    .trim()
    .slice(0, 2_000);
  if (neglectedNeed.length < 20) {
    throw new Error("Marktanalyse lieferte keine brauchbare Bedürfnis-Lücke.");
  }
  if (fulfilledNeed.length < 20) {
    throw new Error(
      "Marktanalyse lieferte kein brauchbares erfülltes Bedürfnis aus den Best-Rezensionen.",
    );
  }

  return {
    genre,
    zielgruppe,
    richtungen: richtungLabels,
    scannedAt: new Date().toISOString(),
    books,
    topCritiqueThemes,
    neglectedNeed,
    topStrengthThemes,
    fulfilledNeed,
    modelLabel: model.label,
    sources: result.groundingSources?.slice(0, 24),
    searchSuggestionsHtml: result.searchSuggestionsHtml?.slice(0, 50_000),
    webSearchQueries: result.webSearchQueries?.slice(0, 12),
  };
}

/** Compact block for draft/critique prompts. */
export function formatMarktanalyseForPrompt(
  scan: RomanMarktanalyse | null | undefined,
  maxChars = 10_000,
): string {
  if (!scan || !scan.books.length) return "";
  const lines: string[] = [
    `Marktanalyse Deutschland (${scan.genre}${
      scan.richtungen?.length ? ` · ${scan.richtungen.join(" · ")}` : ""
    } · ${scan.zielgruppe}, ${scan.scannedAt.slice(0, 10)}):`,
    `MUSS — Vernachlässigtes Leserbedürfnis (verbindlich erfüllen): ${scan.neglectedNeed}`,
  ];
  if (scan.fulfilledNeed?.trim()) {
    lines.push(
      `MUSS — Erfülltes Leserbedürfnis (verbindlich bedienen): ${scan.fulfilledNeed}`,
    );
  }
  if (scan.topCritiqueThemes.length) {
    lines.push(
      `Übergreifende Kritik-Themen: ${scan.topCritiqueThemes.join("; ")}`,
    );
  }
  if ((scan.topStrengthThemes ?? []).length) {
    lines.push(
      `Übergreifende Stärken-Themen: ${scan.topStrengthThemes.join("; ")}`,
    );
  }
  for (const b of scan.books) {
    const parts = [
      `Kritik: ${b.critiquePoints.join(" · ") || "—"}`,
      `Stärken: ${(b.strengthPoints ?? []).join(" · ") || "—"}`,
    ];
    lines.push(`- ${b.title} (${b.author}): ${parts.join(" | ")}`);
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}
