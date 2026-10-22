/**
 * Set all Graph Kennzeichen (+ hardInvariants) to E-HS 1958.
 * Run: npx tsx --env-file=.env.local scripts/tmp-graph-plate-1958.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
} from "../src/lib/roman/editorial";
import { retainApprovedStructureFingerprints } from "../src/lib/roman/phase-fingerprints";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import {
  scanIdentityContinuityFixes,
} from "../src/lib/roman/manuskript-continuity-pass";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";
const TARGET = "E-HS 1958";
const PLATE_RE =
  /\b[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\s*\d{1,4}[A-Z]?\b/g;

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  let graph = ed.wissensGraph;
  if (!graph) throw new Error("no graph");

  let hits = 0;
  const nodes = graph.nodes.map((n) => {
    const attrs = { ...n.attrs };
    let changed = false;
    for (const key of ["kennzeichen", "nummernschild", "plate"] as const) {
      const v = attrs[key]?.trim();
      if (!v) continue;
      const norm = v.replace(/\s+/g, " ").trim();
      if (norm !== TARGET) {
        console.log(`${n.label}: ${key} ${norm} → ${TARGET}`);
        attrs[key] = TARGET;
        changed = true;
        hits += 1;
      }
    }
    return changed ? { ...n, attrs } : n;
  });

  const hardInvariants = (graph.hardInvariants ?? []).map((h) => {
    const next = h.replace(PLATE_RE, (raw) => {
      const norm = raw.replace(/\s+/g, " ").trim();
      return norm === TARGET ? raw : TARGET;
    });
    if (next !== h) {
      console.log(`invariant: ${h.slice(0, 80)} → …`);
      hits += 1;
    }
    return next;
  });

  // Also unify any remaining wrong plates in manuskript
  let ms = ed.manuskriptText ?? "";
  const msNext = ms.replace(PLATE_RE, (raw) => {
    const norm = raw.replace(/\s+/g, " ").trim();
    return norm === TARGET ? raw : TARGET;
  });
  if (msNext !== ms) {
    console.log("manuskript plates unified to", TARGET);
    ms = msNext;
    hits += 1;
  }

  graph = {
    ...graph,
    nodes,
    hardInvariants,
    updatedAt: new Date().toISOString(),
  };

  const identity = scanIdentityContinuityFixes(ms, graph);
  console.log(`identity after graph fix (pre-save): ${identity.length}`);

  let nextEd = retainApprovedStructureFingerprints({
    ...ed,
    manuskriptText: ms,
    wissensGraph: graph,
  });

  // Refresh freigabe so Canon rows drop
  const findings = await runFreigabeAudits({
    manuskriptText: ms,
    structured: nextEd.szenenplotStructured ?? null,
    wissensGraph: graph,
    storyState: nextEd.storyState,
    charaktere: roman.charaktere,
    tonalitaet: roman.tonalitaet,
  });
  const canon = findings.filter((f) => f.source === "canon");
  console.log(
    `freigabe canon left: ${canon.length}`,
    canon.map((f) => f.summary.slice(0, 100)),
  );
  nextEd = withManuskriptFreigabe(nextEd, {
    checkedAt: new Date().toISOString(),
    textFingerprint: manuskriptFreigabeFingerprint(ms),
    findings,
    overrideAt: null,
    settled: ed.manuskriptFreigabe?.settled,
  });

  await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial: nextEd,
  });

  const check = await getRomanKontext(ID, { omitCover: true });
  const passat = check?.editorial?.wissensGraph?.nodes?.find((n) =>
    /passat/i.test(n.label),
  );
  console.log("Passat kennzeichen now:", passat?.attrs?.kennzeichen);
  const id2 = scanIdentityContinuityFixes(
    check?.editorial?.manuskriptText ?? "",
    check?.editorial?.wissensGraph,
  );
  console.log("identity after save:", id2.length);
  console.log("done, hits", hits);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
