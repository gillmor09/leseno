import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/novel/novelOrchestrator.ts";
let s = readFileSync(path, "utf8");

const outlineStub = `    if (step === "outline_revision") {
      throw new Error(
        "Outline-Revision aus Abnahme wurde entfernt — Qualitätsprobe mit Tic-Gate statt Nachschreib-Schleifen.",
      );
    }

`;

const assistedStub = `    if (step === "assisted_fix") {
      throw new Error(
        "Gezielte Fixes wurden entfernt — Draft-Tic-Gate ersetzt Nachbesserungs-Wellen.",
      );
    }

`;

function replaceBlock(
  src: string,
  startMarker: string,
  endMarker: string,
  stub: string,
): string {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`start not found: ${startMarker.slice(0, 50)}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`end not found: ${endMarker.slice(0, 50)}`);
  return src.slice(0, start) + stub + src.slice(end);
}

s = replaceBlock(
  s,
  '    if (step === "outline_revision") {',
  '    if (step === "wave_dispatch") {',
  outlineStub,
);

s = replaceBlock(
  s,
  '    if (step === "assisted_fix") {',
  "    throw new Error(`Unbekannter Orchestrator-Schritt: ${step}`);",
  assistedStub,
);

const resumable = `const RESUMABLE_STEPS = new Set([
  "style_guide",
  "voice_discovery",
  "voice_critique",
  "voice_lock",
  "world_building",
  "outline",
  "wave_dispatch",
  "wave_barrier",
  "wave_chapter_done",
  "scene_plan",
  "draft",
  "review",
  "state_sync",
  "manuscript_review",
  "revision_plan",
  "targeted_rewrite",
  "global_recheck",
  "timeline_pass",
  "formula_pass",
  "voice_rewrite",
]);`;

s = s.replace(/const RESUMABLE_STEPS = new Set\(\[[\s\S]*?\]\);/, resumable);

writeFileSync(path, s);
console.log({
  outlineStubbed: s.includes("Outline-Revision aus Abnahme wurde entfernt"),
  assistedStubbed: s.includes("Gezielte Fixes wurden entfernt"),
  stillHasDelete: s.includes("deleteChaptersAboveNumber"),
  stillHasAssistedImportUse: s.includes("getAssistedFixState"),
});
