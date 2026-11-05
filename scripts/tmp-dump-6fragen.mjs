import { getSachbuchKontext } from "../src/lib/sachbuch/repository.ts";
import { writeFileSync } from "node:fs";
const book = await getSachbuchKontext("47194844-8130-4938-91ae-d6cddd14abe4");
const text = (book?.kapitel ?? []).map((k) => k.finalText || "").join("\n");
const start = text.indexOf("Erstens klärt das Team in Feld 1");
const end = text.indexOf("Damit wird gelebte Speicherbegrenzung", start);
const slice = text.slice(start, end + 120);
writeFileSync("scripts/tmp-kompakt-6fragen.txt", slice, "utf8");
console.log(slice);
