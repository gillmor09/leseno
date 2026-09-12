/**
 * Ideen-Finder: Gemini Flash chat to develop a novel idea,
 * then Mistral maps the transcript onto foundation steps 1–4.
 */

import { generateText } from "@/lib/ai/provider";
import {
  emptyCharakter,
  emptySzenenRasterItem,
} from "@/lib/roman/fundament";
import {
  resolveRomanIdeaChatModel,
  resolveRomanIdeaFillModel,
} from "@/lib/roman/model";
import type {
  RomanCharakter,
  RomanIdeaChatMessage,
  RomanSzenenRasterItem,
} from "@/lib/roman/types";

export type { RomanIdeaChatMessage };

export type RomanIdeaChatRole = RomanIdeaChatMessage["role"];

/** Fields filled into steps 1–4 (+ Arbeitstitel). */
export type RomanIdeaFoundationFill = {
  title: string;
  genre: string;
  praemisse: string;
  perspektive: string;
  zeitform: string;
  tonalitaet: string;
  stilbibel: string;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
  szenenRaster: RomanSzenenRasterItem[];
};

const CHAT_SYSTEM = `Du bist Ideen-Coach für Belletristik-Romane (deutscher Markt).
Du hilfst Autor:innen per Chat, eine tragfähige Buchidee zu entwickeln.

Regeln:
- Antworte auf Deutsch, klar und konkret (keine Floskeln).
- Stelle gezielte Rückfragen zu Genre, Konflikt, Figur, Setting, Ton — aber nicht alles auf einmal (max. 2–3 Fragen).
- Schlage Alternativen vor, wenn die Idee dünn ist.
- Fasse zwischendurch kurz zusammen, was schon feststeht.
- Erfinde keine fertigen Kapiteltexte; bleib bei Konzept, Figuren, Plot-Ideen.
- Wenn die Idee reif wirkt, sage klar, dass man sie mit „Übernehmen“ ins Roman-Fundament übernehmen kann.`;

const FILL_SYSTEM = `Du bist Lektorats-Assistent. Aus einem Ideen-Chat füllst du ein Roman-Fundament.
Antworte ausschließlich mit gültigem JSON (kein Markdown außerhalb).
Erfinde sinnvolle, konsistente Details, wo der Chat Lücken lässt — aber widersprich dem Chat nicht.
Sprache: Deutsch.`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const MAX_STORED_MESSAGES = 60;

/** Parse persisted Ideen-Finder chat JSON from Postgres. */
export function parseIdeenChatJson(value: unknown): RomanIdeaChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: RomanIdeaChatMessage[] = [];
  for (const row of value) {
    const r = asRecord(row);
    const role = r.role === "assistant" || r.role === "user" ? r.role : null;
    const content = String(r.content ?? "").trim();
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, 20_000) });
    if (out.length >= MAX_STORED_MESSAGES) break;
  }
  return out;
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function formatChatTranscript(messages: RomanIdeaChatMessage[]): string {
  return messages
    .map((m) => {
      const who = m.role === "user" ? "Autor:in" : "Ideen-Coach";
      return `${who}:\n${m.content.trim()}`;
    })
    .join("\n\n");
}

/**
 * One Gemini Flash turn: prior messages + new user text → assistant reply.
 */
export async function chatRomanIdea(input: {
  history: RomanIdeaChatMessage[];
  userMessage: string;
}): Promise<string> {
  const userMessage = input.userMessage.trim();
  if (userMessage.length < 1) {
    throw new Error("Bitte eine Nachricht eingeben.");
  }
  if (userMessage.length > 8000) {
    throw new Error("Nachricht ist zu lang (max. ca. 8000 Zeichen).");
  }

  const history = input.history.slice(-24);
  const transcript = formatChatTranscript(history);
  const model = await resolveRomanIdeaChatModel();

  const userText = transcript
    ? `# Bisheriger Dialog\n${transcript}\n\n# Neue Nachricht der Autor:in\n${userMessage}\n\nAntworte als Ideen-Coach auf die neue Nachricht.`
    : `# Erste Nachricht der Autor:in\n${userMessage}\n\nAntworte als Ideen-Coach und starte die Ideenfindung.`;

  const reply = await generateText({
    model,
    systemInstruction: CHAT_SYSTEM,
    userText,
  });
  const cleaned = reply.trim();
  if (!cleaned) {
    throw new Error("Gemini hat keine Antwort geliefert.");
  }
  return cleaned;
}

function parseCharakter(row: unknown): RomanCharakter {
  const r = asRecord(row);
  const base = emptyCharakter();
  return {
    name: String(r.name ?? base.name).slice(0, 200),
    alter: String(r.alter ?? base.alter).slice(0, 80),
    rolle: String(r.rolle ?? base.rolle).slice(0, 200),
    motivation: String(r.motivation ?? base.motivation).slice(0, 4000),
    schwaeche: String(r.schwaeche ?? base.schwaeche).slice(0, 4000),
    sprachstil: String(r.sprachstil ?? base.sprachstil).slice(0, 2000),
  };
}

function parseRasterItem(row: unknown, index: number): RomanSzenenRasterItem {
  const r = asRecord(row);
  const base = emptySzenenRasterItem();
  const kapitelRaw = r.kapitelNr ?? r.kapitel_nr;
  const kapitelNr =
    typeof kapitelRaw === "number" && Number.isFinite(kapitelRaw)
      ? Math.max(1, Math.min(500, Math.round(kapitelRaw)))
      : base.kapitelNr;
  return {
    szeneId: String(r.szeneId ?? r.szene_id ?? `S${index + 1}`).slice(0, 80),
    ort: String(r.ort ?? base.ort).slice(0, 500),
    figuren: String(r.figuren ?? base.figuren).slice(0, 1000),
    szenenziel: String(r.szenenziel ?? base.szenenziel).slice(0, 4000),
    emotionalStart: String(
      r.emotionalStart ?? r.emotional_start ?? base.emotionalStart,
    ).slice(0, 500),
    emotionalEnd: String(
      r.emotionalEnd ?? r.emotional_end ?? base.emotionalEnd,
    ).slice(0, 500),
    kapitelNr,
  };
}

function parseFillJson(raw: string): RomanIdeaFoundationFill {
  const cleaned = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("Mistral-Antwort ist kein gültiges JSON.");
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  const obj = asRecord(parsed);
  const charsRaw = Array.isArray(obj.charaktere) ? obj.charaktere : [];
  const rasterRaw = Array.isArray(obj.szenenRaster)
    ? obj.szenenRaster
    : Array.isArray(obj.szenen_raster)
      ? obj.szenen_raster
      : [];

  const charaktere = charsRaw.map(parseCharakter).filter((c) => c.name.trim());
  const szenenRaster = rasterRaw
    .map(parseRasterItem)
    .filter((r) => r.szenenziel.trim() || r.ort.trim() || r.szeneId.trim());

  return {
    title: String(obj.title ?? obj.titel ?? "").trim().slice(0, 200),
    genre: String(obj.genre ?? "").trim().slice(0, 200),
    praemisse: String(obj.praemisse ?? "").trim().slice(0, 4000),
    perspektive: String(obj.perspektive ?? "").trim().slice(0, 200),
    zeitform: String(obj.zeitform ?? "").trim().slice(0, 120),
    tonalitaet: String(obj.tonalitaet ?? "").trim().slice(0, 2000),
    stilbibel: String(obj.stilbibel ?? "").trim().slice(0, 100_000),
    charaktere: charaktere.length ? charaktere : [emptyCharakter()],
    weltSchauplaetze: String(
      obj.weltSchauplaetze ?? obj.welt_schauplaetze ?? "",
    )
      .trim()
      .slice(0, 50_000),
    weltRegeln: String(obj.weltRegeln ?? obj.welt_regeln ?? "")
      .trim()
      .slice(0, 50_000),
    szenenRaster: szenenRaster.length
      ? szenenRaster.slice(0, 40)
      : [emptySzenenRasterItem()],
  };
}

/**
 * Mistral maps the Ideen-Finder chat onto foundation steps 1–4.
 */
export async function applyRomanIdeaToFoundation(
  messages: RomanIdeaChatMessage[],
): Promise<RomanIdeaFoundationFill> {
  const usable = messages.filter((m) => m.content.trim().length > 0);
  if (usable.length < 2) {
    throw new Error(
      "Noch zu wenig Dialog — erst mit Gemini eine Idee entwickeln, dann übernehmen.",
    );
  }

  const transcript = formatChatTranscript(usable.slice(-30));
  if (transcript.length < 80) {
    throw new Error("Der Dialog ist zu kurz zum Übernehmen.");
  }

  const model = await resolveRomanIdeaFillModel();
  const raw = await generateText({
    model,
    preferJson: true,
    systemInstruction: FILL_SYSTEM,
    userText: `Erzeuge aus diesem Ideen-Chat ein Roman-Fundament (Schritte 1–4).

# Dialog
${transcript}

Gib JSON genau in dieser Form:
{
  "title": "Arbeitstitel",
  "genre": "Genre",
  "praemisse": "2–6 Sätze Prämisse / Logline",
  "perspektive": "z. B. Ich oder Er/Sie limited",
  "zeitform": "z. B. Präteritum",
  "tonalitaet": "Ton, Stimmung, Stil in 1–3 Sätzen",
  "stilbibel": "kurze Stilhinweise (optional, sonst leer)",
  "charaktere": [
    {
      "name": "",
      "alter": "",
      "rolle": "",
      "motivation": "",
      "schwaeche": "",
      "sprachstil": ""
    }
  ],
  "weltSchauplaetze": "Orte / Atmosphäre",
  "weltRegeln": "Weltregeln / Genre-Logik",
  "szenenRaster": [
    {
      "szeneId": "S1",
      "kapitelNr": 1,
      "ort": "",
      "figuren": "",
      "szenenziel": "",
      "emotionalStart": "",
      "emotionalEnd": ""
    }
  ]
}

Hinweise:
- 2–6 zentrale Charaktere.
- 6–18 Szenen-Raster-Einträge als grober Plot-Plan (nicht den ganzen Roman).
- Prämisse und Genre immer befüllen.`,
  });

  const fill = parseFillJson(raw);
  if (!fill.praemisse.trim() && !fill.genre.trim() && !fill.title.trim()) {
    throw new Error(
      "Übernahme lieferte keine brauchbaren Fundament-Felder. Dialog erweitern und erneut versuchen.",
    );
  }
  return fill;
}
