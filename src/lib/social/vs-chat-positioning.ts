/**
 * Positioning bank: leseno vs. free AI chat windows.
 * Full list for Social / later campaigns; landing shows a 6-card subset.
 * Not the same as MOTIVATION_ANGLES (reading-joy bank) — keep both.
 */

export type VsChatPositionId =
  | "lesen_nicht_prompten"
  | "altersgerecht"
  | "wissen_im_abenteuer"
  | "kind_im_zentrum"
  | "wiederkommen"
  | "schutzraum"
  | "regeln_drin"
  | "soziales_lesen"
  | "lust_statt_pflicht"
  | "tippen_kann_jeder";

export type VsChatPosition = {
  id: VsChatPositionId;
  /** Short card / Winkel title. */
  title: string;
  /** Landing-page body copy. */
  landingText: string;
  /** Crisp insight for captions / social. */
  insight: string;
  /** Image scene hint (English, same convention as motivation bank). */
  sceneHint: string;
};

/**
 * All ten arguments — archive and source of truth.
 * Prefer editing here; landing + social pick from this list.
 */
export const VS_CHAT_POSITIONS: VsChatPosition[] = [
  {
    id: "lesen_nicht_prompten",
    title: "Lesen, nicht Prompten",
    landingText:
      "leseno erzeugt eine Lesesituation: Stufe, Länge, Genre, Lesemodus — optional Silben und Vorlesen. Das Kind liest und taucht ein, statt einem Bot zu diktieren.",
    insight:
      "Ein Chatfenster liefert Text auf Zuruf — Lesen braucht Stufe, Raum und Fokus. Der Unterschied ist die Situation, nicht nur der Generator.",
    sceneHint:
      "Calm reading nook: child absorbed in a story book while a blurred laptop chat window sits unused in the background",
  },
  {
    id: "altersgerecht",
    title: "Altersgerecht von Haus aus",
    landingText:
      "Schulstufe steuert Sprache und Tiefe — bei Fakten, „Warum?“ und Hintergrund (am Ende unter Wissen). Kein Glückstreffer, ob der Text zu schwer, zu süßlich oder zu erwachsen wird.",
    insight:
      "„Irgendwie kindlich“ reicht nicht: Sprache und Tiefe müssen zur Lesestufe passen — sonst frustriert oder langweilt der Text.",
    sceneHint:
      "Parent adjusting a simple story setting while child reads comfortably at their level, warm cooperative kitchen table",
  },
  {
    id: "wissen_im_abenteuer",
    title: "Staunen ohne Schulstempel",
    landingText:
      "Echte Aha-Momente stecken mitten in der Geschichte. Nachfragen geht kindgerecht — ohne Lexikon-Ton und ohne dass Eltern jeden Fakt nachprompten müssen.",
    insight:
      "Wissen klebt besser, wenn es im Abenteuer mitschwimmt — Neugier statt Übungsblatt, Vertiefung auf Kind-Niveau.",
    sceneHint:
      "Child mid-story discovery glow: eyes wide at a wonder moment in the book, parent nearby smiling, no classroom vibe",
  },
  {
    id: "kind_im_zentrum",
    title: "Persönlich statt Prompt-Trick",
    landingText:
      "Meine Welt und Kind-Login: Interessen, Erlebnisse, eigener Einstieg. Die Geschichte dreht sich um dieses Kind — nicht um einen einmaligen Chat-Prompt mit dem Namen.",
    insight:
      "Nicht eine Geschichte über dein Kind — eine Geschichte für dein Kind, mit eigener Welt und eigenem Zugang.",
    sceneHint:
      "Child proudly in their own reading corner with personal touches, opening a story that feels made for them",
  },
  {
    id: "wiederkommen",
    title: "Wiederkommen statt Einmal-Wow",
    landingText:
      "Bücherei, Fortsetzen, Advent und Buchclub machen aus einer Geschichte ein Ritual. Morgen gibt’s die nächste — nicht nur einen verlorenen Chat-Thread.",
    insight:
      "Ein Wow im Chat verpufft. Wiederfinden, weitermachen und Rituale kleben stärker als ein einmaliger Prompt-Erfolg.",
    sceneHint:
      "Bookshelf or library corner ritual: child pulling out a favorite story again with eager routine energy",
  },
  {
    id: "schutzraum",
    title: "Klarer Weg statt offenem Chat",
    landingText:
      "Thema wählen, Geschichte lesen — ein klarer Weg. Weniger Verhandlung, weniger Überraschungen, mehr Schutzraum fürs Kind.",
    insight:
      "Thema wählen und lesen — ohne Nebenchats, ohne unvorhersehbare Abzweigungen. Schutzraum schlägt Prompt-Lotterie.",
    sceneHint:
      "Focused path visual: child and parent on a simple story journey from topic choice to cozy reading, no cluttered screens",
  },
  {
    id: "regeln_drin",
    title: "Die Regeln sind schon drin",
    landingText:
      "Eltern müssen nicht jedes Mal nachjustieren. Kindgerechtigkeit und Lesbarkeit sind Produkt — ruhig und verlässlich im Alltag.",
    insight:
      "Du wählst Thema und Stufe. Die Regeln für Kindgerechtigkeit und Lesbarkeit sind schon drin — nicht erst im nächsten Prompt.",
    sceneHint:
      "Relaxed parent pouring tea while child reads independently, calm trust that the story path is already safe and fit",
  },
  {
    id: "soziales_lesen",
    title: "Lesen darf geteilt werden",
    landingText:
      "Im Buchclub Geschichten freigeben und liken — Lesen als gemeinsame Sache, nicht als einsamer Bot-Output zum Screenshot.",
    insight:
      "Geschichten darf man teilen und feiern — nicht nur einmal vorlesen und wegwischen.",
    sceneHint:
      "Two kids or friends sharing a glowing story moment on a sofa, laughter and connection, lived-in living room",
  },
  {
    id: "lust_statt_pflicht",
    title: "Lust statt Pflicht",
    landingText:
      "Kein Ersatz für Schule und kein Druck-Tool. Geschichten, die Kinder lesen wollen — Zugang über Spaß, nicht über Abhaken.",
    insight:
      "Freude ist der Eingang zum Lesen. Pflicht allein endet, sobald niemand mehr zuschaut — Lust bleibt.",
    sceneHint:
      "Joyful reading without checklist energy: child diving into a story for fun, shoes kicked off, pure leisure",
  },
  {
    id: "tippen_kann_jeder",
    title: "Tippen kann jeder",
    landingText:
      "Kostenlos Text erzeugen ist leicht. Verlässlich kindgerecht lesen lassen — vorhersehbar, wiederholbar, ohne Prompt-Lotterie — ist der Unterschied.",
    insight:
      "Kostenlos Text erzeugen ist leicht. Verlässlich kindgerecht lesen lassen — mit Lust statt Pflicht — ist das eigentliche Produkt.",
    sceneHint:
      "Joyful reading moment outdoors or on a sofa: child laughing into a story, phone face-down nearby, pure leisure",
  },
];

/**
 * Six cards for the landing grid (2×3). Order = display order.
 */
export const VS_CHAT_LANDING_IDS: readonly VsChatPositionId[] = [
  "lesen_nicht_prompten",
  "altersgerecht",
  "kind_im_zentrum",
  "wiederkommen",
  "schutzraum",
  "regeln_drin",
] as const;

export function vsChatPositionsForLanding(): VsChatPosition[] {
  return VS_CHAT_LANDING_IDS.map((id) => {
    const row = VS_CHAT_POSITIONS.find((entry) => entry.id === id);
    if (!row) {
      throw new Error(`VS_CHAT_LANDING_IDS: missing position „${id}“.`);
    }
    return row;
  });
}

export function getVsChatPositionById(
  id: string,
): VsChatPosition | null {
  const key = id.trim();
  if (!key) return null;
  return VS_CHAT_POSITIONS.find((entry) => entry.id === key) ?? null;
}
