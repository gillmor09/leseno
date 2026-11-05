import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  for (const n of [3, 6, 8]) {
    const t = sachbuchKapitelBodyText(book!.kapitel[n - 1]!);
    console.log("==== K" + n);
    for (const m of t.matchAll(/\([^)]{8,220}\)/g)) {
      if (/Kapitel|Durchsatz|Felder|Sales|hier geht|Wochen/i.test(m[0])) {
        console.log("()", m[0]);
      }
    }
    // longer windows around Kapitel mentions that sound editorial
    for (const m of t.matchAll(/[^.!?\n]{0,40}Kapitel \d[^.!?\n]{0,160}/g)) {
      if (/ist Kapitel|war Kapitel|bilanzen|noch nicht|hier geht|das war|aus Kapitel \d und/i.test(m[0])) {
        console.log("SENT:", m[0].replace(/\s+/g, " ").trim());
      }
    }
  }

  // K6 specific known string
  const t6 = sachbuchKapitelBodyText(book!.kapitel[5]!);
  const idx = t6.indexOf("Dass weniger Felder");
  console.log("\nK6 Dass weniger:", idx);
  if (idx >= 0) console.log(t6.slice(idx - 80, idx + 200));

  const t8 = sachbuchKapitelBodyText(book!.kapitel[7]!);
  const i8 = t8.indexOf("zu vielen Feldern");
  console.log("\nK8 zu vielen Feldern:", i8);
  if (i8 >= 0) console.log(t8.slice(i8 - 100, i8 + 180));

  const t3 = sachbuchKapitelBodyText(book!.kapitel[2]!);
  const i3 = t3.indexOf("noch nicht die gesamte Sales Velocity");
  console.log("\nK3 Sales Velocity meta:", i3);
  if (i3 >= 0) console.log(t3.slice(i3 - 120, i3 + 350));
}

main();
