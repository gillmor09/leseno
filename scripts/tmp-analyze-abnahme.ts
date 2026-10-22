/**
 * Deep abnahme / quality post-mortem for greenfield novel.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-analyze-abnahme.ts [novelId]
 */

import { hasChapterContract } from "@/lib/novel/chapter-contract";
import { getLogicLedger } from "@/lib/novel/logic-ledger";
import { getManuscriptRevisionState } from "@/lib/novel/manuscript-revision";
import {
  detectCrossChapterFormulaHits,
  detectNovelProseTics,
  detectPlaceholders,
} from "@/lib/novel/prose-tic-detect";
import { getNovelBundle } from "@/lib/novel/repository";
import { getVoiceCard } from "@/lib/novel/voice-card";
import { getWaveState } from "@/lib/novel/wave-batch";

const NOVEL_ID =
  process.argv[2]?.trim() || "ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22";

async function main(): Promise<void> {
  const b = await getNovelBundle(NOVEL_ID);
  if (!b) throw new Error("not found");

  const chapters = b.chapters
    .slice()
    .sort((a, c) => a.chapterNumber - c.chapterNumber);

  const abnahme = b.novel.abnahme;
  const rev = getManuscriptRevisionState(b);
  const wave = getWaveState(b);
  const ledger = getLogicLedger(b);
  const voice = getVoiceCard(b);

  // Contract / beat coverage
  let withContract = 0;
  let withBeats = 0;
  const jobs: Record<string, number> = {};
  const beatTypes: Record<string, number> = {};
  for (const c of chapters) {
    if (hasChapterContract(c.contract)) {
      withContract += 1;
      const job = String((c.contract as { job?: string }).job ?? "?");
      jobs[job] = (jobs[job] ?? 0) + 1;
    }
    const beats = (c.scenePlan as { beats?: unknown } | null)?.beats;
    if (Array.isArray(beats) && beats.length > 0) {
      withBeats += 1;
      for (const beat of beats) {
        if (beat && typeof beat === "object") {
          const t = String((beat as { type?: string }).type ?? "?");
          beatTypes[t] = (beatTypes[t] ?? 0) + 1;
        }
      }
    }
  }

  // Feedback aggregate
  const byCh = new Map<
    string,
    { n: number; fails: number; approves: number; soft: number; lastIssues: string[] }
  >();
  for (const c of chapters) {
    byCh.set(c.id, {
      n: c.chapterNumber,
      fails: 0,
      approves: 0,
      soft: 0,
      lastIssues: [],
    });
  }
  const issueBuckets: Record<string, number> = {
    character: 0,
    scene: 0,
    prose: 0,
    outline: 0,
    LOGIK: 0,
    soft: 0,
    other: 0,
  };
  for (const f of b.editorFeedbacks) {
    const row = byCh.get(f.chapterId);
    if (!row) continue;
    if (f.approved) {
      row.approves += 1;
      if (f.issues.some((i) => /soft-freigabe|manuelle freigabe|lückenheilung/i.test(i))) {
        row.soft += 1;
        issueBuckets.soft += 1;
      }
    } else {
      row.fails += 1;
    }
    for (const issue of f.issues) {
      if (/\[character/i.test(issue) || /^character/i.test(issue))
        issueBuckets.character += 1;
      else if (/\[scene/i.test(issue)) issueBuckets.scene += 1;
      else if (/\[prose/i.test(issue)) issueBuckets.prose += 1;
      else if (/\[outline/i.test(issue)) issueBuckets.outline += 1;
      if (/LOGIK/i.test(issue)) issueBuckets.LOGIK += 1;
    }
    if (!f.approved && f.issues.length) row.lastIssues = f.issues.slice(0, 3);
  }

  const softChapters = [...byCh.values()]
    .filter((r) => r.soft > 0)
    .map((r) => r.n)
    .sort((a, c) => a - c);
  const highFail = [...byCh.values()]
    .filter((r) => r.fails >= 5)
    .sort((a, c) => c.fails - a.fails)
    .slice(0, 10)
    .map((r) => ({ n: r.n, fails: r.fails, soft: r.soft, status: chapters.find((c) => c.chapterNumber === r.n)?.status }));

  // Tic / formula scan on final preferred text
  let ticCh = 0;
  let endAphorism = 0;
  let placeholderCh = 0;
  const formulaHits: { n: number; codes: string[] }[] = [];
  const priorTexts: string[] = [];
  for (const c of chapters) {
    const text = (c.finalText || c.rawDraft).trim();
    if (text.length < 80) continue;
    const tics = detectNovelProseTics(text);
    if (tics.length) {
      ticCh += 1;
      if (tics.some((h) => h.code === "chapter_end_aphorism")) endAphorism += 1;
    }
    if (detectPlaceholders(text).length) placeholderCh += 1;
    const cross = detectCrossChapterFormulaHits({
      currentText: text,
      priorChapterTexts: priorTexts.slice(-5),
    });
    if (cross.length) {
      formulaHits.push({
        n: c.chapterNumber,
        codes: cross.map((h) => h.code),
      });
    }
    priorTexts.push(text);
  }

  // Ending samples (last 180 chars) for chapters with soft or high fail
  const endings = softChapters.slice(0, 6).map((n) => {
    const c = chapters.find((x) => x.chapterNumber === n)!;
    const text = (c.finalText || c.rawDraft).trim();
    return {
      n,
      status: c.status,
      end: text.slice(-180).replace(/\s+/g, " "),
      job: (c.contract as { job?: string } | null)?.job,
      beatCount: Array.isArray((c.scenePlan as { beats?: unknown })?.beats)
        ? ((c.scenePlan as { beats: unknown[] }).beats.length)
        : 0,
    };
  });

  // Length distribution
  const lengths = chapters.map((c) => ({
    n: c.chapterNumber,
    len: (c.finalText || c.rawDraft).trim().length,
    status: c.status,
    hasFinal: Boolean((c.finalText || "").trim()),
  }));

  console.log(
    JSON.stringify(
      {
        title: b.novel.title,
        status: b.novel.status,
        orch: {
          phase: b.novel.orchestratorStatus.phase,
          step: b.novel.orchestratorStatus.step,
          label: b.novel.orchestratorStatus.label,
          error: b.novel.orchestratorStatus.error?.slice(0, 200),
        },
        abnahme,
        revision: {
          pass: rev.pass,
          maxPasses: rev.maxPasses,
          reviewSummary: rev.reviewSummary?.slice(0, 500),
          planRationale: rev.plan?.rationale?.slice(0, 300),
          planActions: rev.plan?.actions?.map((a) => ({
            ch: a.chapter,
            action: a.action,
            brief: a.brief.slice(0, 100),
          })),
          queue: rev.queue,
          done: rev.done,
        },
        wave: {
          waveIndex: wave.waveIndex,
          syncDoneCount: wave.syncDone.length,
          status: wave.status,
        },
        infrastructure: {
          withContract,
          withBeats,
          totalChapters: chapters.length,
          jobs,
          beatTypes,
          hasVoiceCard: Boolean(voice),
          voiceSampleCount: voice?.sampleLines?.length ?? 0,
          ledgerTimeline: ledger?.timeline?.length ?? 0,
          ledgerMoney: ledger?.money?.length ?? 0,
          ledgerOpenQ: ledger?.openQuestions?.length ?? 0,
        },
        softApprovedChapters: softChapters,
        highFailChapters: highFail,
        issueBuckets,
        qualityScan: {
          ticChapters: ticCh,
          endAphorismChapters: endAphorism,
          placeholderChapters: placeholderCh,
          formulaHitChapters: formulaHits.slice(0, 12),
        },
        softEndings: endings,
        lengthStats: {
          min: Math.min(...lengths.map((l) => l.len)),
          max: Math.max(...lengths.map((l) => l.len)),
          median: lengths.map((l) => l.len).sort((a, c) => a - c)[
            Math.floor(lengths.length / 2)
          ],
          withFinalText: lengths.filter((l) => l.hasFinal).length,
          under2k: lengths.filter((l) => l.len < 2000).map((l) => l.n),
          over6k: lengths.filter((l) => l.len > 6000).map((l) => l.n),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
