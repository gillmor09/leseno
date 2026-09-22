/**
 * Exposé (grob Handlung): Co-Autor sketches Anfang/Mitte/Ende;
 * Entwicklungslektor critiques; Co-Autor weaves commented apply.
 * Stored via `withExposeText` / type-specific editorial fields.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_DRAFT_MAX_TOKENS,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";

const MARK_START = "===EXPOSE===";
const MARK_ENDE = "===ENDE===";

export type ExposeSuggestResult = {
  expose: string;
  woven: boolean;
  modelLabel: string;
};

export type ExposeCritiqueResult = {
  critique: string;
  modelLabel: string;
};

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBetween(text: string, startMark: string, endMark: string): string {
  const a = text.indexOf(startMark);
  if (a < 0) return "";
  const from = a + startMark.length;
  const b = text.indexOf(endMark, from);
  return (b < 0 ? text.slice(from) : text.slice(from, b)).trim();
}

/** Parse marked Exposé body; falls back to whole reply if markers missing. */
function parseExposeText(raw: string, roleLabel: string): string {
  const text = stripFence(raw);
  const marked = extractBetween(text, MARK_START, MARK_ENDE);
  const expose = (marked || text).trim().slice(0, CLIP.expose);
  if (expose.length < 80) {
    throw new Error(`${roleLabel} lieferte kein brauchbares Exposé.`);
  }
  return expose;
}

/** True when Exposé already has substance. */
export function hasFilledExpose(expose: string): boolean {
  return expose.trim().length >= 80;
}

function typHints(buchTyp: RomanBuchTyp): string {
  switch (buchTyp) {
    case "sachbuch":
      return `Sachbuch: Skizziere die grobe Argument-/Kapitel-Handlung als Anfang (Einstieg & Versprechen), Mitte (Kernargumente / Wendungen), Ende (Auflösung & Lesergewinn) — keine fertigen Kapiteltexte.`;
    case "clever_erzaehlt":
      return `Clever erzählt: Skizziere das Wissensgebiet als Folge von Kurzgeschichten — Anfang (Einstieg & Lernversprechen), Mitte (Geschichten mit aufbauenden Lernpunkten), Ende (Synthese / Lesergewinn). Keine fertige Prosa.`;
    case "serie_welt":
      return `Serie/Welt: Skizziere die grobe Handlungs-/Staffel-Bewegung als Anfang, Mitte, Ende — Weltregeln nur andeuten, Fokus Plot.`;
    default:
      return `Belletristik: Skizziere die grobe Handlung als Anfang, Mitte, Ende (Akte/Bewegungen, zentrale Wendepunkte) — keine fertige Kapitelprosa.`;
  }
}

/**
 * Co-Autor drafts or weaves the Exposé (Anfang / Mitte / Ende).
 */
export async function suggestExposeFromCoAutor(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  existingExpose: string;
}): Promise<ExposeSuggestResult> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error(
      "Zuerst eine Ideendokumentation im Schritt Idee erarbeiten.",
    );
  }

  const weave = hasFilledExpose(input.existingExpose);
  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";

  const weaveBlock = weave
    ? `Bestehendes Exposé VERWEBEN und AUFWERTEN — nicht blind ersetzen. Brauchbares behalten, Lücken schließen, Widersprüche zur Idee auflösen.`
    : `Exposé neu anlegen nach Idee, Regeln, Figuren und Welt.`;

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Ideendokumentation
${idee.slice(0, CLIP.idee)}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}

# Bisheriges Exposé
${weave ? input.existingExpose.trim().slice(0, CLIP.expose) : "(leer — neu anlegen)"}

${weaveBlock}

${typHints(input.buchTyp)}

Pflichtstruktur im Exposé (Markdown-Überschriften):
## Anfang
## Mitte
## Ende

Optional danach kurz: ## Wendepunkte, ## Offene Fragen — nur wenn nötig.
Auf Deutsch, konkret, editierbar. Keine Meta-Floskeln, keine Chat-Einleitung.
Heb das Exposé über austauschbares Genre-Mittelmaß: klare Eigenentscheidungen, keine Logiklöcher.

Antworte EXAKT in diesem Format:
${MARK_START}
(vollständiges Exposé)
${MARK_ENDE}`;

  const system = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Exposé:
Du skizzierst die grobe Handlung (Anfang, Mitte, Ende) als editierbares Exposé.
Nur ${MARK_START} … ${MARK_ENDE}. Kein JSON.`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: false,
    maxTokens: ROMAN_DRAFT_MAX_TOKENS,
  });

  return {
    expose: parseExposeText(raw, "Co-Autor"),
    woven: weave,
    modelLabel: model.label,
  };
}

/**
 * Entwicklungslektor critical read — full upstream context, suggestions only.
 */
export async function critiqueExposeMitEntwicklungslektor(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln?: string;
  charaktere?: RomanCharakter[];
  weltSchauplaetze?: string;
  weltRegeln?: string;
  expose: string;
  editorial?: RomanEditorial | null;
}): Promise<ExposeCritiqueResult> {
  const expose = input.expose.trim();
  if (!hasFilledExpose(expose)) {
    throw new Error("Zuerst ein Exposé anlegen.");
  }

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const chars = formatCharaktere(input.charaktere ?? []) || "(noch keine Steckbriefe)";
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

${compliance}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Basis-Regeln
${(input.grobRegeln ?? "").trim().slice(0, CLIP.grob) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Welt
Schauplätze: ${(input.weltSchauplaetze ?? "").trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${(input.weltRegeln ?? "").trim().slice(0, CLIP.weltRegeln) || "(leer)"}

# Exposé (zu prüfen)
${expose.slice(0, CLIP.expose)}

Auftrag:
Prüfe das Exposé dramaturgisch gegen ALLE Upstream-Artefakte (Idee, Regeln, Figuren, Welt) — und knallhart gegen Regeln + innere Logik/Kontinuität.
Fokus: Motivation, Wendepunkte, Pacing, Figurenbögen, innere Logik, Genre-/Zielgruppen-Schärfe, Vermeidung von austauschbarem Mittelmaß, Logiklöcher und Spannungshänger.

Form:
1. Regel- & Logik-Check (Regeln / Logik — je erfüllt/teilweise/fehlt)
2. Kurze kritische Einschätzung (Stärken + Risiken)
3. 4–8 konkrete Verbesserungsvorschläge (nummeriert, actionable; zuerst Regel-/Logik-Lücken; Upstream-Ursache klar)
4. Optional: 1–2 Alternativrichtungen, die das Buch aus der Genre-Masse heben

Regeln:
- Auf Deutsch, klar, ohne Floskeln.
- Du schreibst das Exposé NICHT um — nur Kritik und Vorschläge.
- Keine Stil-Mikrokorrekturen, außer sie blockieren Verständnis.`;

  const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Zusatzauftrag Exposé-Gegenlese:
Du bist Entwicklungslektor:in. Bewerte das Exposé im vollen Kontext und schlage Nacharbeit vor.
Du änderst das Exposé nicht selbst.`;

  const critique = (
    await generateText({
      model,
      systemInstruction: system,
      userText,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 120_000,
    })
  ).trim();

  if (!critique || critique.length < 40) {
    throw new Error("Entwicklungslektor lieferte keine brauchbare Kritik.");
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: model.label };
}

/**
 * Weave Lektor critique + author comment into Exposé (Co-Autor).
 */
export async function weaveExposeFromLektorKritik(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  expose: string;
  critique: string;
  authorComment: string;
}): Promise<{ expose: string; modelLabel: string }> {
  if (!hasFilledExpose(input.expose)) {
    throw new Error("Exposé fehlt.");
  }
  const critique = input.critique.trim();
  if (critique.length < 40) {
    throw new Error("Lektor-Kritik fehlt.");
  }

  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const { comment, hasExplicitComment } = resolveAuthorWeaveComment(
    input.authorComment,
  );

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Kommentar der Autor:in zur Übernahme (verbindliche Leitplanke)
${comment}

${buildCommentedWeaveRules({ kind: "expose", hasExplicitComment })}

# Ideendokumentation (Kontext)
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Bisheriges Exposé
${input.expose.trim().slice(0, CLIP.expose)}

# Entwicklungslektor-Kritik (Vorschlagsliste)
${critique.slice(0, CLIP.critique)}

Auftrag:
Schreibe das VOLLSTÄNDIGE neue Exposé gemäß den Entscheidungsregeln oben.
Behalte die Struktur ## Anfang / ## Mitte / ## Ende.
Bleib kompakt und editierbar — keine Essays.

Antworte EXAKT in diesem Format:
${MARK_START}
(vollständiges Exposé)
${MARK_ENDE}`;

  const system = `${rolle.systemPrompt}

${buildWeaveSystemAddendum({
  kind: "expose",
  outputFormatHint: `${MARK_START} … ${MARK_ENDE} (kein JSON, kein ideeKurz).`,
})}`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: false,
    maxTokens: 3500,
  });

  return {
    expose: parseExposeText(raw, "Co-Autor"),
    modelLabel: model.label,
  };
}
