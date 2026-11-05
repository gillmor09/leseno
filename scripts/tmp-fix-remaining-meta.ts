/**
 * Dump + fix remaining wooden meta lines in Kap 3 and 5.
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // --- Kap 5 ---
  {
    const k = book.kapitel[4]!;
    let body = sachbuchKapitelBodyText(k);
    const i = body.indexOf("VDP-Methodenkoffer");
    console.log("K5 snip:", body.slice(Math.max(0, i - 100), i + 200).replace(/\s+/g, " "));
    const find =
      "erprobte Werkzeuge aus unserem VDP-Methodenkoffer, die wir in den vorangegangenen Kapiteln eingeführt haben:";
    const to = "erprobte Werkzeuge aus dem VDP-Methodenkoffer:";
    if (body.includes(find)) {
      body = body.replace(find, to);
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
        finalText: body,
        updatedAt: now,
      });
      console.log("K5: applied exact");
    } else {
      // char-level debug around Methodenkoffer
      const start = body.indexOf("Methodenkoffer");
      console.log("K5 raw around:", JSON.stringify(body.slice(start - 60, start + 120)));
      const soft =
        /,?\s*die wir in den vorangegangenen Kapiteln eingeführt haben:?/;
      if (soft.test(body)) {
        body = body.replace(soft, "");
        body = body.replace(
          /erprobte Werkzeuge aus unserem VDP-Methodenkoffer/,
          "erprobte Werkzeuge aus dem VDP-Methodenkoffer",
        );
        const now = new Date().toISOString();
        await patchSachbuchKapitel(ID, k.id, {
          manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
          finalText: body,
          updatedAt: now,
        });
        console.log("K5: applied soft");
      } else {
        console.log("K5: no match");
      }
    }
  }

  // --- Kap 3 ---
  {
    const k = book.kapitel[2]!;
    let body = sachbuchKapitelBodyText(k);
    for (const needle of ["Kapitel 1", "Kapitel 2", "PDCA-Takt", "Cisco"]) {
      const idx = body.indexOf(needle);
      if (idx >= 0) {
        console.log(
          `K3 ${needle}:`,
          body.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, " "),
        );
      }
    }
    const swaps = [
      {
        find: "den Kapitel 2 als Gegenstück zur Rechenschaftspflicht eingeführt hat",
        to: "der die Rechenschaftspflicht operativ trägt",
      },
      {
        find: "Der Cisco-Benchmark aus Kapitel 1 zeigt denselben Hebel an der Vertriebsnaht",
        to: "Cisco-Benchmarks zeigen denselben Hebel an der Vertriebsnaht",
      },
      {
        find: "Cisco-Benchmark aus Kapitel 1",
        to: "Cisco-Benchmark",
      },
    ];
    let n = 0;
    for (const s of swaps) {
      if (body.includes(s.find)) {
        body = body.replace(s.find, s.to);
        n += 1;
        console.log("K3 applied:", s.find.slice(0, 60));
      }
    }
    if (n > 0) {
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: { ...k.manuscript, improvedText: body, improvedAt: now },
        finalText: body,
        updatedAt: now,
      });
    } else {
      console.log("K3: no exact swaps");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
