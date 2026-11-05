/**
 * Expand Vorwort honesty: Privacy Value is the best starting path,
 * but hard cases still need lawyers + statutory documentation duties remain.
 * Applies to Hauptband; refreshes Kompakt + Teaser Vorwort from templates.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-vorwort-limits.ts
 */
import { buildSachbuchCompactEditionCopy } from "../src/lib/sachbuch/compact";
import { buildSachbuchImpressum } from "../src/lib/sachbuch/impressum";
import { buildSachbuchTeaserEditionCopy } from "../src/lib/sachbuch/teaser";
import {
  getSachbuchKontext,
  patchSachbuchBook,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const COMPACT_ID = "47194844-8130-4938-91ae-d6cddd14abe4";
const TEASER_ID = "34128455-4057-4ce4-bee2-3f5dc0f96e62";

/**
 * Binding preface — author voice, USP, Abgrenzung, honesty on limits.
 * Kept as continuous Vorwort (no separate Disclaimer page).
 */
const VORWORT = `Dieses Buch ist kein weiteres Datenschutz-Handbuch für Juristen — und keine Checkliste zum Abhaken.

Es stellt eine unbequeme Behauptung in den Raum: Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler. Falsche Daten sind Ausschuss. Überflüssige Felder sind Verschwendung. Undurchsichtige Klauseln sind schlechtes Design. Fehlende Löschung ist unterlassenes Lifecycle-Management. Fehlende Dokumentation ist ein gebrochenes Qualitätsprinzip. Wer nur Paragrafen sieht, übersieht die Wertschöpfung. Wer nur Checklisten abarbeitet, baut keine steuerbare Organisation.

Der USP dieses Buches ist die Qualitäts-Pyramide in einem Band. Unten das Fundament: Rechtmäßigkeit, Rechenschaft und Integrität in der Sprache von Enterprise Risk Management und ISO-/PDCA-Denken. In der Mitte der Lean-Motor: Zweckbindung, Minimierung, Speicherbegrenzung und Richtigkeit als Waste Reduction, Data Lifecycle und Fehlervermeidung — mit Werkzeugen, die Sie montags anwenden können. Oben das Kundenergebnis: Transparenz und Fairness als Design Thinking und Customer Experience, für Vertrauen und Conversion. Jedes DSGVO-Prinzip bekommt ein methodisches Gegenstück aus Lean, TQM, UX, ERM oder Data Governance — nicht als Dekoration, sondern als Steuerungslogik.

Damit grenzt sich Lean Privacy klar ab. Es ersetzt keine Rechtsberatung und kommentiert keine Artikelkette. Es ist kein Bußgeld-Angstbuch und kein Security-Technikhandbuch. Es ist auch keine Sammlung von One-Pager-Checklisten ohne Handlungstheorie. Stattdessen bekommen Ops-, Qualitäts-, Product- und Geschäftsführungsleser eine gemeinsame Sprache für Datenflüsse: Diagnose, Hebel, Mapping-Matrix und ein fiktives Composite-Unternehmen — die KlarNetz AG —, an dem Sie sehen, wie Fundament, Motor und Kundenergebnis zusammenwirken.

Wichtig ist, was wir ehrlich zugeben: Privacy Value Thinking als Mindset und Value Driven Privacy als Methode sind aus unserer Sicht der beste Weg, Datenschutz von Anfang an gewinnbringend zu denken und mitzubauen. Aber sie ersetzen keine Rechtsberatung. Bei schwierigen Fragestellungen braucht es weiterhin Juristinnen und Juristen. Und neben der Methode bleiben gesetzliche Dokumentationspflichten und andere Fleißarbeiten: Informationspflichten, TOMs, Abwägungen, Verträge und vergleichbare Nachweise. Wer Datenschutz vollumfänglich bedienen will, kommt daran nicht vorbei.

Der Anspruch dieses Buches ist ein anderer. Es liefert keine Rechtsmeinung, keine Freigabe und keinen Ersatz für die Bewertung konkreter Sachverhalte. Es hilft, Prozesse und Produkte von der Basis her so aufzusetzen, dass genau diese Pflichten um ein Vielfaches leichter und für alle Beteiligten nachvollziehbarer werden — weil Zweck, Datenfluss, Rollen, Nachweise und Löschlogik schon klar sind, bevor die Rechtsfrage gestellt wird. Das Gesetz und die daraus folgenden Pflichten verlieren ihren Schrecken — nicht, weil sie verschwinden, sondern weil die Arbeit vorbereitet und steuerbar ist. Das Ergebnis ist nicht nur Compliance mit weniger Reibung, sondern ein werthaltigerer Prozess und ein besseres Produkt für Kunden und Unternehmen.

Ich schreibe das bewusst aus einer operativen Perspektive. Ich bin kein Jurist. Seit zehn Jahren arbeite ich als Datenschutzmanager auf der Umsetzungseite: zuerst mit der Einführung und dem Alltag der DSGVO ab 2016, danach am Aufbau eines Datenschutz-Managementsystems, und seitdem im täglichen Inlife sowie in zahlreichen Transformationsprojekten. Dort habe ich die Facetten des Datenschutzes vor allem dort kennengelernt, wo Prozesse entstehen und scheitern — in den Fachbereichen, nicht nur in der Rechtsabteilung.

Lesen Sie dieses Buch, wenn Sie Datenschutz als Teil von Prozessqualität und Kundennutzen führen wollen — nicht als Sonderwelt der Rechtsabteilung. Wenn Sie nach der Lektüre jedes Kernprinzip in Lean-, Qualitäts- und Design-Sprache übersetzen und in derselben Pyramide steuern können, hat das Buch sein Ziel erreicht. Und wenn Ihre Juristinnen und Juristen danach schneller, präziser und mit besseren Unterlagen prüfen können, hat es seinen Auftrag erfüllt.`;

const VORWORT_SECTION = `### Vorwort (verbindlich für Export / Titelei)
Das Vorwort ist Teil der Idee — nicht Dekoration. Es muss den USP, die Abgrenzung und den Autor-Standpunkt tragen. Verbindlicher Vorwort-Text:

<<<VORWORT
${VORWORT}
VORWORT>>>

**USP, den das Vorwort herausstellen muss:**
- Ein Band, drei Pyramidenebenen (Fundament · Lean-Motor · Kundenergebnis) statt isolierter Lean- oder Jura-Perspektive.
- Jedes DSGVO-Prinzip mit methodischem Gegenstück (Lean / TQM-ISO / UX-Design Thinking / ERM / DLM-MDM).
- Operative Steuerungslogik für Macher: Diagnose → Hebel → Mapping — am Composite KlarNetz AG.
- Privacy-Probleme = Qualitäts- und Prozessfehler (Ausschuss, Muda, schlechtes UX, kaputtes Lifecycle, gebrochenes PDCA).
- Privacy Value Thinking + Value Driven Privacy: bester Start für gewinnbringenden Datenschutz — ohne Ersatz für Jura und ohne Wegfall gesetzlicher Pflichten.

**Klare Abgrenzung (Vorwort und gesamtes Buch):**
- Ehrliche Einschränkung: Methode ersetzt keine Rechtsberatung; schwierige Fälle brauchen Juristinnen und Juristen.
- Neben Methodik bleiben Dokumentationspflichten und Fleißarbeiten (Infopflichten, TOMs, Abwägungen, Verträge, Nachweise).
- Mit gut aufgesetzten Prozessen werden diese Pflichten leichter und nachvollziehbarer; Gesetz verliert den Schrecken; Prozess/Produkt wird werthaltiger.
- Gegen gängige Jura-Beratungsbücher: keine Artikel-Schlacht, kein Kommentarstil, keine Ersatz-Rechtsberatung.
- Gegen simple Checklisten-/One-Pager-Bücher und gegen Angst-/Bußgeld-Rhetorik sowie reines IT-Security-Handbuch.
- Gegen „Folgeband / Vertiefung später“: Fundament, Motor und Kundenergebnis stehen in diesem einen Band.

**Autor-Standpunkt (im Vorwort sichtbar):**
- Kein Jurist; seit ca. 10 Jahren Datenschutzmanager auf operativer Seite.
- Seit Inkrafttreten der DSGVO 2016: Umsetzung, Aufbau DSMS, täglicher Inlife, Transformationsprojekte — Schwerpunkt Fachbereiche.`;

const ABGRENZUNG = `### 5. Abgrenzung (auch im Vorwort sichtbar)
- **Ehrliche Einschränkung:** Privacy Value Thinking / Value Driven Privacy ist der beste Start für gewinnbringenden Datenschutz von Anfang an — aber kein Ersatz für Rechtsberatung. Schwierige Fragestellungen brauchen weiterhin Juristinnen und Juristen.
- **Fleißarbeiten bleiben:** gesetzliche Dokumentationspflichten, Informationspflichten, TOMs, Abwägungen, Verträge und vergleichbare Nachweise gehören zur vollumfänglichen Bedienung; die Methode macht sie leichter und nachvollziehbarer, schafft sie nicht ab.
- **Mehrwert trotz Pflicht:** gut aufgesetzte Prozesse lassen Gesetz und Pflichten den Schrecken verlieren und schaffen werthaltigere Prozesse/Produkte.
- **Kein Jura-Beratungshandbuch:** keine Paragrafen-Ketten, keine Gerichtsurteile, keine Erwägungsgründe, keine Ersatz-Rechtsberatung.
- **Keine simple Checkliste:** keine One-Pager zum Abhaken ohne Handlungstheorie; Artefakte und Sprints folgen aus Pyramide und Gegenstück-Matrix.
- **Kein IT-Security-Handbuch:** Technik nur soweit Kosten, Haftung, Freigabe und Resilienz betroffen sind.
- **Kein abstraktes Lean- oder UX-Lehrbuch:** immer am Datenfluss und an KlarNetz AG.
- **Kein Folgeband:** alle drei Pyramidenebenen in diesem Band.
- **Operative Autor-Stimme:** kein Jurist, sondern Datenschutzmanager mit Umsetzungserfahrung seit DSGVO 2016 (DSMS, Inlife, Transformation, Fachbereiche).`;

const STIL_NOTE =
  "Vorwort: USP (Qualitäts-Pyramide, Gegenstück-Matrix, Privacy Value Thinking + Value Driven Privacy) und ehrliche Einschränkung — bester Start für gewinnbringenden Datenschutz, aber kein Ersatz für Juristinnen/Juristen; Dokumentationspflichten und Fleißarbeiten (Infopflichten, TOMs, Abwägungen, Verträge) bleiben; gut aufgesetzte Prozesse machen sie leichter und werthaltiger. Autor: operativer Datenschutzmanager (kein Jurist). Siehe Idee-Abschnitt „Vorwort (verbindlich)“.";

async function patchFull() {
  const book = await getSachbuchKontext(FULL_ID);
  if (!book) throw new Error("Hauptband nicht gefunden");

  let briefing = book.idee.briefing.trim();
  const vorwortBlockRe = /### Vorwort[\s\S]*?(?=\n### |\n## [^#]|$)/;
  if (vorwortBlockRe.test(briefing)) {
    briefing = briefing.replace(vorwortBlockRe, `${VORWORT_SECTION}\n\n`);
  } else if (briefing.includes("### 2. Buchform")) {
    briefing = briefing.replace(
      "### 2. Buchform",
      `${VORWORT_SECTION}\n\n### 2. Buchform`,
    );
  } else {
    briefing = `${briefing}\n\n${VORWORT_SECTION}`;
  }

  if (/### 5\. Abgrenzung[\s\S]*?(?=\n### |\n## [^#]|$)/.test(briefing)) {
    briefing = briefing.replace(
      /### 5\. Abgrenzung[\s\S]*?(?=\n### |\n## [^#]|$)/,
      `${ABGRENZUNG}\n\n`,
    );
  }

  let stilbibel = book.stilbibel.trim();
  if (/Vorwort: USP[\s\S]*?(?=\n\n|$)/.test(stilbibel)) {
    stilbibel = stilbibel.replace(/Vorwort: USP[\s\S]*?(?=\n\n|$)/, STIL_NOTE);
  } else {
    stilbibel = `${stilbibel}\n\n${STIL_NOTE}`;
  }

  await patchSachbuchBook(FULL_ID, {
    idee: {
      ...book.idee,
      briefing: briefing.trim() + "\n",
    },
    stilbibel,
  });

  const refreshed = await getSachbuchKontext(FULL_ID);
  if (!refreshed) throw new Error("Hauptband nach Idee-Update nicht gefunden");

  await upsertSachbuchExport({
    id: FULL_ID,
    vorsatz: {
      ...refreshed.export.vorsatz,
      vorwort: VORWORT,
      impressum: buildSachbuchImpressum({
        jahr: refreshed.export.vorsatz.impressum.jahr,
        autorPseudonym: refreshed.export.vorsatz.titelseite.autor,
      }),
    },
  });

  return {
    edition: "full",
    vorwortChars: VORWORT.length,
    hasEhrlichkeit: VORWORT.includes("ehrlich zugeben"),
    hasFleiss: VORWORT.includes("Informationspflichten, TOMs"),
    hasSchrecken: VORWORT.includes("verlieren ihren Schrecken"),
  };
}

async function patchDerived(
  id: string,
  buildVorwort: (source: Awaited<ReturnType<typeof getSachbuchKontext>>) => string,
  sourceId: string,
) {
  const book = await getSachbuchKontext(id);
  if (!book) throw new Error(`Buch nicht gefunden: ${id}`);
  const source = await getSachbuchKontext(sourceId);
  if (!source) throw new Error(`Quelle nicht gefunden: ${sourceId}`);
  const vorwort = buildVorwort(source);
  await upsertSachbuchExport({
    id,
    vorsatz: {
      ...book.export.vorsatz,
      vorwort,
    },
  });
  return {
    edition: book.idee.edition,
    vorwortChars: vorwort.length,
    hasEhrlichkeit: /ehrlich|Jurist|Dokumentationspflicht/i.test(vorwort),
    snippet: vorwort.slice(-320),
  };
}

async function main() {
  const full = await patchFull();
  const hauptband = await getSachbuchKontext(FULL_ID);
  if (!hauptband) throw new Error("Hauptband reload failed");

  const compact = await patchDerived(
    COMPACT_ID,
    (src) => buildSachbuchCompactEditionCopy(src!).vorwort,
    FULL_ID,
  );
  const teaser = await patchDerived(
    TEASER_ID,
    (src) => buildSachbuchTeaserEditionCopy(src!).vorwort,
    COMPACT_ID,
  );

  console.log(JSON.stringify({ full, compact, teaser }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
