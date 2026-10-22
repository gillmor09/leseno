/**
 * Book-level tone contract from High Concept (e.g. humorvolle Satire).
 * Soft styleguide labels are not enough — draft/style/architect/abnahme
 * must see the same hard mandate when the idea demands comedy/satire.
 */

import type { NovelBundle, NovelVoiceCard } from "@/lib/novel/types";

export type NovelToneMode = "default" | "satire_humor";

/** Idea / styleguide signals that lock satire + humor as book voice. */
const SATIRE_HUMOR_RE =
  /\b(satir\w*|humor\w*|humour|komöd\w*|komedie|comedy|iron\w*|sarkasm\w*|witz\w*|lustig\w*|schwarzer\s+humor|tragikom\w*|parodi\w*|burlesk\w*|slapstick|farce)\b/i;

/**
 * Detect whether the High Concept (and optional style labels) demand
 * humorvolle Satire — not just “literary with occasional relief”.
 */
export function detectToneModeFromTexts(
  ...texts: Array<string | null | undefined>
): NovelToneMode {
  const blob = texts
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (!blob) return "default";
  return SATIRE_HUMOR_RE.test(blob) ? "satire_humor" : "default";
}

export function detectToneModeFromBundle(
  bundle: NovelBundle | null | undefined,
): NovelToneMode {
  if (!bundle) return "default";
  return detectToneModeFromTexts(
    bundle.novel.highConceptIdea,
    bundle.styleGuide?.genre,
    bundle.styleGuide?.subgenre,
    bundle.styleGuide?.primaryTone,
    bundle.styleGuide?.styleRules?.notes,
  );
}

/** Genre labels when satire/humor is locked. */
export function toneModeStyleLabels(mode: NovelToneMode): {
  genre: string;
  subgenre: string;
} {
  if (mode === "satire_humor") {
    return { genre: "Satire", subgenre: "humorvoller Roman" };
  }
  return { genre: "Roman", subgenre: "" };
}

const SATIRE_TRAITS = [
  "Humorvolle Satire: Witz aus Situation, Status und Charakter — nicht aus erklärten Pointen",
  "Gesellschaftliche oder institutionelle Übertreibung, die trotzdem glaubwürdig bleibt",
  "Ironie und Unterspiel: Figuren meinen es ernst, der Text zeigt die Absurdität",
  "Tempo und Timing: Dialog-Reibung, Missverständnisse, unfreiwillige Komik",
];

const SATIRE_DO_WRITE = [
  "Jede Szene braucht mindestens einen erkennbaren komischen oder satirischen Beat (Situation, Dialog oder Statusbruch)",
  "Zielkonflikte übertreiben, ohne Slapstick um der Gag willen",
  "Pointen stehen lassen — keine Nachsätze, die den Witz erklären",
  "Auch in ernsten Job-Kapiteln (escalate/climax) die satirische Haltung halten — kein Umschalten in nüchternen Thriller-Ton",
];

/**
 * Merge satire/humor hard traits into the voice card (idempotent).
 */
export function enrichVoiceCardForToneMode(
  card: NovelVoiceCard,
  mode: NovelToneMode,
): NovelVoiceCard {
  if (mode !== "satire_humor") return card;
  const toneLabel = /satir|humor|komöd|iron/i.test(card.toneLabel)
    ? card.toneLabel
    : card.toneLabel.trim()
      ? `${card.toneLabel.trim()} — humorvolle Satire`
      : "Humorvolle Satire";
  const traits = mergeUnique(card.traits, SATIRE_TRAITS, 10);
  const doWrite = mergeUnique(card.doWrite, SATIRE_DO_WRITE, 8);
  const sampleLines =
    card.sampleLines.length >= 2
      ? card.sampleLines
      : [
          "„Das Verfahren ist transparent“, sagte sie und schob die Akte unter den Stapel mit den transparenten Verfahren.",
          "Er lächelte dienstlich, als wäre Peinlichkeit ein Formularfeld.",
        ];
  return {
    ...card,
    toneLabel,
    traits,
    doWrite,
    sampleLines,
  };
}

function mergeUnique(
  existing: string[],
  extras: string[],
  max: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of [...extras, ...existing]) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Architect: structure must serve satire/humor, not bury it. */
export function formatToneContractForArchitect(mode: NovelToneMode): string {
  if (mode !== "satire_humor") return "";
  return `# Ton-Vertrag (HARD — aus der High-Concept-Idee)
Dieses Buch ist humorvolle Satire. Akte, Kapitel-Jobs und Manifeste müssen das tragen:
- Prämisse und Akt-Summaries: Konflikt + satirischer Hebel (Institution/Status/Norm), nicht nur ernster Plot
- Kapitel: mood nennt Humor/Satire/Ironie; mind. jedes 3. Kapitel job=comic ODER jedes Kapitel hat in must/goal einen satirischen Beat
- Manifeste: mustShow enthält sichtbare komische/satirische Beats (Statusbruch, Timing, unfreiwillige Bloßstellung) — nicht nur Plot-Fakten
- Kein Umschalten in nüchternen Thriller-/Verfahrensroman ohne Witz`;
}

/** Draft + stylist: every scene must deliver humor/satire. */
export function formatToneContractForAuthor(mode: NovelToneMode): string {
  if (mode !== "satire_humor") return "";
  return `# Ton-Vertrag (HARD — humorvolle Satire)
Pflicht in DIESER Szene:
- Mindestens ein klarer komischer oder satirischer Beat (Situation, Dialog-Timing oder Statusbruch)
- Figuren meinen es ernst; der Text zeigt die Absurdität (Ironie/Unterspiel)
- Keine humorlose Verfahrens-/Protokollprosa als Hauptsatz; Pointen nicht nachklären
- Auch bei ernstem Konflikt: satirische Haltung halten — nicht „erst Plot, Humor später“`;
}

/** Logic/chapter auditor: fail dead-serious prose when satire is contracted. */
export function formatToneContractForAuditor(mode: NovelToneMode): string {
  if (mode !== "satire_humor") return "";
  return `Ton-Vertrag prüfen (humorvolle Satire):
- Gibt es in der Prosa erkennbare Komik/Satire (Situation, Timing, Status)? Wenn die Szene/das Kapitel durchgängig ernst-nüchtern ohne Witz wirkt → passed=false und Issue „Ton: Satire/Humor fehlt“.
- Erklärte Pointen oder Motto-Witze zählen nicht als Erfüllung.
- Contract/Job dürfen ernst sein — die Haltung muss trotzdem satirisch bleiben.`;
}

/** Compact line for Abnahme / export. */
export function formatToneContractForAbnahme(mode: NovelToneMode): string {
  if (mode !== "satire_humor") return "";
  return `Ton-Vertrag: humorvolle Satire (HARD). Scores genre/tonalitaet/versprechen streng senken, wenn Manuskript nicht erkennbar satirisch-humorvoll ist.`;
}
