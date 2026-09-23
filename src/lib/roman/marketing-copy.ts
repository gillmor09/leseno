/**
 * Amazon / Klappentext marketing copy for a roman:
 * back-cover blurb + one-line eyecatcher (Untertitel / Search hook)
 * + up to 7 KDP backend search keywords.
 *
 * Einzeiler, Klappentext and Keywords are generated in separate model calls so the
 * longer blurb is never truncated mid-JSON.
 */

import { generateText } from "@/lib/ai/provider";
import { tryParseModelJsonObject } from "@/lib/ai/parse-model-json";
import type { AiModelConfig } from "@/lib/prompts/catalog";
import type { CleverUnterthemen } from "@/lib/roman/editorial";
import { resolveRomanTextModel } from "@/lib/roman/model";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

export type RomanMarketingCopyResult = {
  klappentext: string;
  einzeiler: string;
  /** Exactly up to 7 Amazon KDP keyword phrases (≤50 chars each). */
  amazonKeywords: string[];
  /** Set when keyword calls failed; blurb is still usable. */
  keywordsWarning?: string;
};

/** Normalize / clamp keyword list for Amazon KDP (max 7 × 50 chars). */
export function normalizeAmazonKeywords(raw: unknown): string[] {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((v) => String(v ?? "").trim());
  } else if (typeof raw === "string" && raw.trim()) {
    list = raw.split(/[\n,;]+/).map((s) => s.trim());
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const k = item.replace(/\s+/g, " ").slice(0, 50).trim();
    if (k.length < 2) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= 7) break;
  }
  return out;
}

function formatChars(chars: RomanCharakter[]): string {
  return chars
    .filter((c) => c.name.trim())
    .slice(0, 5)
    .map((c) => `${c.name.trim()}${c.rolle.trim() ? ` (${c.rolle.trim()})` : ""}`)
    .join("; ");
}

function formatCleverBriefExtras(
  doc: CleverUnterthemen | null | undefined,
): string {
  if (!doc?.kapitel.length) return "";
  const lines = doc.kapitel.slice(0, 10).map((k) => {
    const facts = k.fakten
      .map((f) => f.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
    return `- ${k.nummer}. ${k.titel}${facts ? ` — ${facts}` : ""}`;
  });
  return `# Clever erzählt — Thema
${doc.thema.trim() || "—"}

# Abenteuer / Unterthemen (Lernpunkte)
${lines.join("\n")}`;
}

function bookBrief(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  ideeKurz?: string;
  alterLabel?: string;
  charaktere: RomanCharakter[];
  manuskriptExcerpt?: string;
  cleverUnterthemen?: CleverUnterthemen | null;
  buchTyp?: string;
}): string {
  const cleverExtras = formatCleverBriefExtras(input.cleverUnterthemen);
  const isClever = input.buchTyp === "clever_erzaehlt";
  return `# Titel
${input.title.trim() || "(ohne Titel)"}

# Genre / Thema
${input.genre.trim() || "—"}

# Buchtyp
${isClever ? "Clever erzählt (Wissens-Abenteuer für Kinder)" : input.buchTyp?.trim() || "Roman"}

# Altersklasse
${input.alterLabel?.trim() || "—"}

# Prämisse / Kernaussage
${input.praemisse.trim() || "—"}

# Ton
${input.tonalitaet.trim() || "—"}

# Idee (gekürzt)
${(input.ideeKurz ?? "").trim().slice(0, 3_500) || "—"}

# Figuren
${formatChars(input.charaktere) || "—"}

${cleverExtras ? `${cleverExtras}\n` : ""}# Ausschnitt
${(input.manuskriptExcerpt ?? "").trim().slice(0, isClever ? 2_500 : 4_000) || "—"}`;
}

/**
 * Pull a JSON string field; `closed` is false if the value was truncated
 * (no closing quote before end of input).
 */
function extractJsonStringField(
  raw: string,
  field: string,
): { text: string; closed: boolean } {
  const re = new RegExp(`"${field}"\\s*:\\s*"`, "i");
  const m = re.exec(raw);
  if (!m || m.index == null) return { text: "", closed: false };
  let i = m.index + m[0].length;
  let out = "";
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "\\") {
      const next = raw[i + 1];
      if (next == null) return { text: out.trim(), closed: false };
      if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "t") out += "\t";
      else if (next === '"' || next === "\\") out += next;
      else out += next;
      i += 2;
      continue;
    }
    if (c === '"') return { text: out.trim(), closed: true };
    out += c;
    i += 1;
  }
  return { text: out.trim(), closed: false };
}

function pickStringField(
  obj: Record<string, unknown>,
  keys: string[],
): string {
  const lower = new Map(
    Object.entries(obj).map(([k, v]) => [
      k.toLowerCase().replace(/[\s-]/g, "_"),
      v,
    ]),
  );
  for (const key of keys) {
    const v = lower.get(key.toLowerCase().replace(/[\s-]/g, "_"));
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** True if text ends with a finished German sentence (not mid-word cut-off). */
export function isCompleteBlurb(text: string): boolean {
  const t = text.trim();
  if (t.length < 60) return false;
  return /[.!?…]["»“']?\s*$/u.test(t);
}

/**
 * If the blurb was cut mid-sentence, keep finished sentences.
 * Accepts a single long complete sentence.
 */
export function trimToCompleteSentences(text: string): string | null {
  const t = text.trim();
  const parts = t.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  if (/[.!?…]$/.test(last)) {
    const out = parts.join(" ").trim();
    return isCompleteBlurb(out) ? out : null;
  }
  const kept = parts.slice(0, -1);
  if (kept.length === 0) return null;
  const out = kept.join(" ").trim();
  return isCompleteBlurb(out) ? out : null;
}

function synthesizeEinzeiler(klappentext: string): string {
  const first = klappentext.split(/(?<=[.!?])\s+/)[0] ?? klappentext;
  return first.replace(/\s+/g, " ").slice(0, 90).trim();
}

function parseEinzeilerPayload(raw: string): string {
  const parsed = tryParseModelJsonObject(raw);
  if (parsed) {
    const hit = pickStringField(parsed, [
      "einzeiler",
      "subtitle",
      "untertitel",
      "tagline",
      "hook",
      "eyecatcher",
    ]);
    if (hit.length >= 5) return hit.replace(/\s+/g, " ").slice(0, 120);
  }
  const scanned = extractJsonStringField(raw, "einzeiler");
  if (scanned.text.length >= 5) {
    return scanned.text.replace(/\s+/g, " ").slice(0, 120);
  }
  // Plain one-liner response
  const line = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/[{}"']/g, " ")
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 5 && l.length <= 120);
  if (line) return line.replace(/\s+/g, " ").slice(0, 120);
  throw new Error("Einzeiler nicht lesbar — bitte erneut erzeugen.");
}

function finalizeKlappentext(text: string, closed: boolean): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) {
    throw new Error("Klappentext leer — bitte erneut erzeugen.");
  }

  if (!closed || !isCompleteBlurb(t)) {
    const trimmed = trimToCompleteSentences(t);
    if (trimmed) return trimmed.slice(0, 4_000);
  }

  if (isCompleteBlurb(t)) return t.slice(0, 4_000);

  // Soft salvage: long enough prose without terminal punctuation → add ellipsis.
  if (t.length >= 90) {
    const salvaged = `${t.replace(/[,:;–—\-]\s*$/, "").trim()}…`;
    if (salvaged.length >= 60) return salvaged.slice(0, 4_000);
  }

  throw new Error(
    "Klappentext unvollständig (abgeschnitten) — bitte erneut erzeugen.",
  );
}

function parseKlappentextPayload(raw: string): string {
  const parsed = tryParseModelJsonObject(raw);
  let text = "";
  let closed = true;

  if (parsed) {
    text = pickStringField(parsed, [
      "klappentext",
      "blurb",
      "beschreibung",
      "description",
      "text",
    ]);
  }

  if (!text) {
    const scanned = extractJsonStringField(raw, "klappentext");
    if (!scanned.text) {
      const alt =
        extractJsonStringField(raw, "blurb").text ||
        extractJsonStringField(raw, "beschreibung").text;
      text = alt;
      closed = Boolean(alt);
    } else {
      text = scanned.text;
      closed = scanned.closed;
    }
  }

  if (!text) {
    const prose = raw
      .replace(/```(?:json)?/gi, "")
      .replace(/[{}"]/g, " ")
      .trim();
    if (prose.length >= 60) {
      text = prose;
      closed = isCompleteBlurb(prose);
    }
  }

  return finalizeKlappentext(text, closed);
}

async function generateEinzeiler(
  model: AiModelConfig,
  brief: string,
): Promise<string> {
  const raw = await generateText({
    model,
    preferJson: true,
    maxTokens: 200,
    timeoutMs: 45_000,
    systemInstruction: `Du schreibst einen Amazon-Eyecatcher (Untertitel) für ein deutsches Kinder-/Jugendbuch.
Antworte NUR als JSON: {"einzeiler":"..."}
- Max. 90 Zeichen, ein Satz oder Fragment
- Neugierig machen, kein Buchtitel wiederholen, kein Spoiler`,
    userText: `${brief}\n\nSchreibe jetzt nur den einzeiler.`,
  });
  return parseEinzeilerPayload(raw);
}

async function generateKlappentext(
  model: AiModelConfig,
  brief: string,
  einzeiler: string,
): Promise<string> {
  const run = async (extra?: string, preferJson = true) => {
    const raw = await generateText({
      model,
      preferJson,
      maxTokens: 2_000,
      timeoutMs: 90_000,
      systemInstruction: preferJson
        ? `Du schreibst den Klappentext (Amazon-Beschreibung) für ein deutsches eBook.
Antworte NUR als JSON: {"klappentext":"..."}
- Deutsch, Appetitmacher, 90–140 Wörter
- Ein durchgehender Absatz, keine Zeilenumbrüche im String
- Spannungsbogen andeuten, ohne Spoiler des Endes
- Genre- und Altersklassen-Ton treffen
- Muss mit einem vollständigen Satz enden (. ! ?)
- Keine Hashtags, kein HTML`
        : `Du schreibst den Klappentext (Amazon-Beschreibung) für ein deutsches eBook.
Antworte NUR mit dem Fließtext (kein JSON, keine Anführungszeichen um den ganzen Text).
- Deutsch, Appetitmacher, 90–140 Wörter, ein Absatz
- Muss mit einem vollständigen Satz enden (. ! ?)
- Keine Hashtags, kein HTML`,
      userText: `${brief}

# Bereits gewählter Einzeiler (nicht wiederholen, aber Ton passen)
${einzeiler}

${extra ?? "Schreibe jetzt nur den vollständigen klappentext."}`,
    });
    return parseKlappentextPayload(raw);
  };

  try {
    return await run();
  } catch (firstError) {
    console.warn(
      "[generateKlappentext] retry:",
      firstError instanceof Error ? firstError.message : firstError,
    );
    try {
      return await run(
        'WICHTIG: Kompletter Klappentext, 90–120 Wörter, endet mit Punkt. Nur JSON {"klappentext":"…"}.',
      );
    } catch (secondError) {
      console.warn(
        "[generateKlappentext] plain-text retry:",
        secondError instanceof Error ? secondError.message : secondError,
      );
      return await run(
        "WICHTIG: Schreibe jetzt den kompletten Klappentext als normalen Absatz (90–120 Wörter), Ende mit Punkt.",
        false,
      );
    }
  }
}

/**
 * Pull keyword phrases from JSON objects, JSON arrays, or numbered lines.
 * Returns whatever normalized phrases were found (may be short of 7).
 */
function collectKeywordPhrases(raw: string): string[] {
  const parsed = tryParseModelJsonObject(raw);
  if (parsed) {
    const list =
      (Array.isArray(parsed.keywords) && parsed.keywords) ||
      (Array.isArray(parsed.amazonKeywords) && parsed.amazonKeywords) ||
      (Array.isArray(parsed.schlagwoerter) && parsed.schlagwoerter) ||
      null;
    if (list) {
      const fromObjects = list.map((item) => {
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          return String(
            rec.keyword ?? rec.phrase ?? rec.text ?? rec.value ?? "",
          );
        }
        return item;
      });
      const normalized = normalizeAmazonKeywords(fromObjects);
      if (normalized.length > 0) return normalized;
    }
  }

  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      const arr = JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as unknown;
      if (Array.isArray(arr)) {
        const normalized = normalizeAmazonKeywords(arr);
        if (normalized.length > 0) return normalized;
      }
    } catch {
      // Numbered / comma fallback below.
    }
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:\d+[\.\)]|[-*•])\s*/, "")
        .replace(/^["']|["'],?\s*$/g, "")
        .trim(),
    )
    .filter(
      (line) =>
        line.length >= 2 &&
        !/^[{}\[\]]/.test(line) &&
        !/^(keywords?|amazonKeywords|schlagwoerter)\s*:/i.test(line),
    );
  if (lines.length >= 3) {
    const fromLines = normalizeAmazonKeywords(lines);
    if (fromLines.length > 0) return fromLines;
  }

  return normalizeAmazonKeywords(
    cleaned.replace(/[{}"\[\]]/g, " ").replace(/keywords?\s*:/gi, " "),
  );
}

async function generateAmazonKeywordsOnce(
  model: AiModelConfig,
  brief: string,
  attempt: number,
): Promise<string[]> {
  const raw = await generateText({
    model,
    preferJson: true,
    // Headroom for thinking models — 400 tokens often returns an empty body in prod.
    maxTokens: 4_096,
    timeoutMs: 90_000,
    systemInstruction: `Du erzeugst Amazon-KDP-Suchkeywords (Backend-Keywords) für ein deutsches Kinder-/Jugendbuch.
Antworte NUR als JSON: {"keywords":["…","…","…","…","…","…","…"]}
Regeln:
- GENAU 7 Einträge
- Jeder Eintrag: Suchphrase auf Deutsch, max. 50 Zeichen
- Kein Buchtitel, keine Autorennamen, keine Konkurrenz-ASINs
- Mix aus Genre, Thema, Alter, Nutzen, Stimmung (z. B. „Kinderbuch Abenteuer 8 Jahre“)
- Keine Hashtags, keine Anführungszeichen innerhalb der Phrasen
- Keine Duplikate`,
    userText: `${brief}

${
  attempt > 0
    ? 'WICHTIG: Genau 7 kurze deutsche Suchphrasen. Nur JSON {"keywords":["…","…","…","…","…","…","…"]}.'
    : "Schreibe jetzt genau 7 keywords."
}`,
  });
  const phrases = collectKeywordPhrases(raw);
  if (phrases.length < 5) {
    throw new Error("Keywords nicht lesbar — bitte erneut erzeugen.");
  }
  return phrases.slice(0, 7);
}

/**
 * Up to 3 attempts. Runs in parallel with the blurb so a slow Klappentext
 * does not starve this call on the production request budget.
 */
async function generateAmazonKeywords(
  model: AiModelConfig,
  brief: string,
): Promise<string[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await generateAmazonKeywordsOnce(model, brief, attempt);
    } catch (error) {
      lastError = error;
      console.warn(
        "[generateAmazonKeywords] attempt",
        attempt + 1,
        error instanceof Error ? error.message : error,
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Keywords nicht lesbar — bitte erneut erzeugen.");
}

/**
 * Model writes German Klappentext + Einzeiler + 7 Amazon keywords from book materials.
 * Separate calls avoid truncated JSON mid-blurb.
 */
export async function generateRomanMarketingCopy(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  ideeKurz?: string;
  alterLabel?: string;
  charaktere: RomanCharakter[];
  manuskriptExcerpt?: string;
  cleverUnterthemen?: CleverUnterthemen | null;
  buchTyp?: string;
}): Promise<RomanMarketingCopyResult> {
  const model = await resolveRomanTextModel();
  const brief = bookBrief(input);

  // Overlap with Einzeiler + Klappentext. On the live host the request often
  // dies before a third sequential model call (keywords) can finish.
  const keywordsTask = generateAmazonKeywords(model, brief).then(
    (amazonKeywords) => ({ amazonKeywords, keywordsWarning: undefined as string | undefined }),
    (error: unknown) => {
      console.warn(
        "[generateRomanMarketingCopy] keywords:",
        error instanceof Error ? error.message : error,
      );
      return {
        amazonKeywords: [] as string[],
        keywordsWarning:
          "Keywords konnten nicht erzeugt werden. Klappentext ist da — bitte Keywords erneut erzeugen.",
      };
    },
  );

  let einzeiler = await generateEinzeiler(model, brief);
  const klappentext = await generateKlappentext(model, brief, einzeiler);

  if (einzeiler.length < 5) {
    einzeiler = synthesizeEinzeiler(klappentext);
  }

  const keywords = await keywordsTask;

  return {
    klappentext,
    einzeiler: einzeiler.slice(0, 120),
    amazonKeywords: keywords.amazonKeywords,
    keywordsWarning: keywords.keywordsWarning,
  };
}

export function marketingCopySourceFromRoman(roman: RomanKontext): {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  ideeKurz: string;
  alterLabel: string;
  charaktere: RomanCharakter[];
  manuskriptExcerpt: string;
  cleverUnterthemen: CleverUnterthemen | null;
  buchTyp: string;
} {
  const ed = roman.editorial;
  const alter =
    ed?.zielAlterMin != null || ed?.zielAlterMax != null
      ? ed.zielAlterMin != null && ed.zielAlterMax != null
        ? `${ed.zielAlterMin}–${ed.zielAlterMax} Jahre`
        : ed.zielAlterMin != null
          ? `ab ${ed.zielAlterMin}`
          : `bis ${ed.zielAlterMax}`
      : "";
  const prose = (ed?.manuskriptText ?? "").trim();
  const outline = (roman.manuskriptRaw ?? "").trim();
  return {
    title: roman.title,
    genre: roman.genre,
    praemisse: roman.praemisse,
    tonalitaet: roman.tonalitaet,
    ideeKurz: ed?.ideeKurz ?? "",
    alterLabel: alter,
    charaktere: roman.charaktere,
    manuskriptExcerpt: prose || outline,
    cleverUnterthemen: ed?.cleverUnterthemen ?? null,
    buchTyp: ed?.buchTyp ?? "unbekannt",
  };
}
