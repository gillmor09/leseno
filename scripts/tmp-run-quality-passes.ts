/**
 * Heal ledger (parse + anchors + soft debt), reset timeline/formula passes,
 * kick timeline_pass → formula_pass → voice (orchestrator chain).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-run-quality-passes.ts [novelId]
 */

import { kickNovelJobHttp } from "@/lib/novel/novel-job-kick";
import {
  addLedgerDebt,
  deriveAnchorsFromTimeline,
  entityStatesWithLedger,
  entityStatesWithLedgerDebt,
  getLedgerDebt,
  getLogicLedger,
  parseLogicLedger,
  LOGIC_LEDGER_KEY,
} from "@/lib/novel/logic-ledger";
import { entityStatesWithFormulaPass } from "@/lib/novel/formula-pass";
import { entityStatesWithTimelinePass } from "@/lib/novel/timeline-pass";
import {
  getNovelBundle,
  updateNovel,
  upsertKnowledgeGraph,
} from "@/lib/novel/repository";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main(): Promise<void> {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error(`Novel nicht gefunden: ${NOVEL_ID}`);

  const raw = b.knowledgeGraph?.entityStates?.[LOGIC_LEDGER_KEY];
  let ledger = parseLogicLedger(raw) ?? getLogicLedger(b);
  if (!ledger) {
    throw new Error("Kein Logic-Ledger in entityStates — Outline-Seed fehlt.");
  }

  // Canonical anchors from Abnahme (Börse / Fristen) — hard constraint for timeline pass.
  const anchors = deriveAnchorsFromTimeline(ledger.timeline, ledger.anchors);
  const ensureAnchor = (
    id: string,
    dateLabel: string,
    event: string,
    chapterHint: number,
  ) => {
    if (anchors.some((a) => a.id === id)) return;
    anchors.push({ id, dateLabel, event, chapterHint });
  };
  ensureAnchor(
    "boersentermin",
    "16. November",
    "Börsentermin — verbindlicher Stichtag für Referenzlauf und Stellungnahmen",
    13,
  );
  ensureAnchor(
    "stellungnahme_frist",
    "12. November",
    "Frist für die Stellungnahme vor dem Börsentermin",
    17,
  );
  ensureAnchor(
    "auszug",
    "29.–30. Oktober / Übergang November",
    "Abschluss/Auszug — nicht mit Juli-Stichtagen vermischen",
    27,
  );

  // Drop bogus mid-book July reference-run dates from timeline rows if present.
  const timeline = ledger.timeline.map((t) => {
    if (
      (t.chapter === 17 || t.chapter === 18) &&
      /3\.?\s*Juli|Juli/i.test(t.dateLabel)
    ) {
      return {
        ...t,
        dateLabel: "vor dem 16. November (Referenzlauf)",
        event: `${t.event} [korrigiert: kein Juli-Stichtag]`.slice(0, 400),
      };
    }
    return t;
  });

  ledger = {
    ...ledger,
    timeline,
    anchors,
  };

  // Soft-debt from soft-approved feedbacks / statuses.
  let debt = getLedgerDebt(b);
  for (const c of b.chapters) {
    const softStatus = c.status === "approved_with_warnings";
    const softFb = b.editorFeedbacks.some(
      (f) =>
        f.chapterId === c.id &&
        f.approved &&
        f.issues.some((i) =>
          /soft-freigabe|manuelle freigabe|lückenheilung|Ledger-Schuld/i.test(i),
        ),
    );
    if (softStatus || softFb) {
      const issues = b.editorFeedbacks
        .filter((f) => f.chapterId === c.id && !f.approved)
        .flatMap((f) => f.issues)
        .filter((i) => /LOGIK|Zeit|Datum|Ledger|Juli|November/i.test(i))
        .slice(0, 4);
      debt = addLedgerDebt(
        debt,
        c.chapterNumber,
        issues.length
          ? issues
          : [`Soft-Freigabe Kap. ${c.chapterNumber} — Timeline/Logik nachziehen.`],
      );
    }
  }

  let entityStates = entityStatesWithLedger(
    b.knowledgeGraph?.entityStates ?? {},
    ledger,
  );
  entityStates = entityStatesWithLedgerDebt(entityStates, debt);
  entityStates = entityStatesWithTimelinePass(entityStates, {
    queue: [],
    done: [],
    status: "idle",
    updatedAt: new Date().toISOString(),
  });
  entityStates = entityStatesWithFormulaPass(entityStates, {
    queue: [],
    done: [],
    status: "idle",
    updatedAt: new Date().toISOString(),
  });

  await upsertKnowledgeGraph({
    novelId: NOVEL_ID,
    entityStates,
    timelineEvents: b.knowledgeGraph?.timelineEvents ?? [],
  });

  console.log(
    JSON.stringify(
      {
        anchors: ledger.anchors,
        timelineRows: ledger.timeline.length,
        moneyRows: ledger.money.length,
        debtChapters: debt.chapters,
        next: "timeline_pass",
      },
      null,
      2,
    ),
  );

  await updateNovel({
    id: NOVEL_ID,
    status: "writing",
    orchestratorStatus: {
      phase: "timeline_pass",
      step: "timeline_pass",
      chapterNumber: null,
      iteration: null,
      label: "Quality-Passes: Timeline → Formel → Voice…",
      error: null,
      updatedAt: new Date().toISOString(),
    },
  });

  const hop = { novelId: NOVEL_ID, step: "timeline_pass" };
  const ok = await kickNovelJobHttp({ hop, delayMs: 400 });
  console.log("kick", ok ? "ok" : "FAILED");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
