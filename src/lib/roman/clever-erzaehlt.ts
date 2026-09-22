/**
 * Clever erzählt: create-time age band + story length, Top-20 topics,
 * and prompt briefs for Erzähler / Wissenssammler.
 */

import {
  type RomanEditorial,
  buildBasisRegeln,
} from "@/lib/roman/editorial";

/** Story length chosen at book create (drives Erzähler length + style). */
export type CleverGeschichteMinuten = 5 | 10;

export type CleverAlterOption = {
  id: string;
  /** UI label including length. */
  label: string;
  zielAlterMin: number;
  zielAlterMax: number;
  geschichteMinuten: CleverGeschichteMinuten;
  /** Target words per Kurzgeschichte. */
  wortMin: number;
  wortMax: number;
  lesestufe: string;
  /** Narrative style the Erzähler must follow. */
  erzaehlstil: string;
};

/**
 * Age band + story length are one choice at create time.
 * Prompt must follow `geschichteMinuten` / style — not invent length from age alone.
 */
export const CLEVER_ALTER_OPTIONS: readonly CleverAlterOption[] = [
  {
    id: "clever-8-10-5min",
    label: "8–10 Jahre · ca. 5-Min-Geschichten",
    zielAlterMin: 8,
    zielAlterMax: 10,
    geschichteMinuten: 5,
    wortMin: 500,
    wortMax: 700,
    lesestufe: "Kinderbuch / Vorlesen & erstes Selbstlesen",
    erzaehlstil:
      "Kurze Sätze, bekannte Wörter, starkes Vorlesen-Tempo; ein kleines Abenteuer mit klarer Handlungsschleife; Humor und Neugier; Fakten werden erlebt, nicht dozieren.",
  },
  {
    id: "clever-10-12-10min",
    label: "10–12 Jahre · ca. 10-Min-Geschichten",
    zielAlterMin: 10,
    zielAlterMax: 12,
    geschichteMinuten: 10,
    wortMin: 900,
    wortMax: 1_300,
    lesestufe: "Kinderbuch / Selbstlesen",
    erzaehlstil:
      "Selbstlese-tauglich: Abenteuer mit Eigenantrieb der Figuren, Raum für Rätsel oder Entdeckung; klarer Spannungsbogen; Fakten werden im Abenteuer erlebt, ohne Lehrbuch-Ton.",
  },
] as const;

/** Top topics kids typically care about — keyed by Clever alter option id. */
export const CLEVER_TOP_THEMEN: Record<string, readonly string[]> = {
  "clever-8-10-5min": [
    "Dinosaurier",
    "Weltall & Planeten",
    "Haustiere",
    "Wilde Tiere",
    "Haie & Ozean",
    "Vulkane",
    "Ritter & Burgen",
    "Piraten",
    "Feuerwehr & Rettung",
    "Wetter & Stürme",
    "Insekten & Spinnen",
    "Roboter zum Anfassen",
    "Fossilien & Ausgrabungen",
    "Körper & Sinne",
    "Wald & Bäume",
    "Bienen & Honig",
    "Mond & Sterne",
    "Züge & Fahrzeuge",
    "Magnete & Strom (einfach)",
    "Steinzeit & frühe Menschen",
  ],
  "clever-10-12-10min": [
    "Weltraumforschung & Mondlandung",
    "Computer & KI (altersgerecht)",
    "Klima & Umwelt",
    "Antikes Ägypten",
    "Römer & Antike",
    "Evolution (einfach erklärt)",
    "Tiefsee & Meeresbiologie",
    "Vulkane & Plattentektonik",
    "Chemie im Alltag",
    "Herz, Blut & Immunsystem",
    "Kriminalistik & Spuren",
    "Geschichte des Fliegens",
    "Große Erfindungen",
    "Schwarze Löcher (light)",
    "Griechische Mythen meets Wissen",
    "Internet & digitale Welt",
    "Gehirn & Gefühle",
    "Nachhaltigkeit & Recycling",
    "Sport & Körper",
    "Geld & Wirtschaft (einfach)",
  ],
};

export function cleverAlterOptionById(
  id: string,
): CleverAlterOption | undefined {
  return CLEVER_ALTER_OPTIONS.find((o) => o.id === id);
}

export function topThemenForCleverAlter(alterOptionId: string): readonly string[] {
  return CLEVER_TOP_THEMEN[alterOptionId] ?? [];
}

export function asCleverGeschichteMinuten(
  value: unknown,
): CleverGeschichteMinuten | null {
  if (value === 5 || value === 10) return value;
  if (value === "5") return 5;
  if (value === "10") return 10;
  return null;
}

/**
 * MUSS brief for Erzähler / Wissens-Rollen from stored editorial.
 */
export function formatCleverGeschichteBrief(
  editorial: Pick<
    RomanEditorial,
    | "cleverGeschichteMinuten"
    | "zielAlterMin"
    | "zielAlterMax"
    | "zielWortzahlSzeneMin"
    | "zielWortzahlSzeneMax"
    | "lesestufe"
  >,
): string {
  const min = editorial.cleverGeschichteMinuten;
  if (min !== 5 && min !== 10) return "";
  const opt = CLEVER_ALTER_OPTIONS.find(
    (o) =>
      o.geschichteMinuten === min &&
      o.zielAlterMin === editorial.zielAlterMin &&
      o.zielAlterMax === editorial.zielAlterMax,
  );
  const wortMin = editorial.zielWortzahlSzeneMin ?? opt?.wortMin ?? (min === 5 ? 500 : 900);
  const wortMax = editorial.zielWortzahlSzeneMax ?? opt?.wortMax ?? (min === 5 ? 700 : 1300);
  const stil = opt?.erzaehlstil ?? "";
  const alter =
    editorial.zielAlterMin != null && editorial.zielAlterMax != null
      ? `${editorial.zielAlterMin}–${editorial.zielAlterMax} Jahre`
      : "Zielalter laut Buch";
  return [
    `Kurzgeschichten-Länge (verbindlich): ca. ${min} Minuten Vorlese-/Lesezeit (Richtwert ${wortMin}–${wortMax} Wörter).`,
    `Zielalter: ${alter}.`,
    stil ? `Erzählstil (verbindlich): ${stil}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build editorial + genre seed from Clever create form.
 */
export function buildCleverCreateEditorial(input: {
  alterOptionId: string;
  thema: string;
}): {
  editorial: Partial<RomanEditorial>;
  genre: string;
  grobRegeln: string;
} {
  const opt = cleverAlterOptionById(input.alterOptionId);
  if (!opt) {
    throw new Error("Altersgruppe wählen.");
  }
  const thema = input.thema.trim();
  if (thema.length < 2) {
    throw new Error("Thema angeben oder aus der Liste wählen.");
  }

  const partial: Partial<RomanEditorial> = {
    buchTyp: "clever_erzaehlt",
    zielAlterMin: opt.zielAlterMin,
    zielAlterMax: opt.zielAlterMax,
    lesestufe: opt.lesestufe,
    cleverGeschichteMinuten: opt.geschichteMinuten,
    zielWortzahlSzeneMin: opt.wortMin,
    zielWortzahlSzeneMax: opt.wortMax,
    zielWortzahlRoman: opt.geschichteMinuten === 5 ? 12_000 : 15_000,
    ideeKurz: `Wissensgebiet / Thema: ${thema}.\nDas Buch erzählt dieses Gebiet in mehreren Kurzgeschichten (je ca. ${opt.geschichteMinuten} Min.).`,
  };

  const grobRegeln = buildBasisRegeln({
    buchTyp: "clever_erzaehlt",
    genre: thema,
    alterPresetId:
      opt.zielAlterMin === 8 ? "kinder-8-10" : "kinder-10-12",
    zielWortzahlRoman: partial.zielWortzahlRoman ?? "",
  });

  return {
    editorial: {
      ...partial,
      grobRegeln,
      harteRegeln: [
        `Kurzgeschichte ca. ${opt.geschichteMinuten} Minuten (${opt.wortMin}–${opt.wortMax} Wörter) — Länge und Erzählstil der Buch-Auswahl einhalten.`,
        `Thema „${thema}“ ist verbindlich; jede Geschichte ist ein Wissens-Abenteuer. Abenteuer-Wissen (Fakten) und Infografik erscheinen separat — Export-Reihenfolge: Prosa → Infografik → Faktenliste.`,
      ],
    },
    genre: thema,
    grobRegeln,
  };
}
