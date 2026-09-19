/**
 * Co-Autor drafts/weaves character sheets; Fachberater refines names + details.
 * Existing sheets are woven — not blindly overwritten.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import {
  emptyCharakter,
  formatCharaktere,
  hasFilledCharaktere,
} from "@/lib/roman/fundament";
import {
  CLIP,
  ROMAN_EXCELLENCE_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanCharakter } from "@/lib/roman/types";

export type CharaktereSuggestResult = {
  charaktere: RomanCharakter[];
  woven: boolean;
  modelLabel: string;
  /** Which KI role produced this pass. */
  pass: "co_autor" | "fachberater";
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

function parseJsonObject(raw: string, roleLabel: string): Record<string, unknown> {
  const cleaned = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error(`${roleLabel} lieferte ungültiges JSON.`);
    }
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error(`${roleLabel} lieferte ungültiges JSON.`);
    }
  }
  return asRecord(parsed);
}

function takeStr(
  row: Record<string, unknown>,
  keys: string[],
  max: number,
): string {
  for (const key of keys) {
    if (key in row && row[key] != null) {
      const v = String(row[key] ?? "").trim();
      if (v) return v.slice(0, max);
    }
  }
  return "";
}

function parseCharakterRow(row: unknown): RomanCharakter {
  const r = asRecord(row);
  return {
    name: takeStr(r, ["name"], 200),
    alter: takeStr(r, ["alter"], 80),
    rolle: takeStr(r, ["rolle"], 200),
    wesenszuege: takeStr(r, ["wesenszuege", "wesenszüge", "traits"], 4000),
    motivation: takeStr(r, ["motivation", "ziel", "motiv"], 4000),
    schwaeche: takeStr(r, ["schwaeche", "schwäche", "hindernis"], 4000),
    bogen: takeStr(r, ["bogen", "wandel"], 4000),
    sprachstil: takeStr(
      r,
      ["sprachstil", "tonalitaet", "tonalität", "sprache"],
      2000,
    ),
  };
}

function parseCharakterePayload(
  raw: string,
  roleLabel: string,
): RomanCharakter[] {
  const obj = parseJsonObject(raw, roleLabel);
  const rows = Array.isArray(obj.charaktere)
    ? obj.charaktere
    : Array.isArray(obj.characters)
      ? obj.characters
      : [];

  const charaktere = rows
    .map(parseCharakterRow)
    .filter(
      (c) =>
        c.name.trim() ||
        c.rolle.trim() ||
        c.motivation.trim() ||
        c.wesenszuege.trim(),
    )
    .slice(0, 40);

  if (!charaktere.length) {
    throw new Error(`${roleLabel} lieferte keine brauchbaren Charaktere.`);
  }
  return charaktere;
}

function filterDraftChars(list: RomanCharakter[]): RomanCharakter[] {
  return list.filter(
    (c) =>
      c.name.trim() ||
      c.rolle.trim() ||
      c.motivation.trim() ||
      (c.wesenszuege ?? "").trim() ||
      c.schwaeche.trim() ||
      c.bogen.trim() ||
      c.sprachstil.trim() ||
      c.alter.trim(),
  );
}

const JSON_SHAPE = `{
  "charaktere": [
    {
      "name": "passender Eigenname",
      "alter": "z. B. 12 oder ca. 40",
      "rolle": "Protagonist:in / Antagonist:in / …",
      "wesenszuege": "Temperament, Haltung, typische Verhaltensweisen",
      "motivation": "Ziel/Motiv",
      "schwaeche": "Schwäche/Hindernis + typische Reaktion unter Druck (Bias)",
      "bogen": "Bogen/Wandel bis Band-Ende (oder bewusst keiner)",
      "sprachstil": "Tonalität/Sprache der Figur (Dialog/Innenstimme)"
    }
  ]
}`;

/**
 * Suggest or weave character sheets from ideeKurz + grobRegeln (Co-Autor).
 */
export async function suggestCharaktereFromIdee(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  existing: RomanCharakter[];
}): Promise<CharaktereSuggestResult> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error(
      "Zuerst eine Ideendokumentation im Schritt Idee erarbeiten (mind. etwas Substanz).",
    );
  }

  const existing = filterDraftChars(input.existing);
  const weave = hasFilledCharaktere(existing);
  const grob = input.grobRegeln.trim();

  const { rolle, model } = await resolveRomanKiRolle("co_autor");

  const weaveBlock = weave
    ? `Bestehende Steckbriefe VERWEBEN und AUFWERTEN — nicht blind ersetzen:
- Behalte brauchbare Infos, Namen und Kernrollen; löse Widersprüche zugunsten Idee + Grob-Regeln.
- Felder inhaltlich verdichten/schärfen (vollständige neue Feldtexte, nicht nur Diff).
- Figuren hinzufügen, wenn Idee/Grob-Regeln sie brauchen und sie fehlen.
- Figuren weglassen, wenn sie zur Idee/Grob-Regeln nicht mehr passen (kein Zwang, alle Alten zu behalten).
- Liefere die VOLLSTÄNDIGE neue Liste unter "charaktere".`
    : `Noch keine brauchbaren Steckbriefe: lege 2–6 zentrale Figuren neu an (bei Sachbuch optional Stimmen/Perspektiven).`;

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Ideendokumentation (Primärquelle für Figurenkerne)
${idee.slice(0, CLIP.idee)}

# Grob-Regeln (Ton, Tabus, Zielgruppe, Länge — verbindliche Leitplanken)
${grob.slice(0, CLIP.grob) || "(leer — nur aus der Idee ableiten)"}

# Bisherige Charakter-Steckbriefe
${weave ? formatCharaktere(existing).slice(0, CLIP.charaktere) : "(leer — neu anlegen)"}

${weaveBlock}

Antworte ausschließlich mit einem JSON-Objekt (keine Markdown-Fences, keine Prosa außen):
${JSON_SHAPE}

Feldregeln:
- Alle acht Keys pro Figur setzen (Strings; leer nur wenn wirklich unbekannt).
- bogen ≠ motivation ≠ schwaeche.
- Keine Eigennamen erfinden, wenn Idee/Grob-Regeln keine nennen — rolle füllen, name darf leer bleiben (Fachberater-Lauf folgt).
- Belletristik: dramaturgisch tragfähige Besetzung. Sachbuch: ggf. Stimmen/Perspektiven statt Handlungsfiguren.
- Jede Figur braucht erkennbare Eigenwilligkeit — kein austauschbares Genre-Mittelmaß.`;

  const system = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Charakter-Steckbriefe:
Du erstellst oder verwebst editierbare Figuren-Steckbriefe für dieses Buch.
Quellen: Ideendokumentation + Grob-Regeln${weave ? " + bestehende Steckbriefe" : ""}.
${weave ? "Verweben/Aufwerten/Hinzufügen/Entfernen — nicht blind überschreiben." : "Neu anlegen."}
Antwort NUR als JSON mit Key "charaktere" (Array). Keine Markdown-Codeblöcke.`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: true,
    maxTokens: 12_288,
  });

  const charaktere = parseCharakterePayload(raw, "Co-Autor");

  return {
    charaktere: charaktere.length ? charaktere : [emptyCharakter()],
    woven: weave,
    modelLabel: model.label,
    pass: "co_autor",
  };
}

/**
 * Refine / weave character sheets (Co-Autor) — keeps cast, improves sheets.
 * Used by pipeline Verbessern and the optional second-pass button.
 */
export async function refineCharaktereWithFachberater(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  grobRegeln: string;
  existing: RomanCharakter[];
}): Promise<CharaktereSuggestResult> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error(
      "Zuerst eine Ideendokumentation im Schritt Idee erarbeiten (mind. etwas Substanz).",
    );
  }

  const existing = filterDraftChars(input.existing);
  if (!hasFilledCharaktere(existing)) {
    throw new Error(
      "Zuerst Charaktere anlegen (Co-Autor oder manuell) — danach können Steckbriefe verfeinert werden.",
    );
  }

  const grob = input.grobRegeln.trim();
  const { rolle, model } = await resolveRomanKiRolle("co_autor");

  const userText = `# Buchtyp
${BUCHTYP_LABELS[input.buchTyp]}

# Ideendokumentation
${idee.slice(0, CLIP.idee)}

# Grob-Regeln (Ton, Tabus, Zielgruppe, Alter — Leitplanken für Namen & Darstellung)
${grob.slice(0, CLIP.grob) || "(leer — aus Idee und Steckbriefen ableiten)"}

# Aktuelle Charakter-Steckbriefe (zu prüfen und zu verfeinern)
${formatCharaktere(existing).slice(0, CLIP.charaktere)}

Auftrag — Co-Autor Nacharbeit / Verfeinern:
1. Passende Namen: Wenn name leer ist ODER unpassend wirkt (Platzhalter, generisch, kulturell/altersmäßig unstimmig, Stereotypen-Falle, widerspricht Idee/Grob-Regeln) → schlage einen glaubwürdigen, alters- und kontextpassenden Namen vor.
2. Passende Namen behalten, wenn sie schon stimmig sind.
3. Steckbrief-Felder bei Bedarf schärfen/verfeinern (Wesenszüge, Motiv, Schwäche, Bogen, Sprache) — brauchbare Infos behalten und aufwerten, nicht blind ersetzen.
4. Keine neue Besetzung erfinden: gleiche Figurenanzahl und Kernrollen; keine Figuren streichen oder hinzufügen, außer ein Steckbrief ist komplett leer/doppelt.
5. Achte auf Respekt, Plausibilität und Vermeidung unnötiger Klischees.
6. Hebe Figuren über austauschbares Genre-Mittelmaß: konkrete Eigenwilligkeit, klare Motivation, dramaturgisch nutzbare Schwächen.

Antworte ausschließlich mit einem JSON-Objekt (keine Markdown-Fences, keine Prosa außen):
${JSON_SHAPE}

Feldregeln:
- Alle acht Keys pro Figur als vollständige Strings.
- name möglichst gesetzt (außer bewusst anonyme Stimme im Sachbuch).
- bogen ≠ motivation ≠ schwaeche.`;

  const system = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

Zusatzauftrag Charakter-Verfeinerung (2. Lauf):
Du prüfst Idee, Grob-Regeln und die vorliegenden Steckbriefe.
Schwerpunkt: passende Namen finden/ersetzen wo nötig, und Steckbriefe respektvoll verfeinern.
Gleiche Figuren behalten — aufwerten, nicht neu erfinden.
Antwort NUR als JSON mit Key "charaktere" (Array). Keine Markdown-Codeblöcke.`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: true,
    maxTokens: 12_288,
  });

  const charaktere = parseCharakterePayload(raw, "Co-Autor");

  return {
    charaktere,
    woven: true,
    modelLabel: model.label,
    pass: "fachberater",
  };
}
