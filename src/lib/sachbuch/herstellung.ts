/**
 * Phase 8 — Herstellung: Haiku layout pass between Manuskript and Export.
 * Inserts Zwischenüberschriften + One-Pager/Merksatz/Infobox/Schaubild markers
 * without rewriting lektorierte Prosa. See `herstellung-markup.ts`.
 */

import {
  isRetryableAiNetworkError,
  sleepMs,
} from "@/lib/ai/fetch-timeout";
import { generateText } from "@/lib/ai/provider";
import { SACHBUCH_MODEL_HERSTELLUNG } from "@/lib/sachbuch/agent-defaults";
import { assertSachbuchGuideAllows } from "@/lib/sachbuch/guide";
import {
  countSachbuchWords,
  emptySachbuchHerstellungBookReview,
  sachbuchKapitelBodyText,
  sachbuchKapitelHasHerstellung,
} from "@/lib/sachbuch/parse";
import {
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

const HERSTELLUNG_SYSTEM = `Du bist Herstellung / Buchsatz-Lektor für deutschsprachige Business-Sachbücher.
Du bereitet EIN bereits lektoriertes Kapitel für Druck und ePub vor — OHNE den Inhalt umzuschreiben.

Aufgabe:
1) Prüfe, wo echte Unterkapitel (Zwischenüberschriften) dem Leser helfen — typisch 2–6 pro Kapitel, an thematischen Brüchen.
2) Markiere Layout-Artefakte als Kästen:
   - One-Pager / „Blatt für den Montagmorgen“ / Sprint-Board / 9-KPI-Cockpit / A3-Report → BOX onepager
   - Zeilen die mit „Merksatz:“ beginnen oder klare Pull-Quotes → BOX merksatz
   - Kurze Definitionen / KPI-Definitionslisten als Infobox → BOX infobox (nur wenn klar abgegrenzt)
   - Architektur-auf-einen-Blick / Schaubild-Absätze → BOX schaubild
3) Prosa dazwischen unverändert lassen (Formulierung, Reihenfolge, Zahlen). Keine neuen Argumente, keine Kürzungen.

Marker-FORMAT (hart, exakt so):
<<<H>>> Kurzer Unterkapitel-Titel
<<<BOX onepager Optionaler Titel>>>
…Inhalt der Box (Absätze aus dem Original)…
<<<END BOX>>>
<<<BOX merksatz>>>
…Merksatz-Text…
<<<END BOX>>>
<<<BOX infobox Optionaler Titel>>>
…
<<<END BOX>>>
<<<BOX schaubild Optionaler Titel>>>
…
<<<END BOX>>>

Regeln:
- Deutsch. Kein Markdown (# ## **, Listen-Striche, Backticks), kein JSON, kein Vorspann.
- Nur die Marker oben sind erlaubt; sonst reine Absätze mit Leerzeilen.
- Länge: mindestens 92 % der Vorlage in Wörtern (Marker zählen nicht mit).
- Keine Gesetzes-Artikelnummern 1:1 einführen.
- Wenn ein One-Pager/Merksatz schon klar erkennbar ist, wrappe ihn — erfinde keine neuen Kästen ohne Textbasis.
- Unterkapitel-Titel: kurz, inhaltlich, ohne „Kapitel 3.1“-Nummern.`;

const HERSTELLUNG_ATTEMPTS = 3;

function sourceBodyForHerstellung(book: SachbuchKontext, kapitelId: string): {
  kapIndex: number;
  body: string;
} {
  const kapIndex = book.kapitel.findIndex((k) => k.id === kapitelId);
  if (kapIndex < 0) throw new Error("Kapitel nicht gefunden.");
  const kap = book.kapitel[kapIndex]!;
  const body =
    kap.manuscript.improvedText.trim() ||
    sachbuchKapitelBodyText(kap);
  if (countSachbuchWords(body) < 400) {
    throw new Error(
      "Kapitel noch zu kurz für Herstellung — zuerst Manuskript lektorieren.",
    );
  }
  return { kapIndex, body };
}

async function callHaikuHerstellung(input: {
  title: string;
  kapitelTitle: string;
  body: string;
  hint?: string;
}): Promise<string> {
  const model = await resolveRomanSchreibModel(SACHBUCH_MODEL_HERSTELLUNG);
  let lastError: unknown;
  for (let attempt = 1; attempt <= HERSTELLUNG_ATTEMPTS; attempt += 1) {
    try {
      const raw = await generateText({
        model,
        systemInstruction: HERSTELLUNG_SYSTEM,
        userText: `Buch: ${input.title}
Kapitel: ${input.kapitelTitle}

${input.hint ? `${input.hint}\n\n` : ""}Lektorierter Kapiteltext (Vorlage — Inhalt behalten):
${input.body}`,
        maxTokens: 16_000,
        timeoutMs: 300_000,
      });
      return raw.replace(/^```(?:markdown|md|text)?\s*|\s*```$/g, "").trim();
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
    : new Error("Herstellung fehlgeschlagen.");
}

/**
 * Run Haiku Herstellung for one chapter → manuscript.herstellungText.
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
  const sourceWords = countSachbuchWords(body);
  const minWords = Math.ceil(sourceWords * 0.92);

  let prepared = await callHaikuHerstellung({
    title: book.title,
    kapitelTitle: kap.title || `Kapitel ${kapIndex + 1}`,
    body,
  });

  let plainWords = countSachbuchWords(stripSachbuchLayoutMarkup(prepared));
  if (plainWords < minWords || !hasSachbuchLayoutMarkup(prepared)) {
    prepared = await callHaikuHerstellung({
      title: book.title,
      kapitelTitle: kap.title || `Kapitel ${kapIndex + 1}`,
      body,
      hint: !hasSachbuchLayoutMarkup(prepared)
        ? `Die vorherige Ausgabe hatte keine gültigen Marker. Setze zwingend <<<H>>> und mindestens einen <<<BOX …>>> / <<<END BOX>>> (One-Pager oder Merksatz), ohne den Inhalt zu kürzen (mind. ${minWords} Wörter).`
        : `Die vorherige Ausgabe war zu kurz (${plainWords}/${minWords} Wörter). Wiederhole mit vollständiger Vorlage und Markern — nicht kürzen.`,
    });
    plainWords = countSachbuchWords(stripSachbuchLayoutMarkup(prepared));
  }

  if (plainWords < Math.ceil(sourceWords * 0.85)) {
    throw new Error(
      `Herstellung zu kurz (${plainWords}/${minWords} Wörter) — bitte erneut versuchen.`,
    );
  }
  if (!hasSachbuchLayoutMarkup(prepared)) {
    throw new Error(
      "Herstellung ohne Layout-Marker — bitte erneut versuchen.",
    );
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
 * Call after a full-book run (or a single chapter if desired).
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
