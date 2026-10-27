/**
 * Fix chapter goal lever tags from makroStageKey / part id.
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function leverForKey(key: string | null, title: string): string {
  const k = `${key ?? ""} ${title}`.toLowerCase();
  if (k.includes("motor") || /durchsatz|löschen|datenqualität/.test(k)) {
    return "Hebel: Value-Driven Privacy (VDP) — Praxis/Framework.";
  }
  if (
    k.includes("kunde") ||
    /verständlich|fairness/.test(k)
  ) {
    return "Hebel: Privacy Value Thinking + VDP (Kundenergebnis).";
  }
  if (k.includes("zukunft") || /ki|rollout|90-tage/.test(k)) {
    return "Hebel: Privacy Value Thinking und VDP gemeinsam.";
  }
  // fundament / default
  return "Hebel: Privacy Value Thinking (Mindset); VDP für operative Umsetzung.";
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const kapitel = book.kapitel.map((k) => {
    const lever = leverForKey(k.makroStageKey, k.title);
    const withoutOld = k.goals
      .replace(/^Hebel:.*\n+/m, "")
      .replace(/^Hebel:.*$/m, "")
      .trim();
    return {
      ...k,
      goals: `${lever}\n\n${withoutOld}`.trim(),
      updatedAt: new Date().toISOString(),
    };
  });

  await patchSachbuchBook(ID, { kapitel });
  const done = await getSachbuchKontext(ID);
  console.log(
    JSON.stringify(
      done!.kapitel.map((k) => ({
        title: k.title,
        key: k.makroStageKey,
        lever: k.goals.split("\n")[0],
      })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
