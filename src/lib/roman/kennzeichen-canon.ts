/**
 * Kennzeichen canon: stop Co-Autor / Graph-Grow inventing new plates
 * (E-HS 1958 → 2046 → 4411 → ES-HS 1412 …).
 */

import type { RomanWissensGraph } from "@/lib/roman/editorial";

/**
 * German passenger-car plate with hyphen (E-HS 1958, ES-HS 1412).
 * Hyphen required — avoids false hits like „Um 8“ / „DIN A4“.
 */
export const KENNZEICHEN_RE =
  /\b[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\s+\d{1,4}[A-Z]?\b/gi;

export function normalizeKennzeichen(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^([A-ZÄÖÜ]{1,3})-?([A-ZÄÖÜ]{1,2})\s+(\d)/, "$1-$2 $3")
    .trim();
}

/** Collect frozen plates from graph identity attrs. */
export function listFrozenKennzeichen(
  graph: RomanWissensGraph | null | undefined,
): string[] {
  if (!graph?.nodes.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    for (const key of ["kennzeichen", "nummernschild", "plate"] as const) {
      const v = n.attrs[key]?.trim();
      if (!v || !/\d/.test(v)) continue;
      const norm = normalizeKennzeichen(v);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/**
 * Prefer a single book plate when the graph agrees (or Passat/Stellplatz wins).
 */
export function resolvePrimaryKennzeichen(
  graph: RomanWissensGraph | null | undefined,
): string | null {
  if (!graph?.nodes.length) return null;
  const preferred = graph.nodes.find((n) =>
    /passat|stellplatz|pkw|fahrzeug|wagen/i.test(n.label),
  );
  for (const key of ["kennzeichen", "nummernschild", "plate"] as const) {
    const v = preferred?.attrs[key]?.trim();
    if (v && /\d/.test(v)) return normalizeKennzeichen(v);
  }
  const all = listFrozenKennzeichen(graph);
  if (all.length === 1) return all[0]!;
  // Majority vote
  const counts = new Map<string, number>();
  for (const n of graph.nodes) {
    for (const key of ["kennzeichen", "nummernschild", "plate"] as const) {
      const v = n.attrs[key]?.trim();
      if (!v || !/\d/.test(v)) continue;
      const norm = normalizeKennzeichen(v);
      counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return best;
}

/**
 * Rewrite invented plate tokens to a frozen Canon plate.
 * Known frozen plates stay; unknown variants (2046 / 4411 / ES-HS 1412) → primary.
 */
export function canonicalizeKennzeichenInText(
  text: string,
  graph: RomanWissensGraph | null | undefined,
): string {
  const primary = resolvePrimaryKennzeichen(graph);
  if (!primary) return text;
  const frozen = new Set(listFrozenKennzeichen(graph));
  return text.replace(KENNZEICHEN_RE, (raw) => {
    const norm = normalizeKennzeichen(raw);
    // Require real plate shape (city-letters + digits), skip „Um 8“ / „DIN A4“.
    if (!/^[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\s+\d{1,4}/i.test(norm)) {
      return raw;
    }
    if (frozen.has(norm)) return norm;
    return primary;
  });
}

/**
 * After Graph-Grow: never silently change existing Kennzeichen attrs.
 */
export function protectFrozenKennzeichenAttrs(
  previous: RomanWissensGraph,
  next: RomanWissensGraph,
): RomanWissensGraph {
  const prevById = new Map(previous.nodes.map((n) => [n.id, n]));
  const nodes = next.nodes.map((n) => {
    const prev = prevById.get(n.id);
    if (!prev) return n;
    const attrs = { ...n.attrs };
    let changed = false;
    for (const key of ["kennzeichen", "nummernschild", "plate"] as const) {
      const oldV = prev.attrs[key]?.trim();
      if (!oldV || !/\d/.test(oldV)) continue;
      const newV = attrs[key]?.trim();
      if (
        !newV ||
        normalizeKennzeichen(newV) !== normalizeKennzeichen(oldV)
      ) {
        attrs[key] = normalizeKennzeichen(oldV);
        changed = true;
      }
    }
    return changed ? { ...n, attrs } : n;
  });

  return { ...next, nodes };
}
