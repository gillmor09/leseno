/**
 * Continuous idea Q&A: Schreib-Coach dialog + Ideen-Redakteur weave into ideeKurz.
 * Pipeline Verbessern/Gegenlesen uses Entwicklungslektor critique + weave.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  CLIP,
  ROMAN_CRITIQUE_MANDATE,
  ROMAN_CRITIQUE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";
import {
  buildCommentedWeaveRules,
  buildWeaveSystemAddendum,
  resolveAuthorWeaveComment,
} from "@/lib/roman/weave-comment";

const MAX_HISTORY = 40;
const IDEE_MARK_START = "===IDEE===";
const IDEE_MARK_ENDE = "===ENDE===";

/**
 * Idee is only a seed for Spec (Figuren/Welt/Exposé) — never a chapter outline.
 * Injected into coach, redakteur, critique, and weave prompts.
 */
export const IDEE_SCOPE_MANDATE = `Stufe Idee — Zweck und Grenzen (verbindlich):
- Die Ideendokumentation dient AUSSCHLIESSLICH dazu, im nächsten Schritt eine hochwertige Spec (Figuren, Welt, Exposé) bauen zu können.
- Erlaubt: Prämisse/Kern, Genre/Ton, Leserversprechen, zentrale Konfliktspannung, Figurenkerne (Rollen/Antriebe), Setting-Skizze, offene Fragen.
- VERBOTEN: Kapitelgliederung, „Kapitel 1/2/3 …“, Beat-Sheets, Szenenfolgen, Akt-für-Akt mit Kapitelzuordnung, detaillierte Plotchronologie Szene für Szene, fertige Textabschnitte.
- Kein Ersatz für Spec, Kapitelgerüst oder Manuskript — bleib auf Konzept-/Mythos-Ebene.`;

const IDEE_OUTPUT_HINT = `Ausgabeformat (verbindlich):

${IDEE_MARK_START}
…vollständige Ideendokumentation als Fließtext/Absätze…
${IDEE_MARK_ENDE}

Kein JSON, keine Markdown-Fences, kein Meta-Text außerhalb der Marker.
${IDEE_SCOPE_MANDATE}`;

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function formatHistory(messages: RomanIdeaChatMessage[]): string {
  return messages
    .slice(-MAX_HISTORY)
    .map((m) => {
      const who = m.role === "user" ? "Autor:in" : "Schreib-Coach";
      return `${who}:\n${m.content.trim()}`;
    })
    .join("\n\n");
}

function ideeFromRecord(obj: Record<string, unknown>): string {
  const text = String(
    obj.ideeKurz ?? obj.idee_kurz ?? obj.idee ?? obj.text ?? "",
  ).trim();
  return text.slice(0, CLIP.idee);
}

/**
 * Extract a JSON string value that may contain raw newlines / unescaped quotes
 * (common model failure for long ideeKurz prose).
 */
function extractBrokenJsonStringField(
  raw: string,
  fieldNames: string[],
): string | null {
  for (const name of fieldNames) {
    const re = new RegExp(`"${name}"\\s*:\\s*"`, "i");
    const m = re.exec(raw);
    if (!m || m.index == null) continue;
    let i = m.index + m[0].length;
    let out = "";
    while (i < raw.length) {
      const c = raw[i]!;
      if (c === "\\") {
        const n = raw[i + 1];
        if (n === "n") {
          out += "\n";
          i += 2;
          continue;
        }
        if (n === "r") {
          i += 2;
          continue;
        }
        if (n === "t") {
          out += "\t";
          i += 2;
          continue;
        }
        if (n === '"' || n === "\\" || n === "/") {
          out += n;
          i += 2;
          continue;
        }
        if (n === "u" && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
          out += String.fromCharCode(
            parseInt(raw.slice(i + 2, i + 6), 16),
          );
          i += 6;
          continue;
        }
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === '"') {
        const after = raw.slice(i + 1).match(/^\s*[,}\]]/);
        if (after) return out.trim() || null;
        // Unescaped quote inside prose — keep and continue.
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
    }
    // Truncated JSON: take until last quote before a closing brace, else rest.
    const closeQuote = raw.lastIndexOf('"');
    if (closeQuote > m.index + m[0].length) {
      const slice = raw.slice(m.index + m[0].length, closeQuote).trim();
      if (slice.length >= 40) return slice;
    }
    if (out.trim().length >= 40) return out.trim();
  }
  return null;
}

/**
 * Parse Ideen-Redakteur output: markers (preferred), valid JSON, or broken JSON prose.
 */
function parseIdeeKurzJson(raw: string): string {
  const cleaned = stripFence(raw);

  const mark = cleaned.match(
    /===IDEE(?:KURZ)?===\s*([\s\S]*?)(?:\s*===ENDE===|$)/i,
  );
  if (mark?.[1]?.trim()) {
    return mark[1].trim().slice(0, CLIP.idee);
  }

  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const text = ideeFromRecord(obj);
    if (text) return text;
  } catch {
    // fall through
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const text = ideeFromRecord(obj);
      if (text) return text;
    } catch {
      // ignore
    }
  }

  const broken = extractBrokenJsonStringField(cleaned, [
    "ideeKurz",
    "idee_kurz",
    "idee",
    "text",
  ]);
  if (broken) return broken.slice(0, CLIP.idee);

  // Plain prose — reject obvious JSON scaffolding noise.
  if (
    cleaned.length >= 40 &&
    !/^\s*\{/.test(cleaned) &&
    !/"ideeKurz"\s*:/i.test(cleaned)
  ) {
    return cleaned.slice(0, CLIP.idee);
  }

  throw new Error(
    "Ideen-Redakteur lieferte keine brauchbare Ideendokumentation (JSON/Marker ungültig).",
  );
}

/**
 * One coach reply for the idea Q&A (does not write ideeKurz).
 */
export async function chatIdeeMitSchreibCoach(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  history: RomanIdeaChatMessage[];
  userMessage: string;
}): Promise<{ reply: string; modelLabel: string }> {
  const { rolle, model } = await resolveRomanKiRolle("schreib_coach");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

${IDEE_SCOPE_MANDATE}

# Bisherige Ideendokumentation (nur Kontext — du schreibst sie nicht um)
${input.ideeKurz.trim() || "(noch leer)"}

# Dialog bisher
${formatHistory(input.history) || "(Beginn)"}

# Neue Nachricht der Autor:in
${input.userMessage.trim()}

Antworte als Schreib-Coach.
Befehle der Autor:in (Umbenennen, Streichen, Ton, Fokus) zuerst bestätigen und für den Redakteur klar formulieren.
Keine Kapitelpläne, keine Szenenfolgen — nur Konzeptfragen und Schärfung für die spätere Spec.`;

  const reply = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${IDEE_SCOPE_MANDATE}`,
      userText,
      maxTokens: 2000,
    })
  ).trim();

  if (!reply) {
    throw new Error("Schreib-Coach hat keine Antwort geliefert.");
  }
  return { reply: reply.slice(0, 20_000), modelLabel: model.label };
}

/**
 * Weave latest turn into a full ideeKurz document (not append).
 */
export async function weaveIdeeKurz(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  userMessage: string;
  coachReply: string;
}): Promise<{ ideeKurz: string; modelLabel: string }> {
  const { rolle, model } = await resolveRomanKiRolle("ideen_redakteur");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

${IDEE_SCOPE_MANDATE}

# Bisherige Ideendokumentation
${input.ideeKurz.trim() || "(leer — aus diesem Turn neu aufbauen)"}

# Neuester Dialog-Turn
Autor:in:
${input.userMessage.trim()}

Schreib-Coach:
${input.coachReply.trim()}

Auftrag:
Erzeuge die VOLLSTÄNDIGE verwobene Ideendokumentation (nicht nur Diff).
Falls die bisherige Fassung Kapitel-/Szenenpläne enthält: streichen und auf Konzept-/Prämissen-Ebene verdichten.
Kein Kapitelgerüst, keine Szenenfolge.
Befehle der Autor:in (z. B. Umbenennen einer Rolle/Person, Streichen, Tonwechsel) verbindlich und konsistent umsetzen.

${IDEE_OUTPUT_HINT}`;

  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${IDEE_SCOPE_MANDATE}

Für DIESE Antwort gilt NICHT {"ideeKurz":…}-JSON, sondern:
${IDEE_OUTPUT_HINT}`,
    userText,
    preferJson: false,
    maxTokens: 8_000,
  });

  const ideeKurz = parseIdeeKurzJson(raw);
  return { ideeKurz, modelLabel: model.label };
}

/**
 * Entwicklungslektor critical read — used by vertical pipeline Verbessern/Gegenlesen.
 */
export async function critiqueIdeeMitEntwicklungslektor(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  editorial?: RomanEditorial | null;
}): Promise<{ critique: string; modelLabel: string }> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error(
      "Zuerst etwas Ideendokumentation erarbeiten (Schreib-Coach-Runden).",
    );
  }

  const { rolle, model } = await resolveRomanKiRolle("entwicklungslektor");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];
  const compliance = buildCritiqueRulesAndNeedsBlock(input.editorial);

  const userText = `# Buchtyp
${typLabel}

${compliance}

${IDEE_SCOPE_MANDATE}

# Ideendokumentation
${idee.slice(0, CLIP.idee)}

Auftrag:
Gib eine ehrliche, kritische Entwicklungslektor-Meinung zur Idee — und konkrete Vorschläge, was anders gestaltet werden könnte (Konflikt, Figurenkerne, Setting, Ton, Leserversprechen, Lücken, Risiken, Vermeidung von austauschbarem Genre-Mittelmaß).

Wenn die Dokumentation Kapitel-/Szenenpläne enthält: das als Fehlgriff der Stufe markieren und Streichen zugunsten der Spec-Vorbereitung vorschlagen.

Form:
1. Regel- & Logik-Check (knallhart: Regeln / Logik — je erfüllt/teilweise/fehlt)
2. Kurze kritische Einschätzung (Stärken + Schwächen)
3. 4–8 konkrete Gestaltungsvorschläge (nummeriert, actionable — zuerst Regel-/Logik-Lücken und Stufenfehler)
4. Optional: 1–2 Alternativrichtungen, die das Buch aus der Masse heben würden

Regeln:
- Auf Deutsch, klar und konkret.
- Keine komplette Umschreibung der Dokumentation; du schreibst sie nicht um.
- Keine Dialog-Rückfragen an die Autor:in — nur Kritik und Vorschläge.
- Figurennamen optional; Rollen/Archetypen reichen.
- Keine Meta-Kommentare à la „als KI …“.
- Keine Kapitel- oder Szenenpläne vorschlagen.`;

  const system = `${rolle.systemPrompt}

${ROMAN_CRITIQUE_MANDATE}

${IDEE_SCOPE_MANDATE}

Zusatzauftrag Ideen-Kritik:
Du bist kritisch-konstruktive:r Entwicklungslektor. Bewerte die Ideendokumentation und schlage Alternativen vor.
Du änderst die Dokumentation nicht selbst — nur Meinung und Vorschläge.
Für diesen Auftrag: kein Q&A-Dialog, sondern eine abgeschlossene Kritik mit knallhartem Regel- & Logik-Check.`;

  const critique = (
    await generateText({
      model,
      systemInstruction: system,
      userText,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
    })
  ).trim();

  if (!critique || critique.length < 40) {
    throw new Error("Entwicklungslektor lieferte keine brauchbare Kritik.");
  }
  return { critique: critique.slice(0, CLIP.critique), modelLabel: model.label };
}

/**
 * Weave pipeline critique + patch brief into a full ideeKurz (Co-Autor).
 */
export async function weaveIdeeKurzFromCoAutorKritik(input: {
  buchTyp: RomanBuchTyp;
  ideeKurz: string;
  critique: string;
  authorComment: string;
}): Promise<{ ideeKurz: string; modelLabel: string }> {
  const idee = input.ideeKurz.trim();
  if (idee.length < 40) {
    throw new Error("Ideendokumentation fehlt.");
  }
  const critique = input.critique.trim();
  if (critique.length < 40) {
    throw new Error("Kritik fehlt.");
  }

  const { rolle, model } = await resolveRomanKiRolle("co_autor");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];
  const { comment, hasExplicitComment } = resolveAuthorWeaveComment(
    input.authorComment,
  );

  const userText = `# Buchtyp
${typLabel}

${IDEE_SCOPE_MANDATE}

# Kommentar der Autor:in zur Übernahme (verbindliche Leitplanke)
${comment}

${buildCommentedWeaveRules({ kind: "idee", hasExplicitComment })}

# Bisherige Ideendokumentation
${idee.slice(0, CLIP.idee)}

# Kritik und Gestaltungsvorschläge
${critique.slice(0, CLIP.critique)}

Auftrag:
Erzeuge die VOLLSTÄNDIGE neue Ideendokumentation.
Falls Kapitel-/Szenenpläne vorhanden sind: entfernen und auf Konzept-Ebene verdichten (Spec-Vorbereitung).
Keine Chat-Floskeln, keine Meta-Kommentare.

${IDEE_OUTPUT_HINT}`;

  const system = `${rolle.systemPrompt}

${IDEE_SCOPE_MANDATE}

${buildWeaveSystemAddendum({
  kind: "idee",
  outputFormatHint: IDEE_OUTPUT_HINT,
})}`;

  const raw = await generateText({
    model,
    systemInstruction: system,
    userText,
    preferJson: false,
    maxTokens: 8_000,
  });

  const ideeKurz = parseIdeeKurzJson(raw);
  return { ideeKurz, modelLabel: model.label };
}
