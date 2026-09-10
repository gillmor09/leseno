/**
 * Shared reading motivation content for /motivation and social caption generation.
 * Source of truth: manifesto + angle bank (admin picks one Winkel per post).
 * Positioning vs. free chat: also `vs-chat-positioning.ts` (merged into selectable angles).
 */

import {
  VS_CHAT_POSITIONS,
  type VsChatPositionId,
} from "@/lib/social/vs-chat-positioning";

export type MotivationTheme =
  | "entwicklung"
  | "spass"
  | "schule"
  | "familie"
  | "neugier"
  | "alltag";

export type MotivationAngle = {
  id: string;
  theme: MotivationTheme;
  title: string;
  /** One crisp insight the post must land — not an essay. */
  insight: string;
  /** Optional visual scene hint for image planning (mood only; Winkel title is painted separately). */
  sceneHint: string;
};

export const MOTIVATION_THEME_LABELS: Record<MotivationTheme, string> = {
  entwicklung: "Entwicklung",
  spass: "Spaß & Zugang",
  schule: "Schule & Druck",
  familie: "Familie",
  neugier: "Neugier",
  alltag: "Alltag",
};

/** Theme for archived vs-chat positioning angles in the Social picker. */
const VS_CHAT_THEME: Record<VsChatPositionId, MotivationTheme> = {
  lesen_nicht_prompten: "alltag",
  altersgerecht: "familie",
  wissen_im_abenteuer: "neugier",
  kind_im_zentrum: "familie",
  wiederkommen: "alltag",
  schutzraum: "familie",
  regeln_drin: "familie",
  soziales_lesen: "familie",
  lust_statt_pflicht: "spass",
  tippen_kann_jeder: "spass",
};

/** Prefix so vs-chat ids never collide with reading-joy Winkel ids. */
export const VS_CHAT_ANGLE_ID_PREFIX = "vs:" as const;

export function vsChatAngleId(positionId: VsChatPositionId): string {
  return `${VS_CHAT_ANGLE_ID_PREFIX}${positionId}`;
}

/** Positioning archive as selectable Social Winkel. */
export function vsChatPositionsAsMotivationAngles(): MotivationAngle[] {
  return VS_CHAT_POSITIONS.map((entry) => ({
    id: vsChatAngleId(entry.id),
    theme: VS_CHAT_THEME[entry.id],
    title: entry.title,
    insight: entry.insight,
    sceneHint: entry.sceneHint,
  }));
}

/**
 * Fixed north star for leseno voice (social + public page). Keep short.
 */
export const LESENO_READING_MANIFESTO = `Lesen formt, wie Menschen die Welt verstehen, mitdenken und mitfühlen — das ist Entwicklung, nicht Dekoration.
Spaß ist kein Extra: Lust ist der einzige stabile Zugang zum Lesen. Ohne Freude bleibt Lesen oft Pflicht und endet, sobald niemand mehr zuschaut.
Schulisches Lesen allein reicht nicht: Noten, Vergleich und „richtig lesen“ können Neugier abschneiden.
leseno steht für Lesen mit Kopfkino, Humor und ohne Oberlehrer-Ton — ein klarer Gedanke, schwungvoll gesagt.`;

/**
 * Angle bank: each social post picks exactly one. Edit here; /motivation renders the same list.
 */
export const MOTIVATION_ANGLES: MotivationAngle[] = [
  {
    id: "kopfkino",
    theme: "entwicklung",
    title: "Kopfkino schlägt Bildschirm-Fertigkost",
    insight:
      "Beim Lesen baut das Gehirn Szenen selbst — das trainiert Vorstellungskraft stärker als fertige Bilder.",
    sceneHint:
      "Child on a sofa mid-laugh, book open on the lap, imaginary creatures swirling softly around the living room without letters",
  },
  {
    id: "empathie",
    theme: "entwicklung",
    title: "Andere Leben ausprobieren",
    insight:
      "Geschichten lassen Kinder fremde Perspektiven spüren — Empathie wächst mit gelebten Figuren, nicht mit Moralpredigten.",
    sceneHint:
      "Two kids under a blanket fort sharing one glowing book, faces lit with wonder, cozy living-room chaos",
  },
  {
    id: "wortschatz",
    theme: "entwicklung",
    title: "Wörter als Werkzeug",
    insight:
      "Wer liest, sammelt Worte für Gefühle und Streitgespräche — Sprache wird handhabbarer, nicht nur „schöner“.",
    sceneHint:
      "Kitchen table after school: child animatedly telling a parent a story moment, book nearby as a prop, warm orange light",
  },
  {
    id: "konzentration",
    theme: "entwicklung",
    title: "Bei einer Sache bleiben",
    insight:
      "Ein Kapitel zu Ende lesen übt Fokus — eine seltene Fähigkeit in einer Welt voller Wisch-Reize.",
    sceneHint:
      "Quiet corner by a window: child deeply absorbed in a book while phone lies face-down forgotten on the floor",
  },
  {
    id: "spass-zugang",
    theme: "spass",
    title: "Spaß ist der Türöffner",
    insight:
      "Ohne Lust kein nachhaltiges Lesen: Freude ist nicht Belohnung hinterher, sondern der Eingang.",
    sceneHint:
      "Park picnic blanket, family laughing, book held up like a portal with soft magical glow, lively full scene",
  },
  {
    id: "lachen-lernen",
    theme: "spass",
    title: "Lachen zählt als Lesen",
    insight:
      "Wenn ein Kind laut über eine Szene lacht, passiert Lernen — nur ohne den Schulstempel „produktiv“.",
    sceneHint:
      "Bedroom evening: child rolling with laughter on the bed, open book on the pillow, parent peeking in smiling",
  },
  {
    id: "wahl-freiheit",
    theme: "spass",
    title: "Selbst wählen dürfen",
    insight:
      "Wer mitentscheiden darf, was gelesen wird, bleibt eher dran — Autonomie schlägt Pflichtkatalog.",
    sceneHint:
      "Bookstore or home shelf moment: child proudly picking a book while adult kneels beside, equal energy",
  },
  {
    id: "wiederlesen",
    theme: "spass",
    title: "Nochmal dasselbe? Gerne.",
    insight:
      "Lieblingsbücher wiederholen ist kein Rückschritt — es ist Sicherheit und Vertiefung mit Wiedersehensfreude.",
    sceneHint:
      "Cozy armchair ritual: child opening a well-loved book with ritual excitement, lamp glow, stuffed animal audience",
  },
  {
    id: "noten-druck",
    theme: "schule",
    title: "Noten als Spaßbremse",
    insight:
      "Sobald Lesen vor allem bewertet wird, rutscht es von Entdecken zu Vermeiden — Druck frisst Neugier.",
    sceneHint:
      "Contrast scene without text: tense school-desk vibe fading into a warm home reading nook where shoulders drop",
  },
  {
    id: "laut-richtig",
    theme: "schule",
    title: "Laut und „richtig“",
    insight:
      "Vorlesen vor der Klasse kann Mut kosten: Wer stolpert, lernt oft Scham statt Geschichte.",
    sceneHint:
      "After-school relief: child reading freely on the floor at home, shoes kicked off, no audience, soft joy",
  },
  {
    id: "vergleich",
    theme: "schule",
    title: "Schneller ist nicht klüger",
    insight:
      "Lesetempo-Vergleiche erzeugen Verlierergefühle — Verständnis und Lust haben kein Stoppuhr-Ranking.",
    sceneHint:
      "Two different kids reading at different paces in a friendly living room, both looking content, no competition vibe",
  },
  {
    id: "pflichtkanon",
    theme: "schule",
    title: "Pflichtkanon vs. Funke",
    insight:
      "Nicht jedes „wichtige“ Buch zündet jetzt — der Funke kommt oft über das, was gerade fesselt.",
    sceneHint:
      "Child sneaking joyfully into a fantasy book while a boring textbook lies closed aside — playful, not mean",
  },
  {
    id: "hausaufgaben-lesen",
    theme: "schule",
    title: "Lesen als Hausaufgabe",
    insight:
      "Wenn Lesen nur abgehakt wird, trainiert man Abhaken — nicht Beziehung zur Geschichte.",
    sceneHint:
      "Evening table: checklist energy melting away as child gets pulled into a story, parent nearby with tea",
  },
  {
    id: "gemeinsam",
    theme: "familie",
    title: "Zusammen im selben Abenteuer",
    insight:
      "Gemeinsam lesen verbindet Generationen — gleiche Welt, verschiedene Augen, ein Gespräch danach.",
    sceneHint:
      "Sofa full scene: parent and child leaning together into one book, dog at their feet, lived-in living room",
  },
  {
    id: "vorbild",
    theme: "familie",
    title: "Gesehenes Lesen",
    insight:
      "Kinder lesen, was sie vorgelebt bekommen: ein Buch in Erwachsenenhand ist lautere Werbung als jeder Appell.",
    sceneHint:
      "Kitchen morning: adult reading with coffee while child mirrors nearby with their own book, warm daylight",
  },
  {
    id: "kein-perfekter-abend",
    theme: "familie",
    title: "Chaos zählt auch",
    insight:
      "Fünf unperfekte Minuten mit Geschichte schlagen den perfekten Plan, der nie stattfindet.",
    sceneHint:
      "Lively messy bedroom: pajamas, toys on floor, short bedtime reading moment full of energy and warmth",
  },
  {
    id: "fragen-erlaubt",
    theme: "familie",
    title: "Zwischenfragen willkommen",
    insight:
      "„Warum macht die das?“ mitten im Satz ist kein Stören — das ist Denken in Echtzeit.",
    sceneHint:
      "Parent and child mid-discussion on the rug, book open between them, animated hands, curious faces",
  },
  {
    id: "neugier-motor",
    theme: "neugier",
    title: "Neugier als Motor",
    insight:
      "Fragen öffnen Bücher besser als Appelle — „Was passiert als Nächstes?“ zieht stärker als „Du solltest lesen“.",
    sceneHint:
      "Child leaning forward toward a glowing book like a cliffhanger moment, sibling peeking over the shoulder",
  },
  {
    id: "welten-bauen",
    theme: "neugier",
    title: "Eigene Welten bauen",
    insight:
      "Lesen füttert Erfinden: Wer Geschichten aufnimmt, kann später leichter eigene spinnen.",
    sceneHint:
      "Floor full of drawings and toys around an open book — creative aftermath of a story, lively room",
  },
  {
    id: "angst-abbauen",
    theme: "neugier",
    title: "Unbekanntes gefahrlos testen",
    insight:
      "In Geschichten dürfen Kinder mutig sein, bevor das Leben es verlangt — Probehandeln ohne Risiko.",
    sceneHint:
      "Backyard dusk adventure vibe: kids with a book as map prop, flashlight glow, playful exploration",
  },
  {
    id: "alltag-insel",
    theme: "alltag",
    title: "Kleine Lese-Inseln",
    insight:
      "Bus, Wartezimmer, Couchecke: kurze Inseln reichen — Regelmäßigkeit schlägt Marathon-Sessions.",
    sceneHint:
      "Train or bus window seat: child absorbed in a book while city blurs by, calm focused bubble",
  },
  {
    id: "medien-mix",
    theme: "alltag",
    title: "Kein Entweder-oder",
    insight:
      "Lesen konkurriert nicht nur mit Screens — es braucht bewussten Platz daneben, nicht moralische Verbote allein.",
    sceneHint:
      "Living room balance: tablet closed on the table, family on the floor in a lively book scene instead",
  },
  {
    id: "stimme",
    theme: "alltag",
    title: "Vorlesen ist Theater",
    insight:
      "Stimmen, Pausen, Quatsch-Geräusche: Vorlesen darf Performance sein — das klebt Geschichten fest.",
    sceneHint:
      "Parent doing dramatic reading on the couch, kids cracking up, full theatrical living-room moment",
  },
  {
    id: "ohne-ziel",
    theme: "alltag",
    title: "Ohne Lernziel-Schild",
    insight:
      "Manchmal darf Lesen einfach schön sein — Nutzen kommt oft nebenbei, wenn niemand ihn anmeldet.",
    sceneHint:
      "Hammock or garden chair: relaxed reading joy, lemonade nearby, pure leisure atmosphere",
  },
  {
    id: "identitaet",
    theme: "entwicklung",
    title: "Sich selbst zwischen den Zeilen finden",
    insight:
      "Kinder erkennen sich in Figuren wieder — oder entdecken, wer sie noch werden könnten.",
    sceneHint:
      "Mirror-like quiet moment: child pausing mid-page with a soft recognizing smile, bedroom late afternoon",
  },
  {
    id: "durchhalten",
    theme: "entwicklung",
    title: "Durch ein Tal kommen",
    insight:
      "Schwierige Stellen in Geschichten üben Durchhalten — Frustrationstoleranz mit Happy-End-Hoffnung.",
    sceneHint:
      "Child frowning then brightening across a page-turn, rainy window background, resilient cozy mood",
  },
  {
    id: "konflikte-aushalten",
    theme: "entwicklung",
    title: "Konflikte aushalten dürfen",
    insight:
      "Wenn Figuren sich nicht sofort vertragen, üben Kinder Mitfühlen und Aushalten — ohne echte Angst, mit echter Tiefe.",
    sceneHint:
      "Two story characters mid-argument then soft reconciliation imagined around a child reading intently on the sofa",
  },
  {
    id: "eigenes-lesen",
    theme: "spass",
    title: "Mein Login, meine Geschichten",
    insight:
      "Ein eigener Zugang macht Lesen zur Sache des Kindes — Autonomie klebt stärker als „jetzt lesen, weil Mama sagt“.",
    sceneHint:
      "Child proudly opening a tablet or book corner alone but happily, personal space, warm independence vibe",
  },
  {
    id: "schulstoff-nebenbei",
    theme: "schule",
    title: "Lernen ohne Unterrichtsgesicht",
    insight:
      "Viel „Schulstoff“ sitzt besser, wenn er in einer Geschichte mitschwimmt — nebenbei, ohne Tafel-Ton.",
    sceneHint:
      "Museum or nature walk energy translated indoors: kids exploring a story world with curious body language",
  },
  {
    id: "druck-abbauen",
    theme: "familie",
    title: "Druck raus, Beziehung rein",
    insight:
      "Weniger „Lies gefälligst“, mehr „Lass uns reinspringen“ — Beziehung trägt weiter als Kontrolle.",
    sceneHint:
      "Soft invitation moment: adult patting a cushion, child joining with a book, warm cooperative energy",
  },
  {
    id: "lesen-statt-prompt",
    theme: "alltag",
    title: "Lesen, nicht Prompten",
    insight:
      "Ein Chatfenster liefert Text auf Zuruf — Lesen braucht Stufe, Raum und Fokus. Der Unterschied ist die Situation, nicht nur der Generator.",
    sceneHint:
      "Calm reading nook: child absorbed in a story book while a blurred laptop chat window sits unused in the background",
  },
  {
    id: "stufe-statt-glueck",
    theme: "familie",
    title: "Stufe statt Glückstreffer",
    insight:
      "„Irgendwie kindlich“ reicht nicht: Sprache und Tiefe müssen zur Lesestufe passen — sonst frustriert oder langweilt der Text.",
    sceneHint:
      "Parent adjusting a simple story setting while child reads comfortably at their level, warm cooperative kitchen table",
  },
  {
    id: "naechste-geschichte",
    theme: "alltag",
    title: "Die nächste Geschichte zählt",
    insight:
      "Ein Wow im Chat verpufft. Wiederfinden, weitermachen und Rituale kleben stärker als ein einmaliger Prompt-Erfolg.",
    sceneHint:
      "Bookshelf or library corner ritual: child pulling out a favorite story again with eager routine energy",
  },
  {
    id: "klarer-weg",
    theme: "familie",
    title: "Klarer Weg statt offenem Chat",
    insight:
      "Thema wählen und lesen — ohne Nebenchats, ohne unvorhersehbare Abzweigungen. Schutzraum schlägt Prompt-Lotterie.",
    sceneHint:
      "Focused path visual: child and parent on a simple story journey from topic choice to cozy reading, no cluttered screens",
  },
  {
    id: "tippen-kann-jeder",
    theme: "spass",
    title: "Tippen kann jeder",
    insight:
      "Kostenlos Text erzeugen ist leicht. Verlässlich kindgerecht lesen lassen — mit Lust statt Pflicht — ist das eigentliche Produkt.",
    sceneHint:
      "Joyful reading moment outdoors or on a sofa: child laughing into a story, phone face-down nearby, pure leisure",
  },
];

/**
 * All Winkel available in Social Admin: reading-joy bank + vs-chat positioning archive.
 */
export const SOCIAL_SELECTABLE_ANGLES: MotivationAngle[] = [
  ...MOTIVATION_ANGLES,
  ...vsChatPositionsAsMotivationAngles(),
];

export function pickMotivationAngle(postDate: string): MotivationAngle {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(postDate);
  let seed = 0;
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    seed = year * 372 + month * 31 + day;
  } else {
    for (let i = 0; i < postDate.length; i += 1) {
      seed = (seed + postDate.charCodeAt(i) * (i + 1)) % 9973;
    }
  }
  const index = Math.abs(seed) % SOCIAL_SELECTABLE_ANGLES.length;
  return SOCIAL_SELECTABLE_ANGLES[index]!;
}

/** Looks up a bank Winkel by stable `id` (admin selection). */
export function getMotivationAngleById(
  angleId: string,
): MotivationAngle | null {
  const id = angleId.trim();
  if (!id) return null;
  return SOCIAL_SELECTABLE_ANGLES.find((angle) => angle.id === id) ?? null;
}

export function anglesByTheme(): Record<MotivationTheme, MotivationAngle[]> {
  const grouped = {
    entwicklung: [],
    spass: [],
    schule: [],
    familie: [],
    neugier: [],
    alltag: [],
  } as Record<MotivationTheme, MotivationAngle[]>;
  for (const angle of MOTIVATION_ANGLES) {
    grouped[angle.theme].push(angle);
  }
  return grouped;
}
