/**
 * Measurable space/object facts for book continuity.
 * First-seen measurements (cm/mm/m) freeze into the Wissensgraph as attrs +
 * `MASS:` hardInvariants; later prose is checked deterministically.
 * Complements identity attrs (plates, addresses) in `wissens-graph.ts`.
 */

import type {
  RomanWissensGraph,
  RomanWissensGraphNode,
} from "@/lib/roman/editorial";

/** Attr keys that pin a numeric measurement (values stored in cm when possible). */
export const METRIC_ATTR_KEYS = [
  "abstand_cm",
  "hoehe_cm",
  "tiefe_cm",
  "breite_cm",
  "laenge_cm",
  "mass_cm",
  "clearance_cm",
] as const;

export type MetricAttrKey = (typeof METRIC_ATTR_KEYS)[number];

export type MetricMention = {
  /** Normalized cm value. */
  valueCm: number;
  /** Raw unit as written. */
  unit: "mm" | "cm" | "m";
  /** ±context around the number for subject matching. */
  context: string;
  /** Subject fingerprint tokens (content words). */
  subjectTokens: string[];
  quote: string;
  chapter?: number;
};

export type FrozenMetricFact = {
  /** Stable key for matching (sorted subject tokens). */
  subjectKey: string;
  valueCm: number;
  label: string;
  /** Source node id when attached to a prop/place/fact. */
  nodeId?: string;
  attrKey?: MetricAttrKey;
  invariant: string;
  sinceChapter?: number;
};

export type MetricFactViolation = {
  code: "metric_drift";
  message: string;
  frozenCm: number;
  foundCm: number;
};

const STOP = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "eines",
  "und",
  "oder",
  "aber",
  "mit",
  "ohne",
  "von",
  "vom",
  "zum",
  "zur",
  "zu",
  "im",
  "in",
  "am",
  "an",
  "auf",
  "aus",
  "bei",
  "nach",
  "über",
  "uber",
  "unter",
  "vor",
  "hinter",
  "neben",
  "zwischen",
  "sich",
  "ist",
  "war",
  "sind",
  "waren",
  "wird",
  "wurde",
  "als",
  "wie",
  "noch",
  "nur",
  "schon",
  "etwa",
  "fast",
  "rund",
  "ca",
  "circa",
  "ungefähr",
  "ungefaehr",
  "zentimeter",
  "millimeter",
  "meter",
  "cm",
  "mm",
  "m",
]);

const MEASURE_RE =
  /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|millimeter|zentimeter|meter)\b/gi;

const MASS_INV_RE =
  /^MASS:\s*(.+?)\s*=\s*([\d.,]+)\s*cm\b/i;

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toCm(value: number, unitRaw: string): number | null {
  const u = unitRaw.toLowerCase();
  if (u === "mm" || u === "millimeter") return value / 10;
  if (u === "cm" || u === "zentimeter") return value;
  if (u === "m" || u === "meter") return value * 100;
  return null;
}

function unitCanonical(unitRaw: string): "mm" | "cm" | "m" {
  const u = unitRaw.toLowerCase();
  if (u === "mm" || u === "millimeter") return "mm";
  if (u === "m" || u === "meter") return "m";
  return "cm";
}

function tokenizeSubject(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß\s-]/gi, " ")
    .split(/[\s/-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

function subjectKeyOf(tokens: string[]): string {
  return [...tokens].sort().join("|");
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const as = new Set(a);
  const bs = new Set(b);
  let inter = 0;
  for (const t of as) if (bs.has(t)) inter += 1;
  const union = as.size + bs.size - inter;
  return union > 0 ? inter / union : 0;
}

function formatCm(cm: number): string {
  if (Number.isInteger(cm)) return String(cm);
  return cm.toFixed(1).replace(/\.0$/, "");
}

/** Pull measurement mentions from German prose (with local context). */
export function extractMetricMentions(
  prose: string,
  chapter?: number,
): MetricMention[] {
  const text = prose.replace(/\s+/g, " ").trim();
  if (text.length < 20) return [];
  const out: MetricMention[] = [];
  MEASURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MEASURE_RE.exec(text)) !== null) {
    const value = parseNumber(m[1] ?? "");
    if (value === null) continue;
    // Ignore huge distances / story geography (km-scale via "m" with huge numbers).
    const unit = unitCanonical(m[2] ?? "cm");
    const valueCm = toCm(value, m[2] ?? "cm");
    if (valueCm === null) continue;
    // Keep shelf-scale / object-scale facts; skip road distances etc.
    if (valueCm > 5_000 || valueCm < 0.05) continue;
    const start = Math.max(0, m.index - 70);
    const end = Math.min(text.length, m.index + m[0].length + 70);
    const context = text.slice(start, end).trim();
    const subjectTokens = tokenizeSubject(context);
    if (subjectTokens.length < 1) continue;
    out.push({
      valueCm,
      unit,
      context,
      subjectTokens,
      quote: m[0],
      chapter,
    });
    if (out.length >= 40) break;
  }
  return out;
}

function invariantLine(label: string, valueCm: number, chapter?: number): string {
  const kap =
    chapter && chapter > 0 ? ` (seit Kap. ${chapter})` : "";
  return `MASS: ${label} = ${formatCm(valueCm)} cm — FROZEN${kap}`;
}

function labelFromTokens(tokens: string[], fallback: string): string {
  const nice = tokens.slice(0, 5).join(" ");
  return (nice || fallback).slice(0, 80);
}

function pickAttrKey(tokens: string[]): MetricAttrKey {
  const joined = tokens.join(" ");
  if (/abstand|clearance|luft|lücke|luecke|spalt|über|uber/.test(joined)) {
    return "abstand_cm";
  }
  if (/höhe|hoehe|hoch|tief/.test(joined)) {
    if (/tief/.test(joined)) return "tiefe_cm";
    return "hoehe_cm";
  }
  if (/breite|breit/.test(joined)) return "breite_cm";
  if (/länge|laenge|lang/.test(joined)) return "laenge_cm";
  return "mass_cm";
}

function findBestNode(
  nodes: RomanWissensGraphNode[],
  tokens: string[],
): RomanWissensGraphNode | null {
  let best: RomanWissensGraphNode | null = null;
  let bestScore = 0;
  for (const n of nodes) {
    if (
      n.kind !== "prop" &&
      n.kind !== "place" &&
      n.kind !== "fact" &&
      n.kind !== "event" &&
      n.kind !== "person"
    ) {
      continue;
    }
    const nodeTokens = tokenizeSubject(
      `${n.label} ${n.summary} ${Object.values(n.attrs).join(" ")}`,
    );
    const score = jaccard(tokens, nodeTokens);
    // Prefer props/places slightly.
    const boost = n.kind === "prop" || n.kind === "place" ? 0.05 : 0;
    if (score + boost > bestScore) {
      bestScore = score + boost;
      best = n;
    }
  }
  return bestScore >= 0.15 ? best : null;
}

/** Parse frozen MASS invariants + metric attrs from the graph. */
export function listFrozenMetricFacts(
  graph: RomanWissensGraph | null | undefined,
): FrozenMetricFact[] {
  if (!graph) return [];
  const out: FrozenMetricFact[] = [];
  const seen = new Set<string>();

  for (const inv of graph.hardInvariants ?? []) {
    const m = MASS_INV_RE.exec(inv.trim());
    if (!m) continue;
    const label = (m[1] ?? "").trim();
    const valueCm = parseNumber(m[2] ?? "");
    if (!label || valueCm === null) continue;
    const tokens = tokenizeSubject(label);
    const key = subjectKeyOf(tokens.length ? tokens : tokenizeSubject(label));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      subjectKey: key,
      valueCm,
      label,
      invariant: inv.trim(),
    });
  }

  for (const n of graph.nodes) {
    for (const attrKey of METRIC_ATTR_KEYS) {
      const raw = n.attrs[attrKey]?.trim();
      if (!raw) continue;
      const valueCm = parseNumber(raw);
      if (valueCm === null) continue;
      const label =
        n.attrs.mass_label?.trim() ||
        `${n.label}${n.attrs.mass_kontext ? ` ${n.attrs.mass_kontext}` : ""}`.trim();
      const tokens = tokenizeSubject(
        `${label} ${n.label} ${n.summary} ${n.attrs.mass_kontext ?? ""}`,
      );
      const key = subjectKeyOf(tokens.length ? tokens : [n.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      const since = Number(n.attrs.introducedChapter ?? n.sinceChapter ?? 0);
      out.push({
        subjectKey: key,
        valueCm,
        label: label.slice(0, 80),
        nodeId: n.id,
        attrKey,
        invariant: invariantLine(label, valueCm, Number.isFinite(since) ? since : undefined),
        sinceChapter: Number.isFinite(since) && since > 0 ? since : undefined,
      });
    }
  }

  return out.slice(0, 48);
}

/**
 * Keep previously frozen metric attrs when an LLM grow overwrote them.
 * First-seen wins for continuity.
 */
export function protectFrozenMetricAttrs(
  previous: RomanWissensGraph,
  incoming: RomanWissensGraph,
): RomanWissensGraph {
  const prevById = new Map(previous.nodes.map((n) => [n.id, n]));
  const nodes = incoming.nodes.map((n) => {
    const prev = prevById.get(n.id);
    if (!prev) return n;
    let changed = false;
    const attrs = { ...n.attrs };
    for (const key of METRIC_ATTR_KEYS) {
      const oldVal = prev.attrs[key]?.trim();
      if (!oldVal) continue;
      if (attrs[key]?.trim() !== oldVal) {
        attrs[key] = oldVal;
        changed = true;
      }
    }
    for (const key of ["mass_label", "mass_kontext"] as const) {
      const oldVal = prev.attrs[key]?.trim();
      if (!oldVal) continue;
      if (!attrs[key]?.trim()) {
        attrs[key] = oldVal;
        changed = true;
      }
    }
    return changed ? { ...n, attrs } : n;
  });

  // Keep prior MASS invariants even if the model dropped them.
  const inv = new Set<string>();
  for (const h of [...previous.hardInvariants, ...incoming.hardInvariants]) {
    if (h.trim()) inv.add(h.trim().slice(0, 280));
    if (inv.size >= 40) break;
  }

  return {
    ...incoming,
    nodes,
    hardInvariants: Array.from(inv),
  };
}

function matchFrozen(
  mention: MetricMention,
  frozen: FrozenMetricFact[],
): FrozenMetricFact | null {
  let best: FrozenMetricFact | null = null;
  let bestScore = 0;
  for (const f of frozen) {
    const fTokens = tokenizeSubject(f.label);
    const score = Math.max(
      jaccard(mention.subjectTokens, fTokens),
      jaccard(mention.subjectTokens, f.subjectKey.split("|").filter(Boolean)),
    );
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  // Require at least one shared content token for a match.
  return bestScore >= 0.2 ? best : null;
}

/** Absolute tolerance in cm — 11 vs 20 must always fail. */
function valuesConflict(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const tol = Math.max(0.6, Math.min(a, b) * 0.08);
  return diff > tol;
}

/**
 * Freeze first-seen measurements from chapter bodies into the graph.
 * Never overwrites an existing metric attr / MASS invariant.
 */
export function freezeMetricFactsFromChapters(
  graph: RomanWissensGraph,
  chapters: Array<{ number: number; title: string; body: string }>,
): RomanWissensGraph {
  let frozen = listFrozenMetricFacts(graph);
  const nodes = graph.nodes.map((n) => ({
    ...n,
    attrs: { ...n.attrs },
  }));
  const invariants = [...graph.hardInvariants];
  const invSet = new Set(invariants.map((h) => h.trim()));

  for (const ch of chapters) {
    const mentions = extractMetricMentions(ch.body, ch.number);
    for (const mention of mentions) {
      const existing = matchFrozen(mention, frozen);
      if (existing) {
        // Drift in source text is a writer problem; do not rewrite the freeze.
        continue;
      }
      const label = labelFromTokens(
        mention.subjectTokens,
        mention.quote,
      );
      const attrKey = pickAttrKey(mention.subjectTokens);
      const inv = invariantLine(label, mention.valueCm, ch.number);
      if (!invSet.has(inv)) {
        invariants.push(inv);
        invSet.add(inv);
      }

      let node = findBestNode(nodes, mention.subjectTokens);
      if (!node) {
        const id = `fact_mass_${subjectKeyOf(mention.subjectTokens)
          .replace(/\|/g, "_")
          .slice(0, 40) || `c${ch.number}`}`;
        const created: RomanWissensGraphNode = {
          id,
          kind: "fact",
          label: label.slice(0, 60),
          summary: `Messwert aus Kap. ${ch.number}: ${formatCm(mention.valueCm)} cm`,
          attrs: {
            status: "active",
            introducedChapter: String(ch.number),
            [attrKey]: formatCm(mention.valueCm),
            mass_label: label,
            mass_kontext: mention.context.slice(0, 120),
          },
          sinceChapter: ch.number,
        };
        nodes.push(created);
        node = created;
      } else {
        if (!node.attrs[attrKey]?.trim()) {
          node.attrs[attrKey] = formatCm(mention.valueCm);
        }
        if (!node.attrs.mass_label?.trim()) {
          node.attrs.mass_label = label;
        }
        if (!node.attrs.mass_kontext?.trim()) {
          node.attrs.mass_kontext = mention.context.slice(0, 120);
        }
      }

      frozen = [
        ...frozen,
        {
          subjectKey: subjectKeyOf(mention.subjectTokens),
          valueCm: mention.valueCm,
          label,
          nodeId: node.id,
          attrKey,
          invariant: inv,
          sinceChapter: ch.number,
        },
      ];
      if (invariants.length >= 40) break;
    }
    if (invariants.length >= 40) break;
  }

  return {
    ...graph,
    updatedAt: new Date().toISOString(),
    nodes: nodes.slice(0, 120),
    hardInvariants: invariants.slice(0, 40),
  };
}

/**
 * Deterministic check: prose measurements must not contradict frozen MASS facts.
 */
export function validateProseAgainstMetricFacts(input: {
  prose: string;
  graph?: RomanWissensGraph | null;
  /** Optional precomputed facts (skips graph parse). */
  frozen?: FrozenMetricFact[];
}): { ok: boolean; violations: MetricFactViolation[] } {
  const frozen =
    input.frozen ?? listFrozenMetricFacts(input.graph ?? null);
  if (!frozen.length || input.prose.trim().length < 40) {
    return { ok: true, violations: [] };
  }

  const mentions = extractMetricMentions(input.prose);
  const violations: MetricFactViolation[] = [];
  for (const mention of mentions) {
    const match = matchFrozen(mention, frozen);
    if (!match) continue;
    if (!valuesConflict(match.valueCm, mention.valueCm)) continue;
    violations.push({
      code: "metric_drift",
      message: `Maß-Widerspruch: „${match.label}“ ist FROZEN auf ${formatCm(match.valueCm)} cm, Text sagt ${formatCm(mention.valueCm)} cm („${mention.quote}“).`,
      frozenCm: match.valueCm,
      foundCm: mention.valueCm,
    });
    if (violations.length >= 6) break;
  }
  return { ok: violations.length === 0, violations };
}

/** Block for Manuskript fact contracts / chapter packet. */
export function formatMetricFactsForContracts(
  graph: RomanWissensGraph | null | undefined,
  maxLines = 10,
): string {
  const facts = listFrozenMetricFacts(graph);
  if (!facts.length) return "";
  const lines = [
    "### Messwerte (FROZEN — hart, nicht still ändern)",
    ...facts.slice(0, maxLines).map(
      (f) =>
        `- ${f.label} = ${formatCm(f.valueCm)} cm — FROZEN${
          f.sinceChapter ? ` (seit Kap. ${f.sinceChapter})` : ""
        }`,
    ),
  ];
  return lines.join("\n");
}

export function formatMetricViolationRewriteBrief(
  violations: MetricFactViolation[],
): string {
  if (!violations.length) return "";
  return [
    "## Maß-Widerspruch — Korrektur (verbindlich)",
    "Der Entwurf widerspricht eingefrorenen Messwerten aus dem Wissensgraphen. Schreibe neu und nutze EXAKT die FROZEN-Werte:",
    ...violations.map((v, i) => `${i + 1}. ${v.message}`),
    "Keine neuen Maße erfinden. Handlung behalten; nur die Zahlen/Angaben an den Canon anpassen.",
  ].join("\n");
}
