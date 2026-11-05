import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const t5 = sachbuchKapitelBodyText(book!.kapitel[4]!);
  const t9 = sachbuchKapitelBodyText(book!.kapitel[8]!);

  for (const needle of [
    "90-Tage-Durchbruch",
    "90-Tage-Gesamtbilanz",
    "90-Tage-Sprint",
    "90-Tage-Rollout",
    "unternehmensweiten Rollout",
    "Welle des Rollouts",
    "neuen Rollout-Welle",
  ]) {
    let from = 0;
    let n = 0;
    while (true) {
      const i = t5.indexOf(needle, from);
      if (i < 0) break;
      n += 1;
      console.log(`\n--- K5 ${needle} #${n} @${i} ---`);
      console.log(t5.slice(Math.max(0, i - 120), i + needle.length + 280).replace(/\s+/g, " "));
      from = i + needle.length;
    }
    if (!n) console.log(`K5 missing: ${needle}`);
  }

  console.log("\n======== K9 refs to Kap5 / Rollout ========");
  for (const needle of [
    "90-Tage-Lösch-Sprint",
    "initialen Rollout",
    "Kapitel 5",
    "zweiten Jahr",
  ]) {
    let from = 0;
    let n = 0;
    while (true) {
      const i = t9.indexOf(needle, from);
      if (i < 0) break;
      n += 1;
      console.log(`\n--- K9 ${needle} #${n} ---`);
      console.log(t9.slice(Math.max(0, i - 100), i + needle.length + 220).replace(/\s+/g, " "));
      from = i + needle.length;
    }
  }
}

main();
