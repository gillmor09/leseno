import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const p =
  "C:/Users/bernd/.cursor/projects/c-Users-bernd-Documents-leseno/agent-transcripts/ab97a8fa-a31a-4395-ad10-07c3300e984e/ab97a8fa-a31a-4395-ad10-07c3300e984e.jsonl";

async function main() {
  const rl = createInterface({
    input: createReadStream(p, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let i = 0;
  const hits: Array<Record<string, unknown>> = [];
  for await (const line of rl) {
    i += 1;
    if (!line.includes("novelOrchestrator.ts")) continue;
    if (line.includes("scanDraftProseTics") && line.includes("contents")) {
      hits.push({ i, len: line.length, kind: "tic-contents" });
      // Try extract Write contents
      try {
        const obj = JSON.parse(line) as {
          message?: { content?: Array<{ type?: string; name?: string; input?: { path?: string; contents?: string } }> };
        };
        const parts = obj.message?.content ?? [];
        for (const part of parts) {
          if (
            part.name === "Write" &&
            part.input?.path?.includes("novelOrchestrator") &&
            part.input.contents &&
            part.input.contents.length > 20_000
          ) {
            writeFileSync(
              "scripts/tmp-recovered-orchestrator.ts",
              part.input.contents,
            );
            console.log("wrote recovery", part.input.contents.length);
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (line.includes('"name":"Write"') && line.length > 80_000) {
      hits.push({ i, len: line.length, kind: "big-write-line" });
      try {
        const obj = JSON.parse(line) as {
          message?: { content?: Array<{ type?: string; name?: string; input?: { path?: string; contents?: string } }> };
        };
        for (const part of obj.message?.content ?? []) {
          if (
            part.name === "Write" &&
            part.input?.path?.includes("novelOrchestrator") &&
            typeof part.input.contents === "string"
          ) {
            writeFileSync(
              `scripts/tmp-orch-write-${i}.ts`,
              part.input.contents,
            );
            hits.push({
              i,
              saved: part.input.contents.length,
              path: `scripts/tmp-orch-write-${i}.ts`,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  console.log(JSON.stringify({ lines: i, hits }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
