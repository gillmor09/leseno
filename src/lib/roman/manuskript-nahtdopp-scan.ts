/**
 * Deterministic Nahtdopplung detector (no Assist).
 * Flags chapter openings that repeat a long stretch from the previous ending.
 */

import type { ManuskriptFreigabeFinding } from "@/lib/roman/editorial";
import { parsePlotChapters } from "@/lib/roman/plot-chapters";

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[„“"']/g, "")
    .trim();
}

/**
 * Hard freigabe rows when Kap. N+1 opening heavily overlaps Kap. N ending.
 */
export function scanDeterministicNahtdopplung(
  manuskriptText: string,
): ManuskriptFreigabeFinding[] {
  const chapters = parsePlotChapters(manuskriptText).filter((c) =>
    c.body.trim(),
  );
  const out: ManuskriptFreigabeFinding[] = [];
  for (let i = 1; i < chapters.length; i += 1) {
    const prev = chapters[i - 1]!;
    const next = chapters[i]!;
    const prevTail = norm(prev.body.slice(-500));
    const nextHead = norm(next.body.slice(0, 500));
    if (prevTail.length < 80 || nextHead.length < 80) continue;

    // Longest shared prefix of nextHead that appears in prevTail
    let best = 0;
    const minLen = 72;
    for (let len = Math.min(prevTail.length, nextHead.length); len >= minLen; len -= 1) {
      const chunk = nextHead.slice(0, len);
      if (prevTail.includes(chunk)) {
        best = len;
        break;
      }
    }
    if (best < minLen) continue;

    out.push({
      source: "seam",
      kind: "seam_dup",
      chapterNumbers: [prev.number, next.number],
      summary: `Nahtdopplung Kap.${prev.number}→${next.number}: Anfang Kap.${next.number} wiederholt ~${best} Zeichen aus dem Ende von Kap.${prev.number} — überzählige Passage streichen.`,
    });
    if (out.length >= 5) break;
  }
  return out;
}
