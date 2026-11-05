import { listSachbuchKontexte, getSachbuchKontext } from "../src/lib/sachbuch/repository.ts";
import { writeFileSync } from "node:fs";

const list = await listSachbuchKontexte();
writeFileSync("scripts/tmp-sachbuch-list.json", JSON.stringify(list.map(b => ({id:b.id,title:b.title})), null, 2));
const compact = list.find(b => /Kompakt/i.test(b.title));
if (!compact) { console.log("NO COMPACT"); process.exit(1); }
const book = await getSachbuchKontext(compact.id);
const chapters = book?.kapitel ?? [];
const blobs = chapters.map((k,i) => {
  const text = k.herstellung || k.final || k.improved || k.draft || "";
  return `\n\n===== K${i+1} ${k.title || ""} =====\n` + text;
}).join("");
writeFileSync("scripts/tmp-kompakt-full.txt", blobs, "utf8");
const idx = blobs.indexOf("Feld 1:");
writeFileSync("scripts/tmp-kompakt-felder.txt", idx>=0 ? blobs.slice(idx, idx+3500) : "NO FELD1", "utf8");
console.log("compact", compact.id, compact.title, "chapters", chapters.length, "feld1", idx);
