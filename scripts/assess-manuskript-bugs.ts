/**
 * Continuity bug scan for Nur zur Absicherung.
 * Run: npx tsx --env-file=.env.local scripts/assess-manuskript-bugs.ts
 */

import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getRomanKontext } from "../src/lib/roman/repository";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

const ROMAN_ID =
  process.env.ROMAN_ID?.trim() || "c7f4c1ad-b4f2-493d-87a5-321e38102300";

async function main() {
  const roman = await getRomanKontext(ROMAN_ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ms = (roman.editorial.manuskriptText ?? "").replace(/\r\n/g, "\n");
  const chapters = parsePlotChapters(ms);

  function locate(i: number) {
    for (const c of chapters) {
      const start = ms.indexOf(`#### ${c.number}`);
      // fallback: search by title heading
      void start;
    }
    // locate by scanning chapter bodies in order
    let cursor = 0;
    for (const c of chapters) {
      const idx = ms.indexOf(c.body, cursor);
      if (idx < 0) continue;
      if (i >= idx && i < idx + c.body.length) {
        return { n: c.number, title: c.title };
      }
      cursor = idx + c.body.length;
    }
    return { n: null as number | null, title: "?" };
  }

  function ctx(re: RegExp, n = 20) {
    return [...ms.matchAll(re)].slice(0, n).map((h) => {
      const i = h.index ?? 0;
      const loc = locate(i);
      return {
        ch: loc.n,
        title: loc.title,
        snip: ms.slice(Math.max(0, i - 80), i + 140).replace(/\s+/g, " "),
      };
    });
  }

  const out = {
    Tebrügge: ctx(/Tebr[üu]gge/gi),
    Lindemann: ctx(/Lindemann/gi),
    Frau_Kuhlmann: ctx(/Frau Kuhlmann/gi),
    Hartmut_Kuhlmann: ctx(/Hartmut Kuhlmann|Kuhlmann/gi, 8),
    Grundschule: ctx(/Grundschule[^\n.]{0,80}/gi, 12),
    Ludgerus: ctx(/Ludgerus/gi),
    Brille: ctx(/\bBrille\b|Brillengl[äa]ser|randlosen Brille/gi, 25),
    Heck_20: ctx(/Heck.{0,90}zwanzig Zentimeter|zwanzig Zentimeter.{0,90}Heck/gi),
    Einfahrt_20: ctx(
      /zwanzig Zentimeter.{0,50}Einfahrt|Einfahrt.{0,50}zwanzig Zentimeter/gi,
    ),
    Gleichstrom_Wallbox: ctx(/Gleichstrom|DC-Wallbox|22-kW|Typ-2/gi, 20),
    km: [...ms.matchAll(/.{0,50}(?:Kilometer|Pendelstrecke).{0,50}/gi)]
      .slice(0, 30)
      .map((h) => h[0].replace(/\s+/g, " ")),
    Managing: ctx(
      /Managing Director|Chief Systems Architect|Chief Architect/gi,
      15,
    ),
    motifPerCh: chapters.map((c) => ({
      n: c.number,
      title: c.title,
      words: c.body.trim().split(/\s+/).filter(Boolean).length,
      zentimeter: (c.body.match(/Zentimeter/gi) || []).length,
      polder: (c.body.match(/Polder Groden/gi) || []).length,
      praezise: (c.body.match(/präzis\w*/gi) || []).length,
      sophisto: (c.body.match(/Sophistograu/gi) || []).length,
    })),
  };

  const path = join(tmpdir(), "manuskript-bugs.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log("wrote", path);
  console.log(
    JSON.stringify(
      {
        Tebrügge: out.Tebrügge.length,
        Lindemann: out.Lindemann.length,
        Frau_Kuhlmann: out.Frau_Kuhlmann.length,
        Ludgerus: out.Ludgerus.length,
        Heck_20: out.Heck_20.length,
        Einfahrt_20: out.Einfahrt_20.length,
        Brille: out.Brille.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
