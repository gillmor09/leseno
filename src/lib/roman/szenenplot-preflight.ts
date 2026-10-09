/**
 * Deterministic audits: Feingerüst (arcs/lifecycle) vs Feinplot
 * (scene chain, schreibPrompt, arc→scene coverage) before Manuskript.
 * Soft warnings vs hard errors; override via pipelineFertig.feinplot
 * (or legacy szenenplot / outline).
 */

import { isPipelineTabFertig, type RomanEditorial } from "@/lib/roman/editorial";
import { listThinConcreteNodes } from "@/lib/roman/wissens-graph";
import type {
  RomanKapitelGeruestChapter,
  RomanKapitelGeruestStructured,
  RomanSzenenplotChapterNode,
  RomanSzenenplotStructured,
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

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
 * Block Manuskript Erzeugen unless Feinplot passes audit + Reifegrad
 * (Logik + Übergänge + Abdeckung ≥ 75%), or Feinplot fertig (override).
 * Scores live under `feinplot` (legacy key `szenenplot` still accepted).
 */
export function assertGeruestReadyForManuskript(input: {
  editorial: RomanEditorial;
}): void {
  const editorial = input.editorial;
  const override =
    isPipelineTabFertig(editorial, "feinplot") ||
    isPipelineTabFertig(editorial, "szenenplot") ||
    isPipelineTabFertig(editorial, "outline");
  const structured = editorial.szenenplotStructured;
  const audit = auditSzenenplotStructured(structured);

  if (!structured?.chapters.length && !override) {
    throw new Error(
      "Kein Feinplot — bitte Tab „Feinplot“ erzeugen und freigeben, bevor das Manuskript startet.",
    );
  }

  if (!audit.ok && !override) {
    const detail = audit.errors
      .slice(0, 6)
      .map((e) => `• ${e.message}`)
      .join("\n");
    throw new Error(
      `Feinplot-Preflight fehlgeschlagen — bitte Feinplot Verbessern oder „Feinplot fertig“ setzen (Override):\n${detail}`,
    );
  }

  if (!override) {
    const score =
      editorial.reifegrade?.feinplot ??
      editorial.reifegrade?.szenenplot ??
      null;
    if (!score) {
      throw new Error(
        `Feinplot-Reifegrad fehlt — bitte zuerst Feinplot messen (Logik, Übergänge, Abdeckung je ≥${GERUEST_MANUSKRIPT_AXIS_MIN_PCT}%), bevor das Manuskript startet. Oder „Feinplot fertig“ setzen.`,
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
        `Feinplot noch nicht freigabefähig für Manuskript (Logik ${logik}%, Übergänge ${uebergaenge}%, Abdeckung ${abdeckung}% — Ziel je ≥${GERUEST_MANUSKRIPT_AXIS_MIN_PCT}%). Bitte Feinplot Verbessern oder „Feinplot fertig“ setzen.`,
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
        `Wissensgraph noch zu unkonkret für Manuskript (${critical.length} Props/Orte/Events ohne Farbe/Kennzeichen/Adresse/Uhrzeit/Name). Bitte Feinplot neu erzeugen oder Verbessern — Details müssen spätestens im Plot kanonisch sein.`,
      );
    }
  }

  void audit.warnings;
}

/**
 * Gate Grob-/Feinplot Erzeugen: Feingerüst must exist (structure).
 * Override: feingeruest / outline fertig.
 */
export function assertGeruestReadyForSzenenplot(input: {
  editorial: RomanEditorial;
}): void {
  const editorial = input.editorial;
  const override =
    isPipelineTabFertig(editorial, "feingeruest") ||
    isPipelineTabFertig(editorial, "outline");
  const geruest = editorial.kapitelGeruestStructured;
  if ((!geruest?.chapters.length || geruest.chapters.length < 2) && !override) {
    throw new Error(
      "Zuerst Feingerüst erzeugen (mind. 2 Kapitel) — oder „Feingerüst fertig“ setzen.",
    );
  }
  const audit = auditKapitelGeruestStructured(geruest);
  if (!audit.ok && !override) {
    const detail = audit.errors
      .slice(0, 6)
      .map((e) => `• ${e.message}`)
      .join("\n");
    throw new Error(
      `Feingerüst-Preflight fehlgeschlagen — bitte Feingerüst Verbessern:\n${detail}`,
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
