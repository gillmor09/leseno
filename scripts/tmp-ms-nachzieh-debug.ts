/**
 * Targeted Freigabe seam repair for Kap. 17/18 Nahtdopplung.
 * Run: npx tsx --env-file=.env.local scripts/tmp-ms-nachzieh-debug.ts
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
} from "../src/lib/roman/editorial";
import { runManuskriptSeamPayoffPass } from "../src/lib/roman/manuskript-seam-payoff";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function main() {
  const roman0 = await getRomanKontext(ID);
  if (!roman0) throw new Error("missing");
  const editorial0 = roman0.editorial ?? emptyRomanEditorial();
  const before = editorial0.manuskriptText ?? "";
  const lines: string[] = [];
  lines.push(`before hash ${hash(before)} chars ${before.length}`);

  const seed = {
    kind: "seam" as const,
    chapterNumbers: [17, 18],
    summary:
      "Ende Kap.17 endet mit Eva am Sonntagabend, Anfang Kap.18 wiederholt 'Am Montagmorgen, dem 17. Februar' fast wörtlich dieselbe Einstiegsszene",
    patchFocus:
      "Nahtdopplung Kap.17→18 streichen: Anfang Kap.18 nicht nochmals denselben Montagmorgen-Einstieg erzählen — organisch nach Kap.17 ansetzen.",
  };

  const seam = await runManuskriptSeamPayoffPass({
    roman: roman0,
    seedFindings: [seed],
  });
  lines.push(
    `seam: ${seam.summary} patched=[${seam.patchedChapters.join(",")}]`,
  );

  const after = seam.roman.editorial?.manuskriptText ?? "";
  lines.push(
    `after hash ${hash(after)} chars ${after.length} changed=${before !== after}`,
  );

  if (before !== after) {
    const bCh = parsePlotChapters(before);
    const aCh = parsePlotChapters(after);
    for (const n of seam.patchedChapters) {
      const bb = bCh.find((c) => c.number === n)?.body ?? "";
      const aa = aCh.find((c) => c.number === n)?.body ?? "";
      const bHead = bb.slice(0, 220).replace(/\s+/g, " ");
      const aHead = aa.slice(0, 220).replace(/\s+/g, " ");
      lines.push(`Kap ${n} ${bb.length}→${aa.length}`);
      lines.push(`  beforeHead: ${bHead}`);
      lines.push(`  afterHead:  ${aHead}`);
    }

    // Refresh freigabe fingerprint so UI is not stale after script patch.
    const ed = seam.roman.editorial ?? emptyRomanEditorial();
    let findings = ed.manuskriptFreigabe?.findings ?? [];
    try {
      findings = await runFreigabeAudits({
        manuskriptText: after,
        structured: ed.szenenplotStructured ?? null,
        wissensGraph: ed.wissensGraph,
        storyState: ed.storyState,
        charaktere: seam.roman.charaktere,
        tonalitaet: seam.roman.tonalitaet,
      });
    } catch (e) {
      lines.push(
        `reaudit failed: ${e instanceof Error ? e.message.slice(0, 120) : "err"}`,
      );
    }
    const freigabe = {
      checkedAt: new Date().toISOString(),
      textFingerprint: manuskriptFreigabeFingerprint(after),
      findings,
      overrideAt: null,
    };
    await upsertRomanKontext({
      id: seam.roman.id,
      title: seam.roman.title,
      manuskriptRaw: seam.roman.manuskriptRaw,
      stilbibel: seam.roman.stilbibel,
      genre: seam.roman.genre,
      praemisse: seam.roman.praemisse,
      perspektive: seam.roman.perspektive,
      zeitform: seam.roman.zeitform,
      tonalitaet: seam.roman.tonalitaet,
      charaktere: seam.roman.charaktere,
      weltSchauplaetze: seam.roman.weltSchauplaetze,
      weltRegeln: seam.roman.weltRegeln,
      szenenRaster: seam.roman.szenenRaster,
      kiRegelwerk: seam.roman.kiRegelwerk,
      fanPersonaName: seam.roman.fanPersonaName,
      fanPersonaProfil: seam.roman.fanPersonaProfil,
      editorial: withManuskriptFreigabe(ed, freigabe),
    });
    lines.push(`freigabe refreshed findings=${findings.length}`);
  }

  writeFileSync("scripts/tmp-ms-nachzieh-debug.txt", lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
