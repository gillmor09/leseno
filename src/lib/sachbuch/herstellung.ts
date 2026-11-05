/**
 * Phase 8 — Herstellung: Haiku layout *plan* + local apply.
 * Prose is never rewritten — only `<<<H>>>` / `<<<BOX>>>` markers are inserted
 * into the original paragraph list. Avoids token-truncation shortening.
 */

import {
  isRetryableAiNetworkError,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_HERSTELLUNG } from "@/lib/sachbuch/agent-defaults";
import {
  assertSachbuchGuideAllows,
  isSachbuchDerivedEdition,
  isSachbuchTeaser,
} from "@/lib/sachbuch/guide";
import { SACHBUCH_COMPACT_PRODUCT_RULES } from "@/lib/sachbuch/compact";
import { SACHBUCH_TEASER_PRODUCT_RULES } from "@/lib/sachbuch/teaser";
import {
  countSachbuchWords,
  emptySachbuchHerstellungBookReview,
  sachbuchKapitelBodyText,
  sachbuchKapitelHasHerstellung,
} from "@/lib/sachbuch/parse";
import {
  SACHBUCH_LAYOUT_BOX_KINDS,
  type SachbuchLayoutBoxKind,
  hasSachbuchLayoutMarkup,
  stripSachbuchLayoutMarkup,
  summarizeSachbuchLayoutMarkup,
} from "@/lib/sachbuch/herstellung-markup";
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "@/lib/sachbuch/repository";
import type { SachbuchKontext } from "@/lib/sachbuch/types";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

const HERSTELLUNG_PLAN_SYSTEM = `Du bist Herstellung / Buchsatz-Lektor für deutschsprachige Business-Sachbücher.
Du bekommst eine NUMMERIERTE Absatzliste eines bereits lektorierten Kapitels.
Du schreibst KEINEN Buchtext. Du lieferst nur einen Layout-Plan als JSON.

Aufgabe:
1) 2–6 Zwischenüberschriften an thematischen Brüchen (beforePara = Index, VOR dem Absatz).
2) Kästen nur wo der Text klar abgegrenzt ist:
   - merksatz: 2–3 pro Kapitel, nur wo ein kurzer Lehrsatz / Pull-Quote klar steht (Absätze mit „Merksatz:“ oder ein einzelner pointierter Satz). title IMMER leer — der Kasten zeigt nur den Satz, keine Kind-Überschrift und kein „Merksatz für die Praxis“.
   - infobox: kurze Definitionslisten / KPI-Blöcke / Säulen-Zusammenfassungen — title = Inhaltstitel (kein Kind-Label)
   - schaubild: „Architektur auf einen Blick“ / Schaubild-Absätze — title = Inhaltstitel
   - onepager: Management-Canvas / Sprint-Pläne / Chargeback / 6-Fragen-Kompass / 14-Tage- und 30-Tage-Bögen — KEINE „Montagmorgen“-/Download-Rhetorik; title = Inhaltstitel
3) Pflicht, sofern im Text vorhanden: die großen Werkzeugblöcke (Chargeback, 6-Fragen-Felder, Sprint-Tage/Wochen, 9-KPI-Säulen) als onepager oder infobox absetzen.
4) Keine überlappenden Boxes. fromPara/toPara inklusiv, 0-basiert.
5) Erfinde keine Kästen ohne Textbasis. Titel kurz, deutsch, ohne „Kapitel 3.1“. Nie Kind-Labels („Infobox“, „One-Pager“, „Merksatz“) als title setzen — die UI zeigt keine Kind-Überschrift.

Antwort NUR als JSON ohne Markdown-Fence:
{
  "headings": [{ "beforePara": 12, "title": "Kurzer Titel" }],
  "boxes": [{ "kind": "onepager"|"merksatz"|"infobox"|"schaubild", "title": "optional", "fromPara": 40, "toPara": 42 }]
}`;

const HERSTELLUNG_ATTEMPTS = 3;
const BOX_KIND_SET = new Set<string>(SACHBUCH_LAYOUT_BOX_KINDS);

type HeadingPlan = { beforePara: number; title: string };
type BoxPlan = {
  kind: SachbuchLayoutBoxKind;
  title: string;
  fromPara: number;
  toPara: number;
};
type HerstellungPlan = { headings: HeadingPlan[]; boxes: BoxPlan[] };

/** Split lektorierte Prosa into blank-line paragraphs (stable indices for the plan). */
export function splitSachbuchParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
}

function previewPara(text: string, max = 110): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function hintFlags(text: string): string {
  const flags: string[] = [];
  if (/^\s*Merksatz:/i.test(text)) flags.push("merksatz?");
  if (/Merksatz:/i.test(text) === false && /Säule \d/i.test(text)) {
    flags.push("kpi-block?");
  }
  if (/9-KPI|A3-Report|Chargeback|14-Tage-Sprint|30-Tage/i.test(text)) {
    flags.push("onepager?");
  }
  if (/Architektur auf einen Blick|Schaubild/i.test(text)) flags.push("schaubild?");
  return flags.length ? ` [${flags.join(",")}]` : "";
}

function buildParagraphOutline(paras: string[]): string {
  return paras
    .map((p, i) => {
      const w = countSachbuchWords(p);
      return `[${i}] (${w}w)${hintFlags(p)} ${previewPara(p)}`;
    })
    .join("\n");
}

/**
 * Deterministic seed boxes Haiku often misses — Merksatz pull-quotes.
 * (No Montagmorgen/worksheet onepagers: the book is not a download-ratgeber.)
 */
function heuristicBoxes(paras: string[]): BoxPlan[] {
  const boxes: BoxPlan[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]!;
    if (/^\s*Merksatz:/i.test(p)) {
      boxes.push({ kind: "merksatz", title: "", fromPara: i, toPara: i });
    }
  }
  return boxes;
}

function boxesOverlap(a: BoxPlan, b: BoxPlan): boolean {
  return !(a.toPara < b.fromPara || b.toPara < a.fromPara);
}

function normalizePlan(
  raw: HerstellungPlan,
  paraCount: number,
  seedBoxes: BoxPlan[],
): HerstellungPlan {
  const headings: HeadingPlan[] = [];
  for (const h of raw.headings ?? []) {
    const before = Math.round(Number(h.beforePara));
    const title = String(h.title ?? "")
      .replace(/^#+\s*/, "")
      .trim();
    if (!title || before < 0 || before > paraCount) continue;
    if (headings.some((x) => x.beforePara === before)) continue;
    headings.push({ beforePara: before, title: title.slice(0, 120) });
  }
  headings.sort((a, b) => a.beforePara - b.beforePara);

  const boxes: BoxPlan[] = [];
  const pushBox = (b: BoxPlan) => {
    let from = Math.round(Number(b.fromPara));
    let to = Math.round(Number(b.toPara));
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from > to) [from, to] = [to, from];
    if (from < 0 || to >= paraCount) return;
    if (!BOX_KIND_SET.has(b.kind)) return;
    // Merksatz = untitled pull-quote (no chrome kind/title).
    const rawTitle = String(b.title ?? "").trim().slice(0, 120);
    const title =
      b.kind === "merksatz" ||
      /^merksatz(\s+für\s+die\s+praxis)?$/i.test(rawTitle)
        ? ""
        : rawTitle;
    const next: BoxPlan = {
      kind: b.kind,
      title,
      fromPara: from,
      toPara: to,
    };
    if (boxes.some((x) => boxesOverlap(x, next))) return;
    boxes.push(next);
  };

  for (const b of raw.boxes ?? []) {
    const kind = String(b.kind ?? "").toLowerCase() as SachbuchLayoutBoxKind;
    pushBox({
      kind,
      title: String(b.title ?? ""),
      fromPara: Number(b.fromPara),
      toPara: Number(b.toPara),
    });
  }
  // Heuristics fill gaps (no overlap with Haiku boxes).
  for (const b of seedBoxes) pushBox(b);

  boxes.sort((a, b) => a.fromPara - b.fromPara || a.toPara - b.toPara);

  // Drop headings that fall inside a box (title belongs on the box).
  const cleanHeadings = headings.filter(
    (h) =>
      !boxes.some((b) => h.beforePara > b.fromPara && h.beforePara <= b.toPara),
  );

  return { headings: cleanHeadings, boxes };
}

function parsePlanJson(raw: string): HerstellungPlan {
  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const headingsRaw = Array.isArray(parsed.headings) ? parsed.headings : [];
  const boxesRaw = Array.isArray(parsed.boxes) ? parsed.boxes : [];
  return {
    headings: headingsRaw.map((h) => {
      const row = h as Record<string, unknown>;
      return {
        beforePara: Number(row.beforePara),
        title: String(row.title ?? ""),
      };
    }),
    boxes: boxesRaw.map((b) => {
      const row = b as Record<string, unknown>;
      return {
        kind: String(row.kind ?? "").toLowerCase() as SachbuchLayoutBoxKind,
        title: String(row.title ?? ""),
        fromPara: Number(row.fromPara),
        toPara: Number(row.toPara),
      };
    }),
  };
}

/** Apply plan onto original paragraphs — prose bytes unchanged. */
export function applyHerstellungPlan(
  paras: string[],
  plan: HerstellungPlan,
): string {
  const headingAt = new Map<number, string>();
  for (const h of plan.headings) headingAt.set(h.beforePara, h.title);

  const boxStart = new Map<number, BoxPlan>();
  const boxEnd = new Set<number>();
  for (const b of plan.boxes) {
    boxStart.set(b.fromPara, b);
    boxEnd.add(b.toPara);
  }

  const out: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const h = headingAt.get(i);
    if (h) out.push(`<<<H>>> ${h}`);

    const start = boxStart.get(i);
    if (start) {
      const title = start.title.trim();
      out.push(
        title
          ? `<<<BOX ${start.kind} ${title}>>>`
          : `<<<BOX ${start.kind}>>>`,
      );
    }

    out.push(paras[i]!);

    if (boxEnd.has(i)) out.push("<<<END BOX>>>");
  }

  // Heading after last para (rare) — allow beforePara === length
  const after = headingAt.get(paras.length);
  if (after) out.push(`<<<H>>> ${after}`);

  return out.join("\n\n").trim();
}

async function callHaikuPlan(input: {
  title: string;
  kapitelTitle: string;
  outline: string;
  paraCount: number;
  shortEdition?: "compact" | "teaser";
}): Promise<HerstellungPlan> {
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_HERSTELLUNG);
  const shortRules =
    input.shortEdition === "teaser"
      ? `ZUSATZ Teaser:
${SACHBUCH_TEASER_PRODUCT_RULES}
- Erlaubt: höchstens ein merksatz.
- Verboten: schaubild, onepager, infobox-Häufung.`
      : input.shortEdition === "compact"
        ? `ZUSATZ Kompakt-Ausgabe:
${SACHBUCH_COMPACT_PRODUCT_RULES}
- Erlaubt: merksatz + höchstens eine infobox.
- Verboten: schaubild, onepager (keine Canvas-/Sprint-Seiten als Kasten).
- Keine Kästen nur wegen Abbildungs- oder Tabellen-Captions.`
        : null;
  const system = shortRules
    ? `${HERSTELLUNG_PLAN_SYSTEM}

${shortRules}`
    : HERSTELLUNG_PLAN_SYSTEM;
  let lastError: unknown;
  for (let attempt = 1; attempt <= HERSTELLUNG_ATTEMPTS; attempt += 1) {
    try {
      const raw = await generateText({
        model,
        systemInstruction: system,
        userText: `Buch: ${input.title}
Kapitel: ${input.kapitelTitle}
Absätze: 0…${input.paraCount - 1} (insgesamt ${input.paraCount})

Absatz-Übersicht (Index, Wörter, Anfang):
${input.outline}

Liefere den Layout-Plan als JSON.`,
        preferJson: true,
        maxTokens: 4_000,
        timeoutMs: 180_000,
      });
      return parsePlanJson(raw);
    } catch (error) {
      lastError = error;
      if (!isRetryableAiNetworkError(error) || attempt >= HERSTELLUNG_ATTEMPTS) {
        throw error;
      }
      await sleepMs(2_000 * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Herstellung-Plan fehlgeschlagen.");
}

function sourceBodyForHerstellung(book: SachbuchKontext, kapitelId: string): {
  kapIndex: number;
  body: string;
} {
  const kapIndex = book.kapitel.findIndex((k) => k.id === kapitelId);
  if (kapIndex < 0) throw new Error("Kapitel nicht gefunden.");
  const kap = book.kapitel[kapIndex]!;
  const body =
    kap.manuscript.improvedText.trim() || sachbuchKapitelBodyText(kap);
  if (countSachbuchWords(body) < 400) {
    throw new Error(
      "Kapitel noch zu kurz für Herstellung — zuerst Manuskript lektorieren.",
    );
  }
  return { kapIndex, body };
}

/**
 * Run Haiku Herstellung for one chapter → manuscript.herstellungText.
 * Original prose is preserved; only layout markers are added.
 */
export async function herstellenSachbuchKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");

  const { kapIndex, body } = sourceBodyForHerstellung(book, input.kapitelId);
  const kap = book.kapitel[kapIndex]!;
  const paras = splitSachbuchParagraphs(body);
  if (paras.length < 3) {
    throw new Error("Kapitel hat zu wenige Absätze für Herstellung.");
  }

  const shortEdition = isSachbuchTeaser(book)
    ? ("teaser" as const)
    : isSachbuchDerivedEdition(book)
      ? ("compact" as const)
      : undefined;
  const sourceWords = countSachbuchWords(body);
  const outline = buildParagraphOutline(paras);
  const rawPlan = await callHaikuPlan({
    title: book.title,
    kapitelTitle: kap.title || `Kapitel ${kapIndex + 1}`,
    outline,
    paraCount: paras.length,
    shortEdition,
  });
  let plan = normalizePlan(rawPlan, paras.length, heuristicBoxes(paras));
  if (shortEdition === "teaser") {
    plan = {
      ...plan,
      boxes: plan.boxes.filter((b) => b.kind === "merksatz"),
    };
  } else if (shortEdition === "compact") {
    plan = {
      ...plan,
      boxes: plan.boxes.filter(
        (b) => b.kind === "merksatz" || b.kind === "infobox",
      ),
    };
  }

  if (plan.headings.length === 0 && plan.boxes.length === 0) {
    throw new Error(
      "Herstellung ohne Layout-Entscheidungen — bitte erneut versuchen.",
    );
  }

  const prepared = applyHerstellungPlan(paras, plan);
  const plainWords = countSachbuchWords(stripSachbuchLayoutMarkup(prepared));

  // Must be essentially the original (allow tiny whitespace drift from split/join).
  if (plainWords < Math.ceil(sourceWords * 0.98)) {
    throw new Error(
      `Herstellung hat Prosa verändert (${plainWords}/${sourceWords} Wörter) — Abbruch.`,
    );
  }
  if (!hasSachbuchLayoutMarkup(prepared)) {
    throw new Error("Herstellung ohne Layout-Marker — bitte erneut versuchen.");
  }

  const notes = summarizeSachbuchLayoutMarkup(prepared);
  const now = new Date().toISOString();
  return patchSachbuchKapitel(input.sachbuchId, input.kapitelId, {
    manuscript: {
      ...kap.manuscript,
      herstellungText: prepared,
      herstellungNotes: notes,
      hergestelltAt: now,
      modelSlug: SACHBUCH_MODEL_HERSTELLUNG,
    },
    updatedAt: now,
  });
}

/**
 * Refresh book-level Herstellung summary from chapter notes.
 */
export async function refreshSachbuchHerstellungBookReview(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  assertSachbuchGuideAllows(book, "herstellung");

  const decisions: string[] = [];
  let done = 0;
  for (let i = 0; i < book.kapitel.length; i++) {
    const k = book.kapitel[i]!;
    if (!sachbuchKapitelHasHerstellung(k)) continue;
    done += 1;
    const head = `Kap. ${i + 1} „${k.title || "ohne Titel"}“`;
    const notes = k.manuscript.herstellungNotes;
    decisions.push(
      notes[0] ? `${head}: ${notes[0]}` : `${head}: hergestellt`,
    );
  }

  const now = new Date().toISOString();
  const summary =
    done === 0
      ? "Noch keine Kapitel hergestellt."
      : done === book.kapitel.length
        ? `Alle ${done} Kapitel mit Unterkapiteln und Layout-Kästen für den Export vorbereitet.`
        : `${done} von ${book.kapitel.length} Kapiteln hergestellt.`;

  return patchSachbuchBook(sachbuchId, {
    idee: {
      ...book.idee,
      herstellungReview: {
        ...emptySachbuchHerstellungBookReview(),
        summary,
        decisions,
        preparedAt: done > 0 ? now : null,
        modelSlug: SACHBUCH_MODEL_HERSTELLUNG,
      },
    },
  });
}
