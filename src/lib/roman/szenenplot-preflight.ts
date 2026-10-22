/**
 * Deterministic audits: Feingerüst (arcs/lifecycle) vs Feinplot
 * (scene chain, schreibPrompt, arc→scene coverage) before Manuskript.
 * Soft warnings vs hard errors; override via explicit stageGateOverrides
 * (not pipelineFertig — Fertig is soft chrome only).
 * (or legacy szenenplot / outline).
 */

import {
  hasStageGateOverride,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import { auditGeruestPlotClaims } from "@/lib/roman/geruest-plot-claims";
import { listThinConcreteNodes } from "@/lib/roman/wissens-graph";
import {
  structuredKapitelGeruestToMarkdown,
  type RomanKapitelGeruestChapter,
  type RomanKapitelGeruestStructured,
  type RomanSzenenplotArcBeat,
  type RomanSzenenplotCentralArc,
  type RomanSzenenplotChapterNode,
  type RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

/** Min Logik / Dramaturgie % on Szenenplot before Manuskript. */
export const GERUEST_MANUSKRIPT_AXIS_MIN_PCT = 75;

/** Soft: logistics mustShow focus in more than this many chapters → warning. */
export const LOGISTICS_FOCUS_MAX_CHAPTERS = 3;

const LOGISTICS_RE =
  /\b(auto|wagen|pkw|stellplatz|parkplatz|kennzeichen|nummernschild|ice|bahn|zug|bahnhof|hotel|mietwagen|fahrerlaubnis|führerschein)\b/i;

export type SzenenplotPreflightIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type SzenenplotPreflightResult = {
  ok: boolean;
  errors: SzenenplotPreflightIssue[];
  warnings: SzenenplotPreflightIssue[];
};

/** Normalize prop/event labels for lifecycle identity (double-introduce audit). */
export function normalizeGeruestLifecycleLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function normLabel(s: string): string {
  return normalizeGeruestLifecycleLabel(s);
}

type LifecycleChapter = {
  number: number;
  introduces: string[];
  mustNotRepeat: string[];
};

/**
 * Labels already in `introduces` of chapters before `chapterNumber`
 * (sorted by chapter). Used as ledger for per-chapter detail prompts.
 */
export function introducedLabelsBeforeChapter(
  chapters: ReadonlyArray<Pick<LifecycleChapter, "number" | "introduces">>,
  chapterNumber: number,
): string[] {
  const seen = new Map<string, string>();
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    if (ch.number >= chapterNumber) continue;
    for (const label of ch.introduces ?? []) {
      const key = normLabel(label);
      if (!key || seen.has(key)) continue;
      seen.set(key, label.trim());
    }
  }
  return Array.from(seen.values());
}

/**
 * Keep each introduce label only on the first chapter that lists it.
 * Later duplicates are dropped and appended to that chapter's mustNotRepeat
 * so Manuskript / Szenen do not re-open the prop as new.
 */
export function dedupeGeruestChapterIntroduces<T extends LifecycleChapter>(
  chapters: T[],
): T[] {
  const introducedAt = new Map<string, number>();
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const byNum = new Map<number, T>();

  for (const ch of sorted) {
    const keptIntroduces: string[] = [];
    const mustNot = [...(ch.mustNotRepeat ?? [])];
    const mustNotKeys = new Set(mustNot.map(normLabel).filter(Boolean));

    for (const label of ch.introduces ?? []) {
      const key = normLabel(label);
      if (!key) continue;
      const first = introducedAt.get(key);
      if (first == null) {
        introducedAt.set(key, ch.number);
        keptIntroduces.push(label.trim());
        continue;
      }
      // Duplicate introduce → ban re-opening on this chapter.
      if (!mustNotKeys.has(key)) {
        mustNot.push(label.trim());
        mustNotKeys.add(key);
      }
    }

    byNum.set(ch.number, {
      ...ch,
      introduces: keptIntroduces,
      mustNotRepeat: mustNot,
    });
  }

  return chapters.map((ch) => byNum.get(ch.number) ?? ch);
}

type HygieneChapter = LifecycleChapter & {
  props?: string[];
  events?: string[];
  openThreads?: string[];
  resolves?: string[];
  kernsatz?: string;
  inhaltKurz?: string;
  arcBeats?: RomanSzenenplotArcBeat[];
};

function chapterHaystackNormalized(ch: HygieneChapter): string {
  return [
    ch.kernsatz ?? "",
    ch.inhaltKurz ?? "",
    ...(ch.props ?? []),
    ...(ch.events ?? []),
    ...(ch.openThreads ?? []),
  ]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Fix `resolves` entries that lack a prior `introduces`:
 * - If an earlier chapter (< ch.number) mentions the label in openThreads/props/events/kernsatz/inhaltKurz,
 *   seed the label into that earlier chapter's `introduces`.
 * - Otherwise drop the unanchored resolve entry so `resolve_without_intro` cannot fire.
 */
export function sanitizeResolvesWithoutIntro<
  T extends HygieneChapter & { resolves: string[] },
>(chapters: T[]): T[] {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const working = sorted.map((ch) => ({
    ...ch,
    introduces: [...(ch.introduces ?? [])],
    resolves: [...(ch.resolves ?? [])],
  }));

  const introducedAt = new Set<string>();
  for (let i = 0; i < working.length; i++) {
    const ch = working[i]!;
    for (const intro of ch.introduces) {
      const k = normLabel(intro);
      if (k) introducedAt.add(k);
    }

    const keptResolves: string[] = [];
    for (const res of ch.resolves) {
      const key = normLabel(res);
      if (!key) continue;
      if (introducedAt.has(key)) {
        keptResolves.push(res.trim());
        continue;
      }
      // Look for the earliest prior chapter that mentions this thread/prop/event.
      let seededEarlier = false;
      for (let j = 0; j < i; j++) {
        const earlier = working[j]!;
        if (chapterHaystackNormalized(earlier).includes(key)) {
          earlier.introduces.push(res.trim());
          introducedAt.add(key);
          seededEarlier = true;
          break;
        }
      }
      if (seededEarlier) {
        keptResolves.push(res.trim());
      }
    }
    ch.resolves = keptResolves;
  }

  const byNum = new Map(working.map((c) => [c.number, c]));
  return chapters.map((ch) => byNum.get(ch.number) ?? ch);
}

function snapToExistingChapter(target: number, sortedNums: number[]): number {
  if (!sortedNums.length) return target;
  if (sortedNums.includes(target)) return target;
  let best = sortedNums[0]!;
  let bestDist = Math.abs(target - best);
  for (const n of sortedNums) {
    const d = Math.abs(target - n);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Deterministic sanitizer for centralArcs and chapter arcBeats:
 * - Synthesizes a main arc when >=4 chapters have 0 centralArcs.
 * - Snaps setup/peak/payoff to existing chapters and enforces setup <= peak <= payoff.
 * - Remaps or drops unknown arcBeat.arcId references (`arc_beat_unknown`).
 * - Ensures setup/peak/payoff chapters carry an arcBeat and peak tension >= max tension.
 */
export function sanitizeCentralArcsAndBeats<
  T extends HygieneChapter & { arcBeats: RomanSzenenplotArcBeat[] },
>(input: {
  chapters: T[];
  centralArcs: RomanSzenenplotCentralArc[];
}): { chapters: T[]; centralArcs: RomanSzenenplotCentralArc[] } {
  const sortedNums = [...input.chapters]
    .map((c) => c.number)
    .sort((a, b) => a - b);
  if (!sortedNums.length) {
    return { chapters: input.chapters, centralArcs: input.centralArcs };
  }

  const firstNum = sortedNums[0]!;
  const lastNum = sortedNums[sortedNums.length - 1]!;
  const midNum =
    sortedNums[Math.min(sortedNums.length - 1, Math.floor(sortedNums.length * 0.6))] ??
    firstNum;

  let arcs = [...(input.centralArcs ?? [])].map((a) => ({ ...a }));
  if (arcs.length === 0 && sortedNums.length >= 4) {
    const firstCh = input.chapters.find((c) => c.number === firstNum);
    arcs = [
      {
        id: "arc_hauptbogen",
        label: "Hauptbogen",
        parties: [],
        setupChapter: firstNum,
        peakChapter: midNum,
        payoffChapter: lastNum,
        notes: (firstCh?.kernsatz ?? "Spannungsbogen über den Band").slice(
          0,
          160,
        ),
      },
    ];
  }

  arcs = arcs.map((arc) => {
    const s0 = snapToExistingChapter(arc.setupChapter, sortedNums);
    const p0 = snapToExistingChapter(arc.peakChapter, sortedNums);
    const o0 = snapToExistingChapter(arc.payoffChapter, sortedNums);
    const ordered = [s0, p0, o0].sort((a, b) => a - b);
    let setupChapter = ordered[0]!;
    let peakChapter = ordered[1]!;
    let payoffChapter = ordered[2]!;
    if (
      sortedNums.length >= 3 &&
      setupChapter === peakChapter &&
      peakChapter === payoffChapter
    ) {
      setupChapter = firstNum;
      peakChapter = midNum;
      payoffChapter = lastNum;
    }
    return {
      ...arc,
      setupChapter,
      peakChapter,
      payoffChapter,
    };
  });

  const arcIds = new Set(arcs.map((a) => a.id));
  const resolveValidArcId = (rawId: string): string | null => {
    if (arcIds.has(rawId)) return rawId;
    const norm = rawId.trim().toLowerCase();
    for (const a of arcs) {
      if (
        a.id.toLowerCase() === norm ||
        a.id.toLowerCase().includes(norm) ||
        norm.includes(a.id.toLowerCase()) ||
        a.label.toLowerCase().includes(norm)
      ) {
        return a.id;
      }
    }
    return arcs.length === 1 ? arcs[0]!.id : null;
  };

  // Remap/filter arcBeats on each chapter and dedupe by arcId per chapter.
  const chaptersByNum = new Map<number, T>();
  for (const ch of input.chapters) {
    const byArc = new Map<string, RomanSzenenplotArcBeat>();
    for (const beat of ch.arcBeats ?? []) {
      const validId = arcs.length > 0 ? resolveValidArcId(beat.arcId) : beat.arcId;
      if (!validId) continue;
      if (!byArc.has(validId)) {
        byArc.set(validId, { ...beat, arcId: validId });
      }
    }
    chaptersByNum.set(ch.number, {
      ...ch,
      arcBeats: Array.from(byArc.values()),
    });
  }

  // Ensure each arc has setup/peak/payoff beats and peak tension >= maxTension.
  for (const arc of arcs) {
    let maxTension = 0;
    for (const ch of chaptersByNum.values()) {
      for (const b of ch.arcBeats) {
        if (b.arcId === arc.id && b.tension > maxTension) {
          maxTension = b.tension;
        }
      }
    }
    const targetPeakTension = Math.max(4, maxTension || 5);

    const ensureBeat = (
      chNum: number,
      minTension: number,
      defaultDelta: string,
    ) => {
      const ch = chaptersByNum.get(chNum);
      if (!ch) return;
      const idx = ch.arcBeats.findIndex((b) => b.arcId === arc.id);
      if (idx === -1) {
        const mustShow =
          (ch.kernsatz ?? "").trim().slice(0, 200) || arc.label;
        chaptersByNum.set(chNum, {
          ...ch,
          arcBeats: [
            ...ch.arcBeats,
            {
              arcId: arc.id,
              tension: minTension,
              mustShow,
              delta: defaultDelta,
            },
          ],
        });
      } else {
        const existing = ch.arcBeats[idx]!;
        if (existing.tension < minTension) {
          const nextBeats = [...ch.arcBeats];
          nextBeats[idx] = { ...existing, tension: minTension };
          chaptersByNum.set(chNum, { ...ch, arcBeats: nextBeats });
        }
      }
    };

    ensureBeat(arc.setupChapter, 2, `Setup: ${arc.label}`.slice(0, 160));
    ensureBeat(
      arc.peakChapter,
      targetPeakTension,
      `Höhepunkt / Wende: ${arc.label}`.slice(0, 160),
    );
    ensureBeat(arc.payoffChapter, 3, `Einlösung: ${arc.label}`.slice(0, 160));
  }

  return {
    chapters: input.chapters.map((c) => chaptersByNum.get(c.number) ?? c),
    centralArcs: arcs,
  };
}

/**
 * Seed `mustNotRepeat` on later chapters when a prior introduce label
 * still appears in props/events/kernsatz/inhaltKurz (exact normalized
 * substring). Complements introduce-dedupe for Logik continuum.
 */
export function seedMustNotRepeatFromPriorIntroduces<T extends HygieneChapter>(
  chapters: T[],
): T[] {
  const introducedAt = new Map<string, string>();
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const byNum = new Map<number, T>();

  for (const ch of sorted) {
    const haystack = [
      ch.kernsatz ?? "",
      ch.inhaltKurz ?? "",
      ...(ch.props ?? []),
      ...(ch.events ?? []),
    ]
      .join("\n")
      .toLowerCase()
      .replace(/\s+/g, " ");

    const mustNot = (ch.mustNotRepeat ?? []).map((item) => {
      const k = normLabel(item);
      if (
        k &&
        haystack.includes(k) &&
        !/^(?:erst-einführung|erneute einführung|bereits|kein|nicht)/i.test(
          item.trim(),
        )
      ) {
        return `Erst-Einführung von ${item.trim()} nicht wiederholen (bereits etabliert)`;
      }
      return item;
    });
    const mustNotKeys = new Set(mustNot.map(normLabel).filter(Boolean));
    const introKeys = new Set(
      (ch.introduces ?? []).map(normLabel).filter(Boolean),
    );

    for (const [key, label] of introducedAt) {
      const qualified = `Erst-Einführung von ${label} nicht wiederholen (bereits etabliert)`;
      const qualifiedKey = normLabel(qualified);
      if (
        !key ||
        introKeys.has(key) ||
        mustNotKeys.has(key) ||
        mustNotKeys.has(qualifiedKey)
      ) {
        continue;
      }
      if (haystack.includes(key)) {
        mustNot.push(qualified);
        mustNotKeys.add(key);
        mustNotKeys.add(qualifiedKey);
      }
    }

    byNum.set(ch.number, {
      ...ch,
      mustNotRepeat: mustNot,
    });

    for (const label of ch.introduces ?? []) {
      const key = normLabel(label);
      if (key && !introducedAt.has(key)) {
        introducedAt.set(key, label.trim());
      }
    }
  }

  return chapters.map((ch) => byNum.get(ch.number) ?? ch);
}

function lifecycleListsEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every((x, i) => x === bb[i]);
}

function arcBeatsEqual(
  a: RomanSzenenplotArcBeat[] | undefined,
  b: RomanSzenenplotArcBeat[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every(
    (x, i) =>
      x.arcId === bb[i]!.arcId &&
      x.tension === bb[i]!.tension &&
      x.mustShow === bb[i]!.mustShow &&
      x.delta === bb[i]!.delta,
  );
}

function centralArcsEqual(
  a: RomanSzenenplotCentralArc[] | undefined,
  b: RomanSzenenplotCentralArc[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every(
    (x, i) =>
      x.id === bb[i]!.id &&
      x.setupChapter === bb[i]!.setupChapter &&
      x.peakChapter === bb[i]!.peakChapter &&
      x.payoffChapter === bb[i]!.payoffChapter,
  );
}

/**
 * Deterministic Logik hygiene before Reifegrad / hard-gates:
 * 1) resolve-without-intro repair (seed into earlier mentioning chapter or drop)
 * 2) introduce-dedupe
 * 3) mustNotRepeat seeding from prior introduces
 * 4) centralArcs bounds/order + arcBeat unknown/peak-tension repair
 * Returns the same object reference when nothing changed.
 */
export function hygieneKapitelGeruestLogik(
  structured: RomanKapitelGeruestStructured,
): { structured: RomanKapitelGeruestStructured; changed: boolean } {
  const step1 = sanitizeResolvesWithoutIntro(structured.chapters);
  const step2 = dedupeGeruestChapterIntroduces(step1);
  const step3 = seedMustNotRepeatFromPriorIntroduces(step2);
  const { chapters: afterChapters, centralArcs: afterArcs } =
    sanitizeCentralArcsAndBeats({
      chapters: step3,
      centralArcs: structured.centralArcs ?? [],
    });

  let changed = !centralArcsEqual(structured.centralArcs, afterArcs);
  if (!changed) {
    for (let i = 0; i < structured.chapters.length; i++) {
      const before = structured.chapters[i]!;
      const after = afterChapters[i]!;
      if (
        !lifecycleListsEqual(before.introduces, after.introduces) ||
        !lifecycleListsEqual(before.mustNotRepeat, after.mustNotRepeat) ||
        !lifecycleListsEqual(before.resolves, after.resolves) ||
        !arcBeatsEqual(before.arcBeats, after.arcBeats)
      ) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return { structured, changed: false };
  return {
    structured: {
      ...structured,
      centralArcs: afterArcs,
      chapters: afterChapters,
      updatedAt: new Date().toISOString(),
    },
    changed: true,
  };
}

/**
 * Same lifecycle + arc hygiene for Szenenplot chapter nodes.
 */
export function hygieneSzenenplotLogik(
  structured: RomanSzenenplotStructured,
): { structured: RomanSzenenplotStructured; changed: boolean } {
  const step1 = sanitizeResolvesWithoutIntro(structured.chapters);
  const step2 = dedupeGeruestChapterIntroduces(step1);
  const step3 = seedMustNotRepeatFromPriorIntroduces(step2);
  const { chapters: afterChapters, centralArcs: afterArcs } =
    sanitizeCentralArcsAndBeats({
      chapters: step3,
      centralArcs: structured.centralArcs ?? [],
    });

  let changed = !centralArcsEqual(structured.centralArcs, afterArcs);
  if (!changed) {
    for (let i = 0; i < structured.chapters.length; i++) {
      const before = structured.chapters[i]!;
      const after = afterChapters[i]!;
      if (
        !lifecycleListsEqual(before.introduces, after.introduces) ||
        !lifecycleListsEqual(before.mustNotRepeat, after.mustNotRepeat) ||
        !lifecycleListsEqual(before.resolves, after.resolves) ||
        !arcBeatsEqual(before.arcBeats, after.arcBeats)
      ) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return { structured, changed: false };
  return {
    structured: {
      ...structured,
      centralArcs: afterArcs,
      chapters: afterChapters,
      updatedAt: new Date().toISOString(),
    },
    changed: true,
  };
}

/**
 * Apply Logik hygiene to editorial plot/szenen artifacts.
 * Syncs Plot markdown mirror when Kapitelgerüst changes.
 */
export function applyEditorialLogikHygiene(editorial: RomanEditorial): {
  editorial: RomanEditorial;
  changed: boolean;
  notes: string[];
} {
  let next = editorial;
  let changed = false;
  const notes: string[] = [];

  if (next.kapitelGeruestStructured?.chapters.length) {
    const { structured, changed: ch } = hygieneKapitelGeruestLogik(
      next.kapitelGeruestStructured,
    );
    if (ch) {
      changed = true;
      notes.push("Plot-Lifecycle bereinigt (introduces / mustNotRepeat)");
      next = {
        ...next,
        kapitelGeruestStructured: structured,
        kapitelGeruestRaw: structuredKapitelGeruestToMarkdown(structured),
      };
    }
  }

  if (next.szenenplotStructured?.chapters.length) {
    const { structured, changed: ch } = hygieneSzenenplotLogik(
      next.szenenplotStructured,
    );
    if (ch) {
      changed = true;
      notes.push("Szenen-Lifecycle bereinigt (introduces / mustNotRepeat)");
      next = {
        ...next,
        szenenplotStructured: structured,
      };
    }
  }

  return { editorial: next, changed, notes };
}

type ChapterLike = {
  number: number;
  kernsatz: string;
  props: string[];
  events: string[];
  openThreads: string[];
  introduces: string[];
  resolves: string[];
  arcBeats: RomanSzenenplotChapterNode["arcBeats"];
};

function chapterFocusText(ch: ChapterLike): string {
  return [
    ch.kernsatz,
    ...ch.props,
    ...ch.events,
    ...ch.arcBeats.map((b) => `${b.mustShow} ${b.delta}`),
    ...ch.openThreads,
  ].join("\n");
}

function auditArcsAndLifecycle(
  chapters: ChapterLike[],
  arcs: RomanKapitelGeruestStructured["centralArcs"],
  label: string,
): SzenenplotPreflightResult {
  const errors: SzenenplotPreflightIssue[] = [];
  const warnings: SzenenplotPreflightIssue[] = [];

  if (!chapters.length) {
    warnings.push({
      severity: "warning",
      code: "no_structured",
      message: `Kein strukturiertes ${label} — empfehlen: neu erzeugen.`,
    });
    return { ok: true, errors, warnings };
  }

  const chapterNums = new Set(chapters.map((c) => c.number));

  if (chapters.length >= 4 && arcs.length === 0) {
    warnings.push({
      severity: "warning",
      code: "no_central_arcs",
      message:
        "Keine centralArcs — Spannungsbögen fehlen. Dramaturgie wird schwächer.",
    });
  }

  for (const arc of arcs) {
    if (!chapterNums.has(arc.setupChapter)) {
      errors.push({
        severity: "error",
        code: "arc_setup_missing",
        message: `Arc „${arc.label}“ (${arc.id}): setupChapter ${arc.setupChapter} existiert nicht.`,
      });
    }
    if (!chapterNums.has(arc.peakChapter)) {
      errors.push({
        severity: "error",
        code: "arc_peak_missing",
        message: `Arc „${arc.label}“ (${arc.id}): peakChapter ${arc.peakChapter} existiert nicht.`,
      });
    }
    if (!chapterNums.has(arc.payoffChapter)) {
      errors.push({
        severity: "error",
        code: "arc_payoff_missing",
        message: `Arc „${arc.label}“ (${arc.id}): payoffChapter ${arc.payoffChapter} existiert nicht.`,
      });
    }
    if (
      arc.setupChapter > arc.peakChapter ||
      arc.peakChapter > arc.payoffChapter
    ) {
      errors.push({
        severity: "error",
        code: "arc_order",
        message: `Arc „${arc.label}“ (${arc.id}): Setup/Peak/Payoff-Reihenfolge ungültig (${arc.setupChapter}→${arc.peakChapter}→${arc.payoffChapter}).`,
      });
    }

    const peakCh = chapters.find((c) => c.number === arc.peakChapter);
    const peakBeat = peakCh?.arcBeats.find((b) => b.arcId === arc.id);
    if (peakCh && peakBeat) {
      const maxTension = Math.max(
        0,
        ...chapters.flatMap((c) =>
          c.arcBeats.filter((b) => b.arcId === arc.id).map((b) => b.tension),
        ),
      );
      if (peakBeat.tension < maxTension) {
        warnings.push({
          severity: "warning",
          code: "arc_peak_tension",
          message: `Arc „${arc.label}“: Peak-Kap. ${arc.peakChapter} hat Tension ${peakBeat.tension}, max im Buch ist ${maxTension}.`,
        });
      }
    } else if (peakCh && !peakBeat) {
      warnings.push({
        severity: "warning",
        code: "arc_peak_no_beat",
        message: `Arc „${arc.label}“: Peak-Kap. ${arc.peakChapter} hat keinen arcBeat.`,
      });
    }
  }

  const arcIds = new Set(arcs.map((a) => a.id));
  for (const ch of chapters) {
    for (const beat of ch.arcBeats) {
      if (arcIds.size > 0 && !arcIds.has(beat.arcId)) {
        errors.push({
          severity: "error",
          code: "arc_beat_unknown",
          message: `Kap. ${ch.number}: arcBeat referenziert unbekanntes arcId „${beat.arcId}“.`,
        });
      }
    }
  }

  const introducedAt = new Map<string, number>();
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    for (const labelIntro of ch.introduces) {
      const key = normLabel(labelIntro);
      if (!key) continue;
      if (introducedAt.has(key)) {
        errors.push({
          severity: "error",
          code: "double_introduce",
          message: `„${labelIntro}“ wird in Kap. ${introducedAt.get(key)} und erneut in Kap. ${ch.number} eingeführt.`,
        });
      } else {
        introducedAt.set(key, ch.number);
      }
    }
    for (const labelRes of ch.resolves) {
      const key = normLabel(labelRes);
      if (!key) continue;
      if (introducedAt.get(key) == null) {
        warnings.push({
          severity: "warning",
          code: "resolve_without_intro",
          message: `Kap. ${ch.number}: „${labelRes}“ wird geschlossen, ohne vorheriges introduces.`,
        });
      }
    }
  }

  const logisticsChapters: number[] = [];
  for (const ch of chapters) {
    if (LOGISTICS_RE.test(chapterFocusText(ch))) {
      logisticsChapters.push(ch.number);
    }
  }
  if (logisticsChapters.length > LOGISTICS_FOCUS_MAX_CHAPTERS) {
    warnings.push({
      severity: "warning",
      code: "logistics_overfocus",
      message: `Logistik-Motive in ${logisticsChapters.length} Kapiteln als Fokus (Kap. ${logisticsChapters.join(", ")}). Max. empfohlen: ${LOGISTICS_FOCUS_MAX_CHAPTERS}.`,
    });
  }

  // Who-did-X already in Grob-/Feinplot (Absicherung class) — hard before Manuskript.
  for (const issue of auditGeruestPlotClaims(chapters)) {
    if (issue.severity === "error") errors.push(issue);
    else warnings.push(issue);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Audit Pass-1 Kapitelgerüst (arcs / lifecycle / logistics). */
export function auditKapitelGeruestStructured(
  structured: RomanKapitelGeruestStructured | null | undefined,
): SzenenplotPreflightResult {
  if (!structured?.chapters.length) {
    return {
      ok: true,
      errors: [],
      warnings: [
        {
          severity: "warning",
          code: "no_structured",
          message:
            "Kein strukturiertes Kapitelgerüst — bitte Gerüst erzeugen.",
        },
      ],
    };
  }
  return auditArcsAndLifecycle(
    structured.chapters as RomanKapitelGeruestChapter[],
    structured.centralArcs ?? [],
    "Kapitelgerüst",
  );
}

/**
 * Audit structured Szenenplot (arcs + lifecycle + scene chain + schreibPrompt).
 * Kept name for callers; also used as Manuskript gate.
 */
export function auditSzenenplotStructured(
  structured: RomanSzenenplotStructured | null | undefined,
): SzenenplotPreflightResult {
  if (!structured?.chapters.length) {
    return {
      ok: true,
      errors: [],
      warnings: [
        {
          severity: "warning",
          code: "no_structured",
          message:
            "Kein strukturierter Szenenplot — Manuskript stützt sich nur auf Markdown. Empfohlen: Szenenplot neu erzeugen.",
        },
      ],
    };
  }

  const base = auditArcsAndLifecycle(
    structured.chapters,
    structured.centralArcs ?? [],
    "Szenenplot",
  );
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  let emptyScenes = 0;
  let missingPrompt = 0;
  let weakContract = 0;
  let missingSecret = 0;
  const sorted = [...structured.chapters].sort((a, b) => a.number - b.number);
  for (const ch of sorted) {
    if (ch.scenes.length < 1) {
      emptyScenes += 1;
      errors.push({
        severity: "error",
        code: "chapter_no_scenes",
        message: `Kap. ${ch.number} („${ch.title}“) hat keine Szenen.`,
      });
    }
    for (const scene of ch.scenes) {
      const prompt = scene.schreibPrompt?.trim() ?? "";
      if (prompt.length < 40) {
        missingPrompt += 1;
      }
      // Hard contract shape: dramaturgy must be concrete; secrets explicit.
      const goal = scene.dramaturgy.scene_goal?.trim() ?? "";
      const obstacle = scene.dramaturgy.obstacle_conflict?.trim() ?? "";
      if (goal.length < 12 || obstacle.length < 12) {
        weakContract += 1;
        errors.push({
          severity: "error",
          code: "scene_contract_thin",
          message: `Kap. ${ch.number} / ${scene.scene_id}: Dramaturgie zu dünn (Ziel/Hindernis) — vor Manuskript schärfen.`,
        });
      }
      const secret = scene.information_flow.kept_secret?.trim() ?? "";
      if (!secret) {
        missingSecret += 1;
      }
    }
    // After Kap. 1: if earlier chapters introduced motifs, later ones need bans.
    if (ch.number > 1 && (ch.mustNotRepeat?.length ?? 0) === 0) {
      const priorIntroduces = sorted
        .filter((c) => c.number < ch.number)
        .flatMap((c) => c.introduces ?? []);
      if (priorIntroduces.length >= 2) {
        warnings.push({
          severity: "warning",
          code: "must_not_repeat_empty",
          message: `Kap. ${ch.number}: mustNotRepeat leer, obwohl früher Motiv(e) eingeführt wurden — Doppelungsrisiko im Manuskript.`,
        });
      }
    }
  }
  if (missingPrompt > 0) {
    errors.push({
      severity: "error",
      code: "schreib_prompt_thin",
      message: `${missingPrompt} Szene(n) ohne ausreichenden schreibPrompt (<40 Zeichen) — vor Manuskript Verbessern/Freeze.`,
    });
  }
  if (missingSecret > 0) {
    warnings.push({
      severity: "warning",
      code: "kept_secret_unset",
      message: `${missingSecret} Szene(n) ohne kept_secret — setze Geheimnis oder explizit „keins“, sonst riskiert der Co-Autor Spoiler.`,
    });
  }
  void weakContract;

  // Arc beat → at least one scene in that chapter (soft via mustShow presence).
  for (const ch of structured.chapters) {
    for (const beat of ch.arcBeats) {
      if (ch.scenes.length === 0) continue;
      const hay = ch.scenes
        .map(
          (s) =>
            `${s.summary} ${s.dramaturgy.scene_goal} ${s.dramaturgy.outcome_value_change} ${s.schreibPrompt}`,
        )
        .join("\n")
        .toLowerCase();
      const needle = beat.mustShow.trim().toLowerCase().slice(0, 24);
      if (needle.length >= 8 && !hay.includes(needle.slice(0, 12))) {
        warnings.push({
          severity: "warning",
          code: "arc_beat_scene_gap",
          message: `Kap. ${ch.number}: Arc-Beat „${beat.arcId}“ (mustShow) scheint in keiner Szene gespiegelt.`,
        });
      }
    }
  }

  void emptyScenes;
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Block Manuskript Erzeugen unless Feinplot hard-gate is green
 * (audit + Reifegrad floors), or explicit stageGateOverrides.feinplot.
 * Scores live under `feinplot` (legacy key `szenenplot` still accepted).
 */
export function assertGeruestReadyForManuskript(input: {
  editorial: RomanEditorial;
}): void {
  const editorial = input.editorial;
  const override = hasStageGateOverride(editorial, "feinplot");
  const structured = editorial.szenenplotStructured;
  const audit = auditSzenenplotStructured(structured);

  if (!structured?.chapters.length && !override) {
    throw new Error(
      "Kein Feinplot — bitte Tab „Feinplot“ erzeugen (Hard-Gate), bevor das Manuskript startet.",
    );
  }

  if (!audit.ok && !override) {
    const detail = audit.errors
      .slice(0, 6)
      .map((e) => `• ${e.message}`)
      .join("\n");
    throw new Error(
      `Feinplot-Hard-Gate rot — Auto-Repair bei Erzeugen oder „Trotzdem weiter“:\n${detail}`,
    );
  }

  if (!override) {
    const score =
      editorial.reifegrade?.szenen ??
      editorial.reifegrade?.feinplot ??
      editorial.reifegrade?.szenenplot ??
      null;
    if (!score) {
      throw new Error(
        `Feinplot-Reifegrad fehlt — bitte zuerst Feinplot messen (Logik, Übergänge, Abdeckung je ≥${GERUEST_MANUSKRIPT_AXIS_MIN_PCT}%), bevor das Manuskript startet.`,
      );
    }
    const logik = score.regelnPct;
    /** Feinplot craft B = Übergänge (Drama/Ursache→Wirkung). */
    const uebergaenge = score.dramaturgiePct;
    /** Feinplot craft C = Abdeckung (Arc-/Versprechen-Anker). */
    const abdeckung = score.leseflussPct;
    if (
      logik < GERUEST_MANUSKRIPT_AXIS_MIN_PCT ||
      uebergaenge < GERUEST_MANUSKRIPT_AXIS_MIN_PCT ||
      abdeckung < GERUEST_MANUSKRIPT_AXIS_MIN_PCT
    ) {
      throw new Error(
        `Feinplot-Hard-Gate rot (Logik ${logik}%, Übergänge ${uebergaenge}%, Abdeckung ${abdeckung}% — Ziel je ≥${GERUEST_MANUSKRIPT_AXIS_MIN_PCT}%). Erneut Erzeugen (Auto-Repair) oder Override „Trotzdem weiter“.`,
      );
    }
  }

  // Wissensgraph: concrete canon (plates, colors, addresses, times) should exist by Plot.
  const graph = editorial.wissensGraph;
  if (graph?.nodes.length && !override) {
    const thin = listThinConcreteNodes(graph);
    const critical = thin.filter(
      (t) => t.kind === "prop" || t.kind === "place" || t.kind === "event",
    );
    if (critical.length >= 4) {
      throw new Error(
        `Wissensgraph noch zu unkonkret für Manuskript (${critical.length} Props/Orte/Events ohne Farbe/Kennzeichen/Adresse/Uhrzeit/Name). Bitte Feinplot neu erzeugen (Auto-Repair) — Details müssen spätestens im Plot kanonisch sein.`,
      );
    }
  }

  void audit.warnings;
}

/**
 * Gate Grob-/Feinplot Erzeugen: Feingerüst must pass hard audit.
 * Override: explicit stageGateOverrides.feingeruest only.
 */
export function assertGeruestReadyForSzenenplot(input: {
  editorial: RomanEditorial;
}): void {
  const editorial = input.editorial;
  const override = hasStageGateOverride(editorial, "feingeruest");
  const geruest = editorial.kapitelGeruestStructured;
  if ((!geruest?.chapters.length || geruest.chapters.length < 2) && !override) {
    throw new Error(
      "Zuerst Feingerüst erzeugen (mind. 2 Kapitel) — Hard-Gate, kein Fertig-Bypass.",
    );
  }
  const audit = auditKapitelGeruestStructured(geruest);
  if (!audit.ok && !override) {
    const detail = audit.errors
      .slice(0, 6)
      .map((e) => `• ${e.message}`)
      .join("\n");
    throw new Error(
      `Feingerüst-Hard-Gate rot — Auto-Repair bei Erzeugen oder „Trotzdem weiter“:\n${detail}`,
    );
  }
}

/** Human-readable preflight summary for progress / history. */
export function formatSzenenplotPreflightSummary(
  result: SzenenplotPreflightResult,
): string {
  const parts: string[] = [];
  if (result.errors.length) {
    parts.push(
      `Fehler ${result.errors.length}: ${result.errors.map((e) => e.message).join(" · ")}`,
    );
  }
  if (result.warnings.length) {
    parts.push(
      `Hinweise ${result.warnings.length}: ${result.warnings.map((w) => w.message).join(" · ")}`,
    );
  }
  return parts.join("\n").slice(0, 2_000);
}
