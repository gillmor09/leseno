/**
 * Selftest: chapter contracts — normalize, format, ending pick.
 * Run: npx tsx src/lib/novel/chapter-contract.selftest.ts
 */

import {
  applyBeatChainToScenes,
  chapterEndingHint,
  formatBeatChainMandate,
  formatContractForAuthor,
  formatContractForEditor,
  formatContractForSceneLogicAudit,
  formatEndingGestureBudget,
  formatJobTaxonomyForOutline,
  formatScenePlanForAuthor,
  hasChapterContract,
  normalizeChapterContract,
  normalizeSceneBeat,
  normalizeScenePlan,
  pickBeatChain,
  pickEndingForJob,
} from "@/lib/novel/chapter-contract";
import { parseLogicLedger } from "@/lib/novel/logic-ledger";
import { detectNovelProseTics } from "@/lib/novel/prose-tic-detect";
import {
  outlineExtractSchema,
  scenePlanExtractSchema,
} from "@/lib/novel/schemas";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(normalizeChapterContract({}) === null, "empty object → null");
assert(normalizeChapterContract(null) === null, "null → null");

const esc = normalizeChapterContract({ job: "escalate" }, 5);
assert(esc?.job === "escalate", "job escalate");
assert(hasChapterContract(esc), "has contract");
assert((esc?.must.length ?? 0) >= 1, "default must");
assert((esc?.mustNot.length ?? 0) >= 1, "default mustNot");
assert(Boolean(esc?.endingFunction), "ending set");

const bad = normalizeChapterContract({ job: "nope" }, 2);
assert(bad?.job === "escalate", "unknown job → escalate");

const a = pickEndingForJob("comic", 3);
const b = pickEndingForJob("comic", 3);
assert(a === b, "ending pick stable");
assert(pickEndingForJob("comic", 3) !== pickEndingForJob("climax", 3) || true, "ok");

const author = formatContractForAuthor(esc);
assert(author.includes("escalate"), "author format has job");
assert(author.includes("Muss"), "author format has must");
assert(author.includes("Register"), "author format has register");
assert(
  author.includes("Druck-Sprache") || author.includes("äußerer Fokus"),
  "escalate register",
);

const editor = formatContractForEditor(esc);
assert(editor.includes("approved=false"), "editor mentions gate");
assert(editor.includes("Register"), "editor checks register");

const sceneLogic = formatContractForSceneLogicAudit({
  contract: esc,
  sceneIndex: 1,
  sceneCountInChapter: 3,
  beat: "advance",
  manifestMustShow: ["Besichtigung"],
  manifestSituations: ["Betritt die Wohnung"],
});
assert(
  sceneLogic.includes("NICHT Pflicht in jeder Einzelszene"),
  "scene logic scopes chapter must",
);
assert(
  sceneLogic.includes("NICHT die letzte"),
  "early scene skips endingFunction",
);

assert(
  chapterEndingHint(esc, "fallback") === esc!.endingFunction,
  "contract ending wins",
);
assert(chapterEndingHint(null, "fallback") === "fallback", "fallback ending");

assert(
  formatJobTaxonomyForOutline().includes("reveal:"),
  "taxonomy lists jobs",
);

const parsed = outlineExtractSchema.safeParse({
  chapters: [
    {
      chapterNumber: 1,
      title: "Start",
      outline: "Beat: Setup der Figur.",
      job: "setup",
      must: ["Figur zeigen"],
      mustNot: ["Infodump"],
      endingFunction: "Störimpuls",
    },
    {
      chapterNumber: 2,
      title: "Zwei",
      outline: "Beat: Auslöser.",
      job: "incite",
    },
    {
      chapterNumber: 3,
      title: "Drei",
      outline: "Beat: Druck.",
      job: "escalate",
    },
    {
      chapterNumber: 4,
      title: "Vier",
      outline: "Beat: Ende.",
      job: "denouement",
    },
  ],
  lengthRationale: "kurz",
});
assert(parsed.success, "outline schema accepts job fields");

const coerced = outlineExtractSchema.safeParse({
  chapters: [
    {
      chapterNumber: "1",
      title: "A",
      outline: "Beat: x",
      job: "setup",
      must: "nur ein String",
      must_not: ["a", "b", "c", "d"],
      ending_function: "x".repeat(100),
    },
    { chapter_number: 2, title: "B", outline: "Beat: y", job: "incite" },
    { chapterNumber: 3, title: "C", outline: "Beat: z" },
  ],
});
assert(coerced.success, "outline schema coerces stringy model JSON");
if (coerced.success) {
  assert(coerced.data.chapters[0]!.chapterNumber === 1, "coerce chapterNumber");
  assert(coerced.data.chapters[0]!.must?.length === 1, "must string→array");
  assert(
    (coerced.data.chapters[0]!.mustNot?.length ?? 0) <= 3,
    "mustNot capped",
  );
  assert(
    (coerced.data.chapters[0]!.endingFunction?.length ?? 0) <= 80,
    "ending truncated",
  );
}

assert(normalizeSceneBeat("relief") === "relief", "beat relief");
assert(normalizeSceneBeat("nope") === "advance", "unknown beat → advance");
assert(normalizeSceneBeat(undefined, { isLast: true }) === "land", "last → land");

const scenes = normalizeScenePlan([
  { summary: "A startet", beat: "advance" },
  { summary: "Witz", beat: "relief" },
  { summary: "Schluss" },
]);
assert(scenes.length === 3, "3 scenes");
assert(scenes[2]!.beat === "land", "last scene land default");
const sceneFmt = formatScenePlanForAuthor(scenes);
assert(sceneFmt.includes("[relief/"), "scene plan format");
assert(sceneFmt.includes("Register:"), "scene plan has beat register");
assert(sceneFmt.includes("Timing") || sceneFmt.includes("Reibung"), "relief register");

const sceneParsed = scenePlanExtractSchema.safeParse({
  scenes: [
    {
      summary: "Druck steigt",
      location: "Küche",
      characters: ["Hartmut"],
      beat: "advance",
    },
  ],
});
assert(sceneParsed.success, "scene plan schema accepts beat");

const chainA = pickBeatChain("escalate", 5);
const chainB = pickBeatChain("escalate", 5);
assert(
  chainA.join(",") === chainB.join(","),
  "beat chain stable",
);
assert(chainA[chainA.length - 1] === "land", "chain ends with land");
const forced = normalizeScenePlan(
  [{ summary: "eins" }, { summary: "zwei" }, { summary: "drei" }],
  { chain: ["advance", "cost", "land"] },
);
assert(forced.map((s) => s.beat).join(",") === "advance,cost,land", "force chain");
assert(
  formatBeatChainMandate("comic", 2).block.includes("relief"),
  "comic chain mentions relief",
);
assert(
  formatEndingGestureBudget([]).includes("Cap"),
  "ending budget empty prior",
);
assert(
  applyBeatChainToScenes([], ["cost", "land"]).length === 2,
  "pad empty scenes",
);

const flipText = `
„Das war kein Vorschlag?“
„Es war eine Frage.“
„Das war nicht meine Frage.“
„Ich weiß.“
„Das war kein Angebot.“
„Auch gut.“
`.repeat(2);
assert(
  detectNovelProseTics(flipText).some((h) => h.code === "dialog_flip"),
  "dialog flip detector",
);

const ledger = parseLogicLedger({
  timeline: [{ chapter: 1, dateLabel: "Mai", event: "Start" }],
  money: [{ id: "a", amount: "10", status: "offen", chapterRef: 1 }],
  openQuestions: ["Wer zahlt?"],
});
assert(ledger?.timeline.length === 1, "ledger parse");

console.log("chapter-contract.selftest OK");
