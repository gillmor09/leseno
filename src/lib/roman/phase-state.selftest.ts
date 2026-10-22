/**
 * Self-test: freigabe, fingerprints, sources, stale cascade, resume helpers.
 * Run: npx tsx src/lib/roman/phase-state.selftest.ts
 */

import assert from "node:assert/strict";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import {
  fingerprintForPhase,
  retainApprovedGraphFingerprint,
  retainApprovedPhaseFingerprint,
  retainApprovedStructureFingerprints,
} from "@/lib/roman/phase-fingerprints";
import {
  approvePhase,
  assertPhaseApprovedForDownstream,
  fingerprintText,
  isPhaseApproved,
  markDownstreamPhasesStale,
  markPhaseContentChanged,
  parseRomanSources,
  revokePhaseApproval,
} from "@/lib/roman/phase-state";
import { softInvalidateDownstream } from "@/lib/roman/pipeline/cascade";
import { migrateEditorialPhaseState } from "@/lib/roman/migrate-phase-state";
import { normalizePipelineStage } from "@/lib/roman/pipeline/stages";

// Fingerprint stable for same content
{
  const a = fingerprintText(["Hallo Welt", "  extra  "]);
  const b = fingerprintText(["Hallo Welt", "extra"]);
  assert.equal(a, b);
  assert.ok(a.startsWith("f"));
}

// Empty content → empty fingerprint
{
  assert.equal(fingerprintText(["", "  "]), "");
}

// Approve + fingerprint match
{
  let ed = emptyRomanEditorial();
  ed = { ...ed, ideeKurz: "Eine starke Prämisse mit Konflikt und Figur." };
  const roman = {
    title: "T",
    genre: "Thriller",
    tonalitaet: "trocken",
    perspektive: "",
    zeitform: "",
    charaktere: [],
    weltSchauplaetze: "",
    weltRegeln: "",
    manuskriptRaw: "",
    editorial: ed,
  };
  const fp = fingerprintForPhase("idee", roman);
  assert.ok(fp.length > 0);
  ed = approvePhase(ed, "idee", fp);
  assert.equal(isPhaseApproved(ed, "idee", fp), true);
  assert.equal(isPhaseApproved(ed, "idee", "wrong"), false);
}

// Downstream without approval throws
{
  const ed = emptyRomanEditorial();
  assert.throws(
    () =>
      assertPhaseApprovedForDownstream({
        editorial: ed,
        phase: "idee",
        fingerprint: "x",
      }),
    /nicht freigegeben/,
  );
}

// Upstream edit → stale downstream (no wipe)
{
  let ed = emptyRomanEditorial();
  ed = { ...ed, ideeKurz: "Idee A" };
  ed = approvePhase(ed, "idee", "fp1");
  ed = approvePhase(ed, "rahmen", "fp2");
  ed = approvePhase(ed, "fundament", "fp3");
  ed = markDownstreamPhasesStale(ed, "idee", "Idee geändert");
  assert.equal(ed.phaseState?.rahmen?.status, "stale");
  assert.equal(ed.phaseState?.fundament?.status, "stale");
  assert.equal(ed.phaseState?.idee?.status, "approved");
  assert.match(ed.phaseState?.rahmen?.staleReason ?? "", /Idee/);
}

// Soft invalidate keeps content, marks downstream stale
{
  let ed = emptyRomanEditorial();
  ed = {
    ...ed,
    kapitelGeruestRaw: "Plot bleibt",
    szenenplotStructured: {
      version: 1,
      chapters: [
        {
          number: 1,
          title: "Eins",
          kernsatz: "K",
          scenes: [],
        },
      ],
    } as NonNullable<typeof ed.szenenplotStructured>,
    manuskriptText: "Manuskript bleibt",
  };
  ed = approvePhase(ed, "plot", "fp-plot");
  ed = approvePhase(ed, "szenen", "fp-szenen");
  ed = approvePhase(ed, "manuskript", "fp-ms");
  ed = softInvalidateDownstream(ed, "plot", "Plot verbessert");
  ed = markPhaseContentChanged(ed, "plot", "Plot verbessert");
  assert.equal(ed.phaseState?.plot?.status, "stale");
  assert.equal(ed.phaseState?.szenen?.status, "stale");
  assert.equal(ed.phaseState?.manuskript?.status, "stale");
  assert.equal(ed.kapitelGeruestRaw, "Plot bleibt");
  assert.ok(ed.szenenplotStructured?.chapters.length);
  assert.equal(ed.manuskriptText, "Manuskript bleibt");
}

// Revoke clears approval
{
  let ed = approvePhase(emptyRomanEditorial(), "plot", "abc");
  ed = revokePhaseApproval(ed, "plot");
  assert.equal(ed.phaseState?.plot?.status, "draft");
  assert.equal(ed.phaseState?.plot?.fingerprint, null);
}

// Sources parse
{
  const sources = parseRomanSources([
    {
      id: "imp_1",
      kind: "import",
      label: "Pitch",
      excerpt: "Rohtext",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    { id: "", kind: "import", label: "bad" },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.kind, "import");
}

// Legacy stage aliases
{
  assert.equal(normalizePipelineStage("feinplot"), "szenen");
  assert.equal(normalizePipelineStage("feingeruest"), "plot");
  assert.equal(normalizePipelineStage("spec"), "expose");
  assert.equal(normalizePipelineStage("basics"), "rahmen");
}

// Soft migration does not invent approved without Fertig+gate
{
  const ed = migrateEditorialPhaseState({
    title: "X",
    genre: "",
    tonalitaet: "",
    perspektive: "",
    zeitform: "",
    charaktere: [],
    weltSchauplaetze: "",
    weltRegeln: "",
    manuskriptRaw: "",
    editorial: emptyRomanEditorial(),
  });
  assert.equal(ed.phaseState?.idee?.status ?? "draft", "draft");
}

// Downstream graph grow keeps freigabe via fingerprint refresh
{
  let ed = emptyRomanEditorial();
  ed = {
    ...ed,
    wissensGraph: {
      updatedAt: "2026-01-01T00:00:00.000Z",
      modelLabel: "test",
      seededFrom: ["idee"],
      nodes: [
        {
          id: "n1",
          label: "Astra",
          kind: "person",
          summary: "Protagonistin",
          attrs: {},
          sinceChapter: 0,
        },
      ],
      edges: [],
      hardInvariants: ["Astra ist Protagonistin"],
    },
  };
  const romanBase = {
    title: "T",
    genre: "",
    tonalitaet: "",
    perspektive: "",
    zeitform: "",
    charaktere: [],
    weltSchauplaetze: "",
    weltRegeln: "",
    manuskriptRaw: "",
  };
  const fp0 = fingerprintForPhase("graph", { ...romanBase, editorial: ed });
  ed = approvePhase(ed, "graph", fp0);
  assert.equal(isPhaseApproved(ed, "graph", fp0), true);

  ed = {
    ...ed,
    wissensGraph: {
      ...ed.wissensGraph!,
      nodes: [
        ...ed.wissensGraph!.nodes,
        {
          id: "n2",
          label: "Depot",
          kind: "prop",
          summary: "Depotvereinbarung",
          attrs: { amount: "55k" },
          sinceChapter: 1,
        },
      ],
    },
  };
  const fpGrown = fingerprintForPhase("graph", { ...romanBase, editorial: ed });
  assert.notEqual(fp0, fpGrown);
  assert.equal(isPhaseApproved(ed, "graph", fpGrown), false);

  ed = retainApprovedGraphFingerprint(ed);
  assert.equal(ed.phaseState?.graph?.status, "approved");
  assert.equal(ed.phaseState?.graph?.fingerprint, fpGrown);
  assert.equal(isPhaseApproved(ed, "graph", fpGrown), true);

  // stale stays stale (no silent restore)
  ed = markDownstreamPhasesStale(ed, "expose", "Exposé geändert");
  assert.equal(ed.phaseState?.graph?.status, "stale");
  const afterStale = retainApprovedGraphFingerprint({
    ...ed,
    wissensGraph: {
      ...ed.wissensGraph!,
      nodes: [
        ...ed.wissensGraph!.nodes,
        {
          id: "n3",
          label: "Extra",
          kind: "prop",
          summary: "Extra",
          attrs: {},
          sinceChapter: 2,
        },
      ],
    },
  });
  assert.equal(afterStale.phaseState?.graph?.status, "stale");
}

// Structure retain refreshes plot/szenen fingerprints without revoke
{
  let ed = emptyRomanEditorial();
  ed = {
    ...ed,
    kapitelGeruestRaw: "Kapitel 1 — Start",
    szenenplotStructured: null,
  };
  const romanBase = {
    title: "T",
    genre: "",
    tonalitaet: "",
    perspektive: "",
    zeitform: "",
    charaktere: [],
    weltSchauplaetze: "",
    weltRegeln: "",
    manuskriptRaw: "Alt",
  };
  const fpPlot0 = fingerprintForPhase("plot", { ...romanBase, editorial: ed });
  ed = approvePhase(ed, "plot", fpPlot0);
  ed = { ...ed, kapitelGeruestRaw: "Kapitel 1 — Start (Kontinuität)" };
  const fpPlot1 = fingerprintForPhase("plot", { ...romanBase, editorial: ed });
  assert.notEqual(fpPlot0, fpPlot1);
  ed = retainApprovedPhaseFingerprint(ed, "plot", romanBase);
  assert.equal(ed.phaseState?.plot?.status, "approved");
  assert.equal(ed.phaseState?.plot?.fingerprint, fpPlot1);

  ed = approvePhase(ed, "szenen", fingerprintText(["Alt"]));
  ed = retainApprovedStructureFingerprints(
    { ...ed },
    { manuskriptRaw: "Neu" },
  );
  // szenen without structured uses manuskriptRaw — retain refreshes hash
  const fpSzenen = fingerprintForPhase("szenen", {
    ...romanBase,
    manuskriptRaw: "Neu",
    editorial: ed,
  });
  assert.equal(ed.phaseState?.szenen?.status, "approved");
  assert.equal(ed.phaseState?.szenen?.fingerprint, fpSzenen);
}

console.log("phase-state.selftest: ok");
