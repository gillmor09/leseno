/**
 * Verify Kap1–3 architecture language; re-strip restored Monday closings in Kap1/4.
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText, countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const kap of [1, 2, 3]) {
    const body = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
    const paras = body.split(/\n\n+/).filter(Boolean);
    console.log(`\n=== K${kap} LAST ===`);
    console.log(paras.at(-1)?.slice(0, 450));
    const bad = [
      ...body.matchAll(
        /Fundament .{0,60}(fertig|unerschütterlich|vollständig austariert)|starten den operativen Motor|Motor der Pyramide\. Dort|ruht das Fundament der Qualitäts-Pyramide/gi,
      ),
    ].map((m) => m[0]);
    console.log("bad leftover:", bad.length ? bad : "none");
  }

  // Kap1: keep conceptual last para, drop Monday plan before it
  {
    const k = book.kapitel[0]!;
    let body = sachbuchKapitelBodyText(k);
    const bridge =
      "Steht dieses organisatorische und methodische Fundament der VDP-Pyramide";
    const montag =
      "Für den unmittelbaren Einstieg in Ihrer eigenen Organisation brauchen Sie weder";
    const bIdx = body.indexOf(bridge);
    const mIdx = body.indexOf(montag);
    if (mIdx >= 0 && bIdx > mIdx) {
      body = `${body.slice(0, mIdx).replace(/\s+$/g, "")}\n\n${body.slice(bIdx)}`;
      // soften "im nächsten Kapitel … Motor" is OK (Kap2 starts motor)
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
        finalText: body,
        updatedAt: now,
      });
      console.log("\nK1: stripped Monday plan", {
        words: countSachbuchWords(body),
      });
    } else {
      console.log("\nK1: no Monday strip needed", { mIdx, bIdx });
    }
  }

  // Kap4: restore PVT closing without Monday plan if present
  {
    const k = book.kapitel[3]!;
    let body = sachbuchKapitelBodyText(k);
    const plan = "Warten Sie nicht auf das nächste große Architektur-Update";
    const plan2 = "Starten Sie noch in dieser Woche mit drei konkreten";
    const keep =
      "Privacy Value Thinking liefert das strategische Fundament für diesen unternehmerischen Kulturwandel";
    const pIdx = body.indexOf(plan);
    const p2 = body.indexOf(plan2);
    const kIdx = body.indexOf(keep);
    const cut = [pIdx, p2].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
    if (cut >= 0 && kIdx > cut) {
      body = `${body.slice(0, cut).replace(/\s+$/g, "")}\n\n${body.slice(kIdx)}`;
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
        finalText: body,
        updatedAt: now,
      });
      console.log("K4: stripped Monday plan");
    } else if (cut >= 0 && kIdx < 0) {
      // cut to eof and add short close
      const closing =
        "Privacy Value Thinking liefert das strategische Fundament für diesen Kulturwandel, indem es ungenutzte Datenbestände als teuren Ballast entlarvt. Value-Driven Privacy liefert die Werkzeuge, um diesen Ballast mit industrieller Disziplin zu entfernen – mitten im methodischen Motor der VDP-Pyramide.";
      body = `${body.slice(0, cut).replace(/\s+$/g, "")}\n\n${closing}\n`;
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
        finalText: body,
        updatedAt: now,
      });
      console.log("K4: stripped plan, added short close");
    } else {
      console.log("K4: no Monday strip", { cut, kIdx });
    }
  }

  // Final architecture confirmation
  const k1 = sachbuchKapitelBodyText(
    (
      await getSachbuchKontext(ID)
    )!.kapitel[0]!,
  );
  console.log(
    "\nK1 motor range:",
    k1.includes("Kapiteln zwei bis sechs") ? "2–6 OK" : "MISSING",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
