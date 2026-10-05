/**
 * LLM ops for the durable book knowledge graph.
 * Types/parse/format live in `editorial.ts` (`RomanWissensGraph`).
 * Seeded before Kapitelgerüst; grown per scene batch; gap-closed at the end.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  BUCHTYP_LABELS,
  exposeTextFromEditorial,
  parseRomanWissensGraph,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanWissensGraph,
  type RomanWissensGraphSeedSource,
} from "@/lib/roman/editorial";
import { formatCharaktere } from "@/lib/roman/fundament";
import { CLIP } from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";

export type {
  RomanWissensGraph,
  RomanWissensGraphEdge,
  RomanWissensGraphNode,
  RomanWissensGraphNodeKind,
  RomanWissensGraphSeedSource,
} from "@/lib/roman/editorial";

export {
  formatWissensGraphForPrompt,
  parseRomanWissensGraph,
} from "@/lib/roman/editorial";

const MAX_INVARIANTS = 32;
const MAX_NODES = 100;
const MAX_EDGES = 160;

/** Merge two graphs (incoming wins on same id). */
export function mergeWissensGraphs(
  base: RomanWissensGraph | null | undefined,
  incoming: RomanWissensGraph | null | undefined,
): RomanWissensGraph | null {
  if (!incoming) return base ?? null;
  if (!base) return incoming;
  const nodesById = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of incoming.nodes) nodesById.set(n.id, n);
  const edgesById = new Map(base.edges.map((e) => [e.id, e]));
  for (const e of incoming.edges) edgesById.set(e.id, e);
  const inv = new Set<string>();
  for (const h of [...base.hardInvariants, ...incoming.hardInvariants]) {
    if (h.trim()) inv.add(h.trim().slice(0, 280));
    if (inv.size >= MAX_INVARIANTS) break;
  }
  const seededFrom = Array.from(
    new Set([...base.seededFrom, ...incoming.seededFrom]),
  ).slice(0, 8) as RomanWissensGraphSeedSource[];
  return {
    updatedAt: new Date().toISOString(),
    modelLabel: incoming.modelLabel || base.modelLabel,
    seededFrom,
    nodes: Array.from(nodesById.values()).slice(0, MAX_NODES),
    edges: Array.from(edgesById.values()).slice(0, MAX_EDGES),
    hardInvariants: Array.from(inv),
  };
}

const GRAPH_JSON_HINT = `{
  "nodes": [
    {
      "id": "person_prota",
      "kind": "person|place|prop|fact|secret|thread|rule|tone|motif|event|concept",
      "label": "Kurzname",
      "summary": "1 Satz",
      "attrs": {},
      "sinceChapter": 0,
      "sceneId": ""
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "person_prota",
      "to": "place_x",
      "rel": "an|kennt|besitzt|verursacht|enthüllt|widerspricht|erfordert|motiviert",
      "note": "optional",
      "chapter": 0,
      "sceneId": ""
    }
  ],
  "hardInvariants": ["Muss-Regel in einem Satz"]
}

PFLICHT:
- edges.from / edges.to MÜSSEN exakt eine nodes.id sein (nicht Label).
- Mindestens so viele edges wie sinnvolle Beziehungen (Figuren↔Orte, Fakten↔Personen).
- hardInvariants: 6–16 kurze Muss-Sätze (Strings).`;

async function runGraphJsonCall(input: {
  system: string;
  userText: string;
}): Promise<RomanWissensGraph> {
  const { rolle, model } = await resolveRomanKiRolle("bewerter");
  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${input.system}

Antworte NUR als JSON (kein Markdown), Schema:
${GRAPH_JSON_HINT}`,
    userText: input.userText,
    preferJson: true,
    maxTokens: 6_000,
    timeoutMs: 120_000,
  });
  const obj = parseModelJsonObject(raw, "Wissensgraph");
  const parsed = parseRomanWissensGraph({
    ...obj,
    updatedAt: new Date().toISOString(),
    modelLabel: model.label,
  });
  if (!parsed) {
    throw new Error("Wissensgraph konnte nicht gelesen werden.");
  }
  return parsed;
}

/**
 * Seed graph from Idee + Recherche + Spec + Tonalität (pre-Gerüst).
 */
export async function seedWissensGraphFromSources(input: {
  buchTyp: RomanBuchTyp;
  title: string;
  genre: string;
  ideeKurz: string;
  rechercheDossier: string;
  tonalitaet: string;
  grobRegeln: string;
  editorial: RomanEditorial;
  charaktere: RomanCharakter[];
  weltSchauplaetze: string;
  weltRegeln: string;
}): Promise<RomanWissensGraph> {
  const expose = exposeTextFromEditorial(input.editorial);
  const seededFrom: RomanWissensGraphSeedSource[] = [];
  if (input.ideeKurz.trim().length >= 40) seededFrom.push("idee");
  if (input.rechercheDossier.trim().length >= 40) seededFrom.push("recherche");
  if (
    expose.trim().length >= 40 ||
    formatCharaktere(input.charaktere).trim().length >= 40
  ) {
    seededFrom.push("spec");
  }
  if (input.tonalitaet.trim().length >= 12) seededFrom.push("tonalitaet");

  const graph = await runGraphJsonCall({
    system: `Du baust den Wissensgraphen für ein Buchprojekt VOR dem Kapitelgerüst.
Ziel: keine Wissenslücken — alle Figuren, Orte, Fakten aus Idee/Recherche/Spec/Tonalität als Knoten + Relationen.
sinceChapter=0 für alles aus dem Seed. Keine Kapitelplanung, keine Szenen.
hardInvariants: 6–16 verbindliche Muss-Sätze (Stil/Tonalität, Recherche-Fakten, Spec-Logik).`,
    userText: `# Buch
Titel: ${input.title.trim() || "(ohne)"}
Typ: ${BUCHTYP_LABELS[input.buchTyp]}
Genre: ${input.genre.trim() || "—"}

# Idee
${input.ideeKurz.trim().slice(0, CLIP.idee) || "(leer)"}

# Hintergrundrecherche
${input.rechercheDossier.trim().slice(0, CLIP.recherche) || "(leer)"}

# Sprache & Tonalität (Schreiber)
${input.tonalitaet.trim().slice(0, CLIP.grob) || "(leer)"}

# Grob-Regeln
${input.grobRegeln.trim().slice(0, CLIP.grob) || "(leer)"}

# Exposé
${expose.slice(0, CLIP.expose) || "(leer)"}

# Charaktere
${formatCharaktere(input.charaktere).slice(0, CLIP.charaktere) || "(leer)"}

# Welt
Schauplätze: ${input.weltSchauplaetze.trim().slice(0, CLIP.weltSchau) || "(leer)"}
Regeln: ${input.weltRegeln.trim().slice(0, CLIP.weltRegeln) || "(leer)"}

Auftrag: VOLLSTÄNDIGER Seed-Graph (Personen, Orte, Props, Fakten, Secrets, Threads, Regeln, Tone-Knoten, Recherche-Konzepte).
Relationen müssen Spec/Idee/Recherche verbinden. Lücken schließen, Widersprüche als hardInvariants markieren.`,
  });

  return {
    ...graph,
    seededFrom: seededFrom.length ? seededFrom : graph.seededFrom,
  };
}

/**
 * Grow graph with a new Szenenplot batch (chapters just filled).
 */
export async function growWissensGraphFromSzenenBatch(input: {
  previous: RomanWissensGraph;
  batchChapters: RomanSzenenplotStructured["chapters"];
  skeletonOutline: string;
}): Promise<RomanWissensGraph> {
  const batchJson = JSON.stringify(
    input.batchChapters.map((c) => ({
      number: c.number,
      title: c.title,
      kernsatz: c.kernsatz,
      scenes: c.scenes.map((s) => ({
        scene_id: s.scene_id,
        heading: s.heading,
        summary: s.summary,
        characters_present: s.characters_present,
        dramaturgy: s.dramaturgy,
        information_flow: s.information_flow,
        continuity: s.continuity,
      })),
    })),
  ).slice(0, 28_000);

  const grown = await runGraphJsonCall({
    system: `Du aktualisierst den Wissensgraphen nach neuen Szenenplot-Kapiteln.
Bewahre brauchbare Alt-Knoten/Kanten; ergänze Events, States, Enthüllungen, Hooks.
sinceChapter / chapter / sceneId setzen. Keine Löschung wichtiger Seed-Fakten.
hardInvariants aktualisieren (Widersprüche zwischen Seed und Szenen markieren).`,
    userText: `# Bisheriger Graph
${JSON.stringify({
  nodes: input.previous.nodes,
  edges: input.previous.edges,
  hardInvariants: input.previous.hardInvariants,
}).slice(0, 24_000)}

# Kapitelgerüst-Übersicht
${input.skeletonOutline.slice(0, 4_000)}

# Neue Szenen (Batch)
${batchJson}

Liefere den VOLLSTÄNDIG aktualisierten Graphen (nicht nur Diff).`,
  });

  return mergeWissensGraphs(
    {
      ...input.previous,
      seededFrom: Array.from(
        new Set([...input.previous.seededFrom, "szenenplot" as const]),
      ) as RomanWissensGraphSeedSource[],
    },
    grown,
  )!;
}

/**
 * Final gap-close pass after full Szenenplot.
 */
export async function closeWissensGraphGaps(input: {
  graph: RomanWissensGraph;
  structured: RomanSzenenplotStructured;
  ideeKurz: string;
  rechercheDossier: string;
  tonalitaet: string;
}): Promise<RomanWissensGraph> {
  const closed = await runGraphJsonCall({
    system: `Du schließt Lücken im Wissensgraphen nach dem fertigen Kapitelgerüst.
Prüfe: jede zentrale Figur/Ort aus Spec kommt vor; Recherche-Fakten als fact/concept;
Tonalität als tone-Knoten mit Relationen; jede Szene hat Continuity-Anschluss im Graphen;
keine offenen Threads ohne Knoten; hardInvariants vollständig und widerspruchsfrei.
Markiere doppelte Kapitel-/Beat-Funktionen als hardInvariant („Kap. X und Y nicht denselben Beat“).`,
    userText: `# Graph
${JSON.stringify({
  nodes: input.graph.nodes,
  edges: input.graph.edges,
  hardInvariants: input.graph.hardInvariants,
}).slice(0, 28_000)}

# Idee (kurz)
${input.ideeKurz.trim().slice(0, 3_000)}

# Recherche (kurz)
${input.rechercheDossier.trim().slice(0, 4_000)}

# Tonalität
${input.tonalitaet.trim().slice(0, 1_500)}

# Kapitel (nur Nummern/Titel/Kern)
${input.structured.chapters
  .map((c) => `Kap. ${c.number} ${c.title}: ${c.kernsatz}`)
  .join("\n")
  .slice(0, 4_000)}

Liefere den vollständigen, lückenfreien Graphen.`,
  });

  return mergeWissensGraphs(input.graph, {
    ...closed,
    seededFrom: ["szenenplot"],
  })!;
}

/**
 * Update graph after Kapitelgerüst / Manuskript chapter patches (Verbessern).
 * Fail-soft callers should catch and keep previous.
 */
export async function growWissensGraphFromChapterBodies(input: {
  previous: RomanWissensGraph;
  stage: "szenenplot" | "manuskript";
  chapters: Array<{ number: number; title: string; body: string }>;
  patchBrief?: string;
}): Promise<RomanWissensGraph> {
  if (!input.chapters.length) return input.previous;
  const source: RomanWissensGraphSeedSource =
    input.stage === "manuskript" ? "manuskript" : "szenenplot";
  const chapterBlock = input.chapters
    .map(
      (c) =>
        `## Kapitel ${c.number} — ${c.title}\n${c.body.trim().slice(0, 6_000)}`,
    )
    .join("\n\n")
    .slice(0, 28_000);

  const grown = await runGraphJsonCall({
    system: `Du aktualisierst den Wissensgraphen nach eingearbeiteten Kapitel-Patches (${input.stage}).
Bewahre Seed-Fakten; aktualisiere States, Enthüllungen, Threads, Relationen für die genannten Kapitel.
sinceChapter/chapter setzen. hardInvariants bei neuen Widersprüchen oder Doppel-Beats ergänzen.
Keine Löschung zentraler Personen/Orte.`,
    userText: `# Bisheriger Graph
${JSON.stringify({
  nodes: input.previous.nodes,
  edges: input.previous.edges,
  hardInvariants: input.previous.hardInvariants,
}).slice(0, 22_000)}

# Patch-Brief (Kontext)
${(input.patchBrief ?? "").trim().slice(0, 2_500) || "(keiner)"}

# Geänderte Kapitel
${chapterBlock}

Liefere den VOLLSTÄNDIG aktualisierten Graphen.`,
  });

  return mergeWissensGraphs(
    {
      ...input.previous,
      seededFrom: Array.from(
        new Set([...input.previous.seededFrom, source]),
      ) as RomanWissensGraphSeedSource[],
    },
    grown,
  )!;
}
