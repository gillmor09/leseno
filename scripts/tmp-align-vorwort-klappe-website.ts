/**
 * Align Hauptband Vorwort + Klappentext with privacyvalue.de voice,
 * then refresh Kompakt/Teaser derived copy.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-align-vorwort-klappe-website.ts
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
 * Vorwort aligned with privacyvalue.de: two levers, honest limits, author stance.
 * Keeps book-only USP (Pyramide, KlarNetz) without brand drift to „Lean Privacy“.
 */
const VORWORT = `Dieses Buch ist kein weiteres Datenschutz-Handbuch für Juristen — und keine Checkliste zum Abhaken.

Es stellt eine unbequeme Behauptung in den Raum: Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler. Falsche Daten sind Ausschuss. Überflüssige Felder sind Verschwendung. Undurchsichtige Klauseln sind schlechtes Design. Fehlende Löschung ist unterlassenes Lifecycle-Management. Fehlende Dokumentation ist ein gebrochenes Qualitätsprinzip. Wer nur Paragrafen sieht, übersieht die Wertschöpfung. Wer nur Checklisten abarbeitet, baut keine steuerbare Organisation.

Deshalb koppelt dieses Buch zwei Hebel. Privacy Value Thinking ist das Mindset: zuerst Nutzen, Prozessqualität und ein klares Geschäftsziel, bevor es an Paragrafen geht. Value-Driven Privacy (VDP) ist die operative Praxis: Lean, Qualität, UX und Risikosteuerung direkt am Datenfluss — dort, wo Daten erhoben, verarbeitet, weitergegeben und gelöscht werden. Ein Mindset ohne Werkzeuge bleibt Theorie; Werkzeuge ohne Mindset werden zu abgehakten Listen. Erst die Kopplung trägt im Alltag.

Der Aufbau folgt einer Qualitäts-Pyramide in einem Band. Unten das Fundament: Rechtmäßigkeit, Rechenschaft und Integrität in der Sprache von Enterprise Risk Management und ISO-/PDCA-Denken. In der Mitte der Lean-Motor: Zweckbindung, Minimierung, Speicherbegrenzung und Richtigkeit als Waste Reduction, Data Lifecycle und Fehlervermeidung — mit Werkzeugen, die Sie montags anwenden können. Oben das Kundenergebnis: Transparenz und Fairness als Design Thinking und Customer Experience, für Vertrauen und Conversion. Jedes DSGVO-Prinzip bekommt ein methodisches Gegenstück — nicht als Dekoration, sondern als Steuerungslogik. Am fiktiven Composite KlarNetz AG sehen Sie, wie Diagnose, Hebel und Mapping zusammenspielen.

Wichtig ist, was wir ehrlich zugeben: Privacy Value Thinking und Value-Driven Privacy sind aus unserer Sicht der beste Weg, Datenschutz von Anfang an gewinnbringend mitzudenken — aber kein Ersatz für Rechtsberatung. Bei schwierigen Fragestellungen braucht es weiterhin Juristinnen und Juristen. Und neben der Methode bleiben gesetzliche Dokumentationspflichten und andere Fleißarbeiten: Informationspflichten, TOMs, Abwägungen, Verträge und Nachweise. Wer Datenschutz vollumfänglich bedienen will, kommt daran nicht vorbei.

Der Anspruch dieses Buches ist ein anderer. Es liefert keine Rechtsmeinung, keine Freigabe und keinen Ersatz für die Bewertung konkreter Sachverhalte. Es hilft, Prozesse und Produkte von der Basis her so aufzusetzen, dass genau diese Pflichten um ein Vielfaches leichter und für alle Beteiligten nachvollziehbarer werden — weil Zweck, Datenfluss, Rollen, Nachweise und Löschlogik schon klar sind, bevor die Rechtsfrage gestellt wird. Das Gesetz und die daraus folgenden Pflichten verlieren ihren Schrecken — nicht, weil sie verschwinden, sondern weil die Arbeit vorbereitet und steuerbar ist. Das Ergebnis ist nicht nur Compliance mit weniger Reibung, sondern ein werthaltigerer Prozess und ein besseres Produkt für Kunden und Unternehmen.

Ich schreibe das bewusst aus einer operativen Perspektive. Ich bin kein Jurist. Seit zehn Jahren arbeite ich als Datenschutzmanager auf der Umsetzungsseite: zuerst mit der Einführung und dem Alltag der DSGVO ab 2016, danach am Aufbau eines Datenschutz-Managementsystems, und seitdem im täglichen Inlife sowie in zahlreichen Transformationsprojekten. Dort habe ich die Facetten des Datenschutzes vor allem dort kennengelernt, wo Prozesse entstehen und scheitern — in den Fachbereichen, nicht nur in der Rechtsabteilung.

Lesen Sie dieses Buch, wenn Sie Datenschutz als Teil von Prozessqualität und Kundennutzen führen wollen — nicht als Sonderwelt der Rechtsabteilung. Wenn Sie nach der Lektüre Zweck vor Erhebung stellen, Risiken und Nachweise in den Datenfluss einbauen und Juristinnen und Juristen mit besseren Unterlagen einbinden können, hat das Buch sein Ziel erreicht.`;

/**
 * Klappentext: website pain without unverifiable „9 von 10“, two levers, outcomes, audience.
 */
const SUMMARY = `Datenschutz wird teuer, wo er zu spät ansetzt: Spezifikationen liegen erst in der Freigabe auf dem Tisch, Rituale ersetzen Wirkung, und ungenutzte Datenbestände treiben Kosten ohne Nutzen. Viele Privacy-Probleme sind keine Paragrafenrätsel, sondern Prozessverschwendung, Qualitätsmängel und schlechtes Systemdesign.

Dieses Buch holt das Thema aus der juristischen Isolierzelle und koppelt zwei Hebel: Privacy Value Thinking als Mindset (zuerst Kundennutzen und Prozessqualität, dann die Daten) und Value-Driven Privacy (VDP) als Handwerkszeug aus Lean, Qualität und UX am Datenfluss. So denken Sie Prozesse von Anfang an so durch, dass die juristische Prüfung später schneller, günstiger und mit klareren Unterlagen läuft — nicht als Ersatz fürs Recht, sondern als Vorsprung.

Ihr Ergebnis:
1. Schnellerer Durchsatz: weniger digitaler Datenballast, klarere Rollouts.
2. Audit-feste Abläufe: funktionierende Routinen statt Papier-Compliance.
3. Belastbares Vertrauen: Risiken aus Kundensicht steuern — Vorteil im B2B- und B2C-Geschäft.

Für Ops, Qualitäts- und Prozessmanager, Product Owner, CX/Service und Geschäftsführung im Mittelstand. Kein Kommentar für Paragrafenreiter, sondern Praxis für alle, die Abläufe und digitale Produkte wirtschaftlich gestalten. Schwierige Grenzfragen bleiben Sache von Juristinnen und Juristen — auf einer belastbaren Grundlage.`;

const VORWORT_SECTION = `### Vorwort (verbindlich für Export / Titelei)
Das Vorwort ist Teil der Idee — nicht Dekoration. Es muss den USP, die Abgrenzung und den Autor-Standpunkt tragen. Verbindlicher Vorwort-Text:

<<<VORWORT
${VORWORT}
VORWORT>>>

**Markenkern (wie privacyvalue.de):**
- Zwei Hebel: Privacy Value Thinking (Mindset) + Value-Driven Privacy / VDP (Praxis).
- Ehrliche Einschränkung: bester Start, aber kein Ersatz für Jura und Dokumentationspflichten.
- Zielgruppe: Ops, QM, Product, CX, GF Mittelstand — Juristen gezielt einbinden.

**Buch-USP im Vorwort:**
- Qualitäts-Pyramide (Fundament · Lean-Motor · Kundenergebnis) + KlarNetz AG.
- Gegen Jura-Kommentar, Checklisten ohne Theorie, Bußgeld-Angst und reines Security-Handbuch.`;

async function main() {
  const book = await getSachbuchKontext(FULL_ID);
  if (!book) throw new Error("Hauptband nicht gefunden");

  let briefing = book.idee.briefing.trim();
  const vorwortBlockRe = /### Vorwort[\s\S]*?(?=\n### |\n## [^#]|$)/;
  if (vorwortBlockRe.test(briefing)) {
    briefing = briefing.replace(vorwortBlockRe, `${VORWORT_SECTION}\n\n`);
  } else {
    briefing = `${briefing}\n\n${VORWORT_SECTION}`;
  }

  await patchSachbuchBook(FULL_ID, {
    idee: {
      ...book.idee,
      briefing: briefing.trim() + "\n",
    },
  });

  const refreshed = await getSachbuchKontext(FULL_ID);
  if (!refreshed) throw new Error("reload failed");

  await upsertSachbuchExport({
    id: FULL_ID,
    summary: SUMMARY,
    vorsatz: {
      ...refreshed.export.vorsatz,
      vorwort: VORWORT,
      impressum: buildSachbuchImpressum({
        jahr: refreshed.export.vorsatz.impressum.jahr,
        autorPseudonym: refreshed.export.vorsatz.titelseite.autor,
      }),
    },
  });

  const full = await getSachbuchKontext(FULL_ID);
  if (!full) throw new Error("full missing");

  // Kompakt: own Vorwort template + Klappe from builder (inherits new summary)
  const compact = await getSachbuchKontext(COMPACT_ID);
  if (compact) {
    const copy = buildSachbuchCompactEditionCopy(full);
    await upsertSachbuchExport({
      id: COMPACT_ID,
      subtitle: copy.subtitle,
      summary: copy.summary,
      keywords: copy.keywords,
      vorsatz: {
        ...compact.export.vorsatz,
        motto: copy.motto || compact.export.vorsatz.motto,
        vorwort: copy.vorwort,
      },
    });
  }

  const compactDone = await getSachbuchKontext(COMPACT_ID);
  const teaser = await getSachbuchKontext(TEASER_ID);
  if (teaser && compactDone) {
    const copy = buildSachbuchTeaserEditionCopy(compactDone);
    await upsertSachbuchExport({
      id: TEASER_ID,
      subtitle: copy.subtitle,
      summary: copy.summary,
      keywords: copy.keywords,
      vorsatz: {
        ...teaser.export.vorsatz,
        motto: copy.motto || teaser.export.vorsatz.motto,
        vorwort: copy.vorwort,
      },
    });
  }

  const check = await getSachbuchKontext(FULL_ID);
  console.log(
    JSON.stringify(
      {
        vorwortChars: check!.export.vorsatz.vorwort.length,
        summaryChars: check!.export.summary.length,
        hasLeanPrivacy: check!.export.vorsatz.vorwort.includes("Lean Privacy"),
        hasPVT: check!.export.vorsatz.vorwort.includes("Privacy Value Thinking"),
        hasVDP: check!.export.vorsatz.vorwort.includes("Value-Driven Privacy"),
        hasEhrlich: check!.export.vorsatz.vorwort.includes("ehrlich zugeben"),
        hasNeunVonZehn: check!.export.summary.includes("neun von zehn"),
        compactVorwortCut: (await getSachbuchKontext(COMPACT_ID))!
          .export.vorsatz.vorwort.includes("baut Büro"),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
