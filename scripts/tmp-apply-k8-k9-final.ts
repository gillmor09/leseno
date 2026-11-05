/**
 * Final: K8 drop Montagmorgen; K9 organic chapter back-refs.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-k8-k9-final.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";
import type { SachbuchKontext } from "../src/lib/sachbuch/types";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

async function load(): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  return book;
}

async function apply(chapter1: number, swaps: Swap[]): Promise<void> {
  const book = await load();
  const k = book.kapitel[chapter1 - 1]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;
  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log(`K${chapter1} MISS: ${s.find.slice(0, 90)}`);
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log(`K${chapter1} OK: ${s.find.slice(0, 70)}`);
  }
  if (text === before) return;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      draftText: k.manuscript.draftText || before,
      improvedAt: now,
    },
    updatedAt: now,
  });
}

async function main() {
  await apply(8, [
    {
      find: "Widerruft eine Kundin ihre Einwilligung am Montagmorgen, erreicht sie am Dienstagmorgen dennoch die automatisierte Rabatt-Mail, weil der nächtliche Datenabgleich scheiterte oder die bereits scharfgeschaltete Versandwarteschlange unberührt blieb.",
      to: "Widerruft eine Kundin ihre Einwilligung, erreicht sie am Folgetag dennoch die automatisierte Rabatt-Mail, weil der nächtliche Datenabgleich scheiterte oder die bereits scharfgeschaltete Versandwarteschlange unberührt blieb.",
    },
  ]);

  await apply(9, [
    {
      find: "Value-Driven Privacy übersetzt diese Haltung in die dreistufige Pyramide der vorangegangenen Kapitel: Fundament (Kapitel 1–2), Motor (Kapitel 3–6) und Kundenergebnis (Kapitel 7–8).",
      to: "Value-Driven Privacy übersetzt diese Haltung in die dreistufige Pyramide der vorangegangenen Kapitel: Fundament, Motor und Kundenergebnis.",
    },
    {
      find: "Noch während die große Trockenlegung der Support-Archive (Kapitel 5) vorbereitet wurde",
      to: "Noch während die große Trockenlegung der Support-Archive vorbereitet wurde",
    },
    {
      find: "Genau dieser Beinahe-Vorfall machte die in Kapitel 5 erzählte Trockenlegung der 45.000 Ausweis-Scans und verwandter Altbestände zur Pflicht",
      to: "Genau dieser Beinahe-Vorfall machte die Trockenlegung der 45.000 Ausweis-Scans und verwandter Altbestände im Support zur Pflicht",
    },
    {
      find: "das Fundament für jene reibungslose Systemmigration im zweiten Jahr nach dem in Kapitel 5 etablierten Bereinigungsprojekt.",
      to: "das Fundament für jene reibungslose Systemmigration im zweiten Jahr nach dem etablierten Support-Bereinigungsprojekt.",
    },
    {
      find: "Dynamische Risikoeinstufung dockt nahtlos an die internen Pfade der Risiko-Ampel aus Kapitel 2 an, statt neue Formularberge zu erzwingen.",
      to: "Dynamische Risikoeinstufung dockt nahtlos an die internen Pfade der bereits etablierten Risiko-Ampel an, statt neue Formularberge zu erzwingen.",
    },
    {
      find: "Wie die in Kapitel 2 herangezogenen Erhebungen von IBM und dem Ponemon Institute zeigen,",
      to: "Wie die Erhebungen von IBM und dem Ponemon Institute zeigen,",
    },
    {
      find: "wie die in Kapitel 7 beleuchteten Erhebungen des State of Digital Trust Report 2024 von Usercentrics und Sapio Research beziffern:",
      to: "wie die Erhebungen des State of Digital Trust Report 2024 von Usercentrics und Sapio Research beziffern:",
    },
    {
      find: "dockt ab Monat 2 die in Kapitel 5 erprobte dreistufige Architektur-Bereinigung nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an",
      to: "dockt ab Monat 2 die im Support erprobte dreistufige Architektur-Bereinigung nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an",
    },
    {
      find: "Parallel dazu klinkt sich in dieser Phase die in Kapitel 5 erprobte Architektur-Bereinigung als spezialisierter technischer Arbeitsstrang ein:",
      to: "Parallel dazu klinkt sich in dieser Phase die im Support erprobte Architektur-Bereinigung als spezialisierter technischer Arbeitsstrang ein:",
    },
    {
      find: "wodurch die aus Kapitel 1 bekannte 1-10-100-Regel der Qualitätskosten direkt in der täglichen Sprint-Planung wirksam wird:",
      to: "wodurch die bekannte 1-10-100-Regel der Qualitätskosten direkt in der täglichen Sprint-Planung wirksam wird:",
    },
  ]);

  const book = await load();
  const t8 = sachbuchKapitelBodyText(book.kapitel[7]!);
  const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
  console.log("\nK8 Montagmorgen left:", t8.includes("Montagmorgen"), "Dienstagmorgen:", t8.includes("Dienstagmorgen"));
  console.log("K9 'Kapitel' leftovers:");
  let from = 0;
  while (true) {
    const i = t9.indexOf("Kapitel", from);
    if (i < 0) break;
    console.log(" ", JSON.stringify(t9.slice(Math.max(0, i - 40), i + 80)));
    from = i + 7;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
