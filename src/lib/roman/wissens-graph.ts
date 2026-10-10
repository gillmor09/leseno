/**
 * LLM ops for the durable book knowledge graph.
 * Types/parse/format live in `editorial.ts` (`RomanWissensGraph`).
 * Seeded before Kapitelgerüst; grown from Pass-1 skeleton + scene batches;
 * gap-closed at the end; grown again during Manuskript chapter writes.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
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
import { CLIP, ROMAN_PROSE_MAX_TOKENS } from "@/lib/roman/pipeline/quality-brief";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  freezeMetricFactsFromChapters,
  protectFrozenMetricAttrs,
} from "@/lib/roman/wissens-metric-facts";

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

const MAX_INVARIANTS = 40;
const MAX_NODES = 120;
const MAX_EDGES = 180;

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

/** Concrete identity attrs the graph must pin by Plot stage (canon for Manuskript). */
export const WISSENS_CONCRETE_ATTR_HINT = `KONKRETE KANON-DETAILS (spätestens ab Szenenplot — Pflicht, nicht optional):
Für person/place/prop/event/fact passende attrs setzen — wenn Quelle nichts sagt: kanonisch ERFINDEN und festhalten (einmal, dann FROZEN):
- Fahrzeuge/Geräte: kennzeichen|nummernschild, farbe, modell|marke, besitzer
- Orte/Gebäude: adresse|strasse, hausnummer, plz, ort|stadt, etage|zimmer (wenn relevant)
- Zeiten/Termine: datum, uhrzeit|zeit, wochentag (wenn die Story Zeit braucht)
- Personen: name|vorname|nachname, alter (wenn relevant), telefon|handy (nur wenn dramaturgisch genutzt)
- Sonstige Props: farbe, standort, besitzer, zustand
- MESSWERTE (Raum/Objekt — sobald die Prosa eine Zahl nennt): abstand_cm|hoehe_cm|tiefe_cm|breite_cm|laenge_cm|mass_cm + mass_label/mass_kontext
  Beispiele: Auto hängt 11 cm über Carport → abstand_cm=11, mass_label="Auto über Carport"; Türspalt 2 cm → abstand_cm=2
  Zusätzlich hardInvariant: „MASS: Auto über Carport = 11 cm — FROZEN“. Erste Nennung gilt; stilles Ändern verboten.
Jedes zentrale Prop/Ort/Fahrzeug OHNE solche Details = Lücke. hardInvariant für jedes feste Detail („Kennzeichen X gilt“, „Hausnr. Y“, „MASS: … = N cm“, „Termin Do 14:30“).`;

const GRAPH_JSON_HINT = `{
  "nodes": [
    {
      "id": "prop_auto",
      "kind": "person|place|prop|fact|secret|thread|rule|tone|motif|event|concept",
      "label": "Kurzname",
      "summary": "1 Satz",
      "attrs": {
        "status": "planned|active|resolved",
        "introducedChapter": "0",
        "resolvedChapter": "",
        "kennzeichen": "AB-CD 123",
        "besitzer": "Name",
        "farbe": "silber",
        "modell": "Golf",
        "abstand_cm": "11",
        "mass_label": "Auto über Carport",
        "hausnummer": "14",
        "strasse": "Birkenweg",
        "uhrzeit": "14:30",
        "datum": "2024-03-12",
        "name": "Vollständiger Name"
      },
      "sinceChapter": 0,
      "sceneId": ""
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "person_prota",
      "to": "prop_auto",
      "rel": "an|kennt|besitzt|verursacht|enthüllt|widerspricht|erfordert|motiviert|fuehrt_ein|schliesst",
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
- Props/Events: kind=prop|event mit attrs.status + introducedChapter; resolvedChapter wenn abgeschlossen.
- Identifizierende Attrs FEST halten (kennzeichen, farbe, modell, hausnummer, adresse, uhrzeit, datum, name, besitzer, standort) — stilles Ändern verboten; Wechsel nur mit sichtbarem Beat + attrs-Update.
${WISSENS_CONCRETE_ATTR_HINT}
- hardInvariants: 8–24 kurze Muss-Sätze — inkl. „X wird nur einmal eingeführt“, „Kennzeichen Y gilt“, „Hausnr./Uhrzeit/Name Z gilt“, „Y ab Kap. N erledigt — nicht neu erfinden“.`;

async function runGraphJsonCall(input: {
  system: string;
  userText: string;
}): Promise<RomanWissensGraph> {
  const { rolle } = await resolveRomanKiRolle("bewerter");
  const model = await resolveRomanAssistModel();
  const raw = await generateText({
    model,
    systemInstruction: `${rolle.systemPrompt}

${input.system}

Antworte NUR als JSON (kein Markdown), Schema:
${GRAPH_JSON_HINT}`,
    userText: input.userText,
    preferJson: true,
    maxTokens: ROMAN_PROSE_MAX_TOKENS,
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
Zentrale Gegenstände/Verträge/Beweise als kind=prop|event mit attrs.status=planned.
${WISSENS_CONCRETE_ATTR_HINT}
Schon im Seed konkrete attrs setzen, soweit aus Quellen ableitbar oder kanonisch erfunden.
hardInvariants: 8–16 verbindliche Muss-Sätze (Stil/Tonalität, Recherche-Fakten, Spec-Logik, einmalige Einführungen, stabile Kennzeichen/Farben/Adressen/Zeiten).`,
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

type SkeletonGrowChapter = {
  number: number;
  title: string;
  kernsatz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  mustNotRepeat: string[];
  introduces: string[];
  resolves: string[];
};

/**
 * Grow graph after Pass-1 skeleton (before scenes) so batches see lifecycle.
 */
export async function growWissensGraphFromSkeleton(input: {
  previous: RomanWissensGraph;
  skeleton: SkeletonGrowChapter[];
}): Promise<RomanWissensGraph> {
  const outline = input.skeleton
    .map((c) => {
      const bits = [
        `Kern: ${c.kernsatz}`,
        c.props.length ? `Props: ${c.props.join(", ")}` : "",
        c.events.length ? `Events: ${c.events.join(", ")}` : "",
        c.introduces.length ? `Führt ein: ${c.introduces.join(", ")}` : "",
        c.resolves.length ? `Schließt: ${c.resolves.join(", ")}` : "",
        c.openThreads.length ? `Offen: ${c.openThreads.join(", ")}` : "",
        c.mustNotRepeat.length
          ? `Nicht wiederholen: ${c.mustNotRepeat.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return `Kap. ${c.number} — ${c.title}: ${bits}`;
    })
    .join("\n")
    .slice(0, 14_000);

  const grown = await runGraphJsonCall({
    system: `Du aktualisierst den Wissensgraphen nach dem Kapitelgerüst-Pass-1 (ohne Szenen).
Lege für jedes Prop/Event/Thread Knoten an (kind=prop|event|thread).
attrs.status: planned→active bei Einführung; resolved bei Abschluss.
attrs.introducedChapter / resolvedChapter setzen (Zahlen als Strings).
${WISSENS_CONCRETE_ATTR_HINT}
Identifizierende Attrs beibehalten oder bei Wechsel explizit updaten + hardInvariant.
sinceChapter = Kapitel der ersten Einführung.
hardInvariants: jedes introduces genau einmal; resolved Items „nicht neu erfinden“;
Doppel-Beats zwischen Kapiteln markieren; Kennzeichen/Farbe/Adresse/Uhrzeit nicht still ändern.`,
    userText: `# Bisheriger Graph
${JSON.stringify({
  nodes: input.previous.nodes,
  edges: input.previous.edges,
  hardInvariants: input.previous.hardInvariants,
}).slice(0, 22_000)}

# Pass-1 Gerüst (Props/Events/Lebenszyklus)
${outline}

Liefere den VOLLSTÄNDIG aktualisierten Graphen.`,
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
      props: c.props,
      events: c.events,
      openThreads: c.openThreads,
      mustNotRepeat: c.mustNotRepeat,
      introduces: c.introduces,
      resolves: c.resolves,
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
Prop/Event-Lebenszyklus fortschreiben (status, introducedChapter, resolvedChapter).
${WISSENS_CONCRETE_ATTR_HINT}
Aus Szenen-Summaries/Dramaturgie konkrete Details übernehmen oder kanonisch ergänzen (Farbe, Kennzeichen, Hausnr., Uhrzeit, Datum, Namen).
sinceChapter / chapter / sceneId setzen. Keine Löschung wichtiger Seed-Fakten.
hardInvariants aktualisieren (Doppel-Einführungen, Widersprüche Seed↔Szenen, feste Detail-Werte).`,
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
    system: `Du schließt Lücken im Wissensgraphen nach dem fertigen Szenenplot.
Prüfe: jede zentrale Figur/Ort aus Spec kommt vor; Recherche-Fakten als fact/concept;
Tonalität als tone-Knoten mit Relationen; jede Szene hat Continuity-Anschluss im Graphen;
jedes introduces hat genau einen Knoten mit introducedChapter; jedes resolves setzt status=resolved;
keine offenen Threads ohne Knoten; hardInvariants vollständig und widerspruchsfrei.
${WISSENS_CONCRETE_ATTR_HINT}
Markiere doppelte Kapitel-/Beat-Funktionen und Doppel-Einführungen als hardInvariant.`,
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

# Kapitel (Kern + Lebenszyklus)
${input.structured.chapters
  .map((c) => {
    const bits = [
      c.kernsatz,
      c.introduces.length ? `neu=${c.introduces.join(",")}` : "",
      c.resolves.length ? `zu=${c.resolves.join(",")}` : "",
      c.props.length ? `props=${c.props.join(",")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    return `Kap. ${c.number} ${c.title}: ${bits}`;
  })
  .join("\n")
  .slice(0, 6_000)}

Liefere den vollständigen, lückenfreien Graphen.`,
  });

  const merged = mergeWissensGraphs(input.graph, {
    ...closed,
    seededFrom: ["szenenplot"],
  })!;
  // Second pass: force concrete identity attrs before Manuskript.
  try {
    return await enrichWissensGraphConcreteDetails({
      graph: merged,
      structured: input.structured,
    });
  } catch {
    return merged;
  }
}

/** Attr keys that count as "concrete" for thin-node detection. */
const CONCRETE_ATTR_KEYS = [
  "kennzeichen",
  "nummernschild",
  "farbe",
  "color",
  "modell",
  "marke",
  "hausnummer",
  "strasse",
  "adresse",
  "plz",
  "ort",
  "stadt",
  "uhrzeit",
  "zeit",
  "datum",
  "name",
  "vorname",
  "nachname",
  "telefon",
  "handy",
  "besitzer",
  "standort",
  "abstand_cm",
  "hoehe_cm",
  "tiefe_cm",
  "breite_cm",
  "laenge_cm",
  "mass_cm",
  "clearance_cm",
] as const;

/**
 * Nodes (prop/place/person/event/fact) that still lack identifying details.
 */
export function listThinConcreteNodes(
  graph: RomanWissensGraph,
): Array<{ id: string; kind: string; label: string }> {
  const out: Array<{ id: string; kind: string; label: string }> = [];
  for (const n of graph.nodes) {
    if (
      n.kind !== "prop" &&
      n.kind !== "place" &&
      n.kind !== "person" &&
      n.kind !== "event" &&
      n.kind !== "fact"
    ) {
      continue;
    }
    const hasConcrete = CONCRETE_ATTR_KEYS.some((k) =>
      Boolean(n.attrs[k]?.trim()),
    );
    if (!hasConcrete) {
      out.push({ id: n.id, kind: n.kind, label: n.label });
    }
  }
  return out.slice(0, 40);
}

/**
 * Dedicated pass after Plot: invent & freeze concrete canon details
 * (colors, plates, house numbers, times, dates, names) so Manuskript
 * cannot reinvent them chapter by chapter.
 */
export async function enrichWissensGraphConcreteDetails(input: {
  graph: RomanWissensGraph;
  structured: RomanSzenenplotStructured;
}): Promise<RomanWissensGraph> {
  const thin = listThinConcreteNodes(input.graph);
  const chapterBits = input.structured.chapters
    .map((c) => {
      const props = c.props?.length ? `props=${c.props.join(", ")}` : "";
      const events = c.events?.length ? `events=${c.events.join(", ")}` : "";
      const scenes = c.scenes
        .slice(0, 4)
        .map(
          (s) =>
            `${s.scene_id}:${s.heading} — ${s.summary.slice(0, 120)}`,
        )
        .join("; ");
      return `Kap. ${c.number} ${c.title}: ${[props, events, scenes].filter(Boolean).join(" | ")}`;
    })
    .join("\n")
    .slice(0, 8_000);

  const enriched = await runGraphJsonCall({
    system: `Du reichst den Wissensgraphen mit KONKRETEN Kanon-Details an — letzter Pflicht-Schritt vor dem Manuskript.
${WISSENS_CONCRETE_ATTR_HINT}
Bestehende konkrete attrs NIEMALS still ändern. Fehlende Details: aus Plot ableiten oder einmalig erfinden und als hardInvariant fixieren.
Jeder prop/place/person/event/fact-Knoten, der in der Dünn-Liste steht, MUSS passende attrs bekommen.
Fahrzeuge ohne Kennzeichen+Farbe, Orte ohne Adresse/Hausnr., Termine ohne Datum/Uhrzeit, Figuren ohne klaren Namens-Attr = unzulässig.
Liefere den VOLLSTÄNDIGEN Graphen.`,
    userText: `# Graph (Ist)
${JSON.stringify({
  nodes: input.graph.nodes,
  edges: input.graph.edges,
  hardInvariants: input.graph.hardInvariants,
}).slice(0, 28_000)}

# Noch dünne Knoten (ohne konkrete attrs)
${
  thin.length
    ? thin.map((t) => `- ${t.id} (${t.kind}): ${t.label}`).join("\n")
    : "(keine — trotzdem prüfen und nachschärfen)"
}

# Plot-Kontext (Props/Events/Szenen)
${chapterBits}

Liefere den vollständigen Graphen mit ausgefüllten konkreten attrs.`,
  });

  return mergeWissensGraphs(input.graph, {
    ...enriched,
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
Bewahre Seed-Fakten; aktualisiere States, Enthüllungen, Threads, Props/Events (status/introduced/resolved) für die genannten Kapitel.
${WISSENS_CONCRETE_ATTR_HINT}
Identifizierende Attrs beibehalten — stilles Ändern verboten; bei sichtbarem Wechsel attrs updaten + hardInvariant.
sinceChapter/chapter setzen. hardInvariants bei neuen Widersprüchen, Doppel-Beats oder Neu-Erfindung bereits gelöster Props ergänzen.
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

  const merged = mergeWissensGraphs(
    {
      ...input.previous,
      seededFrom: Array.from(
        new Set([...input.previous.seededFrom, source]),
      ) as RomanWissensGraphSeedSource[],
    },
    grown,
  )!;
  // First-seen measurements win; then pull any new cm/mm/m facts from chapter prose.
  const protectedGraph = protectFrozenMetricAttrs(input.previous, merged);
  return freezeMetricFactsFromChapters(protectedGraph, input.chapters);
}
