/**
 * Apply remaining Manuskript Freigabe findings from CLI (all passes until clean/stuck).
 * Run: npx tsx --env-file=.env.local scripts/tmp-apply-remaining-freigabe.ts
 */
import { createHash } from "node:crypto";
import { getRomanKontext, upsertRomanKontext } from "../src/lib/roman/repository";
import {
  emptyRomanEditorial,
  hardManuskriptFreigabeFindings,
  manuskriptFreigabeFingerprint,
  withManuskriptFreigabe,
  withPipelineTabFertig,
  type ManuskriptFreigabeFinding,
} from "../src/lib/roman/editorial";
import { runFreigabeAudits } from "../src/lib/roman/manuskript-freigabe-audit";
import { runManuskriptSeamPayoffPass } from "../src/lib/roman/manuskript-seam-payoff";
import { runManuskriptEmotionalConsequencePass } from "../src/lib/roman/manuskript-emotional-consequence";
import { runManuskriptContinuityLedgerPass } from "../src/lib/roman/manuskript-continuity-ledger";
import {
  applyManuskriptContinuityFixes,
  editorialAfterContinuityApply,
  scanManuskriptContinuity,
} from "../src/lib/roman/manuskript-continuity-pass";
import {
  runManuskriptPhraseVariationPass,
  seedPhrasesFromFreigabeFindings,
} from "../src/lib/roman/manuskript-phrase-variation";
import {
  filterFindingsAgainstSettled,
  mergeSettled,
  settledFromFinding,
} from "../src/lib/roman/manuskript-freigabe-settle";
import { canonicalizeKennzeichenInText } from "../src/lib/roman/kennzeichen-canon";

const ID = "16b8a407-1851-4d1f-bf32-a5adf1687451";
const MAX_ROUNDS = 8;

function persistFields(roman: Awaited<ReturnType<typeof getRomanKontext>>) {
  if (!roman) throw new Error("missing");
  return {
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
  };
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function logFindings(label: string, findings: ManuskriptFreigabeFinding[]) {
  const hard = hardManuskriptFreigabeFindings(findings);
  console.log(`\n=== ${label}: ${findings.length} total, ${hard.length} hard ===`);
  for (const f of findings) {
    console.log(
      `  [${f.soft ? "soft" : "HARD"} ${f.source}/${f.kind}] Kap ${f.chapterNumbers.join(",")}: ${f.summary.slice(0, 140)}`,
    );
  }
}

async function refreshFindings(roman: NonNullable<Awaited<ReturnType<typeof getRomanKontext>>>) {
  const ed = roman.editorial ?? emptyRomanEditorial();
  let text = canonicalizeKennzeichenInText(
    ed.manuskriptText ?? "",
    ed.wissensGraph,
  );
  const raw = await runFreigabeAudits({
    manuskriptText: text,
    structured: ed.szenenplotStructured ?? null,
    wissensGraph: ed.wissensGraph,
    storyState: ed.storyState,
    charaktere: roman.charaktere,
    tonalitaet: roman.tonalitaet,
  });
  const settled = ed.manuskriptFreigabe?.settled;
  const findings = filterFindingsAgainstSettled(raw, settled);
  return { text, findings, settled };
}

async function main() {
  let roman = await getRomanKontext(ID);
  if (!roman) throw new Error("missing");

  // Start from stored freigabe if present, else fresh audit
  let ed0 = roman.editorial ?? emptyRomanEditorial();
  let findings = ed0.manuskriptFreigabe?.findings ?? [];
  if (findings.length === 0) {
    const refreshed = await refreshFindings(roman);
    findings = refreshed.findings;
  }
  logFindings("START (stored/fresh)", findings);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const ed = roman.editorial ?? emptyRomanEditorial();
    const stored = ed.manuskriptFreigabe?.findings ?? findings;
    const hard = hardManuskriptFreigabeFindings(stored);
    const stylePhrases = seedPhrasesFromFreigabeFindings(stored);
    const hasStyle =
      stylePhrases.length > 0 ||
      stored.some(
        (f) =>
          f.source === "style" &&
          (f.kind === "style_repeat" ||
            /stockphrase|formulierungs-variation/i.test(f.summary)),
      );
    const hasCanon = hard.some((f) => f.source === "canon");
    const seamSeeds = stored
      .filter(
        (f) =>
          !f.soft &&
          (f.source === "seam" || f.source === "timeline") &&
          (f.kind === "seam" || f.kind === "payoff" || f.kind === "timeline") &&
          !/kein\s+problem|kein\s+befund|\bok\b\s*$/i.test(f.summary),
      )
      .map((f) => ({
        kind: f.kind as "seam" | "payoff" | "timeline",
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
        patchFocus: f.summary.slice(0, 320),
      }))
      .sort((a, b) => {
        const rank = (s: string) =>
          /duplikat|doppelung|dopplung|wiederhol|nahtdopp|überlapp|nochmals|wörtlich/i.test(
            s,
          )
            ? 0
            : 1;
        return rank(a.summary) - rank(b.summary);
      });
    const emotionSeeds = stored
      .filter(
        (f) =>
          !f.soft &&
          f.source === "emotion" &&
          (f.kind === "value_change" ||
            f.kind === "aftermath" ||
            f.kind === "motivation" ||
            f.kind === "emotion"),
      )
      .map((f) => ({
        kind: (f.kind === "emotion" ? "aftermath" : f.kind) as
          | "value_change"
          | "aftermath"
          | "motivation",
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
        patchFocus: f.summary.slice(0, 320),
      }));
    const ledgerSeeds = stored
      .filter(
        (f) =>
          !f.soft &&
          f.source === "ledger" &&
          (f.kind === "timeline" ||
            f.kind === "money" ||
            f.kind === "knowledge"),
      )
      .map((f) => ({
        kind: f.kind as "timeline" | "money" | "knowledge",
        chapterNumbers: f.chapterNumbers,
        summary: f.summary,
      }));

    const patchable =
      Number(hasCanon) +
      Number(hasStyle) +
      seamSeeds.length +
      emotionSeeds.length +
      ledgerSeeds.length;
    if (patchable === 0 && hard.length === 0) {
      console.log(`\nRound ${round}: nothing patchable, hard=0 — done`);
      break;
    }
    if (patchable === 0) {
      console.log(
        `\nRound ${round}: hard left but not patchable (plot_truth?):`,
      );
      for (const f of hard) {
        console.log(`  [${f.source}/${f.kind}] ${f.summary.slice(0, 120)}`);
      }
      break;
    }

    const beforeHash = hash(ed.manuskriptText ?? "");
    let addressed = stored.slice(0, 0);
    let summary = "";

    console.log(`\n--- Round ${round} (ms ${beforeHash}) ---`);

    if (hasCanon) {
      addressed = stored.filter((f) => !f.soft && f.source === "canon");
      const scan = await scanManuskriptContinuity({
        sourceText: ed.manuskriptText ?? "",
        target: "manuskript",
        wissensGraph: ed.wissensGraph,
        charaktere: roman.charaktere,
      });
      if (scan.fixes.length) {
        const applied = applyManuskriptContinuityFixes({
          sourceText: ed.manuskriptText ?? "",
          docFormat: "manuskript",
          wissensGraph: ed.wissensGraph,
          fixes: scan.fixes,
        });
        if (applied.appliedCount > 0) {
          const appliedFixes = scan.fixes.filter((f) =>
            applied.appliedIds.includes(f.id),
          );
          const nextEd = editorialAfterContinuityApply(ed, {
            target: "manuskript",
            text: applied.text,
            wissensGraph: applied.wissensGraph,
            appliedFixes,
          });
          roman = await upsertRomanKontext({
            ...persistFields(roman),
            editorial: nextEd,
          });
          summary = `Canon ${applied.appliedCount} fixes`;
        } else {
          summary = "Canon scan hits but no apply";
        }
      } else {
        summary = "Canon already clean";
      }
    } else if (hasStyle) {
      addressed = stored.filter(
        (f) =>
          f.source === "style" &&
          (f.kind === "style_repeat" ||
            /stockphrase|formulierungs-variation/i.test(f.summary)),
      );
      const style = await runManuskriptPhraseVariationPass({
        roman,
        seedPhrases: stylePhrases,
      });
      roman = style.roman;
      summary = style.summary;
    } else if (seamSeeds.length > 0) {
      addressed = stored.filter(
        (f) =>
          !f.soft &&
          (f.source === "seam" || f.source === "timeline") &&
          (f.kind === "seam" ||
            f.kind === "payoff" ||
            f.kind === "timeline"),
      );
      const seam = await runManuskriptSeamPayoffPass({
        roman,
        seedFindings: seamSeeds,
      });
      roman = seam.roman;
      summary = `${seam.summary} patched=[${seam.patchedChapters.join(",")}]`;
    } else if (emotionSeeds.length > 0) {
      addressed = stored.filter(
        (f) =>
          !f.soft &&
          f.source === "emotion" &&
          (f.kind === "value_change" ||
            f.kind === "aftermath" ||
            f.kind === "motivation" ||
            f.kind === "emotion"),
      );
      const emo = await runManuskriptEmotionalConsequencePass({
        roman,
        seedFindings: emotionSeeds,
      });
      roman = emo.roman;
      summary = `${emo.summary} patched=[${emo.patchedChapters.join(",")}]`;
    } else if (ledgerSeeds.length > 0) {
      addressed = stored.filter(
        (f) =>
          !f.soft &&
          f.source === "ledger" &&
          (f.kind === "timeline" ||
            f.kind === "money" ||
            f.kind === "knowledge"),
      );
      const ledger = await runManuskriptContinuityLedgerPass({
        roman,
        seedFindings: ledgerSeeds,
      });
      roman = ledger.roman;
      summary = `${ledger.summary} patched=[${ledger.patchedChapters.join(",")}]`;
    }

    console.log(`  pass: ${summary}`);

    // Settle + reaudit
    const now = new Date().toISOString();
    const ed2 = roman.editorial ?? emptyRomanEditorial();
    let text = canonicalizeKennzeichenInText(
      ed2.manuskriptText ?? "",
      ed2.wissensGraph,
    );
    const settled = mergeSettled(
      ed.manuskriptFreigabe?.settled,
      addressed.map((f) => settledFromFinding(f, now)),
    );
    let nextFindings: ManuskriptFreigabeFinding[] = [];
    try {
      const raw = await runFreigabeAudits({
        manuskriptText: text,
        structured: ed2.szenenplotStructured ?? null,
        wissensGraph: ed2.wissensGraph,
        storyState: ed2.storyState,
        charaktere: roman.charaktere,
        tonalitaet: roman.tonalitaet,
      });
      nextFindings = filterFindingsAgainstSettled(raw, settled);
    } catch (e) {
      console.log("  reaudit failed:", e instanceof Error ? e.message : e);
      nextFindings = filterFindingsAgainstSettled(stored, settled);
    }

    const hardLeft = hardManuskriptFreigabeFindings(nextFindings).length;
    let nextEd = withManuskriptFreigabe(ed2, {
      checkedAt: now,
      textFingerprint: manuskriptFreigabeFingerprint(text),
      findings: nextFindings,
      overrideAt: null,
      ...(settled.length ? { settled } : {}),
    });
    if (text !== (ed2.manuskriptText ?? "")) {
      nextEd = { ...nextEd, manuskriptText: text };
    }
    if (hardLeft === 0) {
      nextEd = withPipelineTabFertig(nextEd, "schreiben", true);
    }
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        roman = await upsertRomanKontext({
          ...persistFields(roman),
          editorial: nextEd,
        });
        break;
      } catch (err) {
        console.log(
          `  upsert retry ${attempt}/4:`,
          err instanceof Error ? err.message.slice(0, 120) : err,
        );
        if (attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    findings = nextFindings;
    logFindings(`After round ${round}`, findings);

    const afterHash = hash(roman.editorial?.manuskriptText ?? "");
    if (hardLeft === 0) {
      console.log("\nHARD CLEAN — freigabe ok");
      break;
    }
    if (afterHash === beforeHash && addressed.length > 0) {
      console.log("\nText unchanged this round — continuing with settle only");
    }
  }

  const final = await getRomanKontext(ID, { omitCover: true });
  const ff = final?.editorial?.manuskriptFreigabe?.findings ?? [];
  logFindings("FINAL", ff);
  console.log(
    "hard left:",
    hardManuskriptFreigabeFindings(ff).length,
    "schreiben fertig:",
    Boolean(final?.editorial?.pipelineTabFertig?.schreiben),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
