import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const RE =
  /Schritt 1:|Quick-Start|Werkzeugkasten für den|laden Sie|Beginnen Sie (stattdessen|mit)|Gehen Sie gemeinsam|Nehmen Sie sich|Verankern Sie|Wählen Sie (Ihr|das nächste)|in dieser Woche|am kommenden Montag|sofort wirksamen|Handlungsanleitung|Hausaufgabe|Praxisauftrag/gi;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits: string[] = [];
    const copy = new RegExp(RE.source, RE.flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(body))) {
      // ignore mid-chapter narrative Monday
      if (m[0] === "am kommenden Montag" || /Montagmorgen/.test(m[0])) {
        /* still report */
      }
      hits.push(
        `${m[0]} :: ${body.slice(Math.max(0, m.index - 30), m.index + 90).replace(/\s+/g, " ")}`,
      );
    }
    if (hits.length) {
      console.log(`\nK${i + 1} (${hits.length})`);
      for (const h of hits.slice(0, 8)) console.log(" ", h);
    } else {
      console.log(`K${i + 1}: none`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
