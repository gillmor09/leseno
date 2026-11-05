/**
 * Teaser edition: derived from a finished Kompakt book (~20–30 % of Kompakt).
 * Purpose: newsletter goodie, Werbebroschüre, website appetizer — marketing
 * overview, not a third manuscript. See `SACHBUCH_DERIVED_SKIPPED_STEPS`.
 */

import {
  isRetryableAiNetworkError,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_HERSTELLUNG } from "@/lib/sachbuch/agent-defaults";
import {
  clipOpinionForVorwort,
  compactSourceBookTitle,
  formatHauptbandKapitelRange,
  sachbuchKapitelCompactSourceText,
  sachbuchKapitelSourceIds,
} from "@/lib/sachbuch/compact";
import {
  assertSachbuchGuideAllows,
  isSachbuchCompact,
  isSachbuchTeaser,
} from "@/lib/sachbuch/guide";
import {
  countSachbuchWords,
  emptySachbuchEvidenz,
  emptySachbuchHerstellungBookReview,
  emptySachbuchKapitel,
  emptySachbuchKapitelManuscript,
  emptySachbuchManuscriptBookReview,
  sanitizeSachbuchBookProse,
} from "@/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
  upsertSachbuchExport,
  upsertSachbuchKontext,
} from "@/lib/sachbuch/repository";
import type { SachbuchKapitel, SachbuchKontext } from "@/lib/sachbuch/types";
import { emptyVorsatz } from "@/lib/roman/front-matter";
import { emptySachbuchHoerbuchState } from "@/lib/sachbuch/hoerbuch";
import {
  buildSachbuchImpressum,
  SACHBUCH_DEFAULT_AUTHOR,
  SACHBUCH_DEFAULT_IMPRINT,
} from "@/lib/sachbuch/impressum";
import { resolveRomanSchreibModel } from "@/lib/roman/model";

/** Kompakt chapters shorter than this are copied into the teaser, not AI-cut. */
export const SACHBUCH_TEASER_SOURCE_MIN_WORDS = 400;

export const SACHBUCH_TEASER_MAX_KAPITEL = 3;

const RATIO_MIN = 0.2;
const RATIO_AIM = 0.25;
const RATIO_MAX = 0.3;
const ACCEPT_MIN = 0.15;
const ACCEPT_MAX = 0.38;

/**
 * Product split vs. Kompakt / Hauptband.
 * Teaser = Appetit & Marketing; Kompakt = Briefing; Full = Werkstatt.
 */
export const SACHBUCH_TEASER_PRODUCT_RULES = `Teaser — Produktregeln:
- Eigenständiger Appetizer (Newsletter-Goodie, Werbebroschüre, Webseiten-Basis) — kein dritter Buchnachdruck.
- Gliederung: 2–3 kurze Marketing-Abschnitte (Hook → Kernidee → Einstieg/CTA), nicht 1:1 die Kompakt-Kapitel.
- Ton: neugierig, klar, verkaufsstark — Ideen greifbar machen, ohne Workshop-Didaktik und ohne Rechtsberatung.
- Keine Abbildungen, Tabellen-Grafiken, Infografiken oder Caption-Zeilen.
- Pro Abschnitt ein Verweis: „Vertiefung in der Kompaktausgabe ‚…‘“ und/oder „Ausführlich im Hauptband ‚…‘“.
- Keine Montagmorgen-Pläne, keine Sprint-Boards, keine Gesetzes-Artikelnummern 1:1.
- Kästen höchstens ein Merksatz; keine One-Pager-/Canvas-Seiten.`;

export function teaserSourceBookTitle(title: string): string {
  return (
    title
      .replace(/\s*[—–-]\s*Teaser\s*$/i, "")
      .replace(/\s*[—–-]\s*Kompakt\s*$/i, "")
      .trim() || title.trim()
  );
}

function teaserTitle(title: string): string {
  const base = teaserSourceBookTitle(title);
  return `${base} — Teaser`.slice(0, 300);
}

/**
 * Marketing / Titelei for a teaser: inherit thesis from Kompakt/Hauptband,
 * reframe as appetizer for newsletter, brochure, web.
 */
export function buildSachbuchTeaserEditionCopy(compact: SachbuchKontext): {
  subtitle: string;
  summary: string;
  keywords: string[];
  motto: string;
  vorwort: string;
} {
  const mainTitle =
    compactSourceBookTitle(
      compact.export.suggestedTitle.trim() || compact.title,
    ) || teaserSourceBookTitle(compact.title);
  const compactTitle =
    compact.export.suggestedTitle.trim() ||
    compact.title.trim() ||
    `${mainTitle} — Kompakt`;

  const subtitle =
    "Appetizer — Mindset und Praxis zum Kennenlernen";

  const summary = `„${mainTitle} — Teaser“ ist der Appetitanreger: ein grober Überblick über die wichtigsten Ideen — mit klarem Marketing-Ton für Newsletter, Werbebroschüre und Website.

Was Sie hier bekommen: den Hook, die Kernaussage und den Einstieg — kurz genug zum Weiterleiten, stark genug zum Neugierigmachen.

Was die Kompaktausgabe „${compactTitle}“ und der Hauptband liefern: Briefing-Tiefe bzw. volle Werkstatt mit Belegen, Figuren und Umsetzung.

${compact.export.summary.trim() ? `Kernversprechen (aus der Kompaktausgabe):\n${compact.export.summary.trim().slice(0, 1_200)}\n\n` : ""}Dieser Teaser ersetzt weder Kompakt noch Hauptband — und keine Rechtsberatung.`.slice(
    0,
    8_000,
  );

  const opinion = clipOpinionForVorwort(compact.idee.unpopularOpinion);
  const vorwort = `Dies ist kein Buch in Miniatur.

„${mainTitle} — Teaser“ ist ein Appetizer: für Newsletter, Handouts und die Website. Er skizziert die wichtigsten Ideen und macht Lust auf mehr — mit bewusst verkaufsstarkem Ton.

${opinion ? `Der Kern in einem Satz: ${opinion}\n\n` : ""}Wer orientieren und umsetzen will, greift zur Kompaktausgabe „${compactTitle}“ oder zum Hauptband „${mainTitle}“. Wer neugierig machen will, startet hier.

Kurz und ehrlich: Der Privacy-Value-Ansatz macht Datenschutz von Anfang an werthaltiger — ersetzt aber keine Rechtsberatung, keine schwierigen Juristenfragen und keine gesetzlichen Dokumentationspflichten. Gut aufgesetzte Prozesse machen diese Arbeit leichter und nachvollziehbarer.

Keine Rechtsberatung — und kein Ersatz für Kompakt oder Hauptband.`.slice(
    0,
    12_000,
  );

  return {
    subtitle: subtitle.slice(0, 300),
    summary,
    keywords: [...(compact.export.keywords ?? [])].slice(0, 6),
    motto: compact.export.vorsatz.motto.trim(),
    vorwort,
  };
}

const TEASER_SYSTEM = `Du schreibst den Teaser eines deutschsprachigen Business-Sachbuchs.
Du verdichtest EINEN Marketing-Abschnitt auf etwa ein Viertel der Kompakt-Vorlage.

${SACHBUCH_TEASER_PRODUCT_RULES}

Pflicht:
- Sprache: Deutsch, klar, einladend — Appetit und Orientierung, nicht Lektoratsprosa.
- Dieselbe These und dieselben Fachbegriffe wie in der Vorlage; weniger Beispiele, mehr Punch.
- Behalte: die eine Kernbotschaft, einen greifbaren Anker (Fall/Zahl/Bild in Worten), den CTA-Gedanken.
- Streiche: Wiederholung, Didaktik, Checklisten, Captions, Meta-Kommentare.
- Höchstens ein Merksatz, als eigene Zeile, die mit „Merksatz:“ beginnt.
- Am Ende genau ein Verweisabsatz: „Vertiefung in der Kompaktausgabe ‚[Titel]‘.“ (optional plus Hauptband).
- FORMAT: nur Absätze, getrennt durch Leerzeilen. Kein Markdown, keine Aufzählungszeichen, kein JSON, kein Vorspann.
- Länge einhalten: mindestens die genannte Untergrenze, höchstens die Obergrenze.`;

function wordBand(sourceWords: number): { min: number; aim: number; max: number } {
  const min = Math.max(80, Math.round(sourceWords * RATIO_MIN));
  const max = Math.max(min + 30, Math.round(sourceWords * RATIO_MAX));
  const aim = Math.min(max, Math.max(min, Math.round(sourceWords * RATIO_AIM)));
  return { min, aim, max };
}

function inNearBand(words: number, sourceWords: number): boolean {
  return (
    words >= Math.round(sourceWords * ACCEPT_MIN) &&
    words <= Math.round(sourceWords * ACCEPT_MAX)
  );
}

export type SachbuchTeaserBundlePlan = {
  title: string;
  goals: string;
  sourceKapitelIds: string[];
  sourceNumbers: number[];
};

const TEASER_ARC_2 = ["Der Hook", "Der Einstieg"] as const;
const TEASER_ARC_3 = ["Der Hook", "Die Kernidee", "Der Einstieg"] as const;

function splitIntoBundles<T>(items: T[], bundleCount: number): T[][] {
  const n = items.length;
  const k = Math.max(1, Math.min(bundleCount, n));
  const out: T[][] = [];
  let start = 0;
  for (let i = 0; i < k; i++) {
    const remaining = n - start;
    const slots = k - i;
    const size = Math.ceil(remaining / slots);
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out.filter((b) => b.length > 0);
}

export function targetSachbuchTeaserKapitelCount(compactCount: number): number {
  if (compactCount <= 0) return 0;
  if (compactCount === 1) return 1;
  if (compactCount === 2) return 2;
  return SACHBUCH_TEASER_MAX_KAPITEL;
}

/** Contiguous Kompakt chapters → 2–3 marketing teaser sections. */
export function planSachbuchTeaserBundles(
  compact: SachbuchKontext,
): SachbuchTeaserBundlePlan[] {
  const indexed = compact.kapitel.map((k, i) => ({
    id: k.id,
    title: k.title.trim() || `Kapitel ${i + 1}`,
    number: i + 1,
  }));
  const target = targetSachbuchTeaserKapitelCount(indexed.length);
  if (target === 0) return [];

  const groups = splitIntoBundles(indexed, target);
  const arcs =
    groups.length <= 2
      ? TEASER_ARC_2.slice(0, groups.length)
      : TEASER_ARC_3.slice(0, groups.length);

  return groups.map((group, i) => {
    const sourceNumbers = group.map((g) => g.number);
    const range = formatHauptbandKapitelRange(sourceNumbers);
    const sourceList = group.map((g) => `${g.number}. ${g.title}`).join("\n");
    const arc = arcs[i] ?? `Teil ${i + 1}`;
    return {
      title: arc.slice(0, 500),
      goals: `Teaser-Abschnitt ${i + 1}/${groups.length}: „${arc}“.
Bündelt Kompakt-Kapitel ${range}:
${sourceList}
Schreibe Appetit & Orientierung — kein verkürztes Briefing-Kapitel.`.slice(
        0,
        20_000,
      ),
      sourceKapitelIds: group.map((g) => g.id),
      sourceNumbers,
    };
  });
}

function buildTeaserKapitelFromBundles(
  bundles: SachbuchTeaserBundlePlan[],
  now: string,
): SachbuchKapitel[] {
  return bundles.map((b) =>
    emptySachbuchKapitel({
      title: b.title,
      goals: b.goals,
      sourceKapitelId: b.sourceKapitelIds[0] ?? null,
      sourceKapitelIds: b.sourceKapitelIds,
      status: "draft",
      updatedAt: now,
    }),
  );
}

/** True when the Kompakt source is ready to spawn a teaser. */
export function sachbuchTeaserSourceReady(book: SachbuchKontext): {
  ok: boolean;
  reason?: string;
} {
  if (!isSachbuchCompact(book)) {
    return {
      ok: false,
      reason: "Teaser entstehen nur aus einer Kompakt-Ausgabe.",
    };
  }
  if (isSachbuchTeaser(book)) {
    return { ok: false, reason: "Das ist bereits ein Teaser." };
  }
  if (book.kapitel.length === 0) {
    return { ok: false, reason: "Kompakt hat noch keine Kapitel." };
  }
  const pending = book.kapitel.filter((k) => k.status !== "ready");
  if (pending.length > 0) {
    return {
      ok: false,
      reason: `Zuerst Kompakt fertig kürzen (${pending.length} Kapitel offen).`,
    };
  }
  const usable = book.kapitel.some(
    (k) =>
      countSachbuchWords(sachbuchKapitelCompactSourceText(k)) >=
      SACHBUCH_TEASER_SOURCE_MIN_WORDS,
  );
  if (!usable) {
    return {
      ok: false,
      reason: "Kompakt hat zu wenig Text für einen Teaser.",
    };
  }
  return { ok: true };
}

/**
 * Create an empty teaser book from Kompakt: 2–3 marketing sections,
 * cursor on Manuskript. Prose filled later per hop.
 */
export async function createSachbuchTeaserEdition(
  compactId: string,
): Promise<SachbuchKontext> {
  const compact = await getSachbuchKontext(compactId);
  if (!compact) throw new Error("Kompakt-Ausgabe nicht gefunden.");
  const ready = sachbuchTeaserSourceReady(compact);
  if (!ready.ok) throw new Error(ready.reason ?? "Teaser nicht möglich.");

  const now = new Date().toISOString();
  const title = teaserTitle(
    compactSourceBookTitle(compact.title) || compact.title,
  );
  const bundles = planSachbuchTeaserBundles(compact);
  if (bundles.length === 0) {
    throw new Error("Keine Abschnitte für den Teaser.");
  }
  const kapitel = buildTeaserKapitelFromBundles(bundles, now);

  const created = await upsertSachbuchKontext({
    id: null,
    title,
    stilbibel: compact.stilbibel,
    zielgruppe: compact.zielgruppe,
    agents: compact.agents,
    evidenz: emptySachbuchEvidenz(),
    makro: {
      ...compact.makro,
      status: compact.makro.bookTypeId.trim() ? "ready" : compact.makro.status,
      kapitelGenerated: kapitel.length > 0,
    },
    idee: {
      ...compact.idee,
      interviewMessages: [],
      status: "ready",
      refineStatus: "idle",
      refineLog: [],
      refinedBriefing: "",
      refinedOpinion: "",
      refinedCaseStudies: [],
      manuscriptReview: emptySachbuchManuscriptBookReview(),
      herstellungReview: emptySachbuchHerstellungBookReview(),
      edition: "teaser",
      sourceBookId: compact.id,
      sourceBookTitle: compact.title.slice(0, 300),
      hoerbuch: emptySachbuchHoerbuchState(),
      guide: {
        currentStep: "manuscript",
        ideaApprovedAt: now,
        writeApprovedAt: now,
      },
    },
    kapitel,
  });

  const copy = buildSachbuchTeaserEditionCopy(compact);
  const autor = SACHBUCH_DEFAULT_AUTHOR;
  const year =
    compact.export.vorsatz.impressum.jahr.trim() ||
    String(new Date().getFullYear());
  return upsertSachbuchExport({
    id: created.id,
    suggestedTitle: title,
    subtitle: copy.subtitle,
    summary: copy.summary,
    keywords: copy.keywords,
    autorName: autor,
    coverImageDataUrl: "",
    coverPrompt: "",
    vorsatz: {
      ...emptyVorsatz(),
      titelseite: {
        titel: title,
        untertitel: copy.subtitle,
        autor,
        imprint: SACHBUCH_DEFAULT_IMPRINT,
      },
      impressum: buildSachbuchImpressum({
        jahr: year,
        autorPseudonym: autor,
      }),
      widmung: "",
      motto: copy.motto,
      vorwort: copy.vorwort,
    },
  });
}

function mergeTeaserSourceTexts(
  compact: SachbuchKontext,
  sourceIds: string[],
): { text: string; numbers: number[]; words: number } {
  const parts: string[] = [];
  const numbers: number[] = [];
  for (const id of sourceIds) {
    const idx = compact.kapitel.findIndex((k) => k.id === id);
    if (idx < 0) continue;
    const kap = compact.kapitel[idx]!;
    const body = sachbuchKapitelCompactSourceText(kap);
    if (!body.trim()) continue;
    const n = idx + 1;
    numbers.push(n);
    parts.push(
      `<<<KOMPAKT KAPITEL ${n}: ${kap.title || "ohne Titel"}>>>\n\n${body}`,
    );
  }
  const text = parts.join("\n\n");
  return { text, numbers, words: countSachbuchWords(text) };
}

async function writeTeaserProse(input: {
  bookTitle: string;
  compactTitle: string;
  hauptbandTitle: string;
  sectionNumber: number;
  sectionCount: number;
  sectionTitle: string;
  compactRange: string;
  opinion: string;
  outline: string;
  source: string;
  sourceWords: number;
  instruction: string;
}): Promise<string> {
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_HERSTELLUNG);
  const { min, aim, max } = wordBand(input.sourceWords);
  const raw = await generateText({
    model,
    systemInstruction: TEASER_SYSTEM,
    userText: `Teaser-Buch: ${input.bookTitle}
Kompaktausgabe (Vertiefung): „${input.compactTitle}“
Hauptband: „${input.hauptbandTitle}“
Teaser-Abschnitt ${input.sectionNumber} von ${input.sectionCount}: ${input.sectionTitle}
Bündelt Kompakt-Kapitel: ${input.compactRange}
These: ${input.opinion || "—"}

Teaser-Gliederung:
${input.outline}

Vorlage: ${input.sourceWords} Wörter.
Ziel: ${aim} Wörter. Erlaubt: ${min}–${max} Wörter.
Pflicht-Verweis am Ende: Vertiefung in der Kompaktausgabe „${input.compactTitle}“.

${input.instruction}

Vorlage:
${input.source}`,
    maxTokens: 8_192,
    timeoutMs: 240_000,
  });
  return sanitizeSachbuchBookProse(
    raw.replace(/^```(?:markdown|md|text)?\s*|\s*```$/g, "").trim(),
  );
}

/** Drop Abbildung/Tabelle caption lines from teaser prose. */
export function stripTeaserFigureCaptions(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (/^(?:Abbildung|Tabelle)\s*[\d.]+\s*[:：]/i.test(p)) return false;
      return true;
    })
    .join("\n\n");
}

/**
 * Condense one teaser marketing section from bundled Kompakt chapters.
 */
export async function condenseSachbuchTeaserKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchTeaser(book)) {
    throw new Error("Nur Teaser werden so verdichtet.");
  }
  assertSachbuchGuideAllows(book, "manuscript");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Abschnitt nicht gefunden.");
  const compactId = book.idee.sourceBookId?.trim();
  const sourceIds = sachbuchKapitelSourceIds(kapitel);
  if (!compactId || sourceIds.length === 0) {
    throw new Error("Kompakt-Quellen für diesen Teaser-Abschnitt fehlen.");
  }

  const compact = await getSachbuchKontext(compactId);
  if (!compact) throw new Error("Kompakt-Ausgabe nicht gefunden.");
  if (!isSachbuchCompact(compact)) {
    throw new Error("Teaser-Quelle muss eine Kompakt-Ausgabe sein.");
  }

  const merged = mergeTeaserSourceTexts(compact, sourceIds);
  if (merged.numbers.length === 0 || merged.words < 60) {
    throw new Error(
      `Abschnitt „${kapitel.title || "ohne Titel"}“ hat in der Kompakt-Quelle zu wenig Text.`,
    );
  }

  const sourceText = merged.text;
  const sourceWords = merged.words;
  const compactRange = formatHauptbandKapitelRange(merged.numbers);
  const existing = countSachbuchWords(kapitel.manuscript.draftText);
  if (
    kapitel.status === "ready" &&
    existing >= 80 &&
    (sourceWords < SACHBUCH_TEASER_SOURCE_MIN_WORDS ||
      inNearBand(existing, sourceWords))
  ) {
    return book;
  }

  const sectionNumber = book.kapitel.findIndex((k) => k.id === kapitel.id) + 1;
  const compactTitle =
    compact.export.suggestedTitle.trim() || compact.title.trim();
  const hauptbandTitle =
    compact.idee.sourceBookTitle?.trim() ||
    compactSourceBookTitle(compactTitle) ||
    teaserSourceBookTitle(book.title);

  let text = sourceText;
  let modelSlug = "";
  if (sourceWords >= SACHBUCH_TEASER_SOURCE_MIN_WORDS) {
    const outline = book.kapitel
      .map((k, i) => `${i + 1}. ${k.title || "ohne Titel"}`)
      .join("\n");
    const opinion = (
      book.idee.unpopularOpinion || compact.idee.unpopularOpinion
    ).slice(0, 1_500);
    const { min, aim, max } = wordBand(sourceWords);

    text = "";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const wordsNow = countSachbuchWords(text);
        let lengthNote: string;
        if (attempt === 1) {
          lengthNote =
            "Schreibe diesen Teaser-Abschnitt als Appetit-Stück. Marketing-Ton erlaubt, aber keine leeren Superlative. Keine Captions.";
        } else if (wordsNow > max) {
          lengthNote = `Die vorige Fassung ist zu lang (${wordsNow} Wörter). Kürze auf ${min}–${max}. Verweis auf die Kompaktausgabe behalten.\n\nVorige Fassung:\n${text}`;
        } else if (attempt === 4) {
          lengthNote = `PFLICHT-AUFFÜLLUNG: nur ${wordsNow} Wörter — zu kurz. Mindestens ${min} (besser ~${aim}), höchstens ${max}. Hole eine greifbare Idee und den CTA-Gedanken aus der Vorlage. Nichts erfinden.\n\nVorige Fassung:\n${text}`;
        } else {
          lengthNote = `Zu kurz (${wordsNow} Wörter). Mindestens ${min}, Ziel ~${aim}, höchstens ${max}. Nichts erfinden.\n\nVorige Fassung:\n${text}`;
        }
        const draft = await writeTeaserProse({
          bookTitle: book.title,
          compactTitle,
          hauptbandTitle,
          sectionNumber: Math.max(1, sectionNumber),
          sectionCount: book.kapitel.length,
          sectionTitle: kapitel.title,
          compactRange,
          opinion,
          outline,
          source: sourceText,
          sourceWords,
          instruction: lengthNote,
        });
        const words = countSachbuchWords(draft);
        text = draft;
        if (words >= min && words <= max) break;
        if (attempt >= 3 && inNearBand(words, sourceWords)) break;
        if (attempt === 4) {
          throw new Error(
            `Teaser außerhalb der Länge (${words} Wörter, Ziel ${min}–${max}).`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const lengthMiss = message.includes("außerhalb der Länge");
        if (
          lengthMiss ||
          !isRetryableAiNetworkError(error) ||
          attempt >= 4
        ) {
          if (text && inNearBand(countSachbuchWords(text), sourceWords)) break;
          throw error;
        }
        await sleepMs(2_000 * attempt);
      }
    }
    if (!text.trim()) throw new Error("Teaser-Abschnitt leer.");
    modelSlug = SACHBUCH_MODEL_HERSTELLUNG;
  } else {
    const pointer = `Vertiefung in der Kompaktausgabe „${compactTitle}“.`;
    text = sourceText
      .replace(/^<<<KOMPAKT KAPITEL \d+:[^\n]*>>>\s*/gm, "")
      .trim();
    if (!/Vertiefung in der Kompaktausgabe/i.test(text)) {
      text = `${text}\n\n${pointer}`;
    }
  }

  text = stripTeaserFigureCaptions(text);
  const words = countSachbuchWords(text);
  if (words < 50) {
    throw new Error("Teaser-Abschnitt zu kurz — bitte erneut versuchen.");
  }

  return patchSachbuchKapitel(book.id, kapitel.id, {
    status: "ready",
    finalText: text,
    generationError: null,
    generationProgress: null,
    infografiken: [],
    infografikDataUrl: null,
    infografikTitle: "",
    infografikPrompt: "",
    manuscript: {
      ...emptySachbuchKapitelManuscript(),
      draftText: text,
      modelSlug,
    },
  });
}
