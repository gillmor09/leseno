/**
 * Sharpen Klappentext with one sales line: legal review gets easier/cheaper/better.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-klappentext-half.ts
 */
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const SUMMARY = `In fast neun von zehn Unternehmen bremst der Datenschutz Prozesse aus und verzögert Produkt-Rollouts. Warum? Weil er als nachgelagerte juristische Prüfaufgabe verwaltet wird. Doch viele Privacy-Probleme sind keine Paragrafenrätsel, sondern teure Prozessverschwendung, Qualitätsmängel und schlechtes Systemdesign.

Dieses Buch holt das Thema aus der juristischen Isolierzelle und koppelt zwei Hebel: „Privacy Value Thinking“ als strategisches Mindset (zuerst Kundennutzen und Prozessqualität klären, dann die Daten) und „Value-Driven Privacy“ (VDP) als operatives Handwerkszeug aus Lean Management, QM und UX. So denken Sie Prozesse von Anfang an so durch, dass die juristische Prüfung später schneller, günstiger und mit klareren Unterlagen läuft — nicht als Ersatz, sondern als Vorsprung.

Ihr Ergebnis:
1. Schnellerer Durchsatz: Sie beseitigen digitalen Datenballast, senken IT-Kosten und beschleunigen Rollouts.
2. Audit-feste Abläufe: Sie ersetzen wirkungslose Papier-Compliance durch funktionierende Routinen im laufenden Betrieb.
3. Belastbares Vertrauen: Sie steuern Risiken aus Kundensicht und sichern sich entscheidende Vorteile im B2B- und B2C-Geschäft.

Geschrieben für Geschäftsführung, Operations, Qualitäts- und Prozessmanager sowie Product Owner im Mittelstand. Kein juristischer Kommentar für Paragrafenreiter, sondern das Praxis-Handbuch für alle, die Abläufe und digitale Produkte wirtschaftlich gestalten.`;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  await upsertSachbuchExport({
    id: ID,
    summary: SUMMARY,
  });

  const done = await getSachbuchKontext(ID);
  if (!done) throw new Error("reload failed");
  const s = done.export.summary;
  console.log(
    JSON.stringify(
      {
        chars: s.length,
        words: s.trim().split(/\s+/).length,
        hasVorsprung: s.includes("juristische Prüfung später schneller"),
        hasNichtErsatz: s.includes("nicht als Ersatz"),
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
