/**
 * Publisher/editorial controls for the roman pipeline:
 * target length, age band, series/Mehrteiler, validation checklist.
 */

import type { RomanCharakter, RomanSzenenRasterItem, Szene } from "@/lib/roman/types";

export type RomanMehrteilerForm = "unbekannt" | "einzelband" | "duologie" | "trilogie" | "serie";

export type RomanEditorialChecklist = {
  ideeKlar: boolean;
  fundamentVoll: boolean;
  regelnHart: boolean;
  umfangGesetzt: boolean;
  outlineGeprueft: boolean;
  roadmapGeprueft: boolean;
  stilStichprobe: boolean;
  coverOk: boolean;
  vorsatzOk: boolean;
  readyToPublish: boolean;
};

export type RomanEditorial = {
  zielAlterMin: number | null;
  zielAlterMax: number | null;
  lesestufe: string;
  zielWortzahlRoman: number | null;
  zielWortzahlSzeneMin: number | null;
  zielWortzahlSzeneMax: number | null;
  serieTitel: string;
  bandNr: number | null;
  mehrteilerForm: RomanMehrteilerForm;
  mehrteilerNotizen: string;
  /** Last AI Mehrteiler advice (editable). */
  mehrteilerBeratung: string;
  /** Hard “Verlagsregeln” beyond free-text kiRegelwerk (bullets). */
  harteRegeln: string[];
  /** Legacy editorial sign-off flags (kept in jsonb; UI uses auto validation only). */
  checklist: RomanEditorialChecklist;
};

export const DEFAULT_EDITORIAL_CHECKLIST: RomanEditorialChecklist = {
  ideeKlar: false,
  fundamentVoll: false,
  regelnHart: false,
  umfangGesetzt: false,
  outlineGeprueft: false,
  roadmapGeprueft: false,
  stilStichprobe: false,
  coverOk: false,
  vorsatzOk: false,
  readyToPublish: false,
};

export function emptyRomanEditorial(): RomanEditorial {
  return {
    zielAlterMin: null,
    zielAlterMax: null,
    lesestufe: "",
    zielWortzahlRoman: null,
    zielWortzahlSzeneMin: 1800,
    zielWortzahlSzeneMax: 2500,
    serieTitel: "",
    bandNr: null,
    mehrteilerForm: "unbekannt",
    mehrteilerNotizen: "",
    mehrteilerBeratung: "",
    harteRegeln: [],
    checklist: { ...DEFAULT_EDITORIAL_CHECKLIST },
  };
}

/**
 * Built-in publisher presets (hardcoded editorial starting points — not AI-generated).
 * Apply via UI selects in Schritt 3 (Alter/Umfang) and Schritt 4 (Genre-Regeln).
 */
export type RomanPresetKind = "alter" | "genre";

export type RomanEditorialPreset = {
  id: string;
  kind: RomanPresetKind;
  label: string;
  /** Short note shown under the select. */
  hint: string;
  apply: Partial<RomanEditorial>;
};

export const ROMAN_ALTER_PRESETS: RomanEditorialPreset[] = [
  {
    id: "bilderbuch-3-6",
    kind: "alter",
    label: "Bilderbuch / Vorlesen (3–6)",
    hint: "Sehr kurze Kapitel, Vorlesen, einfache Wörter · ca. 1.500–5.000 Wörter.",
    apply: {
      zielAlterMin: 3,
      zielAlterMax: 6,
      lesestufe: "Bilderbuch / Vorlesen",
      zielWortzahlRoman: 3_000,
      zielWortzahlSzeneMin: 200,
      zielWortzahlSzeneMax: 500,
    },
  },
  {
    id: "kinder-6-8",
    kind: "alter",
    label: "Erstleser / Kinderbuch (6–8)",
    hint: "Kurze Sätze, bekannte Wörter · ca. 8.000–18.000 Wörter.",
    apply: {
      zielAlterMin: 6,
      zielAlterMax: 8,
      lesestufe: "Erstleser / einfaches Kinderbuch",
      zielWortzahlRoman: 12_000,
      zielWortzahlSzeneMin: 600,
      zielWortzahlSzeneMax: 1_200,
    },
  },
  {
    id: "kinder-8-10",
    kind: "alter",
    label: "Kinderbuch (8–10)",
    hint: "Vorlesen & erstes Selbstlesen · ca. 20.000–35.000 Wörter.",
    apply: {
      zielAlterMin: 8,
      zielAlterMax: 10,
      lesestufe: "Kinderbuch / Vorlesen & erstes Selbstlesen",
      zielWortzahlRoman: 28_000,
      zielWortzahlSzeneMin: 1_200,
      zielWortzahlSzeneMax: 2_000,
    },
  },
  {
    id: "jugend-11-14",
    kind: "alter",
    label: "Mittelstufe / YA light (11–14)",
    hint: "Mehr Tempo und Konflikt, noch zugänglich · ca. 40.000–70.000 Wörter.",
    apply: {
      zielAlterMin: 11,
      zielAlterMax: 14,
      lesestufe: "Jugendbuch / Mittelstufe",
      zielWortzahlRoman: 55_000,
      zielWortzahlSzeneMin: 1_500,
      zielWortzahlSzeneMax: 2_500,
    },
  },
  {
    id: "ya-14-18",
    kind: "alter",
    label: "Young Adult (14–18)",
    hint: "Vollständige Romanstruktur, starke Stimme · ca. 60.000–90.000 Wörter.",
    apply: {
      zielAlterMin: 14,
      zielAlterMax: 18,
      lesestufe: "Young Adult",
      zielWortzahlRoman: 75_000,
      zielWortzahlSzeneMin: 1_800,
      zielWortzahlSzeneMax: 2_800,
    },
  },
  {
    id: "erwachsen",
    kind: "alter",
    label: "Erwachsene / allgemein",
    hint: "Keine Altersbegrenzung der Sprache · typisch 70.000–110.000 Wörter.",
    apply: {
      zielAlterMin: 18,
      zielAlterMax: null,
      lesestufe: "Erwachsene / allgemeine Belletristik",
      zielWortzahlRoman: 90_000,
      zielWortzahlSzeneMin: 1_800,
      zielWortzahlSzeneMax: 2_800,
    },
  },
];

export const ROMAN_GENRE_RULE_PRESETS: RomanEditorialPreset[] = [
  {
    id: "regeln-kinderbuch",
    kind: "genre",
    label: "Kinderbuch",
    hint: "Kindgerechte Sprache, Haken, kein Zynismus.",
    apply: {
      harteRegeln: [
        "Wortwahl und Satzlänge an die gesetzte Lesestufe halten — kurze Sätze, bekannte Wörter.",
        "Kein Erwachsenen-Feuilleton, keine Schachtelsätze, keine Fachsprache.",
        "Humor und Spannung kindgerecht — nie zynisch oder grausam.",
        "Jedes Kapitel endet mit einem klaren dramatischen oder emotionalen Haken.",
      ],
    },
  },
  {
    id: "regeln-ya",
    kind: "genre",
    label: "Young Adult",
    hint: "Stimme, Identifikation, Tempo — ohne Kinderton.",
    apply: {
      harteRegeln: [
        "Protagonist:innen-Stimme glaubwürdig für die Zielaltersgruppe — kein Kinderton, kein belehrender Erwachsenenton.",
        "Emotionale Ehrlichkeit vor Floskeln; innere Konflikte zeigen, nicht erklären.",
        "Tempo halten: jede Szene verändert Beziehung, Wissen oder Risiko.",
        "Keine moralischen Vorträge; Themen durch Handlung und Dialog tragen.",
      ],
    },
  },
  {
    id: "regeln-thriller",
    kind: "genre",
    label: "Thriller / Spannung",
    hint: "Information dosieren, Cliffhanger, Glaubwürdigkeit.",
    apply: {
      harteRegeln: [
        "Information dosieren: Leser:in weiß nie deutlich mehr oder weniger als dramaturgisch nötig.",
        "Jede Szene erhöht Risiko, Druck oder Rätsel — kein Leerlauf.",
        "Kapitelenden mit Haken (Frage, Drohung, Entdeckung), ohne billige Cliffhanger-Wiederholung.",
        "Motive und Logik der Antagonist:innen glaubwürdig halten — kein Plot-Convenience.",
      ],
    },
  },
  {
    id: "regeln-fantasy",
    kind: "genre",
    label: "Fantasy / Spekulativ",
    hint: "Weltregeln konsistent, Exposition sparsam.",
    apply: {
      harteRegeln: [
        "Weltregeln (Magie, Technologie, Gesellschaft) konsistent einhalten — kein Regelbruch ohne Preis.",
        "Exposition sparsam und szenisch: zeigen statt Weltbau-Vortrag.",
        "Eigennamen und Begriffe dosieren; Leser:in nicht mit Glossar erschlagen.",
        "Wunder und Gefahr emotional verankern — nicht nur spekulativ dekorieren.",
      ],
    },
  },
  {
    id: "regeln-romance",
    kind: "genre",
    label: "Romance / Liebesgeschichte",
    hint: "Chemie, Konflikt, Consent, emotionale Beats.",
    apply: {
      harteRegeln: [
        "Romantische Chemie und Konflikt in jeder relevanten Szene spürbar machen.",
        "Consent und emotionale Grenzen klar — kein „Überreden“ als Romantik.",
        "Missverständnisse nur, wenn motiviert; kein künstliches Auseinanderreißen.",
        "Intimität und Nähe zum Ton und zur Altersstufe passend dosieren.",
      ],
    },
  },
  {
    id: "regeln-literary",
    kind: "genre",
    label: "Literarisch / Character-driven",
    hint: "Stimme, Subtext, keine Genre-Pflicht-Plotpunkte.",
    apply: {
      harteRegeln: [
        "Stimme und Subtext vor Plot-Pflichtpunkten — keine Schema-F-Wendungen.",
        "Jedes Bild und jede Metapher muss zur etablierten Tonalität passen.",
        "Dialog trägt Charakter und Machtverhältnis, nicht nur Information.",
        "Emotion unter der Oberfläche lassen — Show, don’t tell, ohne Kälte.",
      ],
    },
  },
];

/** @deprecated Use ROMAN_ALTER_PRESETS / ROMAN_GENRE_RULE_PRESETS. */
export function kidsBookEditorialPreset(): Partial<RomanEditorial> {
  const alter = ROMAN_ALTER_PRESETS.find((p) => p.id === "kinder-8-10")!.apply;
  const rules = ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === "regeln-kinderbuch")!.apply;
  return { ...alter, ...rules };
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function asForm(value: unknown): RomanMehrteilerForm {
  if (
    value === "einzelband" ||
    value === "duologie" ||
    value === "trilogie" ||
    value === "serie" ||
    value === "unbekannt"
  ) {
    return value;
  }
  return "unbekannt";
}

/** Parse DB jsonb → editorial (tolerant). */
export function parseRomanEditorial(raw: unknown): RomanEditorial {
  const base = emptyRomanEditorial();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const checklistRaw =
    row.checklist && typeof row.checklist === "object"
      ? (row.checklist as Record<string, unknown>)
      : {};
  const harte =
    Array.isArray(row.harteRegeln)
      ? row.harteRegeln.map((x) => String(x).trim()).filter(Boolean)
      : base.harteRegeln;

  return {
    zielAlterMin: asInt(row.zielAlterMin),
    zielAlterMax: asInt(row.zielAlterMax),
    lesestufe: String(row.lesestufe ?? "").trim(),
    zielWortzahlRoman: asInt(row.zielWortzahlRoman),
    zielWortzahlSzeneMin: asInt(row.zielWortzahlSzeneMin) ?? 1800,
    zielWortzahlSzeneMax: asInt(row.zielWortzahlSzeneMax) ?? 2500,
    serieTitel: String(row.serieTitel ?? "").trim(),
    bandNr: asInt(row.bandNr),
    mehrteilerForm: asForm(row.mehrteilerForm),
    mehrteilerNotizen: String(row.mehrteilerNotizen ?? "").trim(),
    mehrteilerBeratung: String(row.mehrteilerBeratung ?? "").trim(),
    harteRegeln: harte,
    checklist: {
      ideeKlar: Boolean(checklistRaw.ideeKlar),
      fundamentVoll: Boolean(checklistRaw.fundamentVoll),
      regelnHart: Boolean(checklistRaw.regelnHart),
      umfangGesetzt: Boolean(checklistRaw.umfangGesetzt),
      outlineGeprueft: Boolean(checklistRaw.outlineGeprueft),
      roadmapGeprueft: Boolean(checklistRaw.roadmapGeprueft),
      stilStichprobe: Boolean(checklistRaw.stilStichprobe),
      coverOk: Boolean(checklistRaw.coverOk),
      vorsatzOk: Boolean(checklistRaw.vorsatzOk),
      readyToPublish: Boolean(checklistRaw.readyToPublish),
    },
  };
}

/** Approximate German word count (whitespace tokens). */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function formatWordCount(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

export type RomanValidationItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  stage: "idee" | "fundament" | "regeln" | "umfang" | "outline" | "roadmap" | "schreiben" | "abschluss";
};

/**
 * Computed publisher gate — soft guidance, does not block saves.
 */
export function buildRomanValidation(input: {
  title: string;
  praemisse: string;
  genre: string;
  tonalitaet: string;
  stilbibel: string;
  kiRegelwerk: string;
  manuskriptRaw: string;
  charaktere: RomanCharakter[];
  szenenRaster: RomanSzenenRasterItem[];
  szenen: Szene[];
  hasCover: boolean;
  hasVorsatz: boolean;
  editorial: RomanEditorial;
}): RomanValidationItem[] {
  const e = input.editorial;
  const hasChars = input.charaktere.some((c) => c.name.trim() && c.motivation.trim());
  const hasOutline = input.manuskriptRaw.trim().length >= 200;
  const hasRoadmap = input.szenen.length > 0;
  const completed = input.szenen.filter((s) => s.status === "COMPLETED").length;
  const revisedWords = input.szenen
    .filter((s) => s.status === "COMPLETED")
    .reduce((sum, s) => sum + countWords(s.entwurfRevidiert), 0);
  const ageSet = e.zielAlterMin != null || e.zielAlterMax != null || e.lesestufe.trim().length > 0;
  const lengthSet =
    e.zielWortzahlRoman != null ||
    (e.zielWortzahlSzeneMin != null && e.zielWortzahlSzeneMax != null);
  const rulesStrong =
    input.kiRegelwerk.trim().length >= 40 ||
    input.stilbibel.trim().length >= 40 ||
    e.harteRegeln.length > 0;

  return [
    {
      id: "titel",
      stage: "idee",
      label: "Arbeitstitel",
      ok: input.title.trim().length >= 2,
      hint: "Titel festlegen.",
    },
    {
      id: "praemisse",
      stage: "fundament",
      label: "Prämisse / Logline",
      ok: input.praemisse.trim().length >= 20,
      hint: "Wer? Ziel? Konflikt in 1–2 Sätzen.",
    },
    {
      id: "genre-ton",
      stage: "fundament",
      label: "Genre + Tonalität",
      ok: input.genre.trim().length >= 2 && input.tonalitaet.trim().length >= 5,
      hint: "Ton muss romanweit greifbar sein.",
    },
    {
      id: "figuren",
      stage: "fundament",
      label: "Figuren mit Motivation",
      ok: hasChars,
      hint: "Mindestens eine Figur mit Ziel/Motivation.",
    },
    {
      id: "regeln",
      stage: "regeln",
      label: "Harte Verlagsregeln / Stilbibel",
      ok: rulesStrong,
      hint: "Regelwerk oder Stilbibel oder harte Regeln setzen.",
    },
    {
      id: "alter",
      stage: "umfang",
      label: "Zielalter / Lesestufe",
      ok: ageSet,
      hint: "z. B. 8–10 Jahre — steuert Sprache verbindlich.",
    },
    {
      id: "laenge",
      stage: "umfang",
      label: "Zielumfang (Roman/Szene)",
      ok: lengthSet,
      hint: "Wortzahl-Ziele für Band und Szene setzen.",
    },
    {
      id: "outline",
      stage: "outline",
      label: "Outline / Exposé vorhanden",
      ok: hasOutline,
      hint: "Mind. ca. 200 Zeichen Outline — danach selbst gegenlesen.",
    },
    {
      id: "roadmap",
      stage: "roadmap",
      label: "Szenen-Roadmap",
      ok: hasRoadmap,
      hint: "Phase 0 ausführen und Briefings spot-checken.",
    },
    {
      id: "schreiben",
      stage: "schreiben",
      label: "Szenen geschrieben",
      ok: hasRoadmap ? completed >= Math.min(3, input.szenen.length) : false,
      hint: `${completed}/${input.szenen.length || "?"} Szenen COMPLETED · ${formatWordCount(revisedWords)} Wörter.`,
    },
    {
      id: "cover",
      stage: "abschluss",
      label: "Cover",
      ok: input.hasCover,
      hint: "Cover erzeugen und speichern.",
    },
    {
      id: "vorsatz",
      stage: "abschluss",
      label: "Vorsatz / Buchrücken",
      ok: input.hasVorsatz,
      hint: "Front Matter erzeugen und speichern.",
    },
  ];
}

/**
 * MUST block for prompts: age, length, series, hard rules.
 */
export function buildEditorialMustBlock(editorial: RomanEditorial): string {
  const lines: string[] = [];
  if (editorial.zielAlterMin != null || editorial.zielAlterMax != null) {
    const a =
      editorial.zielAlterMin != null && editorial.zielAlterMax != null
        ? `${editorial.zielAlterMin}–${editorial.zielAlterMax} Jahre`
        : editorial.zielAlterMin != null
          ? `ab ${editorial.zielAlterMin} Jahre`
          : `bis ${editorial.zielAlterMax} Jahre`;
    lines.push(`Zielalter (verbindlich): ${a}`);
  }
  if (editorial.lesestufe.trim()) {
    lines.push(`Lesestufe (verbindlich): ${editorial.lesestufe.trim()}`);
  }
  if (editorial.zielWortzahlSzeneMin != null || editorial.zielWortzahlSzeneMax != null) {
    lines.push(
      `Szenenlänge (Ziel): ${editorial.zielWortzahlSzeneMin ?? "?"}–${editorial.zielWortzahlSzeneMax ?? "?"} Wörter.`,
    );
  }
  if (editorial.zielWortzahlRoman != null) {
    lines.push(
      `Roman-Zielumfang: ca. ${formatWordCount(editorial.zielWortzahlRoman)} Wörter gesamt.`,
    );
  }
  if (editorial.serieTitel.trim() || editorial.mehrteilerForm !== "unbekannt") {
    const band =
      editorial.bandNr != null ? ` · Band ${editorial.bandNr}` : "";
    lines.push(
      `Reihe/Mehrteiler: ${editorial.serieTitel.trim() || "ohne Serientitel"} (${editorial.mehrteilerForm})${band}`,
    );
  }
  if (editorial.mehrteilerNotizen.trim()) {
    lines.push(`Mehrteiler-Notizen:\n${editorial.mehrteilerNotizen.trim()}`);
  }
  if (editorial.harteRegeln.length) {
    lines.push(
      `Harte Verlagsregeln:\n${editorial.harteRegeln.map((r) => `– ${r}`).join("\n")}`,
    );
  }
  if (!lines.length) return "";
  return `## MUSS — Verlag / Umfang / Zielgruppe (verbindlich)
${lines.join("\n")}

Bei Konflikt mit „literarischer“ Eleganz gewinnen Zielalter, Umfang und harte Regeln.`;
}

export const MEHRTEILER_FORM_LABELS: Record<RomanMehrteilerForm, string> = {
  unbekannt: "Noch offen",
  einzelband: "Einzelband",
  duologie: "Duologie (2 Bände)",
  trilogie: "Trilogie (3 Bände)",
  serie: "Offene Serie / Mehrteiler",
};
