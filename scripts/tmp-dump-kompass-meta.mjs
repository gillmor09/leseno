import { getSachbuchKontext } from "../src/lib/sachbuch/repository.ts";
import { writeFileSync } from "node:fs";
const book = await getSachbuchKontext("47194844-8130-4938-91ae-d6cddd14abe4");
const chapters = book?.kapitel ?? [];
const meta = chapters.map((k) => ({
  title: k.title,
  keys: Object.keys(k),
  lens: Object.fromEntries(
    Object.entries(k).map(([key, val]) => [
      key,
      typeof val === "string" ? `str:${val.length}` : typeof val,
    ]),
  ),
}));
writeFileSync("scripts/tmp-kompakt-meta.json", JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
