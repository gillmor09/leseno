/**
 * World/setup: Entwicklungslektor sketches; Ideen-Redakteur writes marked sections
 * (Co-Autor/Claude hung for minutes on large existing worlds).
 * Fachberater critique with commented apply via Ideen-Redakteur.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_DRAFT_MAX_TOKENS,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";

export type RomanWelt = {
  weltSchauplaetze: string;
  weltRegeln: string;
};

export type WeltSuggestResult = RomanWelt & {
  woven: boolean;
  modelLabel: string;
  lektorLabel: string;
};

export type WeltCritiqueResult = {
  critique: string;
  modelLabel: string;
};

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Light cleanup for model JSON (trailing commas, smart quotes). */
function repairJsonText(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function tryParseObject(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(repairJsonText(text));
    } catch {
      return null;
    }
  }
}

const MARK_SCHAU = "===WELT_SCHAUPLAETZE===";
const MARK_REGELN = "===WELT_REGELN===";
const MARK_ENDE = "===ENDE===";

/** Linear section extract — no regex backtracking (safe on huge replies). */
function extractBetween(text: string, startMark: string, endMark: string): string {
  const a = text.indexOf(startMark);
  if (a < 0) return "";
  const from = a + startMark.length;
  const b = text.indexOf(endMark, from);
  return (b < 0 ? text.slice(from) : text.slice(from, b)).trim();
}

function parseWeltSections(raw: string): RomanWelt | null {
  const text = stripFence(raw);
  if (!text.includes(MARK_SCHAU) || !text.includes(MARK_REGELN)) return null;
  const weltSchauplaetze = extractBetween(text, MARK_SCHAU, MARK_REGELN).slice(
    0,
    50_000,
  );
  const weltRegeln = extractBetween(text, MARK_REGELN, MARK_ENDE).slice(
    0,
    50_000,
  );
  if (weltSchauplaetze.length < 20 && weltRegeln.length < 20) return null;
  return { weltSchauplaetze, weltRegeln };
}

/**
 * Fallback field extract via indexOf (linear). Avoids ReDoS from regex on long text.
 */
function extractWeltFieldsLoose(raw: string): Record<string, unknown> | null {
  const pick = (key: string): string => {
    const needle = `"${key}"`;
    const keyAt = raw.indexOf(needle);
    if (keyAt < 0) return "";
    const colon = raw.indexOf(":", keyAt + needle.length);
    if (colon < 0) return "";
    let i = colon + 1;
    while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
    if (raw[i] !== '"') return "";
    i += 1;
    let out = "";
    while (i < raw.length) {
      const ch = raw[i]!;
      if (ch === "\\" && i + 1 < raw.length) {
        const next = raw[i + 1]!;
        if (next === "n") out += "\n";
        else if (next === "t") out += "\t";
        else if (next === '"') out += '"';
        else if (next === "\\") out += "\\";
        else out += next;
        i += 2;
        continue;
      }
      if (ch === '"') break;
      out += ch;
      i += 1;
      if (out.length > 50_000) break;
    }
    return out.trim();
  };

  const weltSchauplaetze =
    pick("weltSchauplaetze") || pick("schauplaetze") || pick("orte");
  const weltRegeln = pick("weltRegeln") || pick("regeln") || pick("grenzen");
  if (weltSchauplaetze.length < 20 && weltRegeln.length < 20) return null;
  return { weltSchauplaetze, weltRegeln };
}

function parseJsonObject(raw: string, roleLabel: string): Record<string, unknown> {
  const cleaned = stripFence(raw);
  let parsed = tryParseObject(cleaned);
  if (parsed == null) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = tryParseObject(cleaned.slice(start, end + 1));
    }
  }
  if (parsed == null) {
    const extracted = extractWeltFieldsLoose(cleaned);
    if (extracted) return extracted;
    throw new Error(`${roleLabel} lieferte ungültiges JSON.`);
  }
  return asRecord(parsed);
}

function coerceWeltField(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          return String(row.text ?? row.content ?? "").trim();
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.text ?? row.content ?? "").trim();
  }
  return "";
}

function parseWeltJson(raw: string, roleLabel: string): RomanWelt {
  const fromSections = parseWeltSections(raw);
  if (fromSections) return fromSections;

  const obj = parseJsonObject(raw, roleLabel);
  const weltSchauplaetze = coerceWeltField(
    obj.weltSchauplaetze ?? obj.schauplaetze ?? obj.orte,
  ).slice(0, CLIP.weltSchau);
  const weltRegeln = coerceWeltField(
    obj.weltRegeln ?? obj.regeln ?? obj.grenzen,
  ).slice(0, CLIP.weltRegeln);
  if (weltSchauplaetze.length < 20 && weltRegeln.length < 20) {
    if (typeof obj.ideeKurz === "string" && obj.ideeKurz.trim()) {
      throw new Error(
        `${roleLabel} lieferte ideeKurz statt Welt-Abschnitten. Bitte erneut versuchen.`,
      );
    }
    throw new Error(`${roleLabel} lieferte keine brauchbare Welt.`);
  }
  return { weltSchauplaetze, weltRegeln };
}

/** True when world fields already have substance. */
export function hasFilledWelt(welt: RomanWelt): boolean {
  return (
    welt.weltSchauplaetze.trim().length >= 40 ||
    welt.weltRegeln.trim().length >= 40
  );
}

function formatWelt(welt: RomanWelt): string {
  const parts = [
    welt.weltSchauplaetze.trim() &&
      `## Schauplätze / Setup\n${welt.weltSchauplaetze.trim()}`,
    welt.weltRegeln.trim() &&
      `## Regeln & Grenzen\n${welt.weltRegeln.trim()}`,
  ].filter(Boolean);
  return parts.join("\n\n") || "(leer)";
}

/**
 * World draft: Co-Autor writes marked sections (optional weave of existing).
 * Pipeline Erzeugen = Co-Autor; Gegenlesen = Entwicklungslektor.
 */
export async function suggestWeltFromLektorUndCoAutor(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  charaktere: RomanCharakter[];
  existing: RomanWelt;
}): Promise<WeltSuggestResult> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error(
      "Zuerst eine Ideendokumentation im Schritt Idee erarbeiten.",
    );
  }

  const weave = hasFilledWelt(input.existing);
  const grob = input.grobRegeln.trim();
  const chars = formatCharaktere(input.charaktere) || "(noch keine Steckbriefe)";
  const existingFormatted = formatWelt(input.existing);

  const writer = await resolveRomanKiRolle("co_autor");
  const weaveBlock = weave
    ? `Bestehende Welt VERWEBEN und AUFWERTEN — nicht blind ersetzen. Idee und Basis-Regeln haben Vorrang bei Widersprüchen; brauchbare Alt-Infos behalten.`
    : `Welt neu anlegen nach Idee, Basis-Regeln und Figuren.`;

  const writerUser = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Ideendokumentation
${idee.slice(0, CLIP.idee)}

# Basis-Regeln
${grob.slice(0, CLIP.grob) || "(leer)"}

# Charaktere
${chars.slice(0, CLIP.charaktere)}

# Bisherige Welt
${weave ? existingFormatted.slice(0, CLIP.weltCombined) : "(leer)"}

${weaveBlock}

Feldregeln:
- Beide Abschnitte auf Deutsch, konkret, ohne Meta-Floskeln.
- Belletristik: greifbare Orte + innere Logik. Sachbuch: ggf. Argument-Räume / Kontextfelder.
- Vollständige Abschnitte liefern — nicht mittendrin abbrechen.
- Keine Klischee-Kulisse; jede Regel muss dramaturgisch nutzbar sein.
- Was die Welt einzigartig macht (kein austauschbares Genre-Kulisse).

Antworte EXAKT in diesem Format (kein JSON, keine Markdown-Fences, keine Extra-Prosa):
${MARK_SCHAU}
(vollständige Schauplätze / Setup)
${MARK_REGELN}
(vollständige Regeln & Grenzen)
${MARK_ENDE}`;

  const raw = await generateText({
    model: writer.model,
    systemInstruction: `${writer.rolle.systemPrompt}

${buildWeaveSystemAddendum({
  kind: "welt",
  outputFormatHint: `${MARK_SCHAU} … ${MARK_REGELN} … ${MARK_ENDE} (kein JSON, kein ideeKurz).`,
})}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Welt/Setup (Co-Autor):
Du schreibst die editierbare Welt-Fassung in markierten Abschnitten.
Quellen: Idee, Basis-Regeln, Figuren${weave ? ", bestehende Welt" : ""}.
Nur ${MARK_SCHAU} … ${MARK_ENDE}.`,
    userText: writerUser,
    preferJson: false,
    maxTokens: ROMAN_DRAFT_MAX_TOKENS,
    timeoutMs: 120_000,
  });

  const welt = parseWeltJson(raw, "Co-Autor");
  return {
    ...welt,
    woven: weave,
    modelLabel: writer.model.label,
    lektorLabel: writer.model.label,
  };
}

/**
 * Critical read of the world — full upstream, suggestions only.
 * Pipeline uses Entwicklungslektor; manual panel may still pass Fachberater.
 */
export async function critiqueWeltMitFachberater(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  charaktere: RomanCharakter[];
  welt: RomanWelt;
  editorial?: RomanEditorial | null;
  roleKey?: "fachberater" | "entwicklungslektor";
}): Promise<WeltCritiqueResult> {
  if (!hasFilledWelt(input.welt)) {
    throw new Error(
      "Zuerst eine Welt anlegen (Co-Autor / Pipeline oder manuell).",
    );
  }

  const roleKey = input.roleKey ?? "fachberater";
  const criticLabel =
    roleKey === "entwicklungslektor" ? "Entwicklungslektor" : "Fachberater";
  const { rolle, model } = await resolveRomanKiRolle(roleKey);
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);
  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

${compliance}

# Ideendokumentation
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Charaktere
${(formatCharaktere(input.charaktere) || "—").slice(0, CLIP.charaktere)}

# Aktuelle Welt
${formatWelt(input.welt).slice(0, CLIP.weltCombined)}

Auftrag — ${criticLabel}-Gegenlese:
Prüfe die Welt gegen Idee, Regeln und Figuren — und knallhart gegen Regeln + innere Logik/Kontinuität — auf Plausibilität, Stereotypen, Respekt, innere Logik, dramaturgische Nutzbarkeit und Eigenständigkeit (kein Genre-Mittelmaß).
1. Regel- & Logik-Check (Regeln / Logik — je erfüllt/teilweise/fehlt)
2. Kurze kritische Einschätzung
3. 4–8 konkrete Verbesserungsvorschläge (nummeriert, actionable; zuerst Regel-/Logik-Lücken; Upstream-Ursache klar)
Keine Umschreibung der Welt selbst — nur Meinung und Vorschläge. Auf Deutsch.`;

  const critique = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

Zusatzauftrag Welt-Gegenlese:
Du prüfst Schauplätze und Weltregeln im vollen Kontext. Nur Kritik und Vorschläge — keine fertige Ersatzfassung.`,
      userText,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
    })
  ).trim();

  if (!critique || critique.length < 40) {
    throw new Error(`${criticLabel} lieferte keine brauchbare Kritik.`);
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: model.label };
}

/**
 * Weave critique + author/patch comment into world fields (Co-Autor).
 */
export async function weaveWeltFromFachberaterKritik(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  welt: RomanWelt;
  critique: string;
  authorComment: string;
}): Promise<RomanWelt & { modelLabel: string }> {
  if (!hasFilledWelt(input.welt)) {
    throw new Error("Welt fehlt.");
  }
  const critique = input.critique.trim();
  if (critique.length < 40) {
    throw new Error("Kritik fehlt.");
  }

  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const { comment, hasExplicitComment } = resolveAuthorWeaveComment(
    input.authorComment,
  );

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Kommentar der Autor:in zur Übernahme (verbindliche Leitplanke)
${comment}

${buildCommentedWeaveRules({ kind: "welt", hasExplicitComment })}

# Ideendokumentation (Kontext)
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Bisherige Welt
${formatWelt({
  weltSchauplaetze: input.welt.weltSchauplaetze.slice(0, CLIP.weltSchau),
  weltRegeln: input.welt.weltRegeln.slice(0, CLIP.weltRegeln),
})}

# Kritik / Gestaltungsvorschläge (Vorschlagsliste)
${critique.slice(0, CLIP.critique)}

Auftrag:
Schreibe die VOLLSTÄNDIGE neue Welt gemäß den Entscheidungsregeln oben.
Bleib kompakt und editierbar — keine Essays.

Antworte EXAKT in diesem Format (kein JSON, keine Markdown-Fences, keine Extra-Prosa):
${MARK_SCHAU}
(vollständige Schauplätze / Setup)
${MARK_REGELN}
(vollständige Regeln & Grenzen)
${MARK_ENDE}`;

  const system = `${rolle.systemPrompt}

${buildWeaveSystemAddendum({
  kind: "welt",
  outputFormatHint: `${MARK_SCHAU} … ${MARK_REGELN} … ${MARK_ENDE} (kein JSON).`,
})}`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: false,
    maxTokens: 8_000,
    timeoutMs: 120_000,
  });

  const fromSections = parseWeltSections(raw);
  if (fromSections) {
    return { ...fromSections, modelLabel: model.label };
  }
  // Rare fallback if the model ignored markers but returned JSON anyway.
  const welt = parseWeltJson(raw, "Co-Autor");
  return { ...welt, modelLabel: model.label };
}
