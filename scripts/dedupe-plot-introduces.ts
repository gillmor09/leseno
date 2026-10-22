/**
 * One-shot: strip double `introduces` on Kapitelgerüst / Plot.
 * Run: npx tsx --env-file=.env.local scripts/dedupe-plot-introduces.ts [--dry-run]
 */

import {
  getRomanKontext,
  setRomanEditorial,
} from "../src/lib/roman/repository";
import {
  auditKapitelGeruestStructured,
  dedupeGeruestChapterIntroduces,
  normalizeGeruestLifecycleLabel,
} from "../src/lib/roman/szenenplot-preflight";
import { structuredKapitelGeruestToMarkdown } from "../src/lib/roman/szenenplot-structured";

const ROMAN_ID =
  process.env.ROMAN_ID?.trim() || "16b8a407-1851-4d1f-bf32-a5adf1687451";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const roman = await getRomanKontext(ROMAN_ID);
  if (!roman) throw new Error(`Roman ${ROMAN_ID} nicht gefunden.`);
  const ed = roman.editorial;
  if (!ed?.kapitelGeruestStructured?.chapters.length) {
    throw new Error("Kein kapitelGeruestStructured — nichts zu deduplizieren.");
  }

  const before = ed.kapitelGeruestStructured;
  const auditBefore = auditKapitelGeruestStructured(before);
  const doublesBefore = auditBefore.errors.filter(
    (e) => e.code === "double_introduce",
  );

  const firstSeen = new Map<string, number>();
  const stripped: Array<{ label: string; fromChapter: number; keptIn: number }> =
    [];
  for (const ch of [...before.chapters].sort((a, b) => a.number - b.number)) {
    for (const label of ch.introduces ?? []) {
      const key = normalizeGeruestLifecycleLabel(label);
      if (!key) continue;
      const first = firstSeen.get(key);
      if (first == null) {
        firstSeen.set(key, ch.number);
        continue;
      }
      stripped.push({
        label: label.trim(),
        fromChapter: ch.number,
        keptIn: first,
      });
    }
  }

  const chapters = dedupeGeruestChapterIntroduces(before.chapters);
  const nextStructured = {
    ...before,
    updatedAt: new Date().toISOString(),
    modelLabel: `${before.modelLabel || "—"} · introduce-dedupe`,
    chapters,
  };
  const auditAfter = auditKapitelGeruestStructured(nextStructured);
  const doublesAfter = auditAfter.errors.filter(
    (e) => e.code === "double_introduce",
  );

  console.log(`Roman: ${roman.title} (${ROMAN_ID})`);
  console.log(`Kapitel: ${before.chapters.length}`);
  console.log(`Doppel-introduces vorher: ${doublesBefore.length}`);
  for (const d of doublesBefore.slice(0, 12)) {
    console.log(`  · ${d.message}`);
  }
  console.log(`Stripped labels: ${stripped.length}`);
  for (const s of stripped.slice(0, 20)) {
    console.log(
      `  · „${s.label}“: Kap. ${s.fromChapter} → behalten in Kap. ${s.keptIn}`,
    );
  }
  console.log(`Doppel-introduces nachher: ${doublesAfter.length}`);

  if (dryRun) {
    console.log("Dry-run — nichts gespeichert.");
    return;
  }

  const nextEd = {
    ...ed,
    kapitelGeruestStructured: nextStructured,
    kapitelGeruestRaw: structuredKapitelGeruestToMarkdown(nextStructured),
  };
  await setRomanEditorial(ROMAN_ID, nextEd);
  console.log("Gespeichert (kapitelGeruestStructured + Raw).");
  console.log(
    "Hinweis: Reifegrad ggf. neu messen — Hard-Gate liest den Dedup sofort.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
