import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  let t = sachbuchKapitelBodyText(book.kapitel[0]!);
  const brackets = [...t.matchAll(/\[[^\]]{3,120}\]/g)].map((m) => m[0]);
  console.log("brackets", brackets);

  const before = t;
  t = t.replace(/\[((?:Abbildung|Tabelle|Platzhalter)[^\]]*)\]/g, "$1");
  // any other editorial brackets
  t = t.replace(/\[([^\]]{10,120})\]/g, "$1");

  // KlarNetz boilerplate in Kap1 is OK (home) — leave 600k

  if (t !== before) {
    const k = book.kapitel[0]!;
    const now = new Date().toISOString();
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: t,
        improvedAt: now,
        changeOrders: [],
        gaps: [],
      },
      finalText: t,
      updatedAt: now,
    });
    console.log("patched", [...t.matchAll(/\[[^\]]{3,80}\]/g)].map((m) => m[0]));
  }

  // verify all chapters
  const v = (await getSachbuchKontext(ID))!;
  console.log("book orders", v.idee.manuscriptReview?.changeOrders?.length ?? 0);
  for (let i = 0; i < v.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(v.kapitel[i]!);
    const b = [...body.matchAll(/\[[^\]]{3,80}\]/g)].map((m) => m[0]);
    const satz = /Buchsatz|Satzanfänge im Druckbild/i.test(body);
    const montag = /Drei Schritte für den Montagmorgen|Werkzeugkasten für den sofortigen/i.test(
      body,
    );
    const n600 = (body.match(/600[.\s]?000/g) ?? []).length;
    if (b.length || satz || montag || (i >= 2 && n600 > 2)) {
      console.log(`K${i + 1}: brackets=${b.length} satz=${satz} montag=${montag} 600k×${n600}`, b.slice(0, 3));
    } else {
      console.log(`K${i + 1}: clean 600k×${n600}`);
    }
  }

  // pyramid check
  const k1 = sachbuchKapitelBodyText(v.kapitel[0]!);
  const k2 = sachbuchKapitelBodyText(v.kapitel[1]!);
  const k3 = sachbuchKapitelBodyText(v.kapitel[2]!);
  console.log(
    "\nK1 motor range 3-6:",
    /Kapiteln drei bis sechs/.test(k1),
    "K1 fund 1+2:",
    /Kapitel eins und Kapitel zwei|Fundament aus Kapitel eins/.test(k1),
  );
  console.log(
    "K2 last:",
    k2.split(/\n\n+/).at(-1)?.slice(0, 220).replace(/\s+/g, " "),
  );
  console.log(
    "K3 last:",
    k3.split(/\n\n+/).at(-1)?.slice(0, 220).replace(/\s+/g, " "),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
