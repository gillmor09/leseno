import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const BAD =
  /Montagmorgen|Quick-Start|Praxis-Checkliste|Starten Sie noch in dieser Woche|Beenden Sie noch in dieser Woche|Formieren Sie noch in dieser Woche|Was Sie am nächsten Montag|Drei Schritte für den Montag|kommenden Arbeitswoche mit (vier|drei|fünf) konkreten|Warten Sie nicht auf das nächste/gi;

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  for (let i = 0; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const hits = [...body.matchAll(BAD)].map((m) => {
      const idx = m.index ?? 0;
      return `${m[0]} @ ${body.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, " ")}`;
    });
    const paras = body.split(/\n\n+/).filter(Boolean);
    console.log(
      `K${i + 1}: ${hits.length ? hits.join("\n  ") : "clean"} | last="${paras.at(-1)?.slice(0, 90).replace(/\s+/g, " ")}"`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
