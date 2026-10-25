import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t1 = b.kapitel[0]!.manuscript.improvedText;
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  const t5 = b.kapitel[4]!.manuscript.improvedText;

  for (const [label, t, terms] of [
    ["K1", t1, ["Data Health Rate", "Cost per Dormant", "Unstructured Storage"]],
    [
      "K4",
      t4,
      [
        "Kennzahl 1",
        "Kennzahl 2",
        "Kennzahl 3",
        "Auskunfts-Durchlaufzeit",
        "Muda-Quote",
        "Latenzzeit",
        "Berechtigungsbereinigung",
      ],
    ],
    [
      "K5 intro",
      t5,
      [
        "Lead Time for Governance",
        "Index Freshness",
        "Sanitized Prompt",
        "Entschlackungsquote",
        "Frischegrad",
        "Freigabe-Durchlaufzeit",
      ],
    ],
  ] as const) {
    console.log(`\n######## ${label}`);
    for (const term of terms) {
      let i = 0;
      let c = 0;
      while ((i = t.indexOf(term, i)) >= 0 && c < 2) {
        console.log(
          `\n[${term} @${i}]\n` + t.slice(Math.max(0, i - 80), i + 220).replace(/\n/g, " / "),
        );
        i += term.length;
        c++;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
