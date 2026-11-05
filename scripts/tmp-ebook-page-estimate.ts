/**
 * Tolino Media eBook Normseitenzahl: Zeichen inkl. Leerzeichen / 2200
 * (+ ~0.5–1 Seite je Abbildung).
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { sachbuchKapitelInfografiken } from "../src/lib/sachbuch/parse";
import { sachbuchSpokenPlainText } from "../src/lib/sachbuch/hoerbuch";

const IDS = {
  full: "1640c419-5f83-4c62-a25b-d57190727fa4",
  compact: "47194844-8130-4938-91ae-d6cddd14abe4",
  teaser: "34128455-4057-4ce4-bee2-3f5dc0f96e62",
} as const;

async function estimate(id: string) {
  const book = await getSachbuchKontext(id);
  if (!book) throw new Error(id);
  const parts: string[] = [];
  const vorwort = book.export.vorsatz.vorwort?.trim() ?? "";
  if (vorwort) parts.push(vorwort);
  const motto = book.export.vorsatz.motto?.trim() ?? "";
  if (motto) parts.push(motto);
  let figs = 0;
  for (const k of book.kapitel) {
    parts.push(k.title);
    parts.push(sachbuchSpokenPlainText(sachbuchKapitelExportBody(k)));
    figs += sachbuchKapitelInfografiken(k).length;
  }
  const text = parts.join("\n\n");
  const chars = text.length;
  const pagesText = chars / 2200;
  const pagesLow = Math.round(pagesText + figs * 0.5);
  const pagesHigh = Math.round(pagesText + figs * 1);
  return {
    edition: book.idee.edition,
    title: book.title,
    chars,
    words: text.split(/\s+/).filter(Boolean).length,
    figs,
    pagesText: Math.round(pagesText),
    recommend: pagesLow === pagesHigh ? pagesLow : `${pagesLow}–${pagesHigh}`,
    suggest: Math.round((pagesLow + pagesHigh) / 2),
  };
}

async function main() {
  const out = [];
  for (const id of Object.values(IDS)) out.push(await estimate(id));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
