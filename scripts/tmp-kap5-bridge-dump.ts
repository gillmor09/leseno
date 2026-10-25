import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontext(ID);
  if (!b) throw new Error("missing");
  const t = b.kapitel[4]!.manuscript.improvedText;
  const i = t.indexOf("Microsoft 365 Copilot");
  console.log("idx", i);
  console.log(t.slice(Math.max(0, i - 500), i + 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
