/**
 * Locate concrete spots for the 6 open book change-orders.
 */
import { writeFileSync } from "node:fs";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function snips(body: string, re: RegExp, max = 8): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = copy.exec(body)) && out.length < max) {
    out.push(
      body
        .slice(Math.max(0, m.index - 60), m.index + m[0].length + 140)
        .replace(/\s+/g, " "),
    );
  }
  return out;
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const report: Record<string, unknown> = {
    bookOrders: book.idee.manuscriptReview?.changeOrders ?? [],
  };

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const body = sachbuchKapitelBodyText(book.kapitel[i]!);
    const kap = i + 1;
    report[`K${kap}`] = {
      satzanweisung: snips(
        body,
        /Buchsatz|Druckbild|Satzanfänge|optisch als Anker|für den Setzer|Platzhalter|Callout|\[Abbildung|\[Tabelle|QR-Code|Begleit-Website|Download-Link/gi,
      ),
      klarnetz: snips(
        body,
        /600[.\s]?000|KlarHome|mittelständischer .{0,40}Anbieter|rund (sechs)?hunderttausend/gi,
      ),
      pyramid: snips(
        body,
        /Kapitel (zwei|2|drei|3).{0,80}(Fundament|Motor)|Motor.{0,40}Kapitel|Fundament.{0,40}Kapitel/gi,
      ),
      leanEcho: snips(
        body,
        /1-10-100|Poka-Yoke.{0,40}(übersetzt|japanisch|vermeidung)|Muda.{0,40}(genannt|bezeichnet|Lehre)|Shigeo Shingo/gi,
      ),
      montag: snips(
        body,
        /Montagmorgen|30-60-90|Tage 1 bis 30|in dieser Woche mit drei/gi,
      ),
      brackets: [...body.matchAll(/\[[^\]]{3,80}\]/g)].slice(0, 20).map((m) => m[0]),
    };
  }

  writeFileSync("scripts/tmp-6-orders-scan.json", JSON.stringify(report, null, 2), "utf8");

  for (let i = 1; i <= 9; i += 1) {
    const r = report[`K${i}`] as {
      satzanweisung: string[];
      klarnetz: string[];
      brackets: string[];
      montag: string[];
      pyramid: string[];
      leanEcho: string[];
    };
    console.log(
      `K${i}: satz=${r.satzanweisung.length} klarnetz=${r.klarnetz.length} brackets=${r.brackets.length} montag=${r.montag.length} pyramid=${r.pyramid.length} lean=${r.leanEcho.length}`,
    );
    if (r.brackets.length) console.log("  brackets:", r.brackets.join(" | "));
    if (r.satzanweisung.length) console.log("  satz0:", r.satzanweisung[0]?.slice(0, 160));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
