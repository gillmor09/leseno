/**
 * Chapter dramatic jobs (contracts): per-chapter craft constraints.
 * Assigned at outline; drives scene plan / draft / review / ending — not voice.
 * Scene beats are a micro-structure under the chapter job.
 */

import type {
  NovelChapterContract,
  NovelChapterJob,
  NovelSceneBeat,
  ScenePlanBeat,
} from "@/lib/novel/types";

export const NOVEL_SCENE_BEATS = [
  "advance",
  "turn",
  "relief",
  "cost",
  "land",
] as const satisfies readonly NovelSceneBeat[];

export const NOVEL_SCENE_BEAT_LABELS: Record<NovelSceneBeat, string> = {
  advance: "Vorantreiben",
  turn: "Drehung",
  relief: "Entlastung",
  cost: "Kosten",
  land: "Landung",
};

const SCENE_BEAT_BLURB: Record<NovelSceneBeat, string> = {
  advance: "bringt den Kapitel-Job einen konkreten Schritt voran",
  turn: "ändert Blickwinkel/Machtlage innerhalb des Jobs",
  relief: "kurze Entlastung (Dialog/Reibung) — nicht die Hauptsache",
  cost: "zeigt den Preis des vorherigen Fortschritts",
  land: "landet Richtung Kapitelende-Funktion",
};

/** Register under the book voice — how this beat speaks, not a new voice. */
const SCENE_BEAT_REGISTER: Record<NovelSceneBeat, string[]> = {
  advance: [
    "Vorwärtsdrang: Handlung und Dialog tragen, wenig Nachklärung",
    "Neuer Schritt muss spürbar sein — Satzlänge frei (kurz und lang gemischt ok)",
  ],
  turn: [
    "Perspektivwechsel in der Sprache: plötzlich anderer Fokus oder Tempo",
    "Ein Satz oder Beat markiert den Bruch — nicht weich überleiten",
  ],
  relief: [
    "Leichteres Register: Timing, Reibung, Mundwerk",
    "Keine Nachsätze, die den Witz erklären",
  ],
  cost: [
    "Nachhall: konkrete Folge am Körper, Raum oder Beziehung",
    "Ruhiger oder härter als advance — aber nicht erklärend",
  ],
  land: [
    "Landung Richtung Kapitelende: ein klarer Schlussimpuls",
    "Kein Motto-Satz; in der Szene enden",
  ],
};

export const NOVEL_CHAPTER_JOBS = [
  "setup",
  "incite",
  "escalate",
  "reveal",
  "confront",
  "comic",
  "aftermath",
  "decision",
  "climax",
  "denouement",
] as const satisfies readonly NovelChapterJob[];

export const NOVEL_CHAPTER_JOB_LABELS: Record<NovelChapterJob, string> = {
  setup: "Setup",
  incite: "Auslöser",
  escalate: "Eskalation",
  reveal: "Enthüllung",
  confront: "Konfrontation",
  comic: "Komik",
  aftermath: "Nachwirkung",
  decision: "Entscheidung",
  climax: "Höhepunkt",
  denouement: "Auflösung",
};

type JobCraft = {
  /** Default must-lines if outline omits them. */
  must: string[];
  mustNot: string[];
  /** Allowed ending functions for this job (pick one per chapter). */
  endings: string[];
  blurb: string;
  /**
   * Language register under the book voice (same Stimme, different Haltung).
   * Injected into author/editor prompts — not a second voice card.
   */
  register: string[];
};

const DIALOG_REGISTER_LINE =
  "Dialog: Figurenstimmen unterscheidbar halten (Satzlänge, Haltung, Wortwahl); längere, erwachsene Sätze sind erwünscht — Kurzstil nicht erzwingen.";

const JOB_CRAFT: Record<NovelChapterJob, JobCraft> = {
  setup: {
    blurb: "Welt, Figur und Leserversprechen setzen.",
    must: [
      "Ein konkretes Alltagsdetail der Figur zeigen",
      "Das Versprechen der Prämisse andeuten, ohne alles zu erklären",
    ],
    mustNot: [
      "Keine reine Exposition ohne Szene",
      "Kein Verfahrens-Ritual als Hauptaktion",
    ],
    endings: ["Handlung beginnt", "Störimpuls", "Dialog-Haken", "sinnliches Detail"],
    register: [
      "Ruhiges Eintauchen: sinnliche Alltagsdetails, Figurstimme etablieren",
      "Versprechen andeuten, nicht erklären — Tempo noch nicht hetzen",
      DIALOG_REGISTER_LINE,
    ],
  },
  incite: {
    blurb: "Auslösendes Ereignis — danach ist der Status quo kaputt.",
    must: [
      "Ein irreversibles auslösendes Ereignis",
      "Figur reagiert in Handlung oder Dialog, nicht nur im Kopf",
    ],
    mustNot: [
      "Keine Rückkehr zum ungestörten Alltag",
      "Kein Aufschub durch Notiz-/Aktenarbeit",
    ],
    endings: ["Entscheidung unter Druck", "Anruf/Störung", "Tür öffnet sich", "offen"],
    register: [
      "Bruch im Rhythmus: Tempowechsel ab dem auslösenden Moment (nicht pauschal nur kurze Sätze)",
      "Reaktion auf der Bühne (Handlung/Dialog), keine glatte Zusammenfassung",
      DIALOG_REGISTER_LINE,
    ],
  },
  escalate: {
    blurb: "Neuer irreversibler Druck — Zeit, Ort, Macht oder Information drehen sich.",
    must: [
      "Mindestens ein neuer irreversibler Schritt",
      "Druck von außen (Zeit, Person, System), nicht nur innere Wiederholung",
    ],
    mustNot: [
      "Keine Wiederholung der letzten Kapitel-Routine",
      "Kein reines Abhaken derselben Verfahrensarbeit",
    ],
    endings: ["Handlung", "Zeitdruck", "Gegenfigur greift ein", "offen"],
    register: [
      "Druck-Sprache: äußerer Fokus, Zeit/Ort/Macht spürbar — Satzlänge frei",
      "Wenig Innenklärung; Fortschritt in Taten und Gegenwind",
      DIALOG_REGISTER_LINE,
    ],
  },
  reveal: {
    blurb: "Neue Information mit Kosten für die Figur.",
    must: [
      "Eine neue Information, die die Lage verändert",
      "Sichtbare Kosten oder Risiko der Entdeckung",
    ],
    mustNot: [
      "Keine Infodump-Monologe",
      "Keine Enthüllung ohne Konsequenz in der Szene",
    ],
    endings: ["Wissensbruch", "Entscheidung nach dem Wissen", "Dialog-Schlag", "offen"],
    register: [
      "Entdeckungs-Spannung: Information verdichtet, Kosten mitschwingen",
      "Kein Lehrton — Wissen über Szene und Reaktion, nicht Vortrag",
      DIALOG_REGISTER_LINE,
    ],
  },
  confront: {
    blurb: "Konflikt mit Gegenfigur oder System — Reibung auf der Bühne.",
    must: [
      "Direkte Konfrontation (Dialog oder Handlung)",
      "Beide Seiten wollen etwas Unvereinbares",
    ],
    mustNot: [
      "Kein Konflikt nur intern im Kopf",
      "Keine friedliche Aktenlage ohne Gegendruck",
    ],
    endings: ["Dialog-Schnitt", "Machtverschiebung", "Abbruch unter Spannung", "Handlung"],
    register: [
      "Reibung: Dialog und Gegenwillen tragen das Tempo",
      "Schärfere Kanten in den Stimmen; wenig erzählende Glättung dazwischen",
      DIALOG_REGISTER_LINE,
    ],
  },
  comic: {
    blurb: "Entlastung über Dialog-Reibung und Timing — Tempo tragen die Stimmen.",
    must: [
      "Dialog trägt den Großteil des Tempos",
      "Mindestens eine Situations- oder Charakterpointe",
    ],
    mustNot: [
      "Keine Verwaltungs-Loop als Hauptszene",
      "Kein humorloses Nachklären der Pointe",
    ],
    endings: ["Dialog-Haken", "situative Pointe", "Missverständnis", "sinnlich-komisch"],
    register: [
      "Komik-Register: Timing, Missverständnisse, Charakterstimmen",
      "Pointen stehen lassen — keine erklärenden Nachsätze",
      DIALOG_REGISTER_LINE,
    ],
  },
  aftermath: {
    blurb: "Folgen verdauen — ruhigerer Rhythmus, innere und äußere Nachwirkung.",
    must: [
      "Sichtbare Folge der letzten Eskalation",
      "Veränderter Zustand der Figur oder Beziehung",
    ],
    mustNot: [
      "Keine neue Verwaltungs-Routine starten",
      "Kein Reset auf Kapitel-1-Status",
    ],
    endings: ["sinnliches Detail", "stille Entscheidung", "Gesprächsfaden", "offen"],
    register: [
      "Nachhall: längere Atmung, Körper/Raum/Stille, weniger Pointe",
      "Folgen zeigen, nicht die Eskalation noch einmal erzählen",
      DIALOG_REGISTER_LINE,
    ],
  },
  decision: {
    blurb: "Figur trifft eine teure Wahl mit erkennbarem Preis.",
    must: [
      "Eine klare, teure Entscheidung",
      "Preis oder Opfer wird in der Szene spürbar",
    ],
    mustNot: [
      "Keine unentschiedene Warteschleife",
      "Keine Entscheidung nur als erklärender Nachsatz",
    ],
    endings: ["Entscheidung fällt", "Handlung nach der Wahl", "Dialog-Bestätigung", "offen"],
    register: [
      "Entscheidungsdruck: Klarheit in Handlung und Dialog, Preis spürbar",
      "Kein Moralisieren — die Wahl zeigt sich, sie wird nicht gepredigt",
      DIALOG_REGISTER_LINE,
    ],
  },
  climax: {
    blurb: "Höhepunkt — maximale Konfrontation der Prämisse.",
    must: [
      "Zentrale Konfrontation der Prämisse",
      "Höchster Einsatz für die Hauptfigur",
      "Offene Kernfrage (Geld/Depot/Prüfung/Frist) auf der Bühne austragen",
    ],
    mustNot: [
      "Keine Nebenhandlung als Hauptszene",
      "Kein Abschwächen durch Verfahrens-Kleinkram",
    ],
    endings: ["Wendepunkt", "Handlungsschnitt", "Dialog-Explosion", "offen"],
    register: [
      "Maximaler Einsatz: dicht, handlungsstark, Prämisse im Zentrum",
      "Kein Abschweifen in Kleinkram; Tempo und Einsatz hoch halten",
      "Dialog: nicht jede Replik kippt die vorige — auch lange Züge und Zustimmung erlauben",
    ],
  },
  denouement: {
    blurb: "Auflösung — Konsequenzen und neuer Gleichgewichtszustand.",
    must: [
      "Konsequenzen der Klimax zeigen",
      "Neuer Gleichgewichtszustand (auch wenn unruhig)",
      "Kernfrage (Depot/Verrechnung/Referenz/offene Forderung) zu einem sichtbaren Status bringen — kein reiner Umzug ohne Ergebnis",
    ],
    mustNot: [
      "Keine neuen großen Subplots öffnen",
      "Kein reines Motto-Ende ohne Szene",
    ],
    endings: ["Handlung im neuen Zustand", "Dialog-Abschluss", "sinnliches Echo", "offen"],
    register: [
      "Ausklang: Konsequenzen und neuer Zustand in Szene, nicht Motto",
      "Ruhigeres Register als Climax — aber konkret, nicht predigen",
      "Dialog: ruhiger, weniger Kippmuster; Status klären statt Wortspiel",
    ],
  },
};

/**
 * Allowed beat chains per job — ScenePlan must pick one (no universal advance→turn→land).
 */
const JOB_BEAT_CHAINS: Record<NovelChapterJob, NovelSceneBeat[][]> = {
  setup: [
    ["advance", "turn", "land"],
    ["advance", "relief", "land"],
    ["turn", "advance", "land"],
  ],
  incite: [
    ["advance", "turn", "land"],
    ["advance", "cost", "land"],
    ["turn", "advance", "land"],
  ],
  escalate: [
    ["advance", "cost", "land"],
    ["turn", "advance", "land"],
    ["advance", "turn", "cost", "land"],
  ],
  reveal: [
    ["advance", "cost", "land"],
    ["turn", "cost", "land"],
    ["advance", "turn", "cost", "land"],
  ],
  confront: [
    ["advance", "turn", "land"],
    ["turn", "advance", "land"],
    ["advance", "cost", "land"],
  ],
  comic: [
    ["relief", "turn", "land"],
    ["advance", "relief", "land"],
    ["turn", "relief", "land"],
  ],
  aftermath: [
    ["cost", "advance", "land"],
    ["turn", "cost", "land"],
    ["cost", "land"],
  ],
  decision: [
    ["advance", "turn", "land"],
    ["cost", "advance", "land"],
    ["turn", "cost", "land"],
  ],
  climax: [
    ["advance", "turn", "cost", "land"],
    ["turn", "advance", "land"],
    ["advance", "cost", "land"],
  ],
  denouement: [
    ["cost", "advance", "land"],
    ["turn", "cost", "land"],
    ["advance", "land"],
  ],
};

/** Gestures that must not dominate chapter endings (book-wide budget). */
export const ENDING_GESTURE_PATTERNS: Array<{
  id: string;
  label: string;
  re: RegExp;
  cap: number;
}> = [
  {
    id: "stift",
    label: "Stift hinlegen/absetzen",
    re: /\b(legte den Stift|setzte den Stift|Stift (?:hin|ab)|Stift rollte)\b/gi,
    cap: 3,
  },
  {
    id: "kladde_zu",
    label: "Kladde zuklappen/schließen",
    re: /\b(klappte die Kladde|Kladde zu|schloss die Kladde|schloß die Kladde)\b/gi,
    cap: 3,
  },
  {
    id: "terminal_dimm",
    label: "Terminal/Display dimmt",
    re: /\b(Terminal (?:dimm|herunter)|Display (?:dunkel|dimm)|schirm .*?(?:dunkel|dimm))\b/gi,
    cap: 3,
  },
  {
    id: "schweigen_blick",
    label: "Schweigen/Blick/Stillstand am Schluss",
    re: /\b(schwieg|Schweigen|Blick (?:ging|blieb|traf|ruhte)|Hand lag|lag auf (?:dem|den)|blieb stehen|nichts sagte)\b/gi,
    cap: 2,
  },
];

/** Register lines for a chapter job (empty if unknown). */
export function getJobRegister(job: NovelChapterJob): string[] {
  return JOB_CRAFT[job]?.register ?? [];
}

/** Register lines for a scene beat. */
export function getSceneBeatRegister(beat: NovelSceneBeat): string[] {
  return SCENE_BEAT_REGISTER[beat] ?? [];
}

/**
 * Stable pick of an allowed beat chain for this job + chapter.
 * Prefers the longest chain so manuscript volume tracks the ~800-Wort-Richtwert.
 */
export function pickBeatChain(
  job: NovelChapterJob,
  chapterNumber: number,
): NovelSceneBeat[] {
  const chains = JOB_BEAT_CHAINS[job] ?? JOB_BEAT_CHAINS.escalate;
  const maxLen = Math.max(...chains.map((c) => c.length));
  const longest = chains.filter((c) => c.length === maxLen);
  const idx =
    Math.abs(chapterNumber * 31 + job.length * 7) % longest.length;
  return [...(longest[idx] ?? chains[0]!)];
}

/** Prompt mandate: exact beat sequence for scene plan. */
export function formatBeatChainMandate(
  job: NovelChapterJob,
  chapterNumber: number,
): { chain: NovelSceneBeat[]; block: string } {
  const chain = pickBeatChain(job, chapterNumber);
  const block = `VORGESCHRIEBENE Beat-Sequenz für dieses Kapitel (exakt einhalten, ${chain.length} Szenen):
${chain.map((b, i) => `${i + 1}. ${b} — ${SCENE_BEAT_BLURB[b]}`).join("\n")}
Keine andere Reihenfolge. Kein Default advance→turn→land, wenn oben etwas anderes steht.`;
  return { chain, block };
}

/**
 * Force scene beats onto the prescribed chain (pad/trim by summaries).
 */
export function applyBeatChainToScenes(
  scenes: ScenePlanBeat[],
  chain: NovelSceneBeat[],
): ScenePlanBeat[] {
  if (!chain.length) return scenes;
  const base = scenes.length
    ? scenes
    : chain.map(() => ({
        summary: "Szene",
        beat: "advance" as NovelSceneBeat,
      }));
  return chain.map((beat, i) => {
    const src = base[Math.min(i, base.length - 1)]!;
    return {
      ...src,
      summary: (src.summary || `Szene ${i + 1}`).trim(),
      beat,
    };
  });
}

/** Author hint: which ending gestures are already over budget in prior chapters. */
export function formatEndingGestureBudget(
  priorChapterTexts: string[],
): string {
  if (!priorChapterTexts.length) {
    return `# Schluss-Gesten-Budget
Noch nichts verbraucht. Cap je Geste: 3× im ganzen Buch.
Vermeide trotzdem Routine-Enden (Stift/Kladde/Terminal-Dimmen) — lieber Handlung, Dialogfaden oder sinnliches Detail.`;
  }
  const corpus = priorChapterTexts.join("\n\n");
  const lines: string[] = [];
  for (const g of ENDING_GESTURE_PATTERNS) {
    const n = [...corpus.matchAll(new RegExp(g.re.source, g.re.flags))].length;
    const left = Math.max(0, g.cap - n);
    lines.push(
      `- ${g.label}: bisher ${n}× / Cap ${g.cap} → noch ${left} erlaubt${left === 0 ? " — VERBOTEN in diesem Kapitelende" : ""}`,
    );
  }
  return `# Schluss-Gesten-Budget (buchweit)
${lines.join("\n")}
Kapitelende: andere Funktion wählen, wenn Caps voll. Kein Bedeutungssatz, der die Lage noch einmal erklärt.`;
}

/** Prompt snippet: enum + short blurbs for outline. */
export function formatJobTaxonomyForOutline(): string {
  return NOVEL_CHAPTER_JOBS.map(
    (j) => `- ${j}: ${JOB_CRAFT[j].blurb}`,
  ).join("\n");
}

export function isNovelChapterJob(raw: unknown): raw is NovelChapterJob {
  return (
    typeof raw === "string" &&
    (NOVEL_CHAPTER_JOBS as readonly string[]).includes(raw)
  );
}

function clipLines(lines: string[], max: number): string[] {
  return lines
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Stable pick among allowed endings for this job + chapter number. */
export function pickEndingForJob(
  job: NovelChapterJob,
  chapterNumber: number,
  preferred?: string,
): string {
  const endings = JOB_CRAFT[job].endings;
  const pref = preferred?.trim();
  if (pref) {
    const hit = endings.find(
      (e) => e.toLowerCase() === pref.toLowerCase() || pref.length >= 4,
    );
    // Prefer model ending if it is one of the allowed, else keep model text if non-empty.
    if (hit && eEquals(hit, pref)) return hit;
    if (pref.length >= 4) return pref.slice(0, 80);
  }
  const idx = Math.abs(chapterNumber * 17 + job.charCodeAt(0)) % endings.length;
  return endings[idx] ?? endings[0]!;
}

function eEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Normalize raw outline/model contract into a stored ChapterContract.
 * Unknown job → escalate. Empty must/mustNot filled from craft defaults.
 */
export function normalizeChapterContract(
  raw: unknown,
  chapterNumber = 1,
): NovelChapterContract | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    if (isNovelChapterJob(raw)) {
      return normalizeChapterContract({ job: raw }, chapterNumber);
    }
    return null;
  }
  const o = raw as Record<string, unknown>;
  // Empty / legacy jsonb default → no contract.
  if (Object.keys(o).length === 0) return null;
  const jobRaw = o.job ?? o.chapterJob;
  if (jobRaw == null || jobRaw === "") return null;
  const job: NovelChapterJob = isNovelChapterJob(jobRaw)
    ? jobRaw
    : typeof jobRaw === "string" &&
        isNovelChapterJob(jobRaw.trim().toLowerCase())
      ? (jobRaw.trim().toLowerCase() as NovelChapterJob)
      : "escalate";

  const craft = JOB_CRAFT[job];
  const must = clipLines(
    Array.isArray(o.must) ? o.must.map(String) : [],
    3,
  );
  const mustNot = clipLines(
    Array.isArray(o.mustNot)
      ? o.mustNot.map(String)
      : Array.isArray(o.must_not)
        ? o.must_not.map(String)
        : [],
    3,
  );
  const endingRaw = String(
    o.endingFunction ?? o.ending_function ?? o.ending ?? "",
  ).trim();
  const mood = String(o.mood ?? "").trim().slice(0, 80) || undefined;

  return {
    job,
    must: must.length ? must : craft.must.slice(0, 2),
    mustNot: mustNot.length ? mustNot : craft.mustNot.slice(0, 2),
    endingFunction: pickEndingForJob(job, chapterNumber, endingRaw || undefined),
    ...(mood ? { mood } : {}),
  };
}

export function parseChapterContract(raw: unknown): NovelChapterContract | null {
  return normalizeChapterContract(raw);
}

export function hasChapterContract(
  c: NovelChapterContract | null | undefined,
): c is NovelChapterContract {
  return Boolean(c && c.job && c.endingFunction);
}

/** Author-facing craft block for scene plan / draft. */
export function formatContractForAuthor(
  contract: NovelChapterContract | null | undefined,
): string {
  if (!hasChapterContract(contract)) {
    return "";
  }
  const craft = JOB_CRAFT[contract.job];
  const label = NOVEL_CHAPTER_JOB_LABELS[contract.job];
  const mood = contract.mood ? `\nStimmung (Feintuning): ${contract.mood}` : "";
  const register = craft.register.map((r) => `- ${r}`).join("\n");
  return `# Kapitel-Contract — Job: ${contract.job} (${label})
${craft.blurb}${mood}
## Register (dieselbe Buchstimme, andere Haltung)
${register}
## Muss (Kapitel-weit — über alle Szenen des Kapitels verteilt, nicht alles in jeder Szene)
${contract.must.map((m) => `- ${m}`).join("\n")}
## Darf nicht (gilt in jeder Szene)
${contract.mustNot.map((m) => `- ${m}`).join("\n")}
## Kapitelende-Funktion (primär letzte Szene)
${contract.endingFunction}
Diese Szene: Manifest.mustShow + situations vollständig spielen. Kapitel-Muss nur, soweit sie in DIESEM Manifest explizit vorkommen.
Stimme = Stimmkarte; Register = diese Job-Haltung.`;
}

/**
 * Stylist-only register templates: chapter job + scene beat.
 * No plot/must lists — Handlung bleibt locked; nur Haltung/Rhythmus.
 */
export function formatRegisterForStylist(input: {
  contract: NovelChapterContract | null | undefined;
  beat?: NovelSceneBeat | null;
}): string {
  const parts: string[] = [];
  if (hasChapterContract(input.contract)) {
    const craft = JOB_CRAFT[input.contract.job];
    const label = NOVEL_CHAPTER_JOB_LABELS[input.contract.job];
    parts.push(
      `## Kapitel-Register — Job ${input.contract.job} (${label})
${craft.blurb}
${craft.register.map((r) => `- ${r}`).join("\n")}
Kapitelende-Funktion (nur tonale Landung, keine neuen Ereignisse): ${input.contract.endingFunction}`,
    );
  }
  if (input.beat && isNovelSceneBeat(input.beat)) {
    const label = NOVEL_SCENE_BEAT_LABELS[input.beat];
    const reg = SCENE_BEAT_REGISTER[input.beat];
    parts.push(
      `## Szenen-Beat-Register — ${input.beat} (${label})
${SCENE_BEAT_BLURB[input.beat]}
${reg.map((r) => `- ${r}`).join("\n")}`,
    );
  }
  if (parts.length === 0) return "";
  return `Du polierst mit diesen Registern (Haltung/Rhythmus), ohne Plot oder Fakten zu ändern.

${parts.join("\n\n")}`;
}

/** Editor-facing checklist for review (full chapter — use at chapter_audit). */
export function formatContractForEditor(
  contract: NovelChapterContract | null | undefined,
): string {
  if (!hasChapterContract(contract)) {
    return "";
  }
  const craft = JOB_CRAFT[contract.job];
  const label = NOVEL_CHAPTER_JOB_LABELS[contract.job];
  return `Kapitel-Contract prüfen:
- Job ${contract.job} (${label}): ${craft.blurb}
- Register getroffen? ${craft.register.join(" · ")}
- Muss erfüllt? ${contract.must.join(" · ")}
- Darf-nicht verletzt? ${contract.mustNot.join(" · ")}
- Kapitelende erfüllt Funktion „${contract.endingFunction}“?
- Dialog ohne Kipp-Takt (kein Dauer-„Das war kein…“)?
- Schluss ohne verbrauchte Routine-Geste (Stift/Kladde/Terminal-Dimmen)?
Wenn Job, Register, Dialog-Schablone oder Schluss-Geste klar verfehlt → approved=false und Issue nennen.`;
}

/**
 * Per-scene logic audit: chapter `must` / endingFunction are chapter-wide.
 * Only fail a scene for contract.must if that obligation is owned by THIS
 * scene's manifest (mustShow/situations), or for clear mustNot contradictions.
 */
export function formatContractForSceneLogicAudit(input: {
  contract: NovelChapterContract | null | undefined;
  sceneIndex: number;
  sceneCountInChapter: number;
  beat?: string | null;
  manifestMustShow?: string[];
  manifestSituations?: string[];
}): string {
  if (!hasChapterContract(input.contract)) {
    return "";
  }
  const contract = input.contract;
  const craft = JOB_CRAFT[contract.job];
  const label = NOVEL_CHAPTER_JOB_LABELS[contract.job];
  const ownedHints = [
    ...(input.manifestMustShow ?? []),
    ...(input.manifestSituations ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const isLast =
    input.sceneCountInChapter > 0 &&
    input.sceneIndex >= input.sceneCountInChapter;
  return `Kapitel-Contract — SCOPE für DIESE Szene (Kap.-Szene ${input.sceneIndex}/${Math.max(1, input.sceneCountInChapter)}, Beat=${input.beat ?? "?"}):
- Job ${contract.job} (${label}): ${craft.blurb}
- Darf-nicht (HART — klarer Widerspruch → Fail): ${contract.mustNot.join(" · ") || "—"}
- Kapitel-Muss (GESAMT-Kapitel, über ALLE Szenen): ${contract.must.join(" · ") || "—"}
- Kapitelende-Funktion (nur letzte Szene prüfen): „${contract.endingFunction}“

REGELN (verbindlich):
1) Kapitel-Muss und endingFunction sind NICHT Pflicht in jeder Einzelszene.
2) Fail wegen eines Kapitel-Muss-Punkts NUR wenn dieser Punkt klar in mustShow/situations DIESER Szene verlangt wird — sonst IGNORIEREN (kommt in einer anderen Szene).
3) endingFunction nur in der letzten Kapitelszene prüfen${isLast ? " (diese Szene ist die letzte)" : " (diese Szene ist NICHT die letzte → endingFunction nicht abwerten)"}.
4) Paraphrasen zählen: Situation „betritt und prüft“ ist erfüllt, wenn der Text den Eintritt/Zugang und die Prüfung greifbar zeigt — kein Literal-Match auf Einzelwörter.
5) Diese Szene muss vor allem ihr eigenes Manifest (mustShow + situations) tragen.

Manifest-Pflichten dieser Szene (hier hart prüfen):
${ownedHints.map((h, i) => `${i + 1}. ${h}`).join("\n") || "(keine — nur mustNot/Wissen prüfen)"}`;
}

/**
 * Ending hint: contract endingFunction wins; else voice-card rotation fallback
 * (caller supplies fallback string).
 */
export function chapterEndingHint(
  contract: NovelChapterContract | null | undefined,
  fallback: string,
): string {
  if (hasChapterContract(contract)) return contract.endingFunction;
  return fallback;
}

export function isNovelSceneBeat(raw: unknown): raw is NovelSceneBeat {
  return (
    typeof raw === "string" &&
    (NOVEL_SCENE_BEATS as readonly string[]).includes(raw)
  );
}

export function formatSceneBeatTaxonomy(): string {
  return NOVEL_SCENE_BEATS.map((b) => {
    const reg = SCENE_BEAT_REGISTER[b].join("; ");
    return `- ${b}: ${SCENE_BEAT_BLURB[b]} | Register: ${reg}`;
  }).join("\n");
}

/** Normalize one scene row; unknown/missing beat → advance (or land if last). */
export function normalizeSceneBeat(
  raw: unknown,
  opts?: { isLast?: boolean },
): NovelSceneBeat {
  if (isNovelSceneBeat(raw)) return raw;
  if (typeof raw === "string") {
    const lower = raw.trim().toLowerCase();
    if (isNovelSceneBeat(lower)) return lower;
  }
  return opts?.isLast ? "land" : "advance";
}

/**
 * Normalize scene-plan rows: ensure beat enum + trim fields.
 * Optional `chain` forces beats onto the prescribed job sequence.
 */
export function normalizeScenePlan(
  scenes: unknown[],
  opts?: { chain?: NovelSceneBeat[] },
): ScenePlanBeat[] {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return opts?.chain?.length
      ? applyBeatChainToScenes([], opts.chain)
      : [];
  }
  const normalized = scenes.map((raw, i) => {
    const o =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const isLast = i === scenes.length - 1;
    const beat = normalizeSceneBeat(o.beat ?? o.sceneBeat, { isLast });
    const characters = Array.isArray(o.characters)
      ? o.characters.map((c) => String(c).trim()).filter(Boolean)
      : undefined;
    return {
      ...o,
      summary: String(o.summary ?? "").trim() || "Szene",
      location: o.location != null ? String(o.location).trim() : undefined,
      characters,
      beat,
    };
  });
  if (opts?.chain?.length) {
    return applyBeatChainToScenes(normalized, opts.chain);
  }
  return normalized;
}

/** Author block: numbered scenes with beat labels + register under the chapter job. */
export function formatScenePlanForAuthor(
  scenes: ScenePlanBeat[] | null | undefined,
): string {
  if (!scenes?.length) return "";
  const lines = scenes.map((s, i) => {
    const beat = s.beat ?? "advance";
    const label = NOVEL_SCENE_BEAT_LABELS[beat] ?? beat;
    const loc = s.location ? ` @ ${s.location}` : "";
    const who =
      s.characters?.length ? ` · ${s.characters.join(", ")}` : "";
    const reg = SCENE_BEAT_REGISTER[beat]
      .map((r) => `     · ${r}`)
      .join("\n");
    return `${i + 1}. [${beat}/${label}]${loc}${who}
   ${s.summary}
   Register:
${reg}`;
  });
  return `# Szenen-Beats (Unterstruktur zum Kapitel-Job)
Jede Szene erfüllt ihren Beat und ihr Register; der Kapitel-Job bleibt die Leitaufgabe.
Buchstimme bleibt (Stimmkarte); Register wechselt mit dem Beat.
Relief höchstens eine Szene und nie als Schluss, außer der Kapitel-Job ist comic.
Letzte Szene sollte land (oder turn/cost) Richtung Kapitelende sein.

${lines.join("\n")}`;
}

/** Editor: soft checklist that beats serve the chapter job. */
export function formatSceneBeatsForEditor(
  scenes: ScenePlanBeat[] | null | undefined,
): string {
  if (!scenes?.length) return "";
  const list = scenes
    .map((s, i) => {
      const beat = s.beat ?? "advance";
      const reg = SCENE_BEAT_REGISTER[beat][0] ?? "";
      return `  ${i + 1}. ${beat}: ${s.summary.slice(0, 80)} | Register: ${reg}`;
    })
    .join("\n");
  return `Szenen-Beats (müssen Kapitel-Job stützen; Register muss zur Beat-Haltung passen):
${list}
Wenn Beat-Sequenz missachtet, alle Szenen dieselbe Routine/Haltung wiederholen, Relief den Job frisst, oder Register falsch ist → Issue.`;
}
