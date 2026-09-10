/**
 * Free-tier story composer options (school stages instead of numeric ages).
 * Generation logic consumes these values; keep labels in sync with the UI.
 */

export const STORY_SCHOOL_STAGES = [
  { id: "vorschule", label: "Vorschule" },
  { id: "klasse_1", label: "1. Klasse" },
  { id: "klasse_2", label: "2. Klasse" },
  { id: "klasse_3", label: "3. Klasse" },
  { id: "klasse_4", label: "4. Klasse" },
  { id: "hoeher", label: "Höher" },
] as const;

export type StorySchoolStageId = (typeof STORY_SCHOOL_STAGES)[number]["id"];

/**
 * „Art der Geschichte“ is a genre choice (plot shape), not only tone.
 * `genreBrief` is injected into story prompts via `promptValueForMood`.
 * Keep exactly three genres — ids stay stable for DB (`lustig` / `spannend` / `motivierend`).
 */
export const STORY_MOODS = [
  {
    id: "lustig",
    label: "Lustig",
    genreBrief:
      "Schreibe eine Kindergeschichte als Komödie mit Klamauk: Missgeschicke, Quatsch-Dialoge, witzige Situationen und Lacher. Genre und Handlungsbogen: Situation → Missgeschick → Escalation → Auflösung mit Lachen. Kindgerecht, ohne gemeinen Humor.",
  },
  {
    id: "spannend",
    label: "Abenteuer",
    genreBrief:
      "Schreibe die Geschichte als Abenteuer: Hindernis oder Auftrag → Plan → Hindernisse auf dem Weg → Höhepunkt → Ankunft/Ziel. Spannung durch Vorankommen und Herausforderungen, nicht durch Angst. Ein Rätsel, Spuren oder eine Detektiv-Spur darf vorkommen, wenn es zum Thema passt — aber kein Pflicht-Krimi und kein reines Schuldetektiv-Format. Ohne echte Gewalt und ohne Angstmachen.",
  },
  {
    id: "motivierend",
    label: "Motivierend",
    genreBrief:
      "Schreibe die Geschichte als Wachstumsgeschichte: die Hauptfigur wächst an Herausforderungen, glaubt an sich, übt durch und schafft es. Genre und Handlungsbogen: Zweifel → Üben/Anlauf → Rückschlag → Durchbruch. Kraftvoll und ermutigend, nicht belehrend, kein Motivationscoach-Vortrag.",
  },
] as const;

export type StoryMoodId = (typeof STORY_MOODS)[number]["id"];

/** Label + genre brief for LLM placeholders (`{{story_mood}}`). */
export function promptValueForMood(mood: StoryMoodId): string {
  const entry = STORY_MOODS.find((item) => item.id === mood);
  if (!entry) {
    return mood;
  }
  return `${entry.label} — ${entry.genreBrief}`;
}

/**
 * Canonical theme chips (single Schlagwort) for freies Lesen.
 * Order in the UI depends on school stage — see `storyTopicsForSchoolStage`.
 */
export const STORY_TOP_TOPICS = [
  "Tiere",
  "Feuerwehr",
  "Drachen",
  "Dinos",
  "Quatsch",
  "Magie",
  "Freundschaft",
  "Detektive",
  "Märchen",
  "Natur",
  "Schule",
  "Superhelden",
  "Piraten",
  "Sport",
  "Musik",
  "Weltraum",
  "Grusel",
  "Reisen",
  "Roboter",
  "Gaming",
  "Zeitreisen",
] as const;

export type StoryTopTopic = (typeof STORY_TOP_TOPICS)[number];

/** @deprecated Prefer STORY_TOP_TOPICS */
export const TOPIC_EXAMPLES = STORY_TOP_TOPICS;

const TOPIC_ID_SET = new Set<string>(STORY_TOP_TOPICS);

export function isStoryTopTopic(value: unknown): value is StoryTopTopic {
  return typeof value === "string" && TOPIC_ID_SET.has(value);
}

/** Vorschule / 1. / 2. Klasse — younger-leaning order (20 topics). */
export const STORY_TOPICS_EARLY_ORDER = [
  "Tiere",
  "Feuerwehr",
  "Drachen",
  "Dinos",
  "Quatsch",
  "Magie",
  "Freundschaft",
  "Detektive",
  "Märchen",
  "Natur",
  "Schule",
  "Superhelden",
  "Piraten",
  "Sport",
  "Musik",
  "Weltraum",
  "Grusel",
  "Reisen",
  "Roboter",
  "Gaming",
] as const satisfies readonly StoryTopTopic[];

/** Ab 3. Klasse — older-leaning order (20 topics). */
export const STORY_TOPICS_LATER_ORDER = [
  "Gaming",
  "Detektive",
  "Quatsch",
  "Magie",
  "Schule",
  "Grusel",
  "Tiere",
  "Freundschaft",
  "Superhelden",
  "Sport",
  "Drachen",
  "Weltraum",
  "Roboter",
  "Dinos",
  "Natur",
  "Zeitreisen",
  "Piraten",
  "Reisen",
  "Musik",
  "Feuerwehr",
] as const satisfies readonly StoryTopTopic[];

/** How many chips before / after the „Mehr“ control. */
export const STORY_TOPIC_VISIBLE_COUNT = 10;

/**
 * Chips to render: first 10, or first 20 when expanded.
 * If collapsed but a later topic is selected, that chip stays visible.
 */
export function visibleStoryTopicsForSchoolStage(
  stage: StorySchoolStageId,
  options: { expanded: boolean; selected?: string | null },
): StoryTopTopic[] {
  const ordered = storyTopicsForSchoolStage(stage);
  const primary = ordered.slice(0, STORY_TOPIC_VISIBLE_COUNT);
  if (options.expanded) {
    return [...ordered.slice(0, STORY_TOPIC_VISIBLE_COUNT * 2)];
  }
  const selected = options.selected?.trim() ?? "";
  if (
    selected &&
    isStoryTopTopic(selected) &&
    !(primary as readonly string[]).includes(selected) &&
    (ordered as readonly string[]).includes(selected)
  ) {
    return [...primary, selected];
  }
  return [...primary];
}

type TopicAgeBand = "early" | "later";

export function topicAgeBandForStage(stage: StorySchoolStageId): TopicAgeBand {
  if (
    stage === "vorschule" ||
    stage === "klasse_1" ||
    stage === "klasse_2"
  ) {
    return "early";
  }
  return "later";
}

/** Ordered theme list for the selected school stage (ready for Top-10 + Mehr). */
export function storyTopicsForSchoolStage(
  stage: StorySchoolStageId,
): readonly StoryTopTopic[] {
  return topicAgeBandForStage(stage) === "early"
    ? STORY_TOPICS_EARLY_ORDER
    : STORY_TOPICS_LATER_ORDER;
}

/** First chip for a stage (default selection). */
export function defaultStoryTopicForSchoolStage(
  stage: StorySchoolStageId,
): StoryTopTopic {
  return storyTopicsForSchoolStage(stage)[0] ?? "Tiere";
}

/**
 * Keeps the current topic if it exists for the new stage; otherwise the stage default.
 */
export function coerceStoryTopicForSchoolStage(
  topic: string | null | undefined,
  stage: StorySchoolStageId,
): StoryTopTopic {
  const ordered = storyTopicsForSchoolStage(stage);
  if (topic && (ordered as readonly string[]).includes(topic)) {
    return topic as StoryTopTopic;
  }
  return defaultStoryTopicForSchoolStage(stage);
}

/** Age-band flavour hints for prompts (not shown on chips). */
const TOPIC_HINTS_EARLY: Partial<Record<StoryTopTopic, string>> = {
  Tiere: "Sprechende Tiere, Haus- und Waldtiere, Welpen",
  Feuerwehr: "Einsätze, Polizei, Rettungskräfte",
  Drachen: "Liebevolle Fabelwesen, Einhörner",
  Dinos: "Urzeit, Entdeckerlust, Urzeitmonster",
  Quatsch: "Lustige Missgeschicke, Reime, Slapstick",
  Magie: "Zauberei, Feen, Hexen-Lite",
  Freundschaft: "Zusammenhalt, Streit und Versöhnen",
  Detektive: "Rätselspuren, Suchbilder, kleine Spürnasen",
  Märchen: "Klassiker neu erzählt, Fabelwelten",
  Natur: "Waldabenteuer, Bauernhof, Jahreszeiten",
  Schule: "Schulanfang, Vorschul-Chaos, Klassenzimmer",
  Superhelden: "Stark sein, kleine Helden, Verwandlung",
  Piraten: "Schatzkisten, Meer, Schiffe",
  Sport: "Fahrradfahren, Bewegung, erste Vereine",
  Musik: "Lieder, Instrumente, Tanzen",
  Weltraum: "Mond, Raketen, Sterne",
  Grusel: "Harmloser Gespenstergrusel, Nacht-Abenteuer",
  Reisen: "Camping, Urlaub, Ausflüge",
  Roboter: "Smarte Spielzeuge, Erfindungen",
  Gaming: "Bunte Spielwelten, Pixel-Einsteiger",
};

const TOPIC_HINTS_LATER: Partial<Record<StoryTopTopic, string>> = {
  Gaming: "Minecraft, Roblox, Pixel- und VR-Abenteuer",
  Detektive: "Escape-Krimis, Rätsel-Fälle, Geheimbünde",
  Quatsch: "Tagebuch-Style, Schulchaos, Anti-Helden",
  Magie: "Magische Internate, Gestaltwandler, Kräfte",
  Schule: "Peinliche Momente, Klassenstreiche, Noten",
  Grusel: "Interaktive Gruselbücher, Geister, Thriller-Lite",
  Tiere: "Magische Tierbegleiter, Tierrettung, Wandler",
  Freundschaft: "Banden, erste Liebe, Mutproben",
  Superhelden: "Verborgene Kräfte, Sci-Fi-Helden",
  Sport: "Fußball-Turniere, Gaming-Esports, Teamgeist",
  Drachen: "Gefährliche Monster, Fantasy-Welten",
  Weltraum: "Aliens, Zukunft, Galaxien",
  Roboter: "Künstliche Intelligenz, Sci-Fi, Erfinder",
  Dinos: "Zeitreisen, Urzeit-Survival",
  Natur: "Survival, Wildnis-Wissen, Klima",
  Zeitreisen: "Altes Ägypten, Ritter, historische Fälle",
  Piraten: "Kaperfahrten, Insel-Abenteuer",
  Reisen: "Inseln, Abenteuer-Trips, Überleben",
  Musik: "Bands, Castings, Musikschulen",
  Feuerwehr: "Reale Heldentaten, Katastrophenschutz",
};

/**
 * Topic string for LLM placeholders: Schlagwort + age-appropriate flavour.
 */
export function promptValueForTopic(
  topic: string,
  stage: StorySchoolStageId,
): string {
  const trimmed = topic.trim();
  if (!trimmed) return trimmed;
  if (!isStoryTopTopic(trimmed)) return trimmed;
  const band = topicAgeBandForStage(stage);
  const hint =
    band === "early"
      ? TOPIC_HINTS_EARLY[trimmed]
      : TOPIC_HINTS_LATER[trimmed];
  return hint ? `${trimmed} (${hint})` : trimmed;
}

/**
 * Optional topic mix: Hauptthema (Schauplatz/Plot) + Nebenthema (Figur/Fähigkeit/Konflikt).
 * Exactly two themes — never add a third world.
 * UI labels/principles are written for kids & teens; plotBrief is for the LLM.
 */
export const STORY_TOPIC_MIX_PATTERNS = [
  {
    id: "crossover",
    label: "Rein gerutscht",
    shortLabel: "Zwei Welten",
    principle:
      "Etwas aus dem Nebenthema taucht plötzlich in der Welt des Hauptthemas auf — als wäre ein Portal aufgegangen.",
    example:
      "Gaming + Tiere: Ein echter Hund gerät über eine alte Konsole in ein Minecraft-ähnliches Spiel — oder ein Pixel-Begleiter „glitcht“ ins Kinderzimmer.",
    plotBrief:
      "Plotte die Geschichte so, dass ein klares Element des Nebenthemas unerwartet in der Welt des Hauptthemas erscheint (oder umgekehrt). Beide Welten bleiben erkennbar, aber es gibt genau eine Verschmelzung als Hook. Kindgerecht, übersichtlich, ein Schauplatz-Schwerpunkt.",
  },
  {
    id: "faehigkeit",
    label: "Super-Trick",
    shortLabel: "So knacke ich’s",
    principle:
      "Das Nebenthema gibt der Hauptfigur einen besonderen Trick oder ein Werkzeug — damit löst sie das Problem im Hauptthema.",
    example:
      "Detektive + Magie: Ein Schüler löst Schul-Krimis, weil er durch Tränke mit Schultieren sprechen kann, die alles beobachten.",
    plotBrief:
      "Plotte so, dass das Nebenthema die besondere Fähigkeit, das Werkzeug oder den Lösungs-Trick der Hauptfigur liefert — und das Hauptthema den Fall, das Ziel oder den Schauplatz. Die Fähigkeit löst den zentralen Konflikt. Keine zusätzlichen Magie-/Skill-Systeme.",
  },
  {
    id: "schauplatz",
    label: "Falsche Location",
    shortLabel: "Bekanntes woanders",
    principle:
      "Das vertraute Thema spielt an einem total überraschenden Ort — neue Kulisse, gleicher Kern.",
    example:
      "Dinos + Weltraum: Dinos sind nicht ausgestorben, sondern leben auf einem verborgenen Planeten und fliegen Raumschiffe.",
    plotBrief:
      "Plotte so, dass das Hauptthema die vertraute Figur/Idee bleibt und das Nebenthema die ungewöhnliche Kulisse oder Umgebung stellt (oder umgekehrt klar erkennbar). Ein starker Setting-Twist, sonst einfache Handlung. Keine weiteren Schauplatz-Wechsel.",
  },
  {
    id: "kontrast",
    label: "Gegenteam",
    shortLabel: "Müssen zusammen",
    principle:
      "Zwei totale Gegensätze müssen zusammenarbeiten — obwohl sie sich eigentlich auf die Nerven gehen.",
    example:
      "Quatsch + Grusel: Ein schreckhafter Spukgeist muss mit einem chaotischen Grundschüler zusammenarbeiten, um ein Versteckspiel zu gewinnen.",
    plotBrief:
      "Plotte ein Duo oder eine Partnerschaft aus Hauptthema und Nebenthema als Kontrast (Temperament, Stil oder Welt). Sie brauchen einander, um das Ziel zu erreichen. Humor und Wärme erlaubt — ohne echte Angst oder Gemeinheit.",
  },
] as const;

export type StoryTopicMixPatternId =
  (typeof STORY_TOPIC_MIX_PATTERNS)[number]["id"];

export function isStoryTopicMixPatternId(
  value: unknown,
): value is StoryTopicMixPatternId {
  return (
    typeof value === "string" &&
    STORY_TOPIC_MIX_PATTERNS.some((pattern) => pattern.id === value)
  );
}

export function storyTopicMixPatternById(
  id: StoryTopicMixPatternId,
): (typeof STORY_TOPIC_MIX_PATTERNS)[number] {
  return (
    STORY_TOPIC_MIX_PATTERNS.find((pattern) => pattern.id === id) ??
    STORY_TOPIC_MIX_PATTERNS[0]!
  );
}

/** Compact label for UI summary / library topic field. */
export function formatStoryTopicMixLabel(
  main: string,
  secondary: string,
): string {
  return `${main.trim()} + ${secondary.trim()}`;
}

export type StoryTopicSeedSource = "interest" | "experience";

/**
 * Human-readable “based on” line for library cards / detail
 * (Thema, Nebenthema, Interesse, Wunsch).
 */
export function formatStoryBasedOnLabel(input: {
  topic?: string | null;
  topicSecondary?: string | null;
  topicSeedSource?: StoryTopicSeedSource | null;
  personalMode?: boolean;
}): string | null {
  const topic = input.topic?.trim() || "";
  const secondary = input.topicSecondary?.trim() || "";
  if (!topic && !secondary) return null;

  if (input.topicSeedSource === "experience") {
    return topic ? `Wunsch: ${topic}` : "Wunsch";
  }
  if (input.topicSeedSource === "interest") {
    return topic ? `Interesse: ${topic}` : "Interesse";
  }
  if (input.personalMode) {
    return topic ? `Persönlich: ${topic}` : "Persönlich";
  }
  if (secondary && topic) {
    return `Thema: ${topic} · Nebenthema: ${secondary}`;
  }
  if (secondary) {
    return `Nebenthema: ${secondary}`;
  }
  return topic ? `Thema: ${topic}` : null;
}

/**
 * LLM topic value when mixing two themes with a named pattern.
 * Enforces the “max two themes” rule in the prompt text.
 */
export function promptValueForTopicMix(input: {
  main: string;
  secondary: string;
  patternId: StoryTopicMixPatternId;
  schoolStage: StorySchoolStageId;
}): string {
  const main = promptValueForTopic(input.main, input.schoolStage);
  const secondary = promptValueForTopic(input.secondary, input.schoolStage);
  const pattern = storyTopicMixPatternById(input.patternId);
  return [
    `Hauptthema (Schauplatz/Plot): ${main}`,
    `Nebenthema (Figur, Fähigkeit oder Konflikt): ${secondary}`,
    `Goldene Regel: Maximal diese zwei Themen mischen. Kein drittes Thema, keine weiteren Welten dazu erfinden. Keep it simple: 1 Schauplatz-Schwerpunkt + 1 Twist.`,
    `Mix-Muster „${pattern.label}“ — ${pattern.principle}`,
    pattern.plotBrief,
    `Beispiel nur zur Orientierung (nicht wörtlich übernehmen): ${pattern.example}`,
  ].join("\n");
}
