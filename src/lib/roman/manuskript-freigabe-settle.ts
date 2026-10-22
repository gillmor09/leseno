/**
 * Freigabe stability: after „Hinweise nachziehen“, suppress the same findings
 * on re-audit until the author clicks „Erneut prüfen“ (full audit clears settle).
 * Assist/phrase scans otherwise re-flag the same Naht/Stil rows forever.
 */

import type {
  ManuskriptFreigabeFinding,
  ManuskriptFreigabeSettled,
  ManuskriptFreigabeSource,
} from "@/lib/roman/editorial";

export type { ManuskriptFreigabeSettled };

/** Stable key for diagnostics / Set membership. */
export function freigabeFindingKey(
  f: Pick<ManuskriptFreigabeFinding, "source" | "kind" | "chapterNumbers" | "summary">,
): string {
  const caps = [...f.chapterNumbers].sort((a, b) => a - b).join(",");
  const phrase = extractStockphrase(f.summary) ?? "";
  return `${f.source}|${f.kind}|${caps}|${phrase}`;
}

export function extractStockphrase(summary: string): string | null {
  const m = summary.match(/Stockphrase\s+[„"]([^„"“]+)[“"]/i);
  const p = m?.[1]?.trim().toLowerCase();
  return p && p.length >= 2 ? p : null;
}

export function settledFromFinding(
  f: ManuskriptFreigabeFinding,
  settledAt: string,
): ManuskriptFreigabeSettled {
  return {
    source: f.source,
    kind: f.kind,
    chapterNumbers: [...f.chapterNumbers],
    phrase: extractStockphrase(f.summary) ?? undefined,
    settledAt,
  };
}

function sameCraftFamily(
  a: { source: string; kind: string },
  b: { source: string; kind: string },
): boolean {
  // Assist rewords seam↔payoff / aftermath↔value_change on every re-audit.
  const seamFamily = (s: string, k: string) =>
    s === "seam" ||
    s === "timeline" ||
    k === "seam" ||
    k === "payoff" ||
    k === "timeline";
  const emotionFamily = (s: string, k: string) =>
    s === "emotion" ||
    k === "aftermath" ||
    k === "value_change" ||
    k === "motivation" ||
    k === "emotion";
  if (seamFamily(a.source, a.kind) && seamFamily(b.source, b.kind)) return true;
  if (emotionFamily(a.source, a.kind) && emotionFamily(b.source, b.kind)) {
    return true;
  }
  return a.source === b.source && a.kind === b.kind;
}

/**
 * True when a fresh audit finding matches a settled (already nachgezogen) item.
 * Style: phrase match. Else: craft family + chapter overlap (Assist rewords kinds).
 */
export function findingMatchesSettled(
  f: ManuskriptFreigabeFinding,
  settled: ManuskriptFreigabeSettled[],
): boolean {
  for (const s of settled) {
    if (s.phrase) {
      if (f.source !== "style" && s.source !== "style") continue;
      const fp = extractStockphrase(f.summary);
      if (fp && fp === s.phrase) return true;
      if (f.summary.toLowerCase().includes(s.phrase)) return true;
      continue;
    }
    if (!sameCraftFamily(f, s)) continue;
    if (!s.chapterNumbers.length) continue;
    const overlap = f.chapterNumbers.some((n) =>
      s.chapterNumbers.includes(n),
    );
    if (overlap) return true;
  }
  return false;
}

export function filterFindingsAgainstSettled(
  findings: ManuskriptFreigabeFinding[],
  settled: ManuskriptFreigabeSettled[] | null | undefined,
): ManuskriptFreigabeFinding[] {
  if (!settled?.length) return findings;
  return findings.filter((f) => !findingMatchesSettled(f, settled));
}

export function mergeSettled(
  previous: ManuskriptFreigabeSettled[] | null | undefined,
  next: ManuskriptFreigabeSettled[],
): ManuskriptFreigabeSettled[] {
  const out: ManuskriptFreigabeSettled[] = [...(previous ?? [])];
  for (const item of next) {
    const dup = out.some(
      (s) =>
        s.source === item.source &&
        s.kind === item.kind &&
        (item.phrase
          ? s.phrase === item.phrase
          : s.chapterNumbers.join(",") === item.chapterNumbers.join(",")),
    );
    if (!dup) out.push(item);
  }
  return out.slice(0, 60);
}

export function parseSettledList(raw: unknown): ManuskriptFreigabeSettled[] {
  if (!Array.isArray(raw)) return [];
  const out: ManuskriptFreigabeSettled[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const sourceRaw = String(r.source ?? "").trim().toLowerCase();
    const source = sourceRaw as ManuskriptFreigabeSource;
    if (
      ![
        "seam",
        "emotion",
        "canon",
        "timeline",
        "plot_truth",
        "ledger",
        "style",
      ].includes(source)
    ) {
      continue;
    }
    const kind = String(r.kind ?? "").trim() || "hinweis";
    const chapterNumbers = Array.isArray(r.chapterNumbers)
      ? r.chapterNumbers
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 1)
          .map((n) => Math.floor(n))
      : [];
    const phrase = String(r.phrase ?? "").trim().toLowerCase() || undefined;
    const settledAt = String(r.settledAt ?? "").trim() || new Date().toISOString();
    if (!chapterNumbers.length && !phrase) continue;
    out.push({
      source,
      kind,
      chapterNumbers: [...new Set(chapterNumbers)].slice(0, 8),
      phrase,
      settledAt,
    });
    if (out.length >= 60) break;
  }
  return out;
}
