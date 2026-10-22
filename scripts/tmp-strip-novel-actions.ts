import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/actions/roman-novel.ts";
let s = readFileSync(path, "utf8");

s = s.replace(
  /\n    \/\/ Short re-run pause:[\s\S]*?\n    \}\n\n    const \{ kickNovelJobHttp \}/,
  "\n    const { kickNovelJobHttp }",
);

const removedBlock = `
const LOOP_REMOVED =
  "Diese Nachschreib-Schleife wurde entfernt. Qualitaet laeuft ueber Draft-Tic-Gate + Qualitaetsprobe (5 Kapitel).";

/** @deprecated Removed — draft tic gate replaces outline-revision loops. */
export async function reviseOutlineFromAbnahmeAction(
  _input: unknown,
): Promise<ActionResult<{ accepted: boolean }>> {
  return { success: false, error: LOOP_REMOVED };
}

/** @deprecated Removed. */
export async function prepareShortRerunAction(
  _input: unknown,
): Promise<ActionResult<{ bundle: NovelBundle; targetChapterCount: number }>> {
  return { success: false, error: LOOP_REMOVED };
}

/** @deprecated Removed. */
export async function startShortRerunAction(
  _input: unknown,
): Promise<ActionResult<{ accepted: boolean; targetChapterCount: number }>> {
  return { success: false, error: LOOP_REMOVED };
}

/** @deprecated Removed — draft tic gate replaces assisted fixes. */
export async function startAssistedFixesAction(
  _input: unknown,
): Promise<ActionResult<{ accepted: boolean; chapters: number[] }>> {
  return { success: false, error: LOOP_REMOVED };
}

`;

const startRevise = s.indexOf(
  "/**\n * Revise chapter outlines/contracts from the last Abnahme",
);
const writeModeStart = s.indexOf("const writeModeSchema = z.object({");
const assistedStart = s.indexOf("const assistedFixSchema = z.object({");
const novelIdOnly = s.indexOf("const novelIdOnlySchema = z.object({");

if (startRevise < 0 || writeModeStart < 0 || assistedStart < 0 || novelIdOnly < 0) {
  throw new Error(
    `markers ${startRevise} ${writeModeStart} ${assistedStart} ${novelIdOnly}`,
  );
}

s =
  s.slice(0, startRevise) +
  removedBlock +
  s.slice(writeModeStart, assistedStart) +
  s.slice(novelIdOnly);

writeFileSync(path, s);
console.log({
  loopRemoved: s.includes("LOOP_REMOVED"),
  writeMode: s.includes("setNovelWriteModeAction"),
  noShortBody: !s.includes("Kurzer Re-Run: Outline auf"),
});
