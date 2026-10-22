/**
 * Unify all Kennzeichen to E-HS 1958 (Manuskript + Wissensgraph).
 * Run: npx tsx --env-file=.env.local scripts/tmp-set-plate-1958.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import { emptyRomanEditorial } from "../src/lib/roman/editorial";
import { retainApprovedStructureFingerprints } from "../src/lib/roman/phase-fingerprints";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";
const TARGET = "E-HS 1958";
const PLATE_RE =
  /\b[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\s*\d{1,4}[A-Z]?\b/g;

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();
  const before = ed.manuskriptText ?? "";

  const found = new Map<string, number>();
  PLATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLATE_RE.exec(before)) !== null) {
    const p = m[0].replace(/\s+/g, " ").trim();
    found.set(p, (found.get(p) ?? 0) + 1);
  }
  console.log("plates before:", Object.fromEntries(found));

  const nextText = before.replace(PLATE_RE, (raw) => {
    const norm = raw.replace(/\s+/g, " ").trim();
    return norm === TARGET ? raw : TARGET;
  });

  let graph = ed.wissensGraph;
  let graphHits = 0;
  if (graph?.nodes?.length) {
    const nodes = graph.nodes.map((n) => {
      const attrs = { ...n.attrs };
      let changed = false;
      for (const key of [
        "kennzeichen",
        "nummernschild",
        "plate",
      ] as const) {
        const v = attrs[key]?.trim();
        if (!v) continue;
        const norm = v.replace(/\s+/g, " ").trim();
        if (norm !== TARGET) {
          attrs[key] = TARGET;
          changed = true;
          graphHits += 1;
          console.log(`graph ${n.label}: ${key} ${norm} → ${TARGET}`);
        }
      }
      return changed ? { ...n, attrs } : n;
    });
    const inv = (graph.hardInvariants ?? []).map((h) =>
      h.replace(PLATE_RE, (raw) => {
        const norm = raw.replace(/\s+/g, " ").trim();
        return norm === TARGET ? raw : TARGET;
      }),
    );
    graph = {
      ...graph,
      nodes,
      hardInvariants: inv,
      updatedAt: new Date().toISOString(),
    };
  }

  // Also plot / gerüst if they contain plates
  let manuskriptRaw = roman.manuskriptRaw ?? "";
  const rawBefore = manuskriptRaw;
  manuskriptRaw = manuskriptRaw.replace(PLATE_RE, (raw) => {
    const norm = raw.replace(/\s+/g, " ").trim();
    return norm === TARGET ? raw : TARGET;
  });

  let kapitelGeruestRaw = ed.kapitelGeruestRaw ?? "";
  const geruestBefore = kapitelGeruestRaw;
  kapitelGeruestRaw = kapitelGeruestRaw.replace(PLATE_RE, (raw) => {
    const norm = raw.replace(/\s+/g, " ").trim();
    return norm === TARGET ? raw : TARGET;
  });

  const textChanged = nextText !== before;
  const rawChanged = manuskriptRaw !== rawBefore;
  const geruestChanged = kapitelGeruestRaw !== geruestBefore;
  console.log({
    textChanged,
    rawChanged,
    geruestChanged,
    graphHits,
    msChars: before.length,
    msDelta: nextText.length - before.length,
  });

  if (!textChanged && !rawChanged && !geruestChanged && graphHits === 0) {
    console.log("nothing to change");
    return;
  }

  let nextEd = retainApprovedStructureFingerprints({
    ...ed,
    manuskriptText: nextText,
    kapitelGeruestRaw: geruestChanged ? kapitelGeruestRaw : ed.kapitelGeruestRaw,
    wissensGraph: graph,
    // Freigabe stale after plate unify
    manuskriptFreigabe: ed.manuskriptFreigabe
      ? { ...ed.manuskriptFreigabe, textFingerprint: "stale-after-plate-unify" }
      : null,
  });

  await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: rawChanged ? manuskriptRaw : roman.manuskriptRaw,
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
  const after = check?.editorial?.manuskriptText ?? "";
  const afterPlates = new Map<string, number>();
  PLATE_RE.lastIndex = 0;
  while ((m = PLATE_RE.exec(after)) !== null) {
    const p = m[0].replace(/\s+/g, " ").trim();
    afterPlates.set(p, (afterPlates.get(p) ?? 0) + 1);
  }
  console.log("plates after:", Object.fromEntries(afterPlates));
  const passat = check?.editorial?.wissensGraph?.nodes?.find((n) =>
    /passat/i.test(n.label),
  );
  console.log("Passat kennzeichen:", passat?.attrs?.kennzeichen);
  const stell = check?.editorial?.wissensGraph?.nodes?.find((n) =>
    /stellplatz/i.test(n.label),
  );
  console.log("Stellplatz kennzeichen:", stell?.attrs?.kennzeichen);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
