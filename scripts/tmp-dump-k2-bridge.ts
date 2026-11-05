import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const body = sachbuchKapitelBodyText(book!.kapitel[1]!);
  const start = body.indexOf(
    "Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf",
  );
  const alt = body.indexOf("ist die erste Ebene unseres Systems vollständig austariert");
  const idx = start >= 0 ? start : alt;
  console.log("idx", idx, "start", start, "alt", alt);
  if (idx >= 0) {
    console.log(body.slice(idx));
  } else {
    // find any fundament-complete language near end
    const i = body.lastIndexOf("Fundament");
    console.log(body.slice(Math.max(0, i - 200), i + 800));
  }
}

main().catch(console.error);
