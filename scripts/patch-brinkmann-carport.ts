/**
 * One-shot: fix Brinkmann carport measure drift in Kap. 8 + freeze MASS facts.
 * Run: npx tsx --env-file=.env.local scripts/patch-brinkmann-carport.ts [--dry-run]
 */

import type { RomanEditorial, RomanWissensGraph } from "../src/lib/roman/editorial";
import { parsePlotChapters } from "../src/lib/roman/plot-chapters";
import { patchChapterBodies } from "../src/lib/roman/pipeline/structure-guard";
import {
  getRomanKontext,
  setRomanEditorial,
} from "../src/lib/roman/repository";
import {
  freezeMetricFactsFromChapters,
  protectFrozenMetricAttrs,
} from "../src/lib/roman/wissens-metric-facts";

/** Open admin tab: Nur zur Absicherung */
const ROMAN_ID =
  process.env.ROMAN_ID?.trim() || "c7f4c1ad-b4f2-493d-87a5-321e38102300";

function applyChapter8Fixes(body: string): {
  next: string;
  changes: string[];
} {
  let next = body;
  const changes: string[] = [];

  // Exact Brinkmann beat (Kap. 8) — keep voice, fix math to Kap. 1 canon.
  const brinkmannExact =
    /eure Carport-Tiefe ist wie bei uns allen im Bebauungsplan:\s*exakt fünf Meter fünfzig ab Außenkante Klinker\.\s*Wenn du ganz bis an die Rückwand fährst, stehen dir vorn noch vierzig Zentimeter zur Verfügung\./gi;
  if (brinkmannExact.test(next)) {
    next = next.replace(
      brinkmannExact,
      "eure Carport-Tiefe ist wie bei uns allen im Bebauungsplan: vier Meter fünfundachtzig ab Außenkante Klinker. Wenn du ganz bis an die Rückwand fährst, bleibt vorn kein Restplatz — die Schnauze hängt zwanzig Zentimeter über.",
    );
    changes.push(
      "Brinkmann: 5,50→4,85 + vierzig-Zentimeter-Restplatz → 20-cm-Überhang",
    );
  }

  // Fallbacks if wording drifted slightly.
  const replacements: Array<[RegExp, string, string]> = [
    [
      /exakt\s+fünf\s+Meter\s+fünfzig(\s+ab\s+Außenkante\s+Klinker)/gi,
      "vier Meter fünfundachtzig$1",
      "exakt fünf Meter fünfzig → vier Meter fünfundachtzig",
    ],
    [
      /Wenn du ganz bis an die Rückwand fährst, stehen dir vorn noch vierzig Zentimeter zur Verfügung\./gi,
      "Wenn du ganz bis an die Rückwand fährst, bleibt vorn kein Restplatz — die Schnauze hängt zwanzig Zentimeter über.",
      "vierzig-Zentimeter-Restplatz-Satz ersetzt",
    ],
  ];
  for (const [re, repl, label] of replacements) {
    const before = next;
    next = next.replace(re, repl);
    if (next !== before) changes.push(label);
  }

  return { next, changes: Array.from(new Set(changes)) };
}

function ensureMassInvariants(graph: RomanWissensGraph): RomanWissensGraph {
  const must = [
    "MASS: Carport Tiefe ab Außenkante Klinker = 485 cm — FROZEN (seit Kap. 1)",
    "MASS: Auto Überhang bei Parken bis Ladekabelanschlag = 20 cm — FROZEN (seit Kap. 1)",
  ];
  const set = new Set<string>();
  for (const h of graph.hardInvariants) {
    const t = h.trim();
    if (!t) continue;
    if (
      /^MASS:/i.test(t) &&
      /carport|klinker|überhang|uberhang|ladekabel|restplatz/i.test(t) &&
      (/\b550\b|\b5[,.]50\b|\b40\b|fünf\s*Meter\s*fünfzig|vierzig/i.test(t) ||
        (!must.includes(t) && /carport|klinker|überhang|ladekabel/i.test(t)))
    ) {
      continue;
    }
    set.add(t.slice(0, 280));
  }
  for (const m of must) set.add(m);

  const nodes = graph.nodes.map((n) => ({ ...n, attrs: { ...n.attrs } }));
  let carport = nodes.find((n) =>
    /carport/i.test(`${n.label} ${n.summary}`),
  );
  if (!carport) {
    nodes.push({
      id: "prop_carport",
      kind: "prop",
      label: "Carport",
      summary: "Tiefe ab Außenkante Klinker 4,85 m (Canon Kap. 1)",
      attrs: {
        status: "active",
        introducedChapter: "1",
        laenge_cm: "485",
        mass_cm: "485",
        mass_label: "Carport Tiefe ab Außenkante Klinker",
      },
      sinceChapter: 1,
    });
  } else {
    carport.attrs.laenge_cm = "485";
    carport.attrs.mass_cm = "485";
    carport.attrs.mass_label =
      carport.attrs.mass_label || "Carport Tiefe ab Außenkante Klinker";
  }

  const auto = nodes.find((n) =>
    /auto|wagen|fahrzeug|ladekabel/i.test(`${n.label} ${n.summary}`),
  );
  if (auto) {
    auto.attrs.abstand_cm = "20";
    auto.attrs.mass_label =
      auto.attrs.mass_label ||
      "Auto Überhang bei Parken bis Ladekabelanschlag";
  }

  return {
    ...graph,
    updatedAt: new Date().toISOString(),
    nodes: nodes.slice(0, 120),
    hardInvariants: Array.from(set).slice(0, 40),
  };
}

function dumpMeasureLines(label: string, body: string) {
  const lines = body.split("\n").filter((l) =>
    /Meter|Zentimeter|Klinker|Carport|Brinkmann|Ladekabel|5[,.]50|4[,.]85|40\s*cm|20\s*cm|Überhang/i.test(
      l,
    ),
  );
  console.log(`--- ${label} ---`);
  console.log(lines.slice(0, 40).join("\n") || "(keine Maß-Zeilen)");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Roman ${ROMAN_ID}${dryRun ? " (dry-run)" : ""}`);

  const roman = await getRomanKontext(ROMAN_ID, { omitCover: true });
  if (!roman) throw new Error("Roman nicht gefunden.");
  console.log(`Titel: ${roman.title}`);

  const editorial = roman.editorial;
  const ms = (editorial.manuskriptText ?? "").replace(/\r\n/g, "\n");
  if (!ms.trim()) throw new Error("manuskriptText leer.");

  const chapters = parsePlotChapters(ms);
  const ch1 = chapters.find((c) => c.number === 1);
  const ch8 = chapters.find((c) => c.number === 8);
  if (!ch8) {
    throw new Error(
      `Kapitel 8 fehlt (gefunden: ${chapters.map((c) => c.number).join(", ")})`,
    );
  }

  if (ch1) dumpMeasureLines("Kap. 1 Maß-Zeilen", ch1.body);
  dumpMeasureLines("Kap. 8 Maß-Zeilen VORHER", ch8.body);

  const { next, changes } = applyChapter8Fixes(ch8.body);
  if (!changes.length) {
    // Show wider context windows for manual tuning
    const windows =
      ch8.body.match(
        /.{0,180}(fünf Meter|5[,.]50|vierzig|40\s*cm|Brinkmann|Außenkante).{0,220}/gi,
      ) ?? [];
    console.log("Kontext-Fenster:", windows.slice(0, 10).join("\n---\n") || "(leer)");
    throw new Error("Keine Regex-Treffer in Kap. 8 — Wortlaut weicht ab.");
  }

  dumpMeasureLines("Kap. 8 Maß-Zeilen NACHHER", next);
  console.log("Änderungen:", changes);

  const guarded = patchChapterBodies(
    ms,
    [{ chapterNumber: 8, body: next }],
    "manuskript",
  );
  if (!guarded.ok) throw new Error(`Struktur-Guard: ${guarded.error}`);

  let graph = editorial.wissensGraph;
  if (graph) {
    graph = protectFrozenMetricAttrs(
      graph,
      freezeMetricFactsFromChapters(graph, [
        ...(ch1 ? [{ number: 1, title: ch1.title, body: ch1.body }] : []),
        { number: 8, title: ch8.title, body: next },
      ]),
    );
    graph = ensureMassInvariants(graph);
  } else {
    graph = ensureMassInvariants({
      updatedAt: new Date().toISOString(),
      modelLabel: "manual-patch",
      seededFrom: ["manuskript"],
      nodes: [],
      edges: [],
      hardInvariants: [],
    });
  }

  console.log(
    "MASS:",
    graph.hardInvariants.filter((h) => /^MASS:/i.test(h)).join(" | "),
  );

  if (dryRun) {
    console.log("Dry-run — nichts gespeichert.");
    return;
  }

  const nextEditorial: RomanEditorial = {
    ...editorial,
    manuskriptText: guarded.text,
    wissensGraph: graph,
  };
  const ok = await setRomanEditorial(ROMAN_ID, nextEditorial);
  if (!ok) throw new Error("setRomanEditorial lieferte false.");
  console.log(`OK — gespeichert in „${roman.title}“`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
