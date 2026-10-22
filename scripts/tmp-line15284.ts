import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

async function main() {
  const p =
    "C:/Users/bernd/.cursor/projects/c-Users-bernd-Documents-leseno/agent-transcripts/ab97a8fa-a31a-4395-ad10-07c3300e984e/ab97a8fa-a31a-4395-ad10-07c3300e984e.jsonl";
  const rl = createInterface({
    input: createReadStream(p, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let i = 0;
  for await (const line of rl) {
    i += 1;
    if (i !== 15284) continue;
    console.log("len", line.length);
    writeFileSync("scripts/tmp-line15284.json", line);
    const obj = JSON.parse(line) as {
      message?: {
        content?: Array<{
          type?: string;
          name?: string;
          input?: { path?: string; contents?: string };
        }>;
      };
    };
    for (const part of obj.message?.content ?? []) {
      console.log(part.type, part.name, part.input?.path, part.input?.contents?.length);
      if (part.input?.contents) {
        writeFileSync("scripts/tmp-orch-from-15284.ts", part.input.contents);
      }
    }
    break;
  }
  console.log("scanned", i);
}

main();
