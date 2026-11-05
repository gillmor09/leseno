/**
 * Compact edition: a second Sachbuch derived from a finished manuscript.
 * Skips Rohkonzept … Schreiben. Spine is 3–4 Briefing-Kapitel that bundle
 * Hauptband chapters; each is condensed to ~25 % of its source bundle.
 * See `SACHBUCH_COMPACT_SKIPPED_STEPS`.
 */

import {
  isRetryableAiNetworkError,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import {
  SACHBUCH_MODEL_HERSTELLUNG,
  SACHBUCH_MODEL_MANUSCRIPT,
} from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows, isSachbuchCompact } from "@/lib/sachbuch/guide";
import { stripSachbuchLayoutMarkup } from "@/lib/sachbuch/herstellung-markup";
import {
  concatAbschnitteText,
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

/** Chapters shorter than this are copied, not condensed. */
export const SACHBUCH_COMPACT_SOURCE_MIN_WORDS = 800;

/** Compact spine: never more than four Briefing chapters. */
export const SACHBUCH_COMPACT_MAX_KAPITEL = 4;

/** Strip trailing „— Kompakt“ from a working title. */
export function compactSourceBookTitle(title: string): string {
  return title.replace(/\s*[—–-]\s*Kompakt\s*$/i, "").trim() || title.trim();
}

/** Source ids for a compact chapter (bundle or legacy single). */
export function sachbuchKapitelSourceIds(kapitel: SachbuchKapitel): string[] {
  if (kapitel.sourceKapitelIds?.length) {
    return [...kapitel.sourceKapitelIds];
  }
  const one = kapitel.sourceKapitelId?.trim();
  return one ? [one] : [];
}

/**
 * Target briefing-chapter count: 3 for mid-size Hauptbände, 4 for longer ones.
 * Tiny books keep their chapter count (≤3).
 */
export function targetSachbuchCompactKapitelCount(sourceCount: number): number {
  if (sourceCount <= 0) return 0;
  if (sourceCount <= 3) return sourceCount;
  if (sourceCount <= 6) return 3;
  return SACHBUCH_COMPACT_MAX_KAPITEL;
}

export type SachbuchCompactBundlePlan = {
  title: string;
  goals: string;
  sourceKapitelIds: string[];
  /** 1-based Hauptband chapter numbers in this bundle. */
  sourceNumbers: number[];
};

const ARC_TITLES_3 = [
  "These und Landkarte",
  "Beweis und Hebel",
  "Umsetzung und Steuerung",
] as const;

const ARC_TITLES_4 = [
  "These und Landkarte",
  "Fall und Beweis",
  "Hebel und Werkzeuge",
  "Umsetzung und Steuerung",
] as const;

/** German chapter-number list: „2“, „2 und 3“, „2–4“, „1, 3 und 5“. */
export function formatHauptbandKapitelRange(numbers: number[]): string {
  const nums = [...new Set(numbers.filter((n) => n >= 1))].sort((a, b) => a - b);
  if (nums.length === 0) return "?";
  if (nums.length === 1) return String(nums[0]);
  const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1);
  if (contiguous && nums.length >= 3) {
    return `${nums[0]}–${nums[nums.length - 1]}`;
  }
  if (nums.length === 2) return `${nums[0]} und ${nums[1]}`;
  return `${nums.slice(0, -1).join(", ")} und ${nums[nums.length - 1]}`;
}

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

/**
 * Contiguous Hauptband chapters → 3–4 Briefing bundles with arc titles.
 */
export function planSachbuchCompactBundles(
  source: SachbuchKontext,
): SachbuchCompactBundlePlan[] {
  const indexed = source.kapitel.map((k, i) => ({
    id: k.id,
    title: k.title.trim() || `Kapitel ${i + 1}`,
    number: i + 1,
  }));
  const target = targetSachbuchCompactKapitelCount(indexed.length);
  if (target === 0) return [];

  const groups = splitIntoBundles(indexed, target);
  const arcs =
    groups.length <= 3
      ? ARC_TITLES_3.slice(0, groups.length)
      : ARC_TITLES_4.slice(0, groups.length);

  return groups.map((group, i) => {
    const sourceNumbers = group.map((g) => g.number);
    const range = formatHauptbandKapitelRange(sourceNumbers);
    const sourceList = group
      .map((g) => `${g.number}. ${g.title}`)
      .join("\n");
    const arc = arcs[i] ?? `Teil ${i + 1}`;
    return {
      title: `${arc}`.slice(0, 500),
      goals: `Briefing-Kapitel ${i + 1}/${groups.length}: „${arc}“.
Bündelt Hauptband-Kapitel ${range}:
${sourceList}
Schreibe ein eigenständiges Briefing — nicht Kapitel für Kapitel hintereinander.`.slice(
        0,
        20_000,
      ),
      sourceKapitelIds: group.map((g) => g.id),
      sourceNumbers,
    };
  });
}

function buildCompactKapitelFromBundles(
  bundles: SachbuchCompactBundlePlan[],
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

/** True when compact still mirrors the Hauptband 1:1 or exceeds 4 chapters. */
export function sachbuchCompactNeedsSpineRebuild(
  book: SachbuchKontext,
  source: SachbuchKontext,
): boolean {
  if (!isSachbuchCompact(book)) return false;
  const planned = planSachbuchCompactBundles(source);
  if (planned.length === 0) return false;
  if (book.kapitel.length !== planned.length) return true;
  if (book.kapitel.length > SACHBUCH_COMPACT_MAX_KAPITEL) return true;
  // Old 1:1 spine: every chapter maps to exactly one source and counts match.
  if (
    book.kapitel.length === source.kapitel.length &&
    source.kapitel.length > SACHBUCH_COMPACT_MAX_KAPITEL
  ) {
    return true;
  }
  const allSingle = book.kapitel.every(
    (k) => sachbuchKapitelSourceIds(k).length <= 1,
  );
  if (allSingle && source.kapitel.length > planned.length) return true;
  return false;
}

/**
 * Product split vs. Hauptband (export / prompts / Titelei).
 * Compact = Landkarte & Briefing; full = Werkstatt mit Grafiken & Falltiefe.
 */
export const SACHBUCH_COMPACT_PRODUCT_RULES = `Kompaktausgabe — Produktregeln:
- Eigenständiges Schnellformat, kein „dünner Nachdruck“ des Hauptbands.
- Gliederung: nur 3 oder 4 Briefing-Kapitel (Hauptband-Kapitel werden gebündelt).
- Keine Abbildungen, Tabellen-Grafiken, Infografiken oder Schaubild-Platzhalter im Text.
- Keine Caption-Zeilen „Abbildung …“ / „Tabelle …“ — statt dessen Verweis auf den Hauptband.
- Pro Kapitel mindestens ein klarer Verweis: „Ausführlich im Hauptband ‚…‘, Kapitel N–M.“ (alle gebündelten Nummern).
- Ton: Briefing / Executive Overview — These, ein Fallanker, ein Hebel; keine Sprint-Didaktik in voller Breite.
- Kästen sparsam (höchstens Merksatz + eine Infobox); keine One-Pager-/Canvas-Seiten als Grafikersatz.`;

/** Clip unpopularOpinion for Vorwort without cutting mid-word / mid-sentence. */
export function clipOpinionForVorwort(raw: string, max = 420): string {
  const text = raw.trim();
  if (!text || text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentence = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (sentence >= Math.floor(max * 0.45)) {
    return slice.slice(0, sentence + 1).trim();
  }
  const space = slice.lastIndexOf(" ");
  return (space > 40 ? slice.slice(0, space) : slice).trim();
}

/**
 * Marketing / Titelei for a compact edition: inherit from the Hauptband,
 * only reframe as the quick overview for Eilige.
 */
export function buildSachbuchCompactEditionCopy(source: SachbuchKontext): {
  subtitle: string;
  summary: string;
  keywords: string[];
  motto: string;
  vorwort: string;
} {
  const mainTitle =
    source.export.suggestedTitle.trim() ||
    compactSourceBookTitle(source.title);
  const subtitle =
    "Executive Briefing — Mindset und Praxis in kompakter Form";

  const summary = `„${mainTitle} — Kompakt“ ist das Schnellformat für Eilige: dieselbe These und dieselbe Landkarte, aber in drei bis vier Briefing-Kapiteln statt als Werkstattbuch.

Was Sie hier bekommen: die Kernargumente, ein Fallanker und die entscheidenden Hebel — ohne Abbildungen, ohne Tabellen-Grafiken und ohne die volle Fall- und Sprint-Tiefe.

Was nur der Hauptband „${mainTitle}“ liefert: die volle Kapitelstruktur, ausführliche KlarNetz-Szenen, Belege, Canvas/Ampel/Kompass als gesetzte Figuren, Umsetzungsschritte und die operative Dichte für die Praxis.

${source.export.summary.trim() ? `Vom Hauptband übernommen (Kernversprechen):\n${source.export.summary.trim()}\n\n` : ""}Diese Kompaktausgabe ersetzt weder den Hauptband noch eine Rechtsberatung.`.slice(
    0,
    8_000,
  );

  const opinion = clipOpinionForVorwort(source.idee.unpopularOpinion);
  const vorwort = `Dies ist nicht dasselbe Buch in dünnerer Bindung.

„${mainTitle} — Kompakt“ ist ein Executive Briefing in drei bis vier Kapiteln: für alle, die in kurzer Zeit Orientierung und die richtige Landkarte brauchen. Dieselbe These, dieselben Werkzeugnamen — aber neu gebündelt, ohne Grafiken und ohne die volle Fall- und Umsetzungstiefe.

${opinion ? `Der Kern in einem Satz: ${opinion}\n\n` : ""}Im Text verweisen wir bewusst auf den Hauptband „${mainTitle}“ (mit Kapitelnummern), wenn Vertiefung, Abbildung oder Sprint-Detail gebraucht wird. Wer umsetzen, argumentieren und steuern will, braucht das Hauptwerk. Wer zuerst den Überblick will, startet hier.

Ehrliche Einschränkung: Privacy Value Thinking und Value Driven Privacy sind aus unserer Sicht der beste Weg, Datenschutz von Anfang an gewinnbringend zu denken — aber kein Ersatz für Rechtsberatung. Schwierige Fälle brauchen weiterhin Juristinnen und Juristen. Dokumentationspflichten und Fleißarbeiten (Informationspflichten, TOMs, Abwägungen, Verträge) bleiben; mit gut aufgesetzten Prozessen werden sie leichter, nachvollziehbarer und der Schrecken vor dem Gesetz sinkt — zugunsten werthaltigerer Prozesse und Produkte.

Keine Rechtsberatung — und kein Ersatz für den Hauptband.`.slice(0, 12_000);

  return {
    subtitle: subtitle.slice(0, 300),
    summary,
    keywords: [...(source.export.keywords ?? [])].slice(0, 6),
    motto: source.export.vorsatz.motto.trim(),
    vorwort,
  };
}

const RATIO_MIN = 0.2;
const RATIO_AIM = 0.25;
const RATIO_MAX = 0.3;
/**
 * Near-miss band after retries. Long, dense source chapters (e.g. Kap. 2/4)
 * often over-compress on the first passes — accept slightly below 20 %.
 */
const ACCEPT_MIN = 0.15;
const ACCEPT_MAX = 0.38;
/**
 * Absolute caps for Executive-Briefing chapters. Three huge Hauptband chapters
 * would otherwise force 5–8k words — Haiku then undershoots forever.
 * Successful 2-chapter bundles land ~3.3–3.8k; keep Kap.1 in that family.
 */
const BAND_MIN_CAP = 2_800;
const BAND_AIM_CAP = 3_800;
const BAND_MAX_CAP = 4_500;
/** Switch to Argon when the merged Vorlage exceeds this. */
const LARGE_BUNDLE_WORDS = 12_000;
/** Cap Vorlage tokens sent to the model (heads of each source block kept). */
const MODEL_SOURCE_WORD_CAP = 14_000;

const COMPACT_SYSTEM = `Du schreibst die Kompakt-Ausgabe eines deutschsprachigen Business-Sachbuchs.
Du kürzt EIN Kapitel auf etwa ein Viertel der Vorlage.

${SACHBUCH_COMPACT_PRODUCT_RULES}

Pflicht:
- Sprache: Deutsch, klar, argumentativ — Briefing-Ton, nicht Workshop-Handbuch.
- Dieselbe These und dieselben Fachbegriffe wie in der Vorlage; weniger Beispiele, weniger Wiederholung.
- Behalte: die Kapitelthese, einen Fallanker, den entscheidenden Faktencheck, das eine zentrale Werkzeug (nur in Worten).
- Streiche: zweite Beispiele, wiederholte Studien, Gerüstsätze, Kapitel-Schlussappelle, Montagmorgen-/Wochenpläne, ausführliche Sprint-Boards.
- Höchstens ein Merksatz, als eigene Zeile, die mit „Merksatz:“ beginnt.
- Am Kapitelende (oder nach dem zentralen Hebel) genau ein Verweisabsatz der Form: „Ausführlich im Hauptband ‚[Titel ohne — Kompakt]‘, Kapitel N–M.“ (alle gebündelten Hauptband-Nummern aus der Anweisung).
- Keine Zeilen „Abbildung …:“ / „Tabelle …:“ / Infografik-Platzhalter.
- Nichts erfinden. Zahlen und Studien nur behalten, wenn sie in der Vorlage stehen.
- Keine Gesetzes-Artikelnummern 1:1 (nicht „Art. 5 DSGVO“). Prinzipien in Alltagssprache.
- FORMAT: nur Absätze, getrennt durch Leerzeilen. Kein Markdown, keine Aufzählungszeichen, kein JSON, kein Vorspann.
- Länge einhalten: mindestens die genannte Untergrenze, höchstens die Obergrenze.`;

function compactTitle(title: string): string {
  const base = title.replace(/\s*[—–-]\s*Kompakt\s*$/i, "").trim() || title.trim();
  return `${base} — Kompakt`.slice(0, 300);
}

/**
 * Reader-facing source for condensation: Herstellung, else Lektorat, else draft.
 * Layout markers are stripped so the model condenses prose, not markup.
 */
export function sachbuchKapitelCompactSourceText(kapitel: SachbuchKapitel): string {
  const raw =
    kapitel.manuscript.herstellungText.trim() ||
    kapitel.manuscript.improvedText.trim() ||
    kapitel.manuscript.draftText.trim() ||
    concatAbschnitteText(kapitel.abschnitte).trim() ||
    kapitel.finalText.trim();
  return sanitizeSachbuchBookProse(stripSachbuchLayoutMarkup(raw));
}

/** True when the source book has at least one chapter worth condensing. */
export function sachbuchCompactSourceReady(book: SachbuchKontext): {
  ok: boolean;
  reason?: string;
} {
  if (isSachbuchCompact(book)) {
    return { ok: false, reason: "Das ist bereits eine Kompakt-Ausgabe." };
  }
  if (book.idee.edition === "teaser") {
    return { ok: false, reason: "Aus einem Teaser entsteht keine Kompakt-Ausgabe." };
  }
  if (book.kapitel.length === 0) {
    return { ok: false, reason: "Noch keine Kapitel." };
  }
  const usable = book.kapitel.some(
    (k) =>
      countSachbuchWords(sachbuchKapitelCompactSourceText(k)) >=
      SACHBUCH_COMPACT_SOURCE_MIN_WORDS,
  );
  if (!usable) {
    return {
      ok: false,
      reason: "Kein Kapitel mit genug Lesertext für eine Kompakt-Ausgabe.",
    };
  }
  return { ok: true };
}

function wordBand(sourceWords: number): { min: number; aim: number; max: number } {
  let min = Math.max(120, Math.round(sourceWords * RATIO_MIN));
  let max = Math.max(min + 40, Math.round(sourceWords * RATIO_MAX));
  let aim = Math.min(max, Math.max(min, Math.round(sourceWords * RATIO_AIM)));
  if (sourceWords > LARGE_BUNDLE_WORDS) {
    max = Math.min(max, BAND_MAX_CAP);
    aim = Math.min(aim, BAND_AIM_CAP);
    min = Math.min(min, BAND_MIN_CAP);
    if (min > max - 200) min = Math.max(120, max - 900);
    aim = Math.min(max, Math.max(min, aim));
  }
  return { min, aim, max };
}

function inNearBand(words: number, sourceWords: number): boolean {
  if (sourceWords > LARGE_BUNDLE_WORDS) {
    const { min, max } = wordBand(sourceWords);
    return words >= Math.round(min * 0.85) && words <= Math.round(max * 1.12);
  }
  return (
    words >= Math.round(sourceWords * ACCEPT_MIN) &&
    words <= Math.round(sourceWords * ACCEPT_MAX)
  );
}

/**
 * Keep each <<<HAUPTBAND…>>> block's head so large bundles fit the context window.
 */
function truncateBundleForModel(text: string, maxWords: number): string {
  const total = countSachbuchWords(text);
  if (total <= maxWords) return text;
  const blocks = text.split(/(?=<<<HAUPTBAND KAPITEL )/);
  if (blocks.length <= 1) {
    return text.split(/\s+/).slice(0, maxWords).join(" ");
  }
  const per = Math.max(800, Math.floor(maxWords / blocks.length));
  return blocks
    .map((b) => {
      const words = b.trim().split(/\s+/);
      if (words.length <= per) return b.trim();
      return `${words.slice(0, per).join(" ")}\n\n[… gekürzt für Kompakt-Briefing …]`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Create an empty compact book: 3–4 Briefing chapters bundling the Hauptband,
 * approvals set, cursor on Manuskript. Prose is filled later, one hop each.
 */
export async function createSachbuchCompactEdition(
  sourceId: string,
): Promise<SachbuchKontext> {
  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error("Sachbuch nicht gefunden.");
  const ready = sachbuchCompactSourceReady(source);
  if (!ready.ok) throw new Error(ready.reason ?? "Kompakt-Ausgabe nicht möglich.");

  const now = new Date().toISOString();
  const title = compactTitle(source.title);
  const bundles = planSachbuchCompactBundles(source);
  if (bundles.length === 0) {
    throw new Error("Keine Kapitel für die Kompakt-Ausgabe.");
  }
  const kapitel = buildCompactKapitelFromBundles(bundles, now);

  const created = await upsertSachbuchKontext({
    id: null,
    title,
    stilbibel: source.stilbibel,
    zielgruppe: source.zielgruppe,
    agents: source.agents,
    evidenz: emptySachbuchEvidenz(),
    makro: {
      ...source.makro,
      status: source.makro.bookTypeId.trim() ? "ready" : source.makro.status,
      kapitelGenerated: kapitel.length > 0,
    },
    idee: {
      ...source.idee,
      interviewMessages: [],
      status: "ready",
      refineStatus: "idle",
      refineLog: [],
      refinedBriefing: "",
      refinedOpinion: "",
      refinedCaseStudies: [],
      manuscriptReview: emptySachbuchManuscriptBookReview(),
      herstellungReview: emptySachbuchHerstellungBookReview(),
      edition: "compact",
      sourceBookId: source.id,
      sourceBookTitle: source.title.slice(0, 300),
      hoerbuch: emptySachbuchHoerbuchState(),
      guide: {
        currentStep: "manuscript",
        ideaApprovedAt: now,
        writeApprovedAt: now,
      },
    },
    kapitel,
  });

  const copy = buildSachbuchCompactEditionCopy(source);
  const autor = SACHBUCH_DEFAULT_AUTHOR;
  const year =
    source.export.vorsatz.impressum.jahr.trim() ||
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

async function writeCompactProse(input: {
  bookTitle: string;
  hauptbandTitle: string;
  compactChapterNumber: number;
  compactChapterCount: number;
  chapterTitle: string;
  hauptbandRange: string;
  opinion: string;
  outline: string;
  source: string;
  sourceWords: number;
  instruction: string;
  modelSlug: string;
}): Promise<string> {
  const model = await resolveRomanSchreibModel(input.modelSlug);
  const { min, aim, max } = wordBand(input.sourceWords);
  const raw = await generateText({
    model,
    systemInstruction: COMPACT_SYSTEM,
    userText: `Kompakt-Buch: ${input.bookTitle}
Hauptband (für Verweise): „${input.hauptbandTitle}“
Kompakt-Kapitel ${input.compactChapterNumber} von ${input.compactChapterCount}: ${input.chapterTitle}
Bündelt Hauptband-Kapitel: ${input.hauptbandRange}
These: ${input.opinion || "—"}

Kompakt-Gliederung:
${input.outline}

Vorlage (mehrere Hauptband-Kapitel hintereinander): ${input.sourceWords} Wörter.
Ziel: ${aim} Wörter. Erlaubt: ${min}–${max} Wörter.
Pflicht-Verweis am Ende: Ausführlich im Hauptband „${input.hauptbandTitle}“, Kapitel ${input.hauptbandRange}.

${input.instruction}

Vorlage:
${input.source}`,
    maxTokens: 16_384,
    timeoutMs: 300_000,
  });
  return sanitizeSachbuchBookProse(
    raw.replace(/^```(?:markdown|md|text)?\s*|\s*```$/g, "").trim(),
  );
}

function mergeCompactSourceTexts(
  source: SachbuchKontext,
  sourceIds: string[],
): { text: string; numbers: number[]; words: number } {
  const parts: string[] = [];
  const numbers: number[] = [];
  for (const id of sourceIds) {
    const idx = source.kapitel.findIndex((k) => k.id === id);
    if (idx < 0) continue;
    const kap = source.kapitel[idx]!;
    const body = sachbuchKapitelCompactSourceText(kap);
    if (!body.trim()) continue;
    const n = idx + 1;
    numbers.push(n);
    parts.push(
      `<<<HAUPTBAND KAPITEL ${n}: ${kap.title || "ohne Titel"}>>>\n\n${body}`,
    );
  }
  const text = parts.join("\n\n");
  return { text, numbers, words: countSachbuchWords(text) };
}

/**
 * Condense one compact Briefing chapter from its bundled Hauptband chapters.
 * Already-in-band drafts are left unchanged so a retry can resume.
 */
export async function condenseSachbuchCompactKapitel(input: {
  sachbuchId: string;
  kapitelId: string;
}): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(input.sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchCompact(book)) {
    throw new Error("Nur Kompakt-Ausgaben werden gekürzt.");
  }
  assertSachbuchGuideAllows(book, "manuscript");
  const kapitel = book.kapitel.find((k) => k.id === input.kapitelId);
  if (!kapitel) throw new Error("Kapitel nicht gefunden.");
  const sourceId = book.idee.sourceBookId?.trim();
  const sourceIds = sachbuchKapitelSourceIds(kapitel);
  if (!sourceId || sourceIds.length === 0) {
    throw new Error("Quellkapitel für diese Kompakt-Ausgabe fehlen.");
  }

  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error("Ursprungsbuch nicht gefunden.");

  const merged = mergeCompactSourceTexts(source, sourceIds);
  if (merged.numbers.length === 0 || merged.words < 80) {
    throw new Error(
      `Kapitel „${kapitel.title || "ohne Titel"}“ hat in der Quelle zu wenig Text.`,
    );
  }

  const sourceText = merged.text;
  const sourceWords = merged.words;
  const hauptbandRange = formatHauptbandKapitelRange(merged.numbers);
  const existing = countSachbuchWords(kapitel.manuscript.draftText);
  if (
    kapitel.status === "ready" &&
    existing >= 120 &&
    (sourceWords < SACHBUCH_COMPACT_SOURCE_MIN_WORDS ||
      inNearBand(existing, sourceWords))
  ) {
    return book;
  }

  const compactChapterNumber =
    book.kapitel.findIndex((k) => k.id === kapitel.id) + 1;
  const hauptbandTitle =
    source.export.suggestedTitle.trim() ||
    compactSourceBookTitle(source.title);

  let text = sourceText;
  let modelSlug = "";
  if (sourceWords >= SACHBUCH_COMPACT_SOURCE_MIN_WORDS) {
    const outline = book.kapitel
      .map((k, i) => `${i + 1}. ${k.title || "ohne Titel"}`)
      .join("\n");
    const opinion = (
      book.idee.unpopularOpinion || source.idee.unpopularOpinion
    ).slice(0, 1_500);
    const { min, aim, max } = wordBand(sourceWords);
    const modelForBundle =
      sourceWords > LARGE_BUNDLE_WORDS
        ? SACHBUCH_MODEL_MANUSCRIPT
        : SACHBUCH_MODEL_HERSTELLUNG;
    const modelSource = truncateBundleForModel(
      sourceText,
      MODEL_SOURCE_WORD_CAP,
    );

    text = "";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const wordsNow = countSachbuchWords(text);
        let lengthNote: string;
        if (attempt === 1) {
          lengthNote =
            "Schreibe EIN Briefing-Kapitel aus der gebündelten Vorlage. Nicht Kapitel für Kapitel abschreiben — verdichten zu These, Fallanker, Hebel. Untergrenze ernst nehmen. Keine Abbildungs-/Tabellen-Captions.";
        } else if (wordsNow > max) {
          lengthNote = `Die vorige Fassung ist zu lang (${wordsNow} Wörter). Kürze auf ${min}–${max} Wörter. Keine neuen Thesen. Verweis auf den Hauptband behalten.\n\nVorige Fassung:\n${text}`;
        } else if (attempt === 4) {
          lengthNote = `PFLICHT-AUFFÜLLUNG: Die vorige Fassung hat nur ${wordsNow} Wörter — zu kurz. Ziel mindestens ${min} Wörter (besser ~${aim}), höchstens ${max}.
Behalte die Briefing-Struktur, aber hole fehlende Substanz aus der Vorlage zurück: konkreten Fall, entscheidenden Faktencheck, das zentrale Werkzeug, eine Zahlen-/Risiko-Passage falls vorhanden. Nichts erfinden. Keine Meta-Kommentare. Keine Abbildung-/Tabelle-Zeilen.
\nVorige Fassung:\n${text}`;
        } else {
          lengthNote = `Die vorige Fassung ist zu kurz (${wordsNow} Wörter). Hole fehlende Substanz aus der Vorlage zurück. Pflicht: mindestens ${min} Wörter, Ziel ~${aim}, höchstens ${max}. Nichts erfinden.\n\nVorige Fassung:\n${text}`;
        }
        const draft = await writeCompactProse({
          bookTitle: book.title,
          hauptbandTitle,
          compactChapterNumber: Math.max(1, compactChapterNumber),
          compactChapterCount: book.kapitel.length,
          chapterTitle: kapitel.title,
          hauptbandRange,
          opinion,
          outline,
          source: modelSource,
          sourceWords,
          instruction: lengthNote,
          modelSlug: modelForBundle,
        });
        const words = countSachbuchWords(draft);
        text = draft;
        if (words >= min && words <= max) break;
        if (attempt >= 3 && inNearBand(words, sourceWords)) break;
        if (attempt === 4) {
          throw new Error(
            `Kompaktfassung außerhalb der Länge (${words} Wörter, Ziel ${min}–${max}).`,
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
    if (!text.trim()) throw new Error("Kompaktfassung leer.");
    modelSlug = modelForBundle;
  } else {
    const pointer = `Ausführlich im Hauptband „${hauptbandTitle}“, Kapitel ${hauptbandRange}.`;
    // Short bundles: strip markers, keep prose, add pointer.
    text = sourceText
      .replace(/^<<<HAUPTBAND KAPITEL \d+:[^\n]*>>>\s*/gm, "")
      .trim();
    if (!text.includes("Ausführlich im Hauptband")) {
      text = `${text}\n\n${pointer}`;
    }
  }

  text = stripCompactFigureCaptions(text);

  const words = countSachbuchWords(text);
  if (words < 80) {
    throw new Error("Kompaktfassung zu kurz — bitte erneut versuchen.");
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

/**
 * Replace an old 1:1 compact spine with the 3–4 Briefing bundles.
 * Clears prose — caller should re-run condensation.
 */
export async function rebuildSachbuchCompactSpine(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchCompact(book)) {
    throw new Error("Nur Kompakt-Ausgaben können neu gegliedert werden.");
  }
  const sourceId = book.idee.sourceBookId?.trim();
  if (!sourceId) throw new Error("Quellbuch (Hauptband) fehlt.");
  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error("Hauptband nicht gefunden.");

  const bundles = planSachbuchCompactBundles(source);
  if (bundles.length === 0) {
    throw new Error("Keine Kapitel für die Kompakt-Gliederung.");
  }
  if (!sachbuchCompactNeedsSpineRebuild(book, source)) {
    return book;
  }

  const now = new Date().toISOString();
  const kapitel = buildCompactKapitelFromBundles(bundles, now);
  return upsertSachbuchKontext({
    id: book.id,
    title: book.title,
    stilbibel: book.stilbibel,
    zielgruppe: book.zielgruppe,
    agents: book.agents,
    evidenz: book.evidenz,
    makro: {
      ...book.makro,
      kapitelGenerated: true,
    },
    idee: book.idee,
    kapitel,
  });
}

/** Drop Abbildung/Tabelle caption lines from compact prose. */
export function stripCompactFigureCaptions(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (/^(?:Abbildung|Tabelle)\s*[\d.]+\s*[:：]/i.test(p)) return false;
      if (/^Tabelle:\s*Die\s+VDP/i.test(p)) return false;
      return true;
    })
    .join("\n\n");
}

/**
 * Remove all chapter Infografiken from a compact edition (product: text-only).
 */
export async function clearSachbuchCompactInfografiken(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchCompact(book)) {
    throw new Error("Nur Kompakt-Ausgaben sind text-only ohne Infografiken.");
  }
  for (const kap of book.kapitel) {
    const has =
      (kap.infografiken?.length ?? 0) > 0 ||
      Boolean(kap.infografikDataUrl?.trim());
    if (!has) continue;
    book = await patchSachbuchKapitel(sachbuchId, kap.id, {
      infografiken: [],
      infografikDataUrl: null,
      infografikTitle: "",
      infografikPrompt: "",
      updatedAt: new Date().toISOString(),
    });
  }
  return book;
}

/**
 * Refresh Titelei / Klappentext for an existing compact edition from the Hauptband.
 */
export async function syncSachbuchCompactEditionMeta(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchCompact(book)) {
    throw new Error("Nur Kompakt-Ausgaben haben diese Titelei-Logik.");
  }
  const sourceId = book.idee.sourceBookId?.trim();
  if (!sourceId) throw new Error("Quellbuch (Hauptband) fehlt.");
  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error("Hauptband nicht gefunden.");

  const copy = buildSachbuchCompactEditionCopy(source);
  const title =
    book.export.suggestedTitle.trim() ||
    compactTitle(source.title);
  const autor = SACHBUCH_DEFAULT_AUTHOR;
  const year =
    book.export.vorsatz.impressum.jahr.trim() ||
    source.export.vorsatz.impressum.jahr.trim() ||
    String(new Date().getFullYear());

  return upsertSachbuchExport({
    id: book.id,
    suggestedTitle: title,
    subtitle: copy.subtitle,
    summary: copy.summary,
    keywords: copy.keywords,
    autorName: autor,
    coverImageDataUrl: book.export.coverImageDataUrl,
    coverPrompt: book.export.coverPrompt,
    vorsatz: {
      ...book.export.vorsatz,
      titelseite: {
        ...book.export.vorsatz.titelseite,
        titel: title,
        untertitel: copy.subtitle,
        autor,
        imprint: SACHBUCH_DEFAULT_IMPRINT,
      },
      impressum: buildSachbuchImpressum({
        jahr: year,
        autorPseudonym: autor,
      }),
      motto: copy.motto || book.export.vorsatz.motto,
      vorwort: copy.vorwort,
    },
  });
}

function ensureHauptbandPointer(
  text: string,
  hauptbandTitle: string,
  hauptbandRange: string,
): string {
  const cleaned = stripCompactFigureCaptions(text);
  if (!cleaned.trim()) return cleaned;
  if (/Ausführlich im Hauptband/i.test(cleaned)) return cleaned;
  const pointer = `Ausführlich im Hauptband „${hauptbandTitle}“, Kapitel ${hauptbandRange}.`;
  return `${cleaned.trim()}\n\n${pointer}`;
}

/**
 * Product split for an existing compact book: optional 3–4 spine rebuild,
 * Titelei, no figures, caption strip, Hauptband-Verweise.
 */
export async function applySachbuchCompactProductSplit(
  sachbuchId: string,
): Promise<SachbuchKontext> {
  let book = await getSachbuchKontext(sachbuchId);
  if (!book) throw new Error("Sachbuch nicht gefunden.");
  if (!isSachbuchCompact(book)) {
    throw new Error("Nur Kompakt-Ausgaben.");
  }

  const sourceId = book.idee.sourceBookId?.trim();
  const source = sourceId ? await getSachbuchKontext(sourceId) : null;
  if (source && sachbuchCompactNeedsSpineRebuild(book, source)) {
    book = await rebuildSachbuchCompactSpine(book.id);
    book = await syncSachbuchCompactEditionMeta(book.id);
    // New empty Briefing chapters — condensation fills prose next.
    return clearSachbuchCompactInfografiken(book.id);
  }

  book = await syncSachbuchCompactEditionMeta(sachbuchId);
  book = await clearSachbuchCompactInfografiken(book.id);

  const hauptbandTitle =
    source?.export.suggestedTitle.trim() ||
    book.idee.sourceBookTitle?.trim() ||
    compactSourceBookTitle(book.title);

  for (const kap of book.kapitel) {
    const sourceIds = sachbuchKapitelSourceIds(kap);
    const numbers =
      source && sourceIds.length > 0
        ? sourceIds
            .map((id) => source.kapitel.findIndex((k) => k.id === id) + 1)
            .filter((n) => n > 0)
        : [];
    const range =
      numbers.length > 0
        ? formatHauptbandKapitelRange(numbers)
        : String(book.kapitel.findIndex((k) => k.id === kap.id) + 1);

    const draft = ensureHauptbandPointer(
      kap.manuscript.draftText,
      hauptbandTitle,
      range,
    );
    const improved = kap.manuscript.improvedText.trim()
      ? ensureHauptbandPointer(
          kap.manuscript.improvedText,
          hauptbandTitle,
          range,
        )
      : kap.manuscript.improvedText;
    const herstellung = kap.manuscript.herstellungText.trim()
      ? ensureHauptbandPointer(
          kap.manuscript.herstellungText,
          hauptbandTitle,
          range,
        )
      : kap.manuscript.herstellungText;
    const finalText = kap.finalText.trim()
      ? ensureHauptbandPointer(kap.finalText, hauptbandTitle, range)
      : kap.finalText;

    const changed =
      draft !== kap.manuscript.draftText ||
      improved !== kap.manuscript.improvedText ||
      herstellung !== kap.manuscript.herstellungText ||
      finalText !== kap.finalText ||
      (kap.infografiken?.length ?? 0) > 0 ||
      Boolean(kap.infografikDataUrl?.trim());
    if (!changed) continue;

    book = await patchSachbuchKapitel(sachbuchId, kap.id, {
      finalText,
      infografiken: [],
      infografikDataUrl: null,
      infografikTitle: "",
      infografikPrompt: "",
      manuscript: {
        ...kap.manuscript,
        draftText: draft,
        improvedText: improved,
        herstellungText: herstellung,
      },
      updatedAt: new Date().toISOString(),
    });
  }

  return book;
}
