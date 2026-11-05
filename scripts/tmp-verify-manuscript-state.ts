/**
 * Verify Lean Privacy manuscript persistence vs UI critique card.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-verify-manuscript-state.ts
 */
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
  sachbuchManuscriptOverallSalesScore,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const CHECKS: Array<{ kap: number; needle: string; label: string }> = [
  { kap: 4, needle: "operativen Speicherbegrenzung", label: "bridge 4→5" },
  { kap: 5, needle: "dreistufige Architektur-Bereinigung", label: "no 90-Tage-Rollout brand" },
  { kap: 5, needle: "90-Tage-Rollout", label: "BAD if found in K5" },
  { kap: 6, needle: "Spitze der Pyramide", label: "bridge 6→7" },
  { kap: 7, needle: "Einwilligungs- und Fairness-Design", label: "bridge 7→8" },
  { kap: 8, needle: "KI-Stresstest und den Gesamt-Rollout", label: "bridge 8→9" },
  { kap: 9, needle: "Value-Driven Privacy übersetzt diese Haltung in die dreistufige Pyramide", label: "short pyramid intro" },
  { kap: 9, needle: "Sales Cycle Velocity", label: "velocity bilanz" },
  { kap: 4, needle: "Dummy-Werte aus", label: "BAD old dummy dupe if found" },
  { kap: 6, needle: "Poka-Yoke als Schnittstellen-Validierung", label: "lean reintro fix" },
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  const overall = sachbuchManuscriptOverallSalesScore(book);
  const rev = book.idee.manuscriptReview;
  console.log("=== BOOK REVIEW ===");
  console.log("overall", overall);
  console.log("scoredAt", rev?.scoredAt);
  console.log("salesScore", rev?.salesScore);
  console.log("summary", (rev?.scoreSummary ?? "").slice(0, 300));
  console.log("\n-- gaps", rev?.gaps?.length ?? 0);
  for (const g of rev?.gaps ?? []) console.log(" •", g);
  console.log("\n-- changeOrders", rev?.changeOrders?.length ?? 0);
  for (const o of rev?.changeOrders ?? []) console.log(" •", o);

  console.log("\n=== KAPITEL BODY SOURCE ===");
  for (let i = 0; i < book.kapitel.length; i += 1) {
    const k = book.kapitel[i]!;
    const improved = k.manuscript.improvedText?.trim() ?? "";
    const draft = k.manuscript.draftText?.trim() ?? "";
    const finalT = k.finalText?.trim() ?? "";
    const body = sachbuchKapitelBodyText(k);
    const src =
      improved.length >= 200
        ? "improved"
        : draft.length >= 200
          ? "draft"
          : finalT.length >= 200
            ? "final"
            : "empty";
    console.log(
      `K${i + 1}: bodySrc=${src} improved=${countSachbuchWords(improved)}w draft=${countSachbuchWords(draft)}w final=${countSachbuchWords(finalT)}w body=${countSachbuchWords(body)}w improvedAt=${k.manuscript.improvedAt ?? "—"} bookPass=${k.manuscript.bookPassAppliedScoredAt ?? "—"} needsImprove=${sachbuchKapitelNeedsManuscriptImprove(book, k.id)}`,
    );
  }

  console.log("\n=== PERSISTENCE CHECKS (in sachbuchKapitelBodyText) ===");
  for (const c of CHECKS) {
    const t = sachbuchKapitelBodyText(book.kapitel[c.kap - 1]!);
    const ok = t.includes(c.needle);
    console.log(`${ok ? "OK " : "NO "} K${c.kap} ${c.label}: ${JSON.stringify(c.needle).slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
