import { resetSachbuchSchreibenProse } from "../src/lib/sachbuch/manuscript";
import { generateNextAbschnitt } from "../src/lib/sachbuch/abschnitte";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  SACHBUCH_ABSCHNITT_BATCH_MAX,
  SACHBUCH_KAPITEL_WORDS_TARGET,
  kapitelMeetsAbschnittVolumeTarget,
  recommendedMinAbschnitte,
} from "../src/lib/sachbuch/agent-defaults";
import { countKapitelAbschnitteWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Reset Schreiben (wipe Abschnitte + Manuskript)…");
  let book = await resetSachbuchSchreibenProse(ID);
  console.log("Reset ok, chapters", book.kapitel.length, new Date().toISOString());

  for (let ci = 0; ci < book.kapitel.length; ci++) {
    const kapitelId = book.kapitel[ci]!.id;
    const title = book.kapitel[ci]!.title;
    console.log(`\n=== Kapitel ${ci + 1}: ${title} ===`);

    for (let n = 0; n < SACHBUCH_ABSCHNITT_BATCH_MAX; n++) {
      book = (await getSachbuchKontext(ID))!;
      const kap = book.kapitel.find((k) => k.id === kapitelId)!;
      const words = countKapitelAbschnitteWords(kap.abschnitte);
      const claims = kap.contextGraph.claimsToProve.length;
      const min = recommendedMinAbschnitte(claims);
      if (
        kapitelMeetsAbschnittVolumeTarget({
          abschnitteCount: kap.abschnitte.length,
          words,
          claimsCount: claims,
        })
      ) {
        console.log(`Kapitel ${ci + 1} volume ok: ${kap.abschnitte.length} Abschnitte, ${words} Wörter (Ziel ${min} / ${SACHBUCH_KAPITEL_WORDS_TARGET})`);
        break;
      }

      console.log(
        `Kap ${ci + 1} Abschnitt ${kap.abschnitte.length + 1} (ca. ${min}) start`,
        new Date().toISOString(),
      );
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          book = await generateNextAbschnitt({ sachbuchId: ID, kapitelId });
          const fresh = book.kapitel.find((k) => k.id === kapitelId)!;
          const w = countKapitelAbschnitteWords(fresh.abschnitte);
          console.log(
            `Kap ${ci + 1} Abschnitt ${fresh.abschnitte.length} ok, words=${w}`,
          );
          ok = true;
        } catch (e) {
          console.error(`Kap ${ci + 1} Abschnitt attempt ${attempt} failed:`, e);
          await sleep(8000 * attempt);
        }
      }
      if (!ok) {
        console.error(`Kap ${ci + 1} stop after failed Abschnitt`);
        break;
      }
    }
  }

  book = (await getSachbuchKontext(ID))!;
  console.log("\n=== Regen done ===", new Date().toISOString());
  for (const k of book.kapitel) {
    console.log(
      `${k.title.slice(0, 40)}… abschnitte=${k.abschnitte.length} words=${countKapitelAbschnitteWords(k.abschnitte)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
