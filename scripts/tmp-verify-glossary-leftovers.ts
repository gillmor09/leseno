/**
 * Second pass: leftover first-time glossary/study phrasing after callbacks.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-verify-glossary-leftovers.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const FIRST_TIME = [
  /übersetzt so viel/i,
  /japanisch für/i,
  /Ursprünglich in der japanischen/i,
  /physischen Produktionsbetrieb/i,
  /Shigeo Shingo/i,
  /Labovitz|Yu Sang Chang/i,
  /W\. Edwards Deming prägte/i,
  /ein weiterer Pfeiler des Toyota/i,
  /durchschnittliche Warenkorb.{0,40}siebenzig|siebzig Prozent/i,
  /1,6- bis 2-F/i,
  /1\.500 US-Dollar pro Vorgang/i,
];

const PASS2: Record<number, Array<{ find: string; to: string }>> = {
  6: [
    {
      find: "Hier greift die 1-10-100-Regel unmittelbar:",
      to: "Hier greift die 1-10-100-Regel aus Kapitel 1 unmittelbar:",
    },
    {
      find: "Die ökonomische Rechnung nach der 1-10-100-Regel spricht für sich selbst.",
      to: "Die ökonomische Rechnung nach der 1-10-100-Regel aus Kapitel 1 spricht für sich selbst.",
    },
    {
      find: "Das Marktforschungsinstitut Gartner beziffert die jährlichen Verluste, die Unternehmen durch mangelhafte Datenqualität erleiden, auf durchschnittlich 12,9 Millionen US-Dollar",
      to: "Gartner, bereits in Kapitel 1 zur Dark-Data-Lage herangezogen, beziffert die jährlichen Verluste durch mangelhafte Datenqualität auf durchschnittlich 12,9 Millionen US-Dollar",
    },
  ],
  8: [
    {
      find: "Wie die bereits an anderer Stelle dieses Buches herangezogenen Wirtschaftlichkeitsberechnungen aus der Cisco Data Privacy Benchmark Study verdeutlichen,",
      to: "Wie die Cisco-ROI-Rechnung aus Kapitel 1 verdeutlicht,",
    },
  ],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const leftover: Array<{ kap: number; hit: string; snip: string }> = [];
  const applied: Array<{ kap: number; n: number }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    let body = sachbuchKapitelBodyText(k);
    const kap = i + 1;
    for (const re of FIRST_TIME) {
      const m = body.match(re);
      if (m && kap >= 3) {
        const idx = body.search(re);
        leftover.push({
          kap,
          hit: m[0],
          snip: body.slice(Math.max(0, idx - 80), idx + 180).replace(/\s+/g, " "),
        });
      }
    }
    const swaps = PASS2[kap];
    if (!swaps?.length) continue;
    let n = 0;
    for (const s of swaps) {
      if (body.includes(s.find)) {
        body = body.replace(s.find, s.to);
        n += 1;
      }
    }
    if (n === 0) {
      applied.push({ kap, n: 0 });
      continue;
    }
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: body,
        improvedAt: now,
      },
      finalText: body,
      updatedAt: now,
    });
    applied.push({ kap, n });
  }

  console.log(JSON.stringify({ leftover, applied }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
