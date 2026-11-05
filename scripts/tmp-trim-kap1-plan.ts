import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText, countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[0]!;
  const before = sachbuchKapitelBodyText(k);
  const step = "Schritt 1: Beweislast umkehren und Vorratshaltung stoppen";
  const stepIdx = before.indexOf(step);
  // find intro paragraph that leads into the three steps
  const introNeedle =
    "unterziehen Sie das Vorhaben gemeinsam mit dem Produktteam drei einfachen handwerklichen Schritten";
  let cut = before.lastIndexOf("\n\n", stepIdx);
  const introIdx = before.lastIndexOf(introNeedle, stepIdx);
  if (introIdx >= 0) {
    const paraStart = before.lastIndexOf("\n\n", introIdx);
    cut = paraStart >= 0 ? paraStart + 2 : introIdx;
  } else if (cut >= 0) {
    cut = cut + 2;
  } else {
    cut = stepIdx;
  }

  console.log("cut from:", before.slice(cut, cut + 200).replace(/\s+/g, " "));
  console.log("before cut ends:", before.slice(Math.max(0, cut - 300), cut).replace(/\s+/g, " "));

  // Is there a conceptual bridge after the steps?
  const afterSteps = before.slice(stepIdx);
  const bridgeNeedles = [
    "Steht dieses organisatorische und methodische Fundament",
    "Mit diesem Fundament",
    "Privacy Value Thinking",
  ];
  let keepFrom = -1;
  let keepLead = "";
  for (const n of bridgeNeedles) {
    const i = before.indexOf(n, stepIdx);
    if (i >= 0 && (keepFrom < 0 || i < keepFrom)) {
      // prefer the last meaningful close near end
      keepFrom = i;
      keepLead = n;
    }
  }
  // Prefer the actual last conceptual close
  const steht = before.lastIndexOf("Steht dieses organisatorische und methodische Fundament");
  if (steht > stepIdx) {
    keepFrom = steht;
    keepLead = "Steht dieses…";
  }

  console.log("keepFrom", keepFrom, keepLead);

  let text: string;
  if (keepFrom > cut) {
    text = `${before.slice(0, cut).replace(/\s+$/g, "")}\n\n${before.slice(keepFrom)}`;
  } else {
    text = `${before.slice(0, cut).replace(/\s+$/g, "")}\n`;
  }
  text = text.replace(/\n{3,}/g, "\n\n");
  if (!text.endsWith("\n")) text += "\n";

  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
    },
    finalText: text,
    updatedAt: now,
  });
  console.log({
    wordsBefore: countSachbuchWords(before),
    wordsAfter: countSachbuchWords(text),
    last: text.trim().slice(-200).replace(/\s+/g, " "),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
