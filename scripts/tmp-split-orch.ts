import { readFileSync, writeFileSync } from "node:fs";

const broken = readFileSync("src/lib/novel/novelOrchestrator.ts", "utf8");
const headEnd = broken.indexOf("export async function runNovelOrchestratorHop");
const lastCatch = broken.lastIndexOf("  } catch (error) {");
console.log({ headEnd, lastCatch, len: broken.length });
if (headEnd < 0 || lastCatch < 0) throw new Error("markers missing");
writeFileSync("scripts/tmp-orch-head.ts", broken.slice(0, headEnd));
writeFileSync("scripts/tmp-orch-tail.ts", broken.slice(lastCatch));
console.log("ok");
