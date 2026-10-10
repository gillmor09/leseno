/**
 * Kontinuitäts-Pass (Gerüst → Plot → Manuskript):
 * scan Canon (MASS, Prop-Identität, Namens-Aliasse) vs stage text and
 * hard-apply surgical string fixes — no Verbessern / content-freeze.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { resolveRomanAssistModel } from "@/lib/roman/assist-model";
import type {
  RomanEditorial,
  RomanWissensGraph,
} from "@/lib/roman/editorial";
import {
  parsePlotChapters,
  serializeManuskriptChapters,
  serializePlotChapters,
} from "@/lib/roman/plot-chapters";
import type { RomanCharakter } from "@/lib/roman/types";
import {
  extractMetricMentions,
  freezeMetricFactsFromChapters,
  listFrozenMetricFacts,
  protectFrozenMetricAttrs,
  type FrozenMetricFact,
  type MetricMention,
} from "@/lib/roman/wissens-metric-facts";

/** Which stored artifact the pass reads/writes. */
export type ContinuityTarget =
  | "kapitelgeruest"
  | "szenenplot"
  | "manuskript";

export type ContinuityFixKind = "mass" | "identity" | "name";

export const CONTINUITY_TARGET_LABEL: Record<ContinuityTarget, string> = {
  kapitelgeruest: "Kapitelgerüst",
  szenenplot: "Szenenplot",
  manuskript: "Manuskript",
};

export type ContinuityFix = {
  id: string;
  kind: ContinuityFixKind;
  chapter: number;
  /** Exact substring to replace (first safe occurrence in chapter/body). */
  find: string;
  replace: string;
  reason: string;
  /** Optional: only apply when this context window matches nearby. */
  nearHint?: string;
};

export type ContinuityScanResult = {
  fixes: ContinuityFix[];
  /** German summary for UI. */
  summary: string;
};

const IDENTITY_KEYS = [
  "kennzeichen",
  "nummernschild",
  "plate",
  "farbe",
  "color",
  "modell",
  "model",
  "marke",
  "brand",
  "hausnummer",
  "strasse",
  "adresse",
] as const;

const PLATE_RE =
  /\b[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\s*\d{1,4}[A-Z]?\b/g;

const ONES = [
  "null",
  "ein",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
];
const TENS = [
  "",
  "",
  "zwanzig",
  "dreißig",
  "vierzig",
  "fünfzig",
  "sechzig",
  "siebzig",
  "achtzig",
  "neunzig",
];

function deUnder100(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (o === 0) return TENS[t] ?? String(n);
  return `${ONES[o]}und${TENS[t]}`;
}

/**
 * German measure for prose replace — prefer spoken forms for common lengths.
 */
export function formatGermanMeasure(cm: number): string {
  if (!Number.isFinite(cm) || cm <= 0) return `${cm} cm`;
  const rounded = Math.round(cm * 10) / 10;
  if (Math.abs(rounded - 20) < 0.05) return "zwanzig Zentimeter";
  if (Math.abs(rounded - 505) < 0.05) {
    return "fünf Meter und fünf Zentimeter";
  }
  if (Math.abs(rounded - 485) < 0.05) return "vier Meter fünfundachtzig";
  if (rounded >= 100) {
    const m = Math.floor(rounded / 100);
    const rest = Math.round(rounded - m * 100);
    if (rest === 0) {
      return m === 1 ? "ein Meter" : `${deUnder100(m)} Meter`;
    }
    if (rest < 100 && m < 20) {
      const mWord = m === 1 ? "ein" : deUnder100(m);
      if (rest < 20) {
        return `${mWord} Meter ${deUnder100(rest)}`;
      }
      // e.g. 4,85 → vier Meter fünfundachtzig
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      if (o === 0) return `${mWord} Meter ${TENS[t]}`;
      return `${mWord} Meter ${ONES[o]}und${TENS[t]}`;
    }
    const meters = (rounded / 100).toFixed(2).replace(".", ",").replace(/,?0+$/, "");
    return `${meters} m`;
  }
  if (Number.isInteger(rounded) && rounded < 100) {
    return `${deUnder100(rounded)} Zentimeter`;
  }
  return `${String(rounded).replace(".", ",")} cm`;
}

function valuesConflict(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const tol = Math.max(0.6, Math.min(a, b) * 0.08);
  return diff > tol;
}

function matchFrozen(
  mention: MetricMention,
  frozen: FrozenMetricFact[],
): FrozenMetricFact | null {
  let best: FrozenMetricFact | null = null;
  let bestScore = 0;
  for (const f of frozen) {
    const fTokens = f.label
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/i)
      .filter((t) => t.length >= 3);
    const score = jaccardSimple(mention.subjectTokens, fTokens);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore >= 0.2 ? best : null;
}

function jaccardSimple(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const as = new Set(a.map((x) => x.toLowerCase()));
  const bs = new Set(b.map((x) => x.toLowerCase()));
  let inter = 0;
  for (const t of as) if (bs.has(t)) inter += 1;
  const union = as.size + bs.size - inter;
  return union > 0 ? inter / union : 0;
}

const WORD_NUM: Record<string, number> = {
  null: 0,
  ein: 1,
  eine: 1,
  eins: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  zwoelf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fünfzehn: 15,
  fuenfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
  dreißig: 30,
  dreissig: 30,
  vierzig: 40,
  fünfzig: 50,
  fuenfzig: 50,
  sechzig: 60,
  siebzig: 70,
  achtzig: 80,
  neunzig: 90,
};

function parseDeCompound(raw: string): number | null {
  const s = raw.toLowerCase().replace(/ß/g, "ss");
  if (WORD_NUM[s] != null) return WORD_NUM[s]!;
  const und = s.match(/^(.+)und(.+)$/);
  if (und) {
    const a = WORD_NUM[und[1]!] ?? null;
    const b = WORD_NUM[und[2]!] ?? null;
    if (a != null && b != null && b >= 20) return a + b;
  }
  return null;
}

/**
 * German verbal lengths (e.g. „fünf Meter fünfzig“, „zwanzig Zentimeter“).
 */
export function extractVerbalMetricMentions(
  prose: string,
  chapter?: number,
): MetricMention[] {
  const text = prose.replace(/\s+/g, " ");
  const out: MetricMention[] = [];
  const patterns: Array<{ re: RegExp; toCm: (m: RegExpExecArray) => number | null }> = [
    {
      re: /\b(null|ein|eine|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|dreizehn|vierzehn|fünfzehn|fuenfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|sechzig|siebzig|achtzig|neunzig|[a-zäöüß]+und[a-zäöüß]+)\s+Zentimeter\b/gi,
      toCm: (m) => parseDeCompound(m[1] ?? ""),
    },
    {
      re: /\b(null|ein|eine|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\s+Meter(?:\s+und)?\s+((?:[a-zäöüß]+und)?[a-zäöüß]+)\b/gi,
      toCm: (m) => {
        const meters = parseDeCompound(m[1] ?? "");
        const rest = parseDeCompound(m[2] ?? "");
        if (meters == null || rest == null) return null;
        // „fünf Meter fünfzig“ → 5m + 50cm = 550cm; „vier Meter fünfundachtzig“ → 485
        if (rest < 100) return meters * 100 + rest;
        return null;
      },
    },
  ];

  for (const { re, toCm } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const valueCm = toCm(m);
      if (valueCm == null || valueCm < 0.05 || valueCm > 5_000) continue;
      const start = Math.max(0, m.index - 70);
      const end = Math.min(text.length, m.index + m[0].length + 70);
      const context = text.slice(start, end).trim();
      const subjectTokens = context
        .toLowerCase()
        .split(/[^a-z0-9äöüß]+/i)
        .filter((t) => t.length >= 3)
        .slice(0, 8);
      out.push({
        valueCm,
        unit: valueCm >= 100 ? "m" : "cm",
        context,
        subjectTokens,
        quote: m[0],
        chapter,
      });
      if (out.length >= 40) return out;
    }
  }
  return out;
}

/** Scan MASS drifts chapter by chapter. */
export function scanMetricContinuityFixes(
  manuskriptText: string,
  graph: RomanWissensGraph | null | undefined,
): ContinuityFix[] {
  const frozen = listFrozenMetricFacts(graph);
  if (!frozen.length) return [];
  const chapters = parsePlotChapters(manuskriptText);
  const fixes: ContinuityFix[] = [];
  const seen = new Set<string>();

  for (const ch of chapters) {
    const mentions = [
      ...extractMetricMentions(ch.body, ch.number),
      ...extractVerbalMetricMentions(ch.body, ch.number),
    ];
    for (const mention of mentions) {
      const match = matchFrozen(mention, frozen);
      if (!match) continue;
      if (!valuesConflict(match.valueCm, mention.valueCm)) continue;
      const replace = formatGermanMeasure(match.valueCm);
      if (replace === mention.quote) continue;
      const id = `mass:${ch.number}:${mention.quote}:${match.valueCm}`;
      if (seen.has(id)) continue;
      seen.add(id);
      fixes.push({
        id,
        kind: "mass",
        chapter: ch.number,
        find: mention.quote,
        replace,
        reason: `Maß „${match.label}“ ist FROZEN auf ${match.valueCm} cm — Text hat „${mention.quote}“.`,
        nearHint: mention.subjectTokens.slice(0, 4).join(" "),
      });
      if (fixes.length >= 40) return fixes;
    }
  }
  return fixes;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan Prop identity attrs (plates etc.) against prose. */
export function scanIdentityContinuityFixes(
  manuskriptText: string,
  graph: RomanWissensGraph | null | undefined,
): ContinuityFix[] {
  if (!graph?.nodes.length) return [];
  const chapters = parsePlotChapters(manuskriptText);
  const fixes: ContinuityFix[] = [];
  const seen = new Set<string>();

  const props = graph.nodes.filter(
    (n) =>
      n.kind === "prop" ||
      n.kind === "place" ||
      n.kind === "person" ||
      n.kind === "fact",
  );

  for (const node of props) {
    for (const key of IDENTITY_KEYS) {
      const canon = node.attrs[key]?.trim();
      if (!canon || canon.length < 2) continue;

      if (key === "kennzeichen" || key === "nummernschild" || key === "plate") {
        const plates = new Set<string>();
        PLATE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PLATE_RE.exec(manuskriptText)) !== null) {
          plates.add(m[0].replace(/\s+/g, " ").trim());
        }
        const canonNorm = canon.replace(/\s+/g, " ").trim();
        for (const plate of plates) {
          if (plate.replace(/\s+/g, " ") === canonNorm) continue;
          // Only flag if chapter also mentions this prop label / vehicle words
          for (const ch of chapters) {
            if (!ch.body.includes(plate)) continue;
            const nearProp =
              ch.body.toLowerCase().includes(node.label.toLowerCase()) ||
              /kennzeichen|nummernschild|iX|BMW|Wagen|Auto/i.test(ch.body);
            if (!nearProp) continue;
            const id = `id:plate:${ch.number}:${plate}`;
            if (seen.has(id)) continue;
            seen.add(id);
            fixes.push({
              id,
              kind: "identity",
              chapter: ch.number,
              find: plate,
              replace: canonNorm,
              reason: `${node.label}: Kennzeichen FROZEN „${canonNorm}“, Text hat „${plate}“.`,
              nearHint: node.label,
            });
          }
        }
        continue;
      }

      // Generic: if canon never appears but a close wrong form does — skip (too risky).
      // Only suggest when hardInvariant explicitly pins the value and a conflicting
      // short token appears near the label.
      void key;
    }
  }

  return fixes.slice(0, 30);
}

type AliasCluster = {
  canon: string;
  aliases: string[];
  /** Prefer replacing „Frau Alias“ → „Frau Canon“. */
  frauForms: boolean;
  /** If true, only replace bare surname near school keywords. */
  schoolContextOnly: boolean;
};

async function detectNameAliasClusters(input: {
  manuskriptText: string;
  graph: RomanWissensGraph | null | undefined;
  charaktere: RomanCharakter[];
}): Promise<AliasCluster[]> {
  const personLabels = (input.graph?.nodes ?? [])
    .filter((n) => n.kind === "person")
    .map((n) => n.label.trim())
    .filter(Boolean)
    .slice(0, 40);
  const charNames = input.charaktere
    .map((c) => c.name.trim())
    .filter(Boolean)
    .slice(0, 40);

  // Sample chapters mentioning Frau X patterns
  const chapters = parsePlotChapters(input.manuskriptText);
  const frauHits = new Map<string, number>();
  for (const ch of chapters) {
    for (const m of ch.body.matchAll(/\bFrau\s+([A-ZÄÖÜ][a-zäöüß]{2,})\b/g)) {
      const name = m[1]!;
      frauHits.set(name, (frauHits.get(name) ?? 0) + 1);
    }
  }
  if (frauHits.size < 2 && personLabels.length < 2) return [];

  try {
    const model = await resolveRomanAssistModel();
    const raw = await generateText({
      model,
      preferJson: true,
      maxTokens: 800,
      timeoutMs: 45_000,
      reasoningEffort: "none",
      systemInstruction: `Du erkennst Namens-Drift in einem deutschen Roman-Manuskript.
Aufgabe: Finde Cluster, in denen DIESSELBE Figur unter mehreren Nachnamen vorkommt (z. B. Lehrerin Lindemann/Tebrügge/Kuhlmann).
NICHT zusammenlegen: verschiedene echte Personen (z. B. Nachbar Hartmut Kuhlmann vs. Lehrerin).
Antwort NUR JSON:
{"clusters":[{"canon":"Tebrügge","aliases":["Lindemann"],"frauForms":true,"schoolContextOnly":true}]}
canon = häufigster/mittlerer kanonischer Nachname. aliases = zu ersetzende falsche Nachnamen.
schoolContextOnly=true wenn nur Schul-/Lehrer-Kontext ersetzt werden soll (nicht Nachbarschaft).
Leeres clusters-Array wenn nichts eindeutig ist. Keine Stilkommentare.`,
      userText: `# Figuren (Steckbrief)
${charNames.join(", ") || "(keine)"}

# Personen-Knoten (Graph)
${personLabels.join(", ") || "(keine)"}

# „Frau X“-Häufigkeiten
${[...frauHits.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([n, c]) => `${n}: ${c}`)
  .join("\n") || "(keine)"}

# Stichprobe Kap. 1 / Mitte / Ende (gekürzt)
${[chapters[0], chapters[Math.floor(chapters.length / 2)], chapters[chapters.length - 1]]
  .filter(Boolean)
  .map((c) => `## Kap. ${c!.number}\n${c!.body.slice(0, 1_200)}`)
  .join("\n\n")
  .slice(0, 8_000)}
`,
    });
    const parsed = parseModelJsonObject(raw) as {
      clusters?: Array<Record<string, unknown>>;
    };
    const out: AliasCluster[] = [];
    for (const row of parsed.clusters ?? []) {
      const canon = String(row.canon ?? "").trim();
      const aliases = Array.isArray(row.aliases)
        ? row.aliases.map((a) => String(a).trim()).filter(Boolean)
        : [];
      if (!canon || aliases.length < 1) continue;
      if (aliases.some((a) => a.toLowerCase() === canon.toLowerCase())) continue;
      out.push({
        canon,
        aliases: aliases.filter((a) => a.toLowerCase() !== canon.toLowerCase()),
        frauForms: row.frauForms !== false,
        schoolContextOnly: Boolean(row.schoolContextOnly),
      });
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}

const SCHOOL_RE =
  /Mathe|Lehrerin|Klasse|Schule|Aufsatz|Note|Sechs|Zeugnis|Klausur|Elternsprechtag|Unterricht|Tafel|Hausaufgabe/i;

export function scanNameFixesFromClusters(
  manuskriptText: string,
  clusters: AliasCluster[],
): ContinuityFix[] {
  if (!clusters.length) return [];
  const chapters = parsePlotChapters(manuskriptText);
  const fixes: ContinuityFix[] = [];
  const seen = new Set<string>();

  for (const cluster of clusters) {
    for (const alias of cluster.aliases) {
      for (const ch of chapters) {
        if (cluster.frauForms) {
          const frauFind = `Frau ${alias}`;
          const frauRe = new RegExp(`Frau\\s+${escapeRegExp(alias)}\\b`, "g");
          if (frauRe.test(ch.body)) {
            const id = `name:frau:${ch.number}:${alias}`;
            if (!seen.has(id)) {
              seen.add(id);
              fixes.push({
                id,
                kind: "name",
                chapter: ch.number,
                find: frauFind,
                replace: `Frau ${cluster.canon}`,
                reason: `Namens-Canon: „Frau ${alias}“ → „Frau ${cluster.canon}“ (Alias-Cluster).`,
              });
            }
          }
        }

        const bareRe = new RegExp(`(?<!Hartmut\\s)\\b${escapeRegExp(alias)}\\b`, "g");
        if (!bareRe.test(ch.body)) continue;
        if (cluster.schoolContextOnly && !SCHOOL_RE.test(ch.body)) {
          // Still allow if Frau form already handled; skip bare surname outside school chapters
          continue;
        }
        // Count bare occurrences excluding those already „Frau Alias“
        const stripped = ch.body.replace(
          new RegExp(`Frau\\s+${escapeRegExp(alias)}\\b`, "g"),
          "",
        );
        if (!new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(stripped)) continue;
        // Avoid replacing Hartmut Kuhlmann etc.
        if (
          new RegExp(`Hartmut\\s+${escapeRegExp(alias)}\\b`).test(ch.body) &&
          !SCHOOL_RE.test(ch.body)
        ) {
          continue;
        }
        const id = `name:bare:${ch.number}:${alias}`;
        if (seen.has(id)) continue;
        seen.add(id);
        fixes.push({
          id,
          kind: "name",
          chapter: ch.number,
          find: alias,
          replace: cluster.canon,
          reason: `Namens-Canon: „${alias}“ → „${cluster.canon}“${
            cluster.schoolContextOnly ? " (Schulkontext)" : ""
          }.`,
          nearHint: cluster.schoolContextOnly ? "Schule" : undefined,
        });
      }
    }
  }
  return fixes.slice(0, 50);
}

/**
 * Full continuity scan (MASS + identity + optional alias LLM).
 * `sourceText` = Gerüst-/Plot-/Manuskript-Markdown.
 */
export async function scanManuskriptContinuity(input: {
  /** @deprecated use sourceText */
  manuskriptText?: string;
  sourceText?: string;
  target?: ContinuityTarget;
  wissensGraph?: RomanWissensGraph | null;
  charaktere?: RomanCharakter[];
  /** Skip LLM alias detection (tests). */
  skipAliasLlm?: boolean;
}): Promise<ContinuityScanResult> {
  const label = CONTINUITY_TARGET_LABEL[input.target ?? "manuskript"];
  const ms = (input.sourceText ?? input.manuskriptText ?? "").replace(
    /\r\n/g,
    "\n",
  );
  if (ms.trim().length < 40) {
    return { fixes: [], summary: `Kein ${label}-Text.` };
  }

  const mass = scanMetricContinuityFixes(ms, input.wissensGraph);
  const identity = scanIdentityContinuityFixes(ms, input.wissensGraph);
  let names: ContinuityFix[] = [];
  if (!input.skipAliasLlm) {
    const clusters = await detectNameAliasClusters({
      manuskriptText: ms,
      graph: input.wissensGraph,
      charaktere: input.charaktere ?? [],
    });
    names = scanNameFixesFromClusters(ms, clusters);
  }

  const fixes = [...mass, ...identity, ...names];
  const byKind = {
    mass: mass.length,
    identity: identity.length,
    name: names.length,
  };
  const summary = fixes.length
    ? `${label}: ${fixes.length} Canon-Abweichungen — ${byKind.mass} Maße, ${byKind.identity} Identität, ${byKind.name} Namen.`
    : `${label}: keine Canon-Abweichungen (Maße / Identität / Namens-Aliasse).`;

  return { fixes, summary };
}

/** Deep string replace for structured Gerüst/Plot JSON mirrors. */
export function deepReplaceStrings(
  value: unknown,
  fixes: ContinuityFix[],
): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const f of fixes) {
      if (!f.find || f.find === f.replace) continue;
      if (s.includes(f.find)) s = s.split(f.find).join(f.replace);
    }
    return s;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepReplaceStrings(v, fixes));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepReplaceStrings(v, fixes);
    }
    return out;
  }
  return value;
}

function applyFixInChapterBody(
  body: string,
  fix: ContinuityFix,
): { body: string; applied: boolean } {
  if (!fix.find || fix.find === fix.replace) {
    return { body, applied: false };
  }

  if (fix.kind === "name" && fix.nearHint === "Schule") {
    // Replace bare surname only in school-ish sentences
    const lines = body.split(/(\n+)/);
    let applied = false;
    const next = lines
      .map((line) => {
        if (!line.includes(fix.find)) return line;
        if (!SCHOOL_RE.test(line) && !line.includes(`Frau ${fix.find}`)) {
          // Allow Frau forms always
          if (!new RegExp(`Frau\\s+${escapeRegExp(fix.find)}\\b`).test(line)) {
            return line;
          }
        }
        // Protect Hartmut Alias
        let out = line.replace(
          new RegExp(`Frau\\s+${escapeRegExp(fix.find)}\\b`, "g"),
          `Frau ${fix.replace}`,
        );
        out = out.replace(
          new RegExp(`(?<!Hartmut\\s)\\b${escapeRegExp(fix.find)}\\b`, "g"),
          (m, offset, s: string) => {
            const before = s.slice(Math.max(0, offset - 12), offset);
            if (/Hartmut\s*$/i.test(before)) return m;
            applied = true;
            return fix.replace;
          },
        );
        if (out !== line) applied = true;
        return out;
      })
      .join("");
    return { body: next, applied };
  }

  if (fix.kind === "mass" && fix.nearHint) {
    // Prefer replace inside a window that contains nearHint tokens
    const tokens = fix.nearHint.split(/\s+/).filter(Boolean);
    const idx = body.indexOf(fix.find);
    if (idx < 0) return { body, applied: false };
    // Find occurrence whose ±80 chars overlap tokens
    let searchFrom = 0;
    while (searchFrom < body.length) {
      const i = body.indexOf(fix.find, searchFrom);
      if (i < 0) break;
      const win = body.slice(Math.max(0, i - 80), i + fix.find.length + 80);
      const hit =
        tokens.length === 0 ||
        tokens.some((t) => win.toLowerCase().includes(t.toLowerCase()));
      if (hit) {
        const next =
          body.slice(0, i) + fix.replace + body.slice(i + fix.find.length);
        return { body: next, applied: true };
      }
      searchFrom = i + fix.find.length;
    }
    return { body, applied: false };
  }

  // Default: global within chapter for exact find (Frau X, plates)
  if (fix.kind === "name" && fix.find.startsWith("Frau ")) {
    const re = new RegExp(
      `Frau\\s+${escapeRegExp(fix.find.replace(/^Frau\s+/, ""))}\\b`,
      "g",
    );
    if (!re.test(body)) return { body, applied: false };
    return {
      body: body.replace(re, fix.replace),
      applied: true,
    };
  }

  if (!body.includes(fix.find)) return { body, applied: false };
  // Replace all in chapter for identity/name exact strings
  const parts = body.split(fix.find);
  if (parts.length < 2) return { body, applied: false };
  return { body: parts.join(fix.replace), applied: true };
}

/**
 * Apply selected fixes to stage markdown; sync MASS freezes into graph.
 * `docFormat`: Gerüst/Plot = markdown headings; Manuskript = print-style.
 */
export function applyManuskriptContinuityFixes(input: {
  /** @deprecated use sourceText */
  manuskriptText?: string;
  sourceText?: string;
  docFormat?: "plot" | "manuskript";
  wissensGraph?: RomanWissensGraph | null;
  fixes: ContinuityFix[];
}): {
  text: string;
  /** @deprecated alias of text */
  manuskriptText: string;
  wissensGraph: RomanWissensGraph | null;
  appliedCount: number;
  appliedIds: string[];
} {
  const source = input.sourceText ?? input.manuskriptText ?? "";
  const docFormat = input.docFormat ?? "manuskript";
  const selected = input.fixes
    .filter((f) => f.find && f.replace)
    // Frau-forms before bare surnames so we don't double-mangle.
    .sort((a, b) => {
      const af = a.find.startsWith("Frau ") ? 0 : 1;
      const bf = b.find.startsWith("Frau ") ? 0 : 1;
      return af - bf;
    });
  if (!selected.length) {
    return {
      text: source,
      manuskriptText: source,
      wissensGraph: input.wissensGraph ?? null,
      appliedCount: 0,
      appliedIds: [],
    };
  }

  const chapters = parsePlotChapters(source);
  if (!chapters.length) {
    // Flat document — apply globally
    let text = source;
    const appliedIds: string[] = [];
    for (const fix of selected) {
      const r = applyFixInChapterBody(text, fix);
      if (r.applied) {
        text = r.body;
        appliedIds.push(fix.id);
      }
    }
    return finalizeApply(text, input.wissensGraph, appliedIds, chapters);
  }

  const byChapter = new Map<number, ContinuityFix[]>();
  for (const fix of selected) {
    const list = byChapter.get(fix.chapter) ?? [];
    list.push(fix);
    byChapter.set(fix.chapter, list);
  }

  const appliedIds: string[] = [];
  const nextChapters = chapters.map((ch) => {
    const fixes = byChapter.get(ch.number) ?? [];
    if (!fixes.length) return ch;
    let body = ch.body;
    for (const fix of fixes) {
      const r = applyFixInChapterBody(body, fix);
      if (r.applied) {
        body = r.body;
        appliedIds.push(fix.id);
      }
    }
    return { ...ch, body };
  });

  let text =
    docFormat === "plot"
      ? serializePlotChapters(nextChapters)
      : serializeManuskriptChapters(nextChapters);
  for (const fix of selected) {
    if (appliedIds.includes(fix.id)) continue;
    if (fix.kind === "name" && fix.find.startsWith("Frau ")) {
      const r = applyFixInChapterBody(text, fix);
      if (r.applied) {
        text = r.body;
        appliedIds.push(fix.id);
      }
    }
  }

  return finalizeApply(text, input.wissensGraph, appliedIds, nextChapters);
}

function finalizeApply(
  text: string,
  graph: RomanWissensGraph | null | undefined,
  appliedIds: string[],
  chapters: Array<{ number: number; title: string; body: string }>,
): {
  text: string;
  manuskriptText: string;
  wissensGraph: RomanWissensGraph | null;
  appliedCount: number;
  appliedIds: string[];
} {
  let nextGraph = graph ?? null;
  if (nextGraph && appliedIds.length) {
    const chBodies = chapters.length ? chapters : parsePlotChapters(text);
    nextGraph = protectFrozenMetricAttrs(
      nextGraph,
      freezeMetricFactsFromChapters(nextGraph, chBodies),
    );
    const inv = new Set(
      nextGraph.hardInvariants.map((h) => h.trim()).filter(Boolean),
    );
    inv.add(
      "Canon: Kontinuitäts-Pass angewendet — Maße/Identität/Namen nicht still zurückdrehen.",
    );
    nextGraph = {
      ...nextGraph,
      updatedAt: new Date().toISOString(),
      hardInvariants: Array.from(inv).slice(0, 40),
    };
  }

  return {
    text,
    manuskriptText: text,
    wissensGraph: nextGraph,
    appliedCount: appliedIds.length,
    appliedIds,
  };
}

/** Merge applied text into editorial for the chosen target. */
export function editorialAfterContinuityApply(
  editorial: RomanEditorial,
  input: {
    target: ContinuityTarget;
    text: string;
    wissensGraph: RomanWissensGraph | null;
    appliedFixes: ContinuityFix[];
  },
): RomanEditorial {
  const graph = input.wissensGraph ?? editorial.wissensGraph;
  if (input.target === "kapitelgeruest") {
    const structured = editorial.kapitelGeruestStructured
      ? (deepReplaceStrings(
          editorial.kapitelGeruestStructured,
          input.appliedFixes,
        ) as typeof editorial.kapitelGeruestStructured)
      : editorial.kapitelGeruestStructured;
    return {
      ...editorial,
      kapitelGeruestRaw: input.text,
      kapitelGeruestStructured: structured,
      wissensGraph: graph,
    };
  }
  if (input.target === "szenenplot") {
    const structured = editorial.szenenplotStructured
      ? (deepReplaceStrings(
          editorial.szenenplotStructured,
          input.appliedFixes,
        ) as typeof editorial.szenenplotStructured)
      : editorial.szenenplotStructured;
    return {
      ...editorial,
      szenenplotStructured: structured,
      wissensGraph: graph,
    };
  }
  return {
    ...editorial,
    manuskriptText: input.text,
    wissensGraph: graph,
  };
}

/** Resolve stage markdown for a continuity target from a loaded roman. */
export function continuitySourceText(input: {
  target: ContinuityTarget;
  manuskriptText?: string;
  kapitelGeruestRaw?: string;
  manuskriptRaw?: string;
}): string {
  if (input.target === "kapitelgeruest") {
    return (input.kapitelGeruestRaw ?? "").trim();
  }
  if (input.target === "szenenplot") {
    return (input.manuskriptRaw ?? "").trim();
  }
  return (input.manuskriptText ?? "").trim();
}
