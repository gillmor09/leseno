import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const orchPath = "src/lib/novel/novelOrchestrator.ts";
let orch = readFileSync(orchPath, "utf8");

const reviewStub = `    if (step === "review") {
      // Unreachable: early guard approves and continues. Kept for hop typing.
      throw new Error("Review-Schritt entfällt — Draft-Tic-Gate freigibt direkt.");
    }

`;

function replaceBlock(
  src: string,
  startMarker: string,
  endMarker: string,
  stub: string,
): string {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`start missing: ${startMarker.slice(0, 40)}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`end missing: ${endMarker.slice(0, 40)}`);
  return src.slice(0, start) + stub + src.slice(end);
}

orch = replaceBlock(
  orch,
  '    if (step === "review") {',
  '    if (step === "voice_rewrite") {',
  reviewStub,
);

if (orch.includes("isFastDraft")) {
  throw new Error("isFastDraft still present");
}

writeFileSync(orchPath, orch);

const actionsPath = "src/app/actions/roman-novel.ts";
let actions = readFileSync(actionsPath, "utf8");
const wmStart = actions.indexOf("const writeModeSchema = z.object({");
const novelIdOnly = actions.indexOf(
  "const novelIdOnlySchema = z.object({",
);
if (wmStart < 0 || novelIdOnly < 0) {
  throw new Error(`action markers ${wmStart} ${novelIdOnly}`);
}
actions = actions.slice(0, wmStart) + actions.slice(novelIdOnly);
writeFileSync(actionsPath, actions);

try {
  unlinkSync("src/lib/novel/write-mode.ts");
  console.log("deleted write-mode.ts");
} catch {
  console.log("write-mode.ts already gone");
}

console.log("done");
