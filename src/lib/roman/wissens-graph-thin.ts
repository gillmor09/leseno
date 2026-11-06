/**
 * Client-safe thin-node detection for the Wissensgraph.
 * Kept free of `@/lib/ai/*` so admin webpack bundles stay Node-API-free.
 */

import type { RomanWissensGraph } from "@/lib/roman/editorial";

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
