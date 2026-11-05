import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  const k = book!.kapitel[4]!;
  let t = sachbuchKapitelBodyText(k);
  const swaps: Array<[string, string]> = [
    [
      "dessen exklusiver, buchweiter 90-Tage-Rollout erst in Kapitel 9 gezogen wird",
      "dessen exklusives, buchweites Transformationsprogramm erst in Kapitel 9 gezogen wird",
    ],
    [
      "bevor Kapitel 9 den buchweiten 90-Tage-Rollout als Gesamtprogramm aufzieht",
      "bevor Kapitel 9 das buchweite Transformationsprogramm als Gesamt-Rollout aufzieht",
    ],
  ];
  for (const [a, b] of swaps) {
    if (!t.includes(a)) {
      console.log("MISS", a);
      continue;
    }
    t = t.split(a).join(b);
    console.log("OK", a.slice(0, 60));
  }
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: { ...k.manuscript, improvedText: t, improvedAt: now },
    updatedAt: now,
  });
  console.log("K5 90-Tage-Rollout left:", [...t.matchAll(/90-Tage-Rollout/gi)].length);
  const t9 = sachbuchKapitelBodyText(book!.kapitel[8]!);
  console.log(
    "K9 90-Tage-Rollout count:",
    [...t9.matchAll(/90-Tage-Rollout/gi)].length,
  );
}

main();
