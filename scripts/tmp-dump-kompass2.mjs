import { getSachbuchKontext } from "../src/lib/sachbuch/repository.ts";
import { writeFileSync } from "node:fs";
const book = await getSachbuchKontext("47194844-8130-4938-91ae-d6cddd14abe4");
const text = (book?.kapitel ?? []).map((k) => `\n\n===== ${k.title} =====\n${k.finalText || ""}`).join("");
writeFileSync("scripts/tmp-kompakt-full.txt", text, "utf8");
const idx = text.indexOf("Feld 1:");
const alt = text.search(/Sechs-Fragen|Prozesskompass|Privacy Solution Canvas/);
console.log({ len: text.length, feld1: idx, canvasLike: alt });
if (idx >= 0) writeFileSync("scripts/tmp-kompakt-felder.txt", text.slice(idx, idx + 4000), "utf8");
else {
  // dump contexts around Kompass
  const re = /.{0,80}(Sechs-Fragen|Prozesskompass|Leitfrage|Feld [1-6]).{0,200}/gi;
  const hits = [...text.matchAll(re)].slice(0, 30).map((m) => m[0].replace(/\s+/g, " "));
  writeFileSync("scripts/tmp-kompakt-felder.txt", hits.join("\n---\n"), "utf8");
}
console.log("wrote");
