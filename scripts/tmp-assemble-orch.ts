import { readFileSync, writeFileSync } from "node:fs";

const head = readFileSync("scripts/tmp-orch-head-clean.ts", "utf8");
const body = readFileSync("scripts/tmp-orch-body.ts", "utf8");
const tail = readFileSync("scripts/tmp-orch-tail.ts", "utf8");
const assembled = `${head}\n${body}\n${tail}\n`;
writeFileSync("src/lib/novel/novelOrchestrator.ts", assembled);
console.log("bytes", assembled.length);
