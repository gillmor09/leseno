/**
 * Book-level logic ledger: timeline + money + open questions + anchors.
 * Stored under knowledge_graph.entityStates[LOGIC_LEDGER_KEY].
 * Seeded after outline; updated each state_sync; fed to draft/review/abnahme.
 *
 * Parse never hard-fails on long strings — clip instead (older books had
 * verbose money.status that made getLogicLedger return null).
 */

import { z } from "zod";
import type { KnowledgeGraph, NovelBundle } from "@/lib/novel/types";

export const LOGIC_LEDGER_KEY = "__logicLedger";
/** Soft-approved chapters that still owe a LOGIK fix. */
export const LEDGER_DEBT_KEY = "__ledgerDebt";

function clip(s: unknown, max: number, fallback = "—"): string {
  const t = String(s ?? "").trim();
  if (!t) return fallback;
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

const timelineRowSchema = z.object({
  chapter: z.coerce.number().int().min(1),
  dateLabel: z.preprocess((v) => clip(v, 120), z.string().min(1).max(120)),
  event: z.preprocess((v) => clip(v, 400), z.string().min(1).max(400)),
});

const moneyRowSchema = z.object({
  id: z.preprocess((v) => clip(v, 60, "pos"), z.string().min(1).max(60)),
  amount: z.preprocess((v) => clip(v, 80), z.string().min(1).max(80)),
  status: z.preprocess((v) => clip(v, 200), z.string().min(1).max(200)),
  chapterRef: z.coerce.number().int().min(1),
});

/** Fixed dates that state_sync must not overwrite. */
const anchorRowSchema = z.object({
  id: z.preprocess((v) => clip(v, 40, "anchor"), z.string().min(1).max(40)),
  dateLabel: z.preprocess((v) => clip(v, 120), z.string().min(1).max(120)),
  event: z.preprocess((v) => clip(v, 240), z.string().min(1).max(240)),
  chapterHint: z.coerce.number().int().min(1).optional(),
});

export const novelLogicLedgerSchema = z.object({
  timeline: z.array(timelineRowSchema).default([]),
  money: z.array(moneyRowSchema).default([]),
  openQuestions: z
    .array(z.preprocess((v) => clip(v, 200), z.string().min(1).max(200)))
    .max(12)
    .default([]),
  anchors: z.array(anchorRowSchema).default([]),
  updatedAt: z.string().optional(),
});

export type NovelLogicLedger = z.infer<typeof novelLogicLedgerSchema>;
export type LedgerAnchor = NovelLogicLedger["anchors"][number];

export type LedgerDebtState = {
  chapters: number[];
  /** Latest LOGIK/issue lines per chapter. */
  issuesByChapter: Record<string, string[]>;
  updatedAt: string;
};

export function emptyLogicLedger(): NovelLogicLedger {
  return {
    timeline: [],
    money: [],
    openQuestions: [],
    anchors: [],
    updatedAt: "",
  };
}

export function emptyLedgerDebt(): LedgerDebtState {
  return { chapters: [], issuesByChapter: {}, updatedAt: "" };
}

/**
 * Clip-tolerant parse. Never returns null solely because a string was too long.
 */
export function parseLogicLedger(raw: unknown): NovelLogicLedger | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const coerceRows = <T>(
    arr: unknown,
    rowParse: (row: unknown) => T | null,
  ): T[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map(rowParse).filter((x): x is T => x != null);
  };

  const timeline = coerceRows(o.timeline, (row) => {
    const p = timelineRowSchema.safeParse(row);
    return p.success ? p.data : null;
  });
  const money = coerceRows(o.money, (row) => {
    const p = moneyRowSchema.safeParse(row);
    return p.success ? p.data : null;
  });
  const openQuestions = Array.isArray(o.openQuestions)
    ? o.openQuestions
        .map((q) => clip(q, 200, ""))
        .filter((q) => q.length > 0)
        .slice(0, 12)
    : [];
  const anchors = coerceRows(o.anchors, (row) => {
    const p = anchorRowSchema.safeParse(row);
    return p.success ? p.data : null;
  });

  // If everything empty and no updatedAt, treat as missing.
  if (
    timeline.length === 0 &&
    money.length === 0 &&
    openQuestions.length === 0 &&
    anchors.length === 0 &&
    !o.updatedAt
  ) {
    return null;
  }

  return {
    timeline,
    money,
    openQuestions,
    anchors,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt.trim() : "",
  };
}

export function getLogicLedger(
  bundle: NovelBundle | KnowledgeGraph | null | undefined,
): NovelLogicLedger | null {
  if (!bundle) return null;
  const states =
    "knowledgeGraph" in bundle
      ? bundle.knowledgeGraph?.entityStates
      : (bundle as KnowledgeGraph).entityStates;
  if (!states) return null;
  return parseLogicLedger(states[LOGIC_LEDGER_KEY]);
}

/** Merge ledger into entityStates without wiping other keys. */
export function entityStatesWithLedger(
  entityStates: Record<string, unknown>,
  ledger: NovelLogicLedger,
): Record<string, unknown> {
  return {
    ...entityStates,
    [LOGIC_LEDGER_KEY]: {
      ...ledger,
      anchors: ledger.anchors ?? [],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function getLedgerDebt(
  bundle: NovelBundle | KnowledgeGraph | null | undefined,
): LedgerDebtState {
  if (!bundle) return emptyLedgerDebt();
  const states =
    "knowledgeGraph" in bundle
      ? bundle.knowledgeGraph?.entityStates
      : (bundle as KnowledgeGraph).entityStates;
  const raw = states?.[LEDGER_DEBT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyLedgerDebt();
  }
  const o = raw as Record<string, unknown>;
  const chapters = Array.isArray(o.chapters)
    ? [
        ...new Set(
          o.chapters
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n >= 1),
        ),
      ].sort((a, b) => a - b)
    : [];
  const issuesByChapter: Record<string, string[]> = {};
  if (o.issuesByChapter && typeof o.issuesByChapter === "object") {
    for (const [k, v] of Object.entries(
      o.issuesByChapter as Record<string, unknown>,
    )) {
      if (Array.isArray(v)) {
        issuesByChapter[k] = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
      }
    }
  }
  return {
    chapters,
    issuesByChapter,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export function entityStatesWithLedgerDebt(
  entityStates: Record<string, unknown>,
  debt: LedgerDebtState,
): Record<string, unknown> {
  return {
    ...entityStates,
    [LEDGER_DEBT_KEY]: {
      ...debt,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Record soft-approve LOGIK debt so later passes must clear it. */
export function addLedgerDebt(
  debt: LedgerDebtState,
  chapterNumber: number,
  issues: string[],
): LedgerDebtState {
  const logicIssues = issues
    .filter((i) => /LOGIK|Zeit|Datum|Ledger|Widerspruch|Frist|Börse|November|Juli/i.test(i))
    .slice(0, 6);
  const fallback = issues.slice(0, 3);
  const lines = logicIssues.length ? logicIssues : fallback;
  return {
    chapters: [...new Set([...debt.chapters, chapterNumber])].sort(
      (a, b) => a - b,
    ),
    issuesByChapter: {
      ...debt.issuesByChapter,
      [String(chapterNumber)]: lines,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function clearLedgerDebtChapter(
  debt: LedgerDebtState,
  chapterNumber: number,
): LedgerDebtState {
  const chapters = debt.chapters.filter((n) => n !== chapterNumber);
  const issuesByChapter = { ...debt.issuesByChapter };
  delete issuesByChapter[String(chapterNumber)];
  return { chapters, issuesByChapter, updatedAt: new Date().toISOString() };
}

/**
 * Derive / merge anchors from seed timeline: prefer rows that look like
 * absolute calendar dates (day + month name or ISO-ish).
 */
export function deriveAnchorsFromTimeline(
  timeline: NovelLogicLedger["timeline"],
  existing: LedgerAnchor[] = [],
): LedgerAnchor[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  const dateLike =
    /\b(\d{1,2}\.\s*)?(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;

  for (const t of timeline) {
    if (!dateLike.test(t.dateLabel) && !dateLike.test(t.event)) continue;
    const id = `ch${t.chapter}`;
    if (byId.has(id)) continue;
    // Prefer explicit calendar mentions in dateLabel.
    if (!dateLike.test(t.dateLabel) && !/\b\d{1,2}\.\s*\w+/i.test(t.dateLabel)) {
      continue;
    }
    byId.set(id, {
      id,
      dateLabel: t.dateLabel,
      event: t.event.slice(0, 240),
      chapterHint: t.chapter,
    });
  }
  return [...byId.values()];
}

/**
 * Merge state_sync ledger patch without letting chapter rows rewrite anchors.
 */
export function mergeLogicLedgerPatch(
  base: NovelLogicLedger,
  patch: {
    timeline?: NovelLogicLedger["timeline"];
    money?: NovelLogicLedger["money"];
    openQuestions?: string[];
    anchors?: LedgerAnchor[];
  },
  chapterNumber: number,
): NovelLogicLedger {
  const anchors =
    patch.anchors?.length
      ? patch.anchors
      : base.anchors?.length
        ? base.anchors
        : deriveAnchorsFromTimeline(base.timeline);

  const timeline = [
    ...base.timeline.filter((t) => t.chapter !== chapterNumber),
    ...(patch.timeline ?? [])
      .filter((t) => t.chapter === chapterNumber)
      .map((t) => ({
        ...t,
        dateLabel: clip(t.dateLabel, 120),
        event: clip(t.event, 400),
      })),
  ].sort((a, b) => a.chapter - b.chapter);

  const moneyById = new Map(base.money.map((m) => [m.id, m] as const));
  for (const m of patch.money ?? []) {
    moneyById.set(m.id, {
      ...m,
      amount: clip(m.amount, 80),
      status: clip(m.status, 200),
    });
  }

  return {
    timeline,
    money: [...moneyById.values()],
    openQuestions: (patch.openQuestions ?? base.openQuestions)
      .map((q) => clip(q, 200, ""))
      .filter(Boolean)
      .slice(0, 12),
    anchors,
    updatedAt: new Date().toISOString(),
  };
}

/** Hard constraint block for author / editor / abnahme. */
export function formatCanonicalTimelineMandate(
  ledger: NovelLogicLedger | null | undefined,
): string {
  if (!ledger) return "";
  const anchors =
    ledger.anchors?.length > 0
      ? ledger.anchors
      : deriveAnchorsFromTimeline(ledger.timeline);
  if (!anchors.length && !ledger.timeline.length) return "";

  const anchorLines = (anchors.length
    ? anchors
    : ledger.timeline.filter((t) =>
        /\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d{1,2}\.\d{1,2})/i.test(
          t.dateLabel,
        ),
      )
  )
    .slice(0, 14)
    .map(
      (a) =>
        `- ${"id" in a && a.id ? `[${a.id}] ` : ""}${a.dateLabel}: ${"event" in a ? a.event : ""}`.trim(),
    )
    .join("\n");

  return `# Kanonische Zeitachse (HARD — keine abweichenden Daten)
Diese Daten/Fristen sind verbindlich. Kein Kapitel darf andere Stichtage erfinden.
${anchorLines || "- (noch dünn — aus Outline/Ledger konsistent halten)"}

Bei Referenzlauf, Börsentermin, Fristen und Stellungnahmen: dieselben Labels verwenden.`;
}

export function formatLogicLedgerForAuthor(
  ledger: NovelLogicLedger | null | undefined,
): string {
  if (!ledger || (!ledger.timeline.length && !ledger.money.length)) {
    const mandate = formatCanonicalTimelineMandate(ledger);
    return mandate;
  }
  const tl = ledger.timeline
    .slice(-14)
    .map((t) => `- Kap.${t.chapter} · ${t.dateLabel}: ${t.event}`)
    .join("\n");
  const money = ledger.money
    .slice(-12)
    .map(
      (m) =>
        `- ${m.id}: ${m.amount} (${m.status}) · Kap.${m.chapterRef}`,
    )
    .join("\n");
  const open = ledger.openQuestions.length
    ? ledger.openQuestions.map((q) => `- ${q}`).join("\n")
    : "- —";
  const mandate = formatCanonicalTimelineMandate(ledger);
  return `${mandate ? `${mandate}\n\n` : ""}# Logic-Ledger (verbindlich — keine Widersprüche)
## Zeitachse
${tl || "- —"}
## Geld / Forderungen
${money || "- —"}
## Offene Fragen
${open}
Neue Daten/Beträge müssen hier konsistent bleiben.`;
}

export function formatLogicLedgerForEditor(
  ledger: NovelLogicLedger | null | undefined,
): string {
  if (!ledger) return "";
  return `Logic-Ledger prüfen (Widerspruch → approved=false):
${formatLogicLedgerForAuthor(ledger)}
Fristen vor Ereignissen, Summen ohne Beleg, doppelte Beträge ohne Status, abweichende Stichtage vs. kanonische Zeitachse → Issue.`;
}

/** Compact slice for Abnahme prompt. */
export function formatLogicLedgerForAbnahme(
  ledger: NovelLogicLedger | null | undefined,
): string {
  if (!ledger) return "";
  return formatLogicLedgerForAuthor(ledger).slice(0, 3_500);
}

export function formatLedgerDebtForAuthor(
  debt: LedgerDebtState | null | undefined,
): string {
  if (!debt?.chapters.length) return "";
  const lines = debt.chapters.map((n) => {
    const issues = debt.issuesByChapter[String(n)] ?? [];
    return `- Kap. ${n}: ${issues[0] ?? "offene Soft-Freigabe-Schuld"}`;
  });
  return `# Offene Ledger-Schuld (Soft-Freigaben)
Diese Kapitel wurden mit Warnung durchgelassen und MÜSSEN in Timeline-/Struktur-Passes nachgezogen werden:
${lines.join("\n")}`;
}
