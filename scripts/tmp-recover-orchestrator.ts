/**
 * Recover novelOrchestrator from compaction segment by extracting a Read dump
 * that contains style_guide through draft, then patching for single-path.
 */
import { readFileSync, writeFileSync } from "node:fs";

const segPath =
  "C:/Users/bernd/.cursor/projects/c-Users-bernd-Documents-leseno/agent-transcripts/ab97a8fa-a31a-4395-ad10-07c3300e984e/compaction/segment_033.md";
const seg = readFileSync(segPath, "utf8");

// Find the longest contiguous dump of numbered lines that includes style_guide and draft
const lineRe = /^ {0,3}(\d+)\|(.*)$/gm;
type Dump = { start: number; lines: Map<number, string> };
const dumps: Dump[] = [];
let cur: Dump | null = null;
let lastN = -1;

for (const line of seg.split("\n")) {
  const m = /^ {0,3}(\d+)\|(.*)$/.exec(line);
  if (!m) {
    if (cur && cur.lines.size > 100) dumps.push(cur);
    cur = null;
    lastN = -1;
    continue;
  }
  const n = Number(m[1]);
  const body = m[2];
  if (!cur || n < lastN || n > lastN + 5) {
    if (cur && cur.lines.size > 100) dumps.push(cur);
    cur = { start: n, lines: new Map() };
  }
  cur.lines.set(n, body);
  lastN = n;
}
if (cur && cur.lines.size > 100) dumps.push(cur);

dumps.sort((a, b) => b.lines.size - a.lines.size);
console.log(
  "dumps",
  dumps.slice(0, 8).map((d) => ({
    start: d.start,
    size: d.lines.size,
    hasStyle: [...d.lines.values()].some((l) => l.includes('step === "style_guide"')),
    hasDraft: [...d.lines.values()].some((l) => l.includes('step === "draft"')),
    hasWave: [...d.lines.values()].some((l) => l.includes('step === "wave_dispatch"')),
    hasTic: [...d.lines.values()].some((l) => l.includes("scanDraftProseTics")),
  })),
);
