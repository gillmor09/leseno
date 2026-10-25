import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t5 = b.kapitel[4]!.manuscript.improvedText;
  const needle =
    "Aus dem einstigen Deal-Killer Datenschutz war ein schlagkräftiges Verkaufsargument im Wettbewerb geworden.";
  const i = t5.indexOf(needle);
  console.log("idx", i);
  console.log(t5.slice(i, i + 900));

  const t1 = b.kapitel[0]!.manuscript.improvedText.slice(0, 800);
  console.log("\n=== Kap1 open ===\n", t1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
