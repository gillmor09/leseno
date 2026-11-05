/**
 * Anchor Vorwort in Idee (USP + Abgrenzung) and sync export.vorsatz.vorwort.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-vorwort-in-idee.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

/**
 * Binding preface — prefer `tmp-apply-vorwort-disclaimer.ts` as source of truth
 * (Autor-Standpunkt + kein Ersatz für juristische Prüfung).
 */
const VORWORT = `Dieses Buch ist kein weiteres Datenschutz-Handbuch für Juristen — und keine Checkliste zum Abhaken.

Es stellt eine unbequeme Behauptung in den Raum: Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler. Falsche Daten sind Ausschuss. Überflüssige Felder sind Verschwendung. Undurchsichtige Klauseln sind schlechtes Design. Fehlende Löschung ist unterlassenes Lifecycle-Management. Fehlende Dokumentation ist ein gebrochenes Qualitätsprinzip. Wer nur Paragrafen sieht, übersieht die Wertschöpfung. Wer nur Checklisten abarbeitet, baut keine steuerbare Organisation.

Der USP dieses Buches ist die Qualitäts-Pyramide in einem Band. Unten das Fundament: Rechtmäßigkeit, Rechenschaft und Integrität in der Sprache von Enterprise Risk Management und ISO-/PDCA-Denken. In der Mitte der Lean-Motor: Zweckbindung, Minimierung, Speicherbegrenzung und Richtigkeit als Waste Reduction, Data Lifecycle und Fehlervermeidung — mit Werkzeugen, die Sie montags anwenden können. Oben das Kundenergebnis: Transparenz und Fairness als Design Thinking und Customer Experience, für Vertrauen und Conversion. Jedes DSGVO-Prinzip bekommt ein methodisches Gegenstück aus Lean, TQM, UX, ERM oder Data Governance — nicht als Dekoration, sondern als Steuerungslogik.

Damit grenzt sich Lean Privacy klar ab. Es ersetzt keine Rechtsberatung und kommentiert keine Artikelkette. Es ist kein Bußgeld-Angstbuch und kein Security-Technikhandbuch. Es ist auch keine Sammlung von One-Pager-Checklisten ohne Handlungstheorie. Stattdessen bekommen Ops-, Qualitäts-, Product- und Geschäftsführungsleser eine gemeinsame Sprache für Datenflüsse: Diagnose, Hebel, Mapping-Matrix und ein fiktives Composite-Unternehmen — die KlarNetz AG —, an dem Sie sehen, wie Fundament, Motor und Kundenergebnis zusammenwirken.

Wichtig ist, was dieses Buch nicht ist: Die Umsetzung von Inhalten aus diesem Buch ersetzt in keiner Weise eine juristische Prüfung. Es liefert keine Rechtsmeinung, keine Freigabe und keinen Ersatz für die Bewertung konkreter Sachverhalte durch fachkundige Juristinnen und Juristen. Sein Zweck ist ein anderer. Es hilft, Datenschutz als Mehrwert zu verstehen und Prozesse von Anfang an so aufzubauen und zu durchdenken, dass eine spätere juristische Prüfung um ein Vielfaches leichter, günstiger und hochwertiger werden kann — weil Zweck, Datenfluss, Rollen, Nachweise und Löschlogik schon klar sind, bevor die Rechtsfrage gestellt wird.

Ich schreibe das bewusst aus einer operativen Perspektive. Ich bin kein Jurist. Seit zehn Jahren arbeite ich als Datenschutzmanager auf der Umsetzungseite: zuerst mit der Einführung und dem Alltag der DSGVO ab 2016, danach am Aufbau eines Datenschutz-Managementsystems, und seitdem im täglichen Inlife sowie in zahlreichen Transformationsprojekten. Dort habe ich die Facetten des Datenschutzes vor allem dort kennengelernt, wo Prozesse entstehen und scheitern — in den Fachbereichen, nicht nur in der Rechtsabteilung.

Lesen Sie dieses Buch, wenn Sie Datenschutz als Teil von Prozessqualität und Kundennutzen führen wollen — nicht als Sonderwelt der Rechtsabteilung. Wenn Sie nach der Lektüre jedes Kernprinzip in Lean-, Qualitäts- und Design-Sprache übersetzen und in derselben Pyramide steuern können, hat das Buch sein Ziel erreicht. Und wenn Ihre Juristinnen und Juristen danach schneller, präziser und mit besseren Unterlagen prüfen können, hat es seinen Auftrag erfüllt.`;

const VORWORT_SECTION = `### Vorwort (verbindlich für Export / Titelei)
Das Vorwort ist Teil der Idee — nicht Dekoration. Es muss den USP und die Abgrenzung tragen. Verbindlicher Vorwort-Text:

<<<VORWORT
${VORWORT}
VORWORT>>>

**USP, den das Vorwort herausstellen muss:**
- Ein Band, drei Pyramidenebenen (Fundament · Lean-Motor · Kundenergebnis) statt isolierter Lean- oder Jura-Perspektive.
- Jedes DSGVO-Prinzip mit methodischem Gegenstück (Lean / TQM-ISO / UX-Design Thinking / ERM / DLM-MDM).
- Operative Steuerungslogik für Macher: Diagnose → Hebel → Mapping — am Composite KlarNetz AG.
- Privacy-Probleme = Qualitäts- und Prozessfehler (Ausschuss, Muda, schlechtes UX, kaputtes Lifecycle, gebrochenes PDCA).

**Klare Abgrenzung (Vorwort und gesamtes Buch):**
- Gegen gängige Jura-Beratungsbücher: keine Artikel-Schlacht, kein Kommentarstil, keine Ersatz-Rechtsberatung, keine Urteilssammlungen.
- Gegen simple Checklisten-/One-Pager-Bücher: keine abhakbare Liste ohne Theorie und ohne Steuerungslogik; Werkzeuge folgen aus der Pyramide und der Matrix.
- Gegen Angst- und Bußgeld-Rhetorik sowie gegen reines IT-Security-Handbuch.
- Gegen „Folgeband / Vertiefung später“: Fundament, Motor und Kundenergebnis stehen in diesem einen Band.`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  let briefing = book.idee.briefing.trim();
  // Replace existing Vorwort section if present; else insert after Kernthese / before Buchform.
  const vorwortBlockRe =
    /### Vorwort[\s\S]*?(?=\n### |\n## [^#]|$)/;
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

  // Sharpen Abgrenzung section if present
  const abgrenzungNew = `### 5. Abgrenzung (auch im Vorwort sichtbar)
- **Kein Jura-Beratungshandbuch:** keine Paragrafen-Ketten, keine Gerichtsurteile, keine Erwägungsgründe, keine Ersatz-Rechtsberatung.
- **Keine simple Checkliste:** keine One-Pager zum Abhaken ohne Handlungstheorie; Artefakte und Sprints folgen aus Pyramide und Gegenstück-Matrix.
- **Kein IT-Security-Handbuch:** Technik nur soweit Kosten, Haftung, Freigabe und Resilienz betroffen sind.
- **Kein abstraktes Lean- oder UX-Lehrbuch:** immer am Datenfluss und an KlarNetz AG.
- **Kein Folgeband:** alle drei Pyramidenebenen in diesem Band.`;

  if (/### 5\. Abgrenzung[\s\S]*?(?=\n### |\n## [^#]|$)/.test(briefing)) {
    briefing = briefing.replace(
      /### 5\. Abgrenzung[\s\S]*?(?=\n### |\n## [^#]|$)/,
      `${abgrenzungNew}\n\n`,
    );
  }

  await patchSachbuchBook(ID, {
    idee: {
      ...book.idee,
      briefing: briefing.trim() + "\n",
    },
    stilbibel: [
      book.stilbibel.trim(),
      "Vorwort: USP (Qualitäts-Pyramide, Gegenstück-Matrix, operativer Steuerungsanspruch) und Abgrenzung zu Jura-Beratungsbüchern sowie simplen Checklisten — siehe Idee-Abschnitt „Vorwort (verbindlich)“.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const refreshed = await getSachbuchKontext(ID);
  if (!refreshed) throw new Error("nach Idee-Update nicht gefunden");

  await upsertSachbuchExport({
    id: ID,
    vorsatz: {
      ...refreshed.export.vorsatz,
      vorwort: VORWORT,
    },
  });

  const done = await getSachbuchKontext(ID);
  if (!done) throw new Error("final load failed");
  console.log(
    JSON.stringify(
      {
        hasVorwortInIdee: done.idee.briefing.includes("### Vorwort"),
        hasUspBlock: done.idee.briefing.includes("USP, den das Vorwort"),
        hasAbgrenzungJura: done.idee.briefing.includes("Jura-Beratungshandbuch"),
        briefingChars: done.idee.briefing.length,
        vorwortChars: done.export.vorsatz.vorwort.length,
        vorwortStartsWith: done.export.vorsatz.vorwort.slice(0, 120),
        stilbibelHasVorwort: done.stilbibel.includes("Vorwort: USP"),
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
