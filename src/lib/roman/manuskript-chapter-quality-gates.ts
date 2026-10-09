/**
 * Sequential post-draft quality gates for Manuskript chapters.
 * Order: Verbote/Geheimnisse → Abdeckung → Raum → Sprache → Verify.
 * One rewrite per failing phase so later fixes do not undo earlier ones;
 * final verify re-checks Raum+Sprache once.
 */

import {
  formatContractViolationRewriteBrief,
  validateManuskriptChapterAgainstContracts,
} from "@/lib/roman/manuskript-contract-validate";
import {
  formatCoverageViolationRewriteBrief,
  validateManuskriptChapterCoverage,
} from "@/lib/roman/manuskript-coverage-validate";
import {
  formatGrammarViolationRewriteBrief,
  validateManuskriptChapterGrammar,
} from "@/lib/roman/manuskript-grammar-validate";
import {
  formatSpatialViolationRewriteBrief,
  validateManuskriptChapterSpatial,
} from "@/lib/roman/manuskript-spatial-validate";
import type { RomanSzenenplotChapterNode } from "@/lib/roman/szenenplot-structured";

export type ManuskriptGateWritten = {
  chapterMarkdown: string;
  wordCount: number;
};

const MAX_REWRITES = 5;

/**
 * Run quality gates on a freshly written chapter; rewrite sequentially if needed.
 */
export async function runManuskriptPostDraftQualityGates(input: {
  written: ManuskriptGateWritten;
  chapterNumber: number;
  chapterLabel: string;
  chapterPacket?: string;
  structuredChapter: RomanSzenenplotChapterNode | null | undefined;
  factContractsBlock?: string;
  extractBody: (markdown: string, chapterNumber: number) => string | null;
  wordCountOf: (body: string) => number;
  rewrite: (patchedPacket: string) => Promise<ManuskriptGateWritten>;
  onProgress?: (label: string) => Promise<void>;
}): Promise<ManuskriptGateWritten> {
  let written = input.written;
  let rewrites = 0;
  const packetBase = input.chapterPacket?.trim() ?? "";

  const currentBody = (): string | null => {
    const body = input.extractBody(written.chapterMarkdown, input.chapterNumber);
    if (!body || input.wordCountOf(body) < 40) return null;
    return body;
  };

  const doRewrite = async (brief: string, label: string) => {
    if (!brief.trim() || rewrites >= MAX_REWRITES) return false;
    rewrites += 1;
    await input.onProgress?.(
      `${input.chapterLabel}: ${label} — Korrektur ${rewrites}/${MAX_REWRITES} …`,
    );
    const patched = [brief.trim(), packetBase].filter(Boolean).join("\n\n");
    written = await input.rewrite(patched || packetBase);
    return true;
  };

  const ch = input.structuredChapter ?? null;

  // 1) Heuristic bans / secrets
  {
    const body = currentBody();
    if (body && ch) {
      const check = validateManuskriptChapterAgainstContracts({
        prose: body,
        chapter: ch,
      });
      if (!check.ok) {
        await doRewrite(
          formatContractViolationRewriteBrief(check.violations),
          "Vertrag (Verbote/Geheim)",
        );
      }
    }
  }

  // 2) Dramaturgy / arcs / facts coverage
  {
    const body = currentBody();
    if (body && ch) {
      const coverage = await validateManuskriptChapterCoverage({
        prose: body,
        chapter: ch,
        factContractsBlock: input.factContractsBlock,
      });
      if (!coverage.ok) {
        await doRewrite(
          formatCoverageViolationRewriteBrief(coverage.violations),
          "Abdeckung (Beats/Fakten)",
        );
      }
    }
  }

  // 3) Spatial spine
  {
    const body = currentBody();
    if (body && ch) {
      const spatial = await validateManuskriptChapterSpatial({
        prose: body,
        chapter: ch,
      });
      if (!spatial.ok) {
        await doRewrite(
          formatSpatialViolationRewriteBrief(spatial.violations),
          "Raum/Props",
        );
      }
    }
  }

  // 4) Grammar last (after plot/space stable)
  {
    const body = currentBody();
    if (body) {
      const grammar = await validateManuskriptChapterGrammar({ prose: body });
      if (!grammar.ok) {
        await doRewrite(
          formatGrammarViolationRewriteBrief(grammar.violations),
          "Sprache",
        );
      }
    }
  }

  // 5) Verify: Raum + Sprache once more (catch tear-apart from last rewrite)
  {
    const body = currentBody();
    if (!body || rewrites >= MAX_REWRITES) return written;
    const briefs: string[] = [];
    if (ch) {
      const spatial = await validateManuskriptChapterSpatial({
        prose: body,
        chapter: ch,
      });
      if (!spatial.ok) {
        briefs.push(formatSpatialViolationRewriteBrief(spatial.violations));
      }
    }
    const grammar = await validateManuskriptChapterGrammar({ prose: body });
    if (!grammar.ok) {
      briefs.push(formatGrammarViolationRewriteBrief(grammar.violations));
    }
    if (briefs.length) {
      await doRewrite(briefs.join("\n\n"), "Nachprüfung Raum/Sprache");
    }
  }

  return written;
}
