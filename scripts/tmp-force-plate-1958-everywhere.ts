/**
 * Force EVERY Kennzeichen to E-HS 1958 (MS, Plot, Gerüst, Graph, Invariants).
 * Run: npx tsx --env-file=.env.local scripts/tmp-force-plate-1958-everywhere.ts
 */
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
} from "../src/lib/roman/editorial";
import { retainApprovedStructureFingerprints } from "../src/lib/roman/phase-fingerprints";
import { deepReplaceStrings } from "../src/lib/roman/manuskript-continuity-pass";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import { scanIdentityContinuityFixes } from "../src/lib/roman/manuskript-continuity-pass";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";
const TARGET = "E-HS 1958";
/** German plate-like tokens (E-HS 1234, E HS 1234, …). */
const PLATE_RE =
  /\b[A-ZÄÖÜ]{1,3}[\s-]?[A-ZÄÖÜ]{1,2}\s*\d{1,4}[A-Z]?\b/gi;

function unifyPlates(text: string): { text: string; changed: number } {
  let changed = 0;
  const next = text.replace(PLATE_RE, (raw) => {
    const norm = raw.replace(/\s+/g, " ").replace(/-/g, "-").trim();
    // Only rewrite if it looks like a Kennzeichen (has digit)
    if (!/\d/.test(norm)) return raw;
    if (!/[A-ZÄÖÜ]{1,3}/i.test(norm)) return raw;
    const compact = norm.toUpperCase().replace(/\s+/g, " ");
    // Prefer E-HS form
    if (/^E[\s-]?HS\s*\d+/i.test(compact) || /^[A-Z]{1,3}-[A-Z]{1,2}\s*\d+/i.test(compact)) {
      if (compact.replace(/\s+/g, " ") === TARGET) return TARGET;
      changed += 1;
      return TARGET;
    }
    return raw;
  });
  return { text: next, changed };
}

async function main() {
  const roman = await getRomanKontext(ID, { omitCover: true });
  if (!roman) throw new Error("missing");
  const ed = roman.editorial ?? emptyRomanEditorial();

  const beforePlates = [
    ...new Set(
      [...(ed.manuskriptText ?? "").matchAll(PLATE_RE)].map((m) =>
        m[0].replace(/\s+/g, " ").trim(),
      ),
    ),
  ];
  console.log("MS plates before:", beforePlates);

  const ms = unifyPlates(ed.manuskriptText ?? "");
  const raw = unifyPlates(roman.manuskriptRaw ?? "");
  const geruest = unifyPlates(ed.kapitelGeruestRaw ?? "");

  let graph = ed.wissensGraph;
  let graphHits = 0;
  if (graph) {
    const nodes = graph.nodes.map((n) => {
      const attrs = { ...n.attrs };
      let changed = false;
      for (const [k, v] of Object.entries(attrs)) {
        if (typeof v !== "string") continue;
        if (!/kennzeichen|nummernschild|plate|schild/i.test(k) && !PLATE_RE.test(v)) {
          PLATE_RE.lastIndex = 0;
          continue;
        }
        PLATE_RE.lastIndex = 0;
        if (/kennzeichen|nummernschild|plate/i.test(k)) {
          const norm = v.replace(/\s+/g, " ").trim();
          if (norm !== TARGET && /\d/.test(norm)) {
            console.log(`graph attr ${n.label}.${k}: ${norm} → ${TARGET}`);
            attrs[k] = TARGET;
            changed = true;
            graphHits += 1;
          }
        } else {
          const u = unifyPlates(v);
          if (u.changed) {
            attrs[k] = u.text;
            changed = true;
            graphHits += u.changed;
          }
        }
      }
      // Force Passat / Stellplatz / Einzug nodes
      if (/passat|stellplatz|einzug|kennzeichen/i.test(n.label)) {
        if (attrs.kennzeichen !== TARGET) {
          attrs.kennzeichen = TARGET;
          changed = true;
          graphHits += 1;
        }
      }
      return changed ? { ...n, attrs } : n;
    });

    const hardInvariants = (graph.hardInvariants ?? []).map((h) => {
      const u = unifyPlates(h);
      if (u.changed) {
        console.log("invariant plate fix:", h.slice(0, 90));
        graphHits += u.changed;
      }
      return u.text;
    });
    // Guarantee freeze invariant
    const invSet = new Set(hardInvariants.map((h) => h.trim()).filter(Boolean));
    invSet.add(
      `MASS/ID: Kennzeichen überall ${TARGET} — FROZEN (Hartmut Passat / Stellplatz 14). Keine anderen Plates erfinden.`,
    );
    graph = {
      ...graph,
      nodes,
      hardInvariants: Array.from(invSet).slice(0, 40),
      updatedAt: new Date().toISOString(),
    };
  }

  // Structured JSON mirrors
  let szenenplotStructured = ed.szenenplotStructured;
  let kapitelGeruestStructured = ed.kapitelGeruestStructured;
  const fakeFix = [
    {
      id: "plate",
      kind: "identity" as const,
      chapter: 0,
      find: "E-HS 2046",
      replace: TARGET,
      reason: "unify",
    },
    {
      id: "plate2",
      kind: "identity" as const,
      chapter: 0,
      find: "E-HS 4411",
      replace: TARGET,
      reason: "unify",
    },
    {
      id: "plate3",
      kind: "identity" as const,
      chapter: 0,
      find: "E-HS 4471",
      replace: TARGET,
      reason: "unify",
    },
    {
      id: "plate4",
      kind: "identity" as const,
      chapter: 0,
      find: "E-HS 1412",
      replace: TARGET,
      reason: "unify",
    },
  ];
  if (szenenplotStructured) {
    szenenplotStructured = deepReplaceStrings(
      szenenplotStructured,
      fakeFix,
    ) as typeof szenenplotStructured;
  }
  if (kapitelGeruestStructured) {
    kapitelGeruestStructured = deepReplaceStrings(
      kapitelGeruestStructured,
      fakeFix,
    ) as typeof kapitelGeruestStructured;
  }

  console.log({
    msChanged: ms.changed,
    rawChanged: raw.changed,
    geruestChanged: geruest.changed,
    graphHits,
  });

  let nextEd = retainApprovedStructureFingerprints({
    ...ed,
    manuskriptText: ms.text,
    kapitelGeruestRaw: geruest.changed ? geruest.text : ed.kapitelGeruestRaw,
    szenenplotStructured,
    kapitelGeruestStructured,
    wissensGraph: graph,
  });

  const identity = scanIdentityContinuityFixes(ms.text, graph);
  console.log("identity left:", identity.length, identity.map((f) => f.reason));

  const findings = await runFreigabeAudits({
    manuskriptText: ms.text,
    structured: nextEd.szenenplotStructured ?? null,
    wissensGraph: graph,
    storyState: nextEd.storyState,
    charaktere: roman.charaktere,
    tonalitaet: roman.tonalitaet,
  });
  console.log(
    "canon freigabe:",
    findings.filter((f) => f.source === "canon").map((f) => f.summary),
  );

  nextEd = withManuskriptFreigabe(nextEd, {
    checkedAt: new Date().toISOString(),
    textFingerprint: manuskriptFreigabeFingerprint(ms.text),
    findings,
    overrideAt: null,
  });

  await upsertRomanKontext({
    id: roman.id,
    title: roman.title,
    manuskriptRaw: raw.changed ? raw.text : roman.manuskriptRaw,
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
  const after = [
    ...new Set(
      [...(check?.editorial?.manuskriptText ?? "").matchAll(PLATE_RE)].map(
        (m) => m[0].replace(/\s+/g, " ").trim(),
      ),
    ),
  ];
  console.log("MS plates after:", after);
  for (const n of check?.editorial?.wissensGraph?.nodes ?? []) {
    const k = n.attrs?.kennzeichen;
    if (k) console.log("graph", n.label, k);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
