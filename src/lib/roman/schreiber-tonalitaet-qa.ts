/**
 * Coach dialog to craft the Basics „Sprache & Tonalität (Schreiber)“ brief.
 * Uses Schreib-Coach for questions + Ideen-Redakteur to weave the brief.
 */

import { generateText } from "@/lib/ai/provider";
import {
  BUCHTYP_LABELS,
  type RomanBuchTyp,
} from "@/lib/roman/editorial";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanIdeaChatMessage } from "@/lib/roman/types";

const SCOPE = `Du arbeitest NUR an Sprache & Tonalität des Schreibers (Erzählstimme, Register, Rhythmus, Humor/Ernst, Dialogdichte, Tabus).
Keine Plot-Ideen, keine Kapitelpläne, keine Figurennamen-Diskussion — außer sie betreffen den Sprachstil.`;

const MARK_START = "===TONALITAET===";
const MARK_ENDE = "===ENDE===";

function formatHistory(messages: RomanIdeaChatMessage[]): string {
  if (messages.length === 0) return "(Beginn)";
  return messages
    .map((m) =>
      m.role === "assistant"
        ? `Coach:\n${m.content.trim()}`
        : `Autor:in:\n${m.content.trim()}`,
    )
    .join("\n\n");
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Extract the Schreiber brief from marker / JSON / plain model replies.
 */
export function parseSchreiberTonalitaetBrief(raw: string): string {
  const cleaned = stripFence(raw);
  for (const startMark of [MARK_START, "===IDEE==="]) {
    const start = cleaned.indexOf(startMark);
    const end = cleaned.lastIndexOf(MARK_ENDE);
    if (start >= 0 && end > start) {
      return cleaned
        .slice(start + startMark.length, end)
        .trim()
        .slice(0, 4_000);
    }
  }
  if (/"ideeKurz"\s*:/i.test(cleaned) || cleaned.startsWith("{")) {
    try {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice =
        start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      const obj = JSON.parse(slice) as Record<string, unknown>;
      const inner = String(
        obj.tonalitaet ??
          obj.schreiberSpracheTonalitaet ??
          obj.ideeKurz ??
          obj.idee_kurz ??
          "",
      ).trim();
      if (inner) return inner.slice(0, 4_000);
    } catch {
      /* fall through */
    }
  }
  return cleaned.slice(0, 4_000);
}

/**
 * One coach turn: ask / sharpen language & tonality (not the idea dossier).
 */
export async function chatSchreiberTonalitaetCoach(input: {
  buchTyp: RomanBuchTyp;
  genre: string;
  lesestufe: string;
  currentBrief: string;
  history: RomanIdeaChatMessage[];
  userMessage: string;
}): Promise<{ reply: string }> {
  const { rolle, model } = await resolveRomanKiRolle("schreib_coach");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

# Genre / Thema
${input.genre.trim() || "(offen)"}

# Lesestufe
${input.lesestufe.trim() || "(offen)"}

${SCOPE}

# Bisherige Vorgabe (Sprache & Tonalität)
${input.currentBrief.trim() || "(noch leer)"}

# Dialog bisher
${formatHistory(input.history)}

# Neue Nachricht der Autor:in
${input.userMessage.trim()}

Antworte als Schreib-Coach speziell zu Sprache & Tonalität.
Max. 2–3 gezielte Rückfragen oder knappe Stil-Vorschläge.
Wenn die Autor:in eine fertige Vorgabe diktiert: bestätigen und ggf. 1 Schärfungsfrage.
Auf Deutsch.`;

  const reply = (
    await generateText({
      model,
      systemInstruction: `${rolle.systemPrompt}

${SCOPE}
Für DIESE Session schreibst du keine Ideendokumentation — nur Dialog zu Sprache/Tonalität.`,
      userText,
      maxTokens: 1600,
    })
  ).trim();

  if (!reply) {
    throw new Error("Schreib-Coach hat keine Antwort geliefert.");
  }
  return { reply: reply.slice(0, 12_000) };
}

/**
 * Weave the latest turn into a compact Schreiber-Vorgabe (1–3 short paragraphs).
 */
export async function weaveSchreiberTonalitaetBrief(input: {
  buchTyp: RomanBuchTyp;
  genre: string;
  lesestufe: string;
  currentBrief: string;
  userMessage: string;
  coachReply: string;
}): Promise<{ brief: string }> {
  const { rolle, model } = await resolveRomanKiRolle("ideen_redakteur");
  const typLabel =
    input.buchTyp === "unbekannt"
      ? "noch offen"
      : BUCHTYP_LABELS[input.buchTyp];

  const userText = `# Buchtyp
${typLabel}

# Genre / Thema
${input.genre.trim() || "(offen)"}

# Lesestufe
${input.lesestufe.trim() || "(offen)"}

${SCOPE}

# Bisherige Vorgabe
${input.currentBrief.trim() || "(leer)"}

# Neuester Dialog-Turn
Autor:in:
${input.userMessage.trim()}

Coach:
${input.coachReply.trim()}

Auftrag:
Erzeuge die VOLLSTÄNDIGE aktualisierte Vorgabe „Sprache & Tonalität (Schreiber)“ —
kompakt, verbindlich, 1–3 kurze Absätze oder Bullet-Zeilen.
Nur Stil/Stimme/Register/Rhythmus/Tabus — kein Plot, keine Ideendokumentation.

Ausgabeformat (verbindlich):
${MARK_START}
…Vorgabetext…
${MARK_ENDE}`;

  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${SCOPE}
Für DIESE Antwort gilt NICHT ===IDEE=== und NICHT {"ideeKurz":…}.
Nur:
${MARK_START}
…Vorgabetext Sprache & Tonalität…
${MARK_ENDE}`,
    userText,
    preferJson: false,
    maxTokens: 1200,
  });

  const brief = parseSchreiberTonalitaetBrief(raw);
  if (brief.length < 12) {
    throw new Error("Vorgabe konnte nicht aktualisiert werden.");
  }
  return { brief };
}
