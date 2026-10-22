/**
 * Deterministic KI-tic / formula detectors for novel chapters.
 * Used for Export Abnahme diagnostics (not a sequential quality driver).
 *
 * Patterns stay in code (not in Autor prompts) to avoid self-priming.
 */

import { ENDING_GESTURE_PATTERNS } from "@/lib/novel/chapter-contract";
import type { NovelBundle } from "@/lib/novel/types";

export type NovelProseTicHit = {
  code:
    | "chapter_end_aphorism"
    | "negation_staccato"
    | "als_chain"
    | "object_personhood"
    | "explained_punch"
    | "placeholder_gap"
    | "nicht_sondern"
    | "ritual_motif"
    | "gesture_lockstep"
    | "ending_echo"
    | "motif_budget"
    | "dialog_flip"
    | "ending_gesture_budget"
    | "read_ritual"
    | "mono_reply"
    | "silence_ending"
    | "das_ist_takt"
    | "procedure_lockstep"
    | "causal_order"
    | "ledger_date_clash";
  label: string;
  detail: string;
  /** Weighted toward chapter ending. */
  atEnd: boolean;
};

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  return [...text.matchAll(copy)].length;
}

/** Confirmation / 1–2 word dialog turns that flatten every voice. */
const MONO_CONFIRM_RE =
  /^(Ja|Nein|Gut|Genau|Klar|Okay|Ok|Schon|Eben|Doch|Offen|Heute|Na bitte|Auch gut|Schon klar|Nicht Sie|Genau so)\.?$/i;

/**
 * Extract quoted inners that are true mono/confirmation beats.
 * Longer short lines („Das war der Plan.“) are normal dialogue — not counted.
 */
export function collectMonoReplyInners(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[„"]\s*([^„"\n]+?)\s*[.“"!?][“"]?/g)) {
    const inner = (m[1] ?? "").replace(/\s+/g, " ").trim();
    if (!inner || inner.length > 24) continue;
    const words = inner.split(" ").filter(Boolean);
    if (words.length <= 2 || MONO_CONFIRM_RE.test(inner)) {
      out.push(inner);
    }
  }
  return out;
}

function normalizeEnding(text: string): string {
  return text
    .slice(-160)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const words = s.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < words.length - 2; i += 1) {
    out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Manuscript gaps the model must not leave. */
export function detectPlaceholders(raw: string): NovelProseTicHit[] {
  const text = raw.trim();
  if (!text) return [];
  const hits: NovelProseTicHit[] = [];
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\[\s*\.{2,}\s*\]/g, label: "eckige Auslassungspunkte" },
    { re: /\[\s*…\s*\]/g, label: "eckige Ellipse" },
    { re: /\[\s*(fehlt|auslassung|placeholder|todo|tbd|xxx)\s*\]/gi, label: "Platzhalter-Tag" },
    { re: /\bTODO\b|\bTBD\b|\bFIXME\b/g, label: "TODO-Marker" },
    { re: /\.{4,}/g, label: "Punkte-Lücke" },
  ];
  for (const p of patterns) {
    const n = countMatches(text, p.re);
    if (n > 0) {
      hits.push({
        code: "placeholder_gap",
        label: "Unvollständiger Text / Platzhalter",
        detail: `${n}× ${p.label} — Szene muss vollständig sein.`,
        atEnd: false,
      });
      break;
    }
  }
  return hits;
}

/**
 * Scan one chapter for template tics + rituals + placeholders.
 */
export function detectNovelProseTics(raw: string): NovelProseTicHit[] {
  const text = raw.trim();
  if (text.length < 80) return detectPlaceholders(text);

  const hits: NovelProseTicHit[] = [...detectPlaceholders(text)];
  const sentences = splitSentences(text);
  const endWindow = text.slice(Math.max(0, text.length - 700));
  const endSentences = sentences.slice(-6);
  const endJoined = endSentences.join(" ");

  // 1) Aphoristic / motto chapter ending
  const endAphorism =
    /\bDas war kein\b/i.test(endJoined) ||
    /\bDas war nicht\b/i.test(endJoined) ||
    (/\bAber es war\b/i.test(endJoined) &&
      endSentences.some((s) => s.length < 90)) ||
    (endSentences.length >= 2 &&
      /^[^.]{10,70}\.$/.test(endSentences[endSentences.length - 1] ?? "") &&
      /^(Das|Es|Aber|Nur|Vielleicht)\b/i.test(
        endSentences[endSentences.length - 1] ?? "",
      ) &&
      /^(Das|Es|Aber|Nur)\b/i.test(
        endSentences[endSentences.length - 2] ?? "",
      ));

  if (endAphorism) {
    hits.push({
      code: "chapter_end_aphorism",
      label: "Motto-/Pointen-Schluss",
      detail:
        "Die letzten Sätze wirken wie Bedeutungs-Resume statt szenischem Weiterlauf.",
      atEnd: true,
    });
  }

  // 2) Negation staccato (Nicht:… / Keine X, keine Y / short Nicht-Sätze)
  const nichtColon = countMatches(text, /\bNicht\s*:/gi);
  const nichtLineStarts = countMatches(text, /(?:^|\n)\s*Nicht\b/gi);
  const shortNicht = countMatches(text, /\bNicht\s+[A-ZÄÖÜ][^.]{0,40}\./g);
  const keinePair = countMatches(
    text,
    /\bKein(?:e|en|em|er)?\s+[^,.\n]{2,48},\s*kein(?:e|en|em|er)?\b/gi,
  );
  const keineSentenceStarts = countMatches(
    text,
    /(?:^|[.!?]\s+)Keine\s+[A-ZÄÖÜa-zäöüß][^.]{0,50}\./g,
  );
  const negScore =
    nichtColon * 2 +
    nichtLineStarts +
    Math.floor(shortNicht / 2) +
    keinePair * 2 +
    Math.floor(keineSentenceStarts / 2);
  const negEnd =
    countMatches(endWindow, /\bNicht\s*:/gi) +
    countMatches(endWindow, /(?:^|\n)\s*Nicht\b/gi) +
    countMatches(
      endWindow,
      /\bKein(?:e|en|em|er)?\s+[^,.\n]{2,48},\s*kein(?:e|en|em|er)?\b/gi,
    );

  if (
    negScore >= 4 ||
    negEnd >= 2 ||
    keinePair >= 2 ||
    (keinePair >= 1 && keineSentenceStarts >= 2)
  ) {
    hits.push({
      code: "negation_staccato",
      label: "Verneinungs-Staccato",
      detail: `Dichte Verneinungs-Muster (Score ${negScore}, Paare ${keinePair}, Ende ${negEnd}).`,
      atEnd: negEnd >= 2,
    });
  }

  // 2b) Nicht X, sondern Y
  const nichtSondern = countMatches(
    text,
    /\b[Nn]icht\s+[^,.\n]{2,48},\s*sondern\b/g,
  );
  if (nichtSondern >= 2) {
    hits.push({
      code: "nicht_sondern",
      label: "Nicht-X-sondern-Y-Takt",
      detail: `${nichtSondern}× Gegenüberstellungs-Formel in einem Kapitel (Cap: 1).`,
      atEnd: false,
    });
  }

  // 3) als hätte / als sei / als ob chains — hard cap: max 1 per chapter
  const alsCount = countMatches(
    text,
    /\bals (hätte|hätt'|sei|wäre|wäre'|würde|ließe|liesse)\b/gi,
  );
  const alsObCount = countMatches(text, /\bals ob\b/gi);
  const alsTotal = alsCount + alsObCount;
  const alsEnd =
    countMatches(
      endWindow,
      /\bals (hätte|hätt'|sei|wäre|wäre'|würde|ließe|liesse)\b/gi,
    ) + countMatches(endWindow, /\bals ob\b/gi);
  if (alsTotal >= 2 || alsEnd >= 2) {
    hits.push({
      code: "als_chain",
      label: "Gleichförmige Vergleichsketten",
      detail: `${alsTotal}× „als …“-Vergleiche (Cap: 1; ${alsEnd} im Schlussfenster).`,
      atEnd: alsEnd >= 1,
    });
  }

  // 4) Object personhood
  const personhood = countMatches(
    text,
    /\b(sich (?:selbst )?(?:abgelegt|hingesetzt|geöffnet|geschlossen|gewehrt)|hatte Schultern|mit Schultern|gut gekleidet|wollte (?:nicht|gern)|lernte zu)\b/gi,
  );
  if (personhood >= 2) {
    hits.push({
      code: "object_personhood",
      label: "Vermenschlichte Dinge/Abstrakta",
      detail: `${personhood} Treffer auf serielle Ding-Personifikation.`,
      atEnd: false,
    });
  }

  // 5) Explained punch
  if (endSentences.length >= 2) {
    const a = endSentences[endSentences.length - 2] ?? "";
    const b = endSentences[endSentences.length - 1] ?? "";
    const explained =
      a.length < 100 &&
      b.length < 140 &&
      /\b(Das bedeutete|Damit war|So wurde|Es zeigte|Das hieß|Mit anderen Worten)\b/i.test(
        b,
      );
    if (explained) {
      hits.push({
        code: "explained_punch",
        label: "Erklärte Pointe",
        detail: "Schlusswirkung wird im Nachsatz noch ausgedeutet.",
        atEnd: true,
      });
    }
  }

  // 6) Ritual motif density inside one chapter (kladde / cold coffee / Uhrzeit ritual)
  const kladde = countMatches(
    text,
    /\b(Kladde|Notizbuch|zog (?:einen |den )?Strich|Strich darunter|notierte die Uhrzeit|schrieb die Uhrzeit)\b/gi,
  );
  const kaffeeKalt = countMatches(
    text,
    /\b(Kaffee war kalt|kalten Kaffee|Kaffee .*?\bkalt\b|kaltgewordene[rn]? Kaffee)\b/gi,
  );
  if (kladde >= 3) {
    hits.push({
      code: "ritual_motif",
      label: "Ritual-Motiv übernutzt",
      detail: `${kladde}× Kladde/Strich/Uhrzeit-Ritual in einem Kapitel.`,
      atEnd: false,
    });
  }
  if (kaffeeKalt >= 2) {
    hits.push({
      code: "ritual_motif",
      label: "Leitmotiv übernutzt",
      detail: `${kaffeeKalt}× Kaffee-kalt-Motiv in einem Kapitel.`,
      atEnd: false,
    });
  }

  // 7) Gesture lockstep: nod / wait / micro-behaviour filler
  const gestures = countMatches(
    text,
    /\b((?:Er|Sie)\s+)?(nickte|schüttelte den Kopf|schrieb|setzte den Stift|legte den Stift|klappte .*? zu)\b/gi,
  );
  const waits = countMatches(
    text,
    /\b(wartete|warteten|ließ(?:en)? (?:die|eine) (?:Pause|Stille)|Hand auf dem Tisch|Hand lag auf)\b/gi,
  );
  const gestureScore = gestures + waits;
  if (gestureScore >= 3) {
    hits.push({
      code: "gesture_lockstep",
      label: "Dialog-Gesten im Gleichschritt",
      detail: `${gestureScore}× Nicken/Warten/Mini-Gesten — durch Information oder Handlung ersetzen.`,
      atEnd: false,
    });
  }

  // 8) Dialog flip / echo-pingpong („Das war kein…“ / „Das ist eine andere Frage“)
  const dialogFlip =
    countMatches(text, /\bDas war (kein|nicht)\b/gi) +
    countMatches(text, /\bDas war (eine Frage|kein Vorschlag|kein Angebot)\b/gi) +
    countMatches(
      text,
      /\bDas (ist|war) (eine andere|nicht dieselbe|nicht die gleiche) Frage\b/gi,
    ) +
    countMatches(text, /\bDas ist (keine|eine) (Beschreibung|Antwort|Zahl)\b/gi) +
    countMatches(text, /[„"][^„"]{0,40}\?[“"]\s*[„"][^„"]{0,30}[.“"]/g);
  const echoShort = countMatches(
    text,
    /\b(Ich weiß\.|Auch gut\.|Genau\.|Eben\.|Schon klar\.)\b/g,
  );
  if (dialogFlip >= 3 || (dialogFlip >= 2 && echoShort >= 3)) {
    hits.push({
      code: "dialog_flip",
      label: "Dialog-Kipp-Takt",
      detail: `${dialogFlip}× Kipp-/Echo-Muster — Antworten variieren (zustimmen, länger, Handlung statt Replik).`,
      atEnd: false,
    });
  }

  // 9) Read-twice ritual (documents / screens read “twice/thrice”)
  const readRitual = countMatches(
    text,
    /\blas(?:t|en)?\s+(?:es|sie|ihn|den Text|die Zeile|den Absatz|den Brief|das Schreiben|die Seite|die Meldung|den Hinweis)\s+(?:noch\s+)?(?:zweimal|dreimal|erneut|noch einmal|nochmals)\b/gi,
  ) +
    countMatches(
      text,
      /\b(?:las|lasen|gelesen)\b[^.]{0,40}\b(?:zweimal|dreimal|erneut|noch einmal|nochmals)\b/gi,
    );
  if (readRitual >= 2) {
    hits.push({
      code: "read_ritual",
      label: "Lese-Ritual",
      detail: `${readRitual}× „nochmals lesen“-Geste — Information einmal zeigen, Handlung weiterführen.`,
      atEnd: false,
    });
  }

  // 10) Mono-replies: only 1–2 word / confirmation staccato (not every short quote)
  const monoHits = collectMonoReplyInners(text);
  if (monoHits.length >= 6) {
    const sample = monoHits.slice(0, 6).map((s) => `„${s}“`).join(" ");
    hits.push({
      code: "mono_reply",
      label: "Einwort-/Kurzrepliken-Häufung",
      detail: `${monoHits.length}× Bestätigungs-/Einwort-Takt (z. B. ${sample}) — mindestens eine Figur braucht längere, eigene Sätze.`,
      atEnd: false,
    });
  }

  // 11) Silence / gaze / stillness chapter ending (Abnahme: same soft landing)
  const silenceEnd = countMatches(
    endWindow,
    /\b(schwieg|Schweigen|Blick (?:ging|blieb|traf|ruhte)|sah (?:ihn|sie|hinaus|hinunter)|Hand lag|lag auf (?:dem|den)|blieb stehen|nichts sagte|Stillstand)\b/gi,
  );
  if (silenceEnd >= 2) {
    hits.push({
      code: "silence_ending",
      label: "Schweige-/Blick-Schluss",
      detail: `${silenceEnd}× Stillstand/Blick/Schweigen im Schlussfenster — Ende in Handlung oder Dialogfaden setzen.`,
      atEnd: true,
    });
  }

  // 12) „Das ist …“ reply staccato (Abnahme: same admin voice for every speaker)
  const dasIstQuoted = countMatches(
    text,
    /[„"][^„"\n]{0,8}Das (ist|war|habe ich|beschreibt|entspricht|stimmt)[^„"\n]{0,48}[.“"]/gi,
  );
  const dasIstBare = countMatches(
    text,
    /\bDas (ist|war) (richtig|sachgerecht|verstanden|korrekt|der Vorgang|eine andere|keine)\b/gi,
  );
  const dasIstScore = dasIstQuoted + dasIstBare;
  if (dasIstScore >= 3) {
    hits.push({
      code: "das_ist_takt",
      label: "„Das ist …“-Antworttakt",
      detail: `${dasIstScore}× gleichförmige „Das ist/war …“-Repliken — Figuren brauchen eigene Satzlänge und Haltung.`,
      atEnd: false,
    });
  }

  // 13) Procedure / protocol lockstep (documentation replaces conflict)
  const procedure = countMatches(
    text,
    /\b(dokumentier(?:en|te|t)|ließ\s+\w+\s+dokumentieren|trägt\s+\w+\s+ein|trug\s+\w+\s+ein|ins\s+Protokoll|Protokoll(?:notiz)?|Blätter\s+(?:nebeneinander|aufeinander)|legte\s+die\s+Blätter|Notiz\s+(?:gemacht|geschrieben))\b/gi,
  );
  if (procedure >= 4) {
    hits.push({
      code: "procedure_lockstep",
      label: "Verfahrens-/Protokoll-Gleichschritt",
      detail: `${procedure}× Dokumentations-/Protokoll-Gesten — Konflikt oder neue Info statt Aktenrhythmus.`,
      atEnd: false,
    });
  }

  return hits;
}

/**
 * Cross-chapter: ending echo + motif budget across the book so far.
 */
export function detectCrossChapterFormulaHits(input: {
  currentText: string;
  priorChapterTexts: string[];
}): NovelProseTicHit[] {
  const hits: NovelProseTicHit[] = [];
  const current = input.currentText.trim();
  if (current.length < 80 || input.priorChapterTexts.length === 0) return hits;

  const curEnd = normalizeEnding(current);
  const curTri = trigrams(curEnd);
  const curLast =
    splitSentences(current).slice(-1)[0]?.toLowerCase().trim() ?? "";
  for (let i = 0; i < input.priorChapterTexts.length; i += 1) {
    const prev = input.priorChapterTexts[i] ?? "";
    if (prev.length < 80) continue;
    const prevEnd = normalizeEnding(prev);
    const triSim = jaccard(curTri, trigrams(prevEnd));
    const prevLast =
      splitSentences(prev).slice(-1)[0]?.toLowerCase().trim() ?? "";
    let lastSim = 0;
    if (curLast.length >= 20 && prevLast.length >= 20) {
      if (curLast === prevLast) lastSim = 1;
      else {
        lastSim = jaccard(
          new Set(curLast.split(/\s+/).filter(Boolean)),
          new Set(prevLast.split(/\s+/).filter(Boolean)),
        );
      }
    }
    const sim = Math.max(triSim, lastSim);
    if (sim >= 0.4) {
      hits.push({
        code: "ending_echo",
        label: "Kapitelende zu ähnlich",
        detail: `Schluss ähnelt Kapitel ${i + 1} (Ähnlichkeit ${sim.toFixed(2)}). Anderes Ende wählen.`,
        atEnd: true,
      });
      break;
    }
  }

  const corpus = [...input.priorChapterTexts, current].join("\n\n");
  const kaffeeTotal = countMatches(
    corpus,
    /\b(Kaffee war kalt|kalten Kaffee|Kaffee .*?\bkalt\b)\b/gi,
  );
  const kladdeTotal = countMatches(
    corpus,
    /\b(zog (?:einen |den )?Strich|Strich darunter|notierte die Uhrzeit)\b/gi,
  );
  if (kaffeeTotal > 3) {
    hits.push({
      code: "motif_budget",
      label: "Leitmotiv-Budget überschritten",
      detail: `Kaffee-kalt bisher ${kaffeeTotal}× (Cap 3) — Motiv streichen oder stark variieren.`,
      atEnd: false,
    });
  }
  if (kladdeTotal > 3) {
    hits.push({
      code: "motif_budget",
      label: "Ritual-Budget überschritten",
      detail: `Kladde-Strich/Uhrzeit bisher ${kladdeTotal}× (Cap 3).`,
      atEnd: false,
    });
  }

  // Ending gesture budget: current chapter end uses a gesture already at cap
  const endWin = current.slice(Math.max(0, current.length - 500));
  const priorCorpus = input.priorChapterTexts.join("\n\n");
  for (const g of ENDING_GESTURE_PATTERNS) {
    const priorN = countMatches(priorCorpus, g.re);
    const curN = countMatches(endWin, g.re);
    if (curN > 0 && priorN >= g.cap) {
      hits.push({
        code: "ending_gesture_budget",
        label: "Schluss-Geste über Budget",
        detail: `${g.label}: Cap ${g.cap} bereits erreicht (${priorN}×) — anderes Kapitelende.`,
        atEnd: true,
      });
      break;
    }
  }

  return hits;
}

/** German issue lines for editor feedback / rewrite prompts. */
export function formatProseTicIssues(hits: NovelProseTicHit[]): string[] {
  return hits.map((h) => `KI-Tic [${h.code}]: ${h.label} — ${h.detail}`);
}

/**
 * Manuscript-level hard gate for Abnahme.
 * `mode: "abnahme"` raises bars on intentional open-ending craft (pipeline),
 * so soft scene endings alone do not fail the whole book.
 */
export function manuscriptSoundsLikeAiFromTics(
  chapterTexts: string[],
  opts?: { mode?: "default" | "abnahme" },
): { soundsLikeAi: boolean; notes: string; hitChapters: number } {
  const abnahme = opts?.mode === "abnahme";
  let hitChapters = 0;
  let endAphorismChapters = 0;
  let placeholderChapters = 0;
  let endingEchoPairs = 0;
  let dialogFlipChapters = 0;
  let silenceEndingChapters = 0;
  let monoReplyChapters = 0;
  let negationChapters = 0;
  let dasIstChapters = 0;
  let procedureChapters = 0;
  const notes: string[] = [];
  const endings: string[] = [];

  for (let i = 0; i < chapterTexts.length; i += 1) {
    const text = chapterTexts[i] ?? "";
    const hits = detectNovelProseTics(text);
    const cross = detectCrossChapterFormulaHits({
      currentText: text,
      priorChapterTexts: chapterTexts.slice(0, i),
    });
    const all = [...hits, ...cross];
    if (all.length) hitChapters += 1;
    if (hits.some((h) => h.code === "chapter_end_aphorism")) {
      endAphorismChapters += 1;
    }
    if (hits.some((h) => h.code === "placeholder_gap")) {
      placeholderChapters += 1;
    }
    if (hits.some((h) => h.code === "dialog_flip")) {
      dialogFlipChapters += 1;
    }
    if (hits.some((h) => h.code === "silence_ending")) {
      silenceEndingChapters += 1;
    }
    if (hits.some((h) => h.code === "mono_reply")) {
      monoReplyChapters += 1;
    }
    if (hits.some((h) => h.code === "negation_staccato")) {
      negationChapters += 1;
    }
    if (hits.some((h) => h.code === "das_ist_takt")) {
      dasIstChapters += 1;
    }
    if (hits.some((h) => h.code === "procedure_lockstep")) {
      procedureChapters += 1;
    }
    if (cross.some((h) => h.code === "ending_echo")) {
      endingEchoPairs += 1;
    }
    endings.push(normalizeEnding(text));
  }

  const n = Math.max(1, chapterTexts.length);
  const endRatio = endAphorismChapters / n;
  const hitRatio = hitChapters / n;

  // Higher bars on Abnahme: open mid-action endings are Szenenvertrag craft.
  const aphorismMin = abnahme ? 5 : 3;
  const aphorismRatio = abnahme ? 0.5 : 0.35;
  const echoMin = abnahme ? 6 : 3;
  const silenceMin = abnahme ? 6 : 3;
  const flipMin = abnahme ? 6 : 4;
  const monoMin = abnahme ? 5 : 3;
  const negMin = abnahme ? 5 : 3;
  const dasIstMin = abnahme ? 4 : 2;
  const procMin = abnahme ? 4 : 2;
  const hitMin = abnahme ? 8 : 5;
  const hitRatioMax = abnahme ? 0.65 : 0.45;

  if (placeholderChapters > 0) {
    notes.push(`Platzhalter/Auslassungen in ${placeholderChapters} Kapiteln.`);
  }
  if (endAphorismChapters >= aphorismMin || endRatio >= aphorismRatio) {
    notes.push(
      `Motto-Schlüsse in ${endAphorismChapters}/${n} Kapiteln (Schablone).`,
    );
  }
  if (endingEchoPairs >= echoMin) {
    notes.push(`${endingEchoPairs} Kapitelenden zu ähnlich (Echo).`);
  }
  if (dialogFlipChapters >= flipMin) {
    notes.push(
      `Dialog-Kipp-Takt in ${dialogFlipChapters}/${n} Kapiteln.`,
    );
  }
  if (silenceEndingChapters >= silenceMin) {
    notes.push(
      `Schweige-/Blick-Schlüsse in ${silenceEndingChapters}/${n} Kapiteln.`,
    );
  }
  if (monoReplyChapters >= monoMin) {
    notes.push(
      `Kurzrepliken-Häufung in ${monoReplyChapters}/${n} Kapiteln.`,
    );
  }
  if (negationChapters >= negMin) {
    notes.push(
      `Verneinungs-Staccato in ${negationChapters}/${n} Kapiteln.`,
    );
  }
  if (dasIstChapters >= dasIstMin) {
    notes.push(
      `„Das ist …“-Antworttakt in ${dasIstChapters}/${n} Kapiteln.`,
    );
  }
  if (procedureChapters >= procMin) {
    notes.push(
      `Verfahrens-/Protokoll-Gleichschritt in ${procedureChapters}/${n} Kapiteln.`,
    );
  }
  if (hitChapters >= hitMin || hitRatio >= hitRatioMax) {
    notes.push(`Formel-Tics in ${hitChapters}/${n} Kapiteln.`);
  }

  const kaffeeTotal = countMatches(
    chapterTexts.join("\n"),
    /\b(Kaffee war kalt|kalten Kaffee|Kaffee .*?\bkalt\b)\b/gi,
  );
  const kaffeeCap = abnahme ? 6 : 3;
  if (kaffeeTotal > kaffeeCap) {
    notes.push(`Leitmotiv Kaffee-kalt ${kaffeeTotal}× über Cap.`);
  }

  const soundsLikeAi =
    placeholderChapters > 0 ||
    endAphorismChapters >= aphorismMin ||
    endRatio >= aphorismRatio ||
    endingEchoPairs >= echoMin ||
    dialogFlipChapters >= flipMin ||
    silenceEndingChapters >= silenceMin ||
    monoReplyChapters >= monoMin ||
    negationChapters >= negMin ||
    dasIstChapters >= dasIstMin ||
    procedureChapters >= procMin ||
    hitChapters >= hitMin ||
    hitRatio >= hitRatioMax ||
    kaffeeTotal > kaffeeCap;

  return {
    soundsLikeAi,
    notes: notes.join(" ") || "",
    hitChapters,
  };
}

/** Scan all chapters for Formel-Tic hits (diagnostic for Export). */
export function scanKapitelFormelTics(bundle: NovelBundle): Array<{
  chapterNumber: number;
  title: string;
  hits: NovelProseTicHit[];
}> {
  const chapters = bundle.chapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const out: Array<{
    chapterNumber: number;
    title: string;
    hits: NovelProseTicHit[];
  }> = [];
  const prior: string[] = [];
  for (const c of chapters) {
    const body = (c.finalText || c.rawDraft).trim();
    if (body.length < 80) {
      prior.push(body);
      continue;
    }
    const hits = [
      ...detectNovelProseTics(body),
      ...detectCrossChapterFormulaHits({
        currentText: body,
        priorChapterTexts: prior,
      }),
    ];
    if (hits.length > 0) {
      out.push({
        chapterNumber: c.chapterNumber,
        title: c.title || `Kapitel ${c.chapterNumber}`,
        hits,
      });
    }
    prior.push(body);
  }
  return out;
}
