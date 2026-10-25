import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t4 = b.kapitel[3]!.manuscript.improvedText;
  const t5 = b.kapitel[4]!.manuscript.improvedText;

  const slices: [string, string, number, number][] = [
    ["K4 ROT week2", t4, 2750, 3200],
    ["K4 Muda Überbearbeitung", t4, 14380, 14780],
    ["K4 Poka intro+Japan", t4, 16520, 17200],
    ["K5 Muda open", t5, 700, 1000],
    ["K5 Poka Datenminimierung", t5, 4500, 4900],
    ["K5 Databerg", t5, 9950, 10350],
    ["K5 Poka Gateway", t5, 36080, 37050],
    ["K5 ConnectTel fallstudie end", t5, 31200, 32500],
    ["K5 before Mittelstands", t5, 73600, 74500],
    ["K5 before Montagblatt", t5, 75600, 76800],
  ];

  for (const [label, t, a, b2] of slices) {
    console.log(`\n======== ${label} ========`);
    console.log(t.slice(a, b2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
