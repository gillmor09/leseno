/**
 * Builds CRAFT-style prompts for social captions and social image prompts.
 * Winkel: manifesto + one motivation angle.
 * Marketing: 1–2 feature highlights + soft CTA (visit / try free).
 * Images: Gemini plans a scene with ZERO text; title overlay via `overlayExactAngleTextOnImage`.
 */

import {
  FLUX_ILLUSTRATION_STYLE_LOCK,
  FLUX_SOCIAL_NO_TEXT,
  fluxDayVisualVariation,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import type { MarketingTopic } from "@/lib/social/marketing-features";
import {
  LESENO_FLUX_PALETTE_LOCK,
  LESENO_MARKETING_FLUX_PALETTE_LOCK,
  LESENO_MARKETING_STYLE_GUIDE,
  LESENO_SOCIAL_STYLE_GUIDE,
} from "@/lib/social/leseno-visual-style";
import {
  LESENO_READING_MANIFESTO,
  type MotivationAngle,
} from "@/lib/social/motivation";
import type { SocialChannel, SocialChannelCraft } from "@/lib/social/types";
import { SOCIAL_CHANNEL_LABELS } from "@/lib/social/types";

const DEFAULT_ROLE =
  "Kolumnist:in für Eltern — scharf, warm, mit Humor; nie Oberlehrer, nie Werbeslogans.";

const DEFAULT_FORMAT = `Genau EIN Gedanke. Aufbau:
1) Strong Hook (Frage, These oder überraschende Wendung) — max. 1–2 Zeilen
2) Core: den Winkel knackig und schwungvoll ausführen — kurze Absätze, Zeilenumbrüche
3) Softes Ende: Diskussionsimpuls oder Augenzwinkern — kein „Kauf jetzt“, kein Moralhammer
Länge: eher kurz als lang. Deutsch.`;

const DEFAULT_ACTION =
  "Schreibe einen Instagram-Post, der genau den genannten Winkel trifft — prägnant, schwungvoll, mit Humor.";

const DEFAULT_MARKETING_ROLE =
  "Produktstimme für leseno — warm, konkret, dezent; Nutzen zeigen, nie laut verkaufen, nie Oberlehrer.";

const DEFAULT_MARKETING_FORMAT = `Genau 1–2 Produkt-Highlights. Aufbau:
1) Hook zum Alltag/Nutzen — max. 1–2 Zeilen
2) Core: die genannten Funktionen als tolles Highlight herausstellen (kurz, greifbar, kein Feature-Dump)
3) Softes CTA-Ende — wähle EINES: „Seite besuchen“ (leseno.de) ODER „kostenlos ausprobieren“
4) Leerzeile, dann 3–5 passende Hashtags in einer Zeile (Pflicht)
Länge: eher kurz. Deutsch. Kein Hard-Sell, kein Preisdumping, keine Fake-Urgency.`;

const DEFAULT_MARKETING_ACTION =
  "Schreibe einen dezenten Instagram-Marketing-Post zu den genannten leseno-Funktionen — highlight-stark, einladend, mit softem CTA und passenden Hashtags.";

const MARKETING_HASHTAG_RULES = `Hashtags (Pflicht, ganz am Ende nach einer Leerzeile):
- Genau 3–5 Tags in einer Zeile, mit #, durch Leerzeichen getrennt.
- Immer #leseno dabei.
- Rest passend zum Highlight und zur Zielgruppe (Eltern, Vorlesen, Kinder, Lesefreude) — z. B. #vorlesen #kinderbücher #lesenmachtspaß #elternleben #geschichtenfürkinder — je nach Thema wählen, nicht alle stapeln.
- Keine generischen Spam-Tags (#love #instagood), keine Marken-Konkurrenz, keine Politik.
- Keine doppelten Tags, keine Satzzeichen in Tags.`;

const DEFAULT_FRAGE_FORMAT = `Aufbau der Caption (Antwort auf die Frage):
1) Kurzer Bezug zur Frage (1 Zeile) — nicht die Frage wiederholen
2) Strukturierte Antwort mit 2–4 konkreten leseno-Lösungen/Funktionen (kurze Aufzählung oder Absätze)
3) Softes CTA — wähle EINES: „Seite besuchen“ (leseno.de) ODER „kostenlos ausprobieren“
4) Leerzeile, dann 3–5 passende Hashtags (Pflicht, inkl. #leseno)
Länge: eher kurz. Deutsch. Kein Hard-Sell.`;


export function buildCraftCaptionPrompt(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  postDate: string;
  dayIndex: number;
  daysInMonth: number;
  angle: MotivationAngle;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const systemInstruction = `Du bist Social-Media-Texter:in für leseno (Lesen für Kinder und Familien).

# Nordstern (immer beachten)
${LESENO_READING_MANIFESTO}

# Stimme
Humorvoll, klar, erwachsenengesprächlich. Kein Oberlehrer. Kein Pseudo-Coach. Keine Floskeln wie „Entdecke die Magie des Lesens“.
Antworte ausschließlich mit dem fertigen Beitragstext auf Deutsch — keine Anführungszeichen um den ganzen Text, keine Meta-Kommentare, keine Hashtag-Listen außer wenn das Format es ausdrücklich verlangt.`;

  const extraNotes = input.storyline.trim();
  const userText = `Erstelle einen ${channelLabel}-Beitrag.

# Role
${input.craft.role.trim() || DEFAULT_ROLE}

# Action
${input.craft.action.trim() || DEFAULT_ACTION}

# Format
${input.craft.format.trim() || DEFAULT_FORMAT}

# Heutiger Winkel (NUR DIESEN — nicht die ganze Motivationsseite nacherzählen)
Titel: ${input.angle.title}
Kern: ${input.angle.insight}
Thema: ${input.angle.theme}

# Pflicht
- Nur diesen einen Winkel pointieren.
- Optional darfst du den Gedanken leicht zuspitzen oder mit einem Alltagsbild schärfen — aber nicht abschweifen.
- Nicht alle Manifesto-Punkte abarbeiten.

${extraNotes ? `# Zusätzliche Redaktionsnotiz (optional, nachrangig)\n${extraNotes}\n` : ""}# Datum
Beitrag für den ${input.postDate} (Tag ${input.dayIndex} von ${input.daysInMonth}).
Variiere Einstieg und Bilder im Kopf gegenüber anderen Tagen.`;

  return { systemInstruction, userText };
}

export function buildCraftRefinePrompt(input: {
  storyline: string;
  craft: SocialChannelCraft;
  channel: SocialChannel;
  currentCaption: string;
  refineInstruction: string;
  angle?: MotivationAngle;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const systemInstruction = `Du überarbeitest Social-Media-Texte für leseno.
Nordstern:
${LESENO_READING_MANIFESTO}
Stimme: humorvoll, prägnant, nicht oberlehrerhaft.
Antworte nur mit dem fertigen Beitragstext auf Deutsch.`;

  const angleBlock = input.angle
    ? `# Winkel (beibehalten oder schärfen, nicht austauschen)
${input.angle.title} — ${input.angle.insight}`
    : "";

  const userText = `Überarbeite den folgenden ${channelLabel}-Beitrag.

# Role
${input.craft.role.trim() || DEFAULT_ROLE}

# Action (Überarbeitung)
${input.refineInstruction.trim()}

# Format
${input.craft.format.trim() || DEFAULT_FORMAT}

${angleBlock}

# Bisheriger Text
${input.currentCaption.trim()}`;

  return { systemInstruction, userText };
}

export function buildMarketingCaptionPrompt(input: {
  storyline: string;
  channel: SocialChannel;
  postDate: string;
  dayIndex: number;
  daysInMonth: number;
  topic: MarketingTopic;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const featureLines = input.topic.features
    .map((f) => `- ${f.title}: ${f.blurb}`)
    .join("\n");

  const systemInstruction = `Du bist Social-Media-Texter:in für leseno (Lesen für Kinder und Familien).

# Nordstern (immer beachten)
${LESENO_READING_MANIFESTO}

# Stimme (Marketing)
Dezent, konkret, einladend. Produktnutzen zeigen — kein Hard-Sell, kein Pseudo-Coach, keine Floskeln wie „Entdecke die Magie“.
Antworte ausschließlich mit dem fertigen Beitragstext auf Deutsch — keine Anführungszeichen um den ganzen Text, keine Meta-Kommentare.`;

  const extraNotes = input.storyline.trim();
  const userText = `Erstelle einen ${channelLabel}-Marketing-Beitrag.

# Role
${DEFAULT_MARKETING_ROLE}

# Action
${DEFAULT_MARKETING_ACTION}

# Format
${DEFAULT_MARKETING_FORMAT}

# Feature-Highlights (NUR DIESE — 1 oder 2)
${featureLines}

# Pflicht
- Genau diese ${input.topic.features.length} Funktion(en) als Highlight herausstellen.
- Softes CTA am Ende: entweder Seite besuchen (leseno.de) oder kostenlos ausprobieren — nicht beides stapeln.
- ${MARKETING_HASHTAG_RULES}
- Kein Preis-Dumping, keine Fake-Urgency, kein Vergleichs-Bashing.

${extraNotes ? `# Zusätzliche Redaktionsnotiz (optional, nachrangig)\n${extraNotes}\n` : ""}# Datum
Beitrag für den ${input.postDate} (Tag ${input.dayIndex} von ${input.daysInMonth}).
Variiere Einstieg gegenüber anderen Tagen.`;

  return { systemInstruction, userText };
}

export function buildMarketingRefinePrompt(input: {
  storyline: string;
  channel: SocialChannel;
  currentCaption: string;
  refineInstruction: string;
  topic?: MarketingTopic;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const systemInstruction = `Du überarbeitest Social-Media-Marketing-Texte für leseno.
Nordstern:
${LESENO_READING_MANIFESTO}
Stimme: dezent, konkret, einladend — soft CTA und passende Hashtags behalten bzw. sinnvoll anpassen.
Antworte nur mit dem fertigen Beitragstext auf Deutsch.`;

  const topicBlock = input.topic
    ? `# Features (beibehalten, nicht austauschen)
${input.topic.features.map((f) => `${f.title}: ${f.blurb}`).join("\n")}`
    : "";

  const userText = `Überarbeite den folgenden ${channelLabel}-Marketing-Beitrag.

# Role
${DEFAULT_MARKETING_ROLE}

# Action (Überarbeitung)
${input.refineInstruction.trim()}

# Format
${DEFAULT_MARKETING_FORMAT}

${topicBlock}

# Hashtags
${MARKETING_HASHTAG_RULES}

# Bisheriger Text
${input.currentCaption.trim()}`;

  return { systemInstruction, userText };
}

/**
 * Generates a single motivating/provocative reading question for kids —
 * one that leseno can answer with product solutions.
 */
export function buildFrageQuestionPrompt(input: {
  storyline: string;
  postDate: string;
  dayIndex: number;
  daysInMonth: number;
}): { systemInstruction: string; userText: string } {
  const extraNotes = input.storyline.trim();
  const systemInstruction = `Du schreibst Social-Media-Fragen für leseno (Lesen für Kinder und Familien).

# Nordstern
${LESENO_READING_MANIFESTO}

# Aufgabe
Formuliere GENAU EINE motivierende oder leicht provokante Frage zum Thema Lesen mit Kindern.
Die Frage muss so sein, dass leseno eine klare Produkt-Antwort/Lösung bieten kann
(z. B. personalisierte Geschichten, Lesemodus, Meine Welt, Wissen, Spaß ohne Druck, Buchclub).

Regeln:
- Nur die Frage zurückgeben — kein Anführungszeichen um den ganzen Text, keine Erklärung, keine Caption.
- Deutsch, Du-Ansprache an Eltern.
- Max. 1–2 kurze Zeilen, ideal als großes Overlay auf einem Bild.
- Kein Soft-Sell in der Frage selbst, kein Markenname „leseno“ in der Frage.
- Keine Ja/Nein-Flachfragen ohne Spannungsbogen.`;

  const userText = `Schreibe die Frage für den ${input.postDate} (Tag ${input.dayIndex}/${input.daysInMonth}).
Variiere gegenüber typischen Lesefragen (nicht immer „Liest ihr genug?“).
${extraNotes ? `\nRedaktionsnotiz (nachrangig):\n${extraNotes}\n` : ""}
Nur die Frage:`;

  return { systemInstruction, userText };
}

/**
 * Caption that answers a Frage post with structured leseno solutions.
 */
export function buildFrageCaptionPrompt(input: {
  storyline: string;
  channel: SocialChannel;
  postDate: string;
  dayIndex: number;
  daysInMonth: number;
  question: string;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const extraNotes = input.storyline.trim();
  const systemInstruction = `Du bist Social-Media-Texter:in für leseno (Lesen für Kinder und Familien).

# Nordstern
${LESENO_READING_MANIFESTO}

# Stimme
Warm, konkret, einladend. Die Frage beantworten — kein Hard-Sell, kein Pseudo-Coach.
Antworte ausschließlich mit dem fertigen Beitragstext auf Deutsch — keine Anführungszeichen um den ganzen Text.`;

  const userText = `Erstelle die ${channelLabel}-Caption als Antwort auf diese Overlay-Frage.

# Frage (steht schon auf dem Bild — nicht wörtlich wiederholen)
${input.question.trim()}

# Format
${DEFAULT_FRAGE_FORMAT}

# Pflicht
- Beantworte die Frage mit 2–4 greifbaren leseno-Lösungen/Funktionen.
- Softes CTA: Seite besuchen (leseno.de) ODER kostenlos ausprobieren.
- ${MARKETING_HASHTAG_RULES}

${extraNotes ? `# Redaktionsnotiz (nachrangig)\n${extraNotes}\n` : ""}# Datum
${input.postDate} (Tag ${input.dayIndex} von ${input.daysInMonth}).`;

  return { systemInstruction, userText };
}

/**
 * Gemini plans a social scene (no on-image text — title is composited later).
 */
export function buildSocialImageScenePlanPrompt(input: {
  imagePromptTemplate: string;
  caption: string;
  channel: SocialChannel;
  postDate: string;
  extraInstruction?: string;
  sceneHint?: string;
  /** Marketing posts use the product/poster style guide. */
  visualMode?: "winkel" | "marketing";
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const marketing = input.visualMode === "marketing";
  const styleGuide = marketing
    ? LESENO_MARKETING_STYLE_GUIDE
    : input.imagePromptTemplate.trim() || LESENO_SOCIAL_STYLE_GUIDE;

  const sceneRule = marketing
    ? "Describe a joyful product-benefit scene starring the SAME familiar leseno illustrated kid (messy dark-brown hair, freckles, large eyes, orange/navy hoodie) as Winkel posts — same 2D craft for people, props, AND background; louder staging, never photo backgrounds with cutout figures."
    : "Describe a FULL lively situation (environment + action + relationships), not a portrait of a kid holding a book.";

  const systemInstruction = `You are the visual art director for leseno (reading joy for kids and families).
Your job: turn a social-media caption into ONE detailed image brief for the pixel model.

Brand / style system (follow literally — especially ART STYLE, COLOR PALETTE, SCENES/COMPOSITION):
"""
${styleGuide}
"""

Hard rules:
- English only; image brief only — no markdown, no quotes around the whole answer.
- ${sceneRule}
- Name brand colors (warm orange, golden yellow, cream).
- Purely visual — do not paint caption words or any headline.
- ZERO text/letters/numbers/signs/logos/UI in the image (typography is added later in code).
- Leave a slightly calmer lower third for a later text overlay.
- Illustrated 2D digital art unless style system asks for photo.
- About 80–160 words.`;

  const extra = input.extraInstruction?.trim();
  const hint = input.sceneHint?.trim();
  const fallbackCaption = marketing
    ? "(no caption — invent a joyful leseno product-benefit scene with the familiar illustrated kid hero)"
    : "(no caption — invent a warm leseno reading situation)";
  const userText = `Plan the illustration for this ${channelLabel} ${marketing ? "marketing " : ""}post (day ${input.postDate} = mood variation only, never paint the date).

# Caption (mood inspiration only — do not paint these words)
${input.caption.trim() || fallbackCaption}

${hint ? `# Suggested situation direction\n${hint}\n` : ""}
${extra ? `# Extra visual direction from editor\n${extra}\n` : ""}
Write the image brief now: ${marketing ? "same character craft as Winkel, joyful product staging" : "full scene"}, orange–gold–cream, illustrated not photo, absolutely no text.`;

  return { systemInstruction, userText };
}

/**
 * Final pixel prompt from Gemini scene + hard no-text (overlay added in code).
 */
export function buildSocialFluxPromptFromScene(input: {
  sceneDescription: string;
  imagePromptTemplate: string;
  postDate: string;
  extraInstruction?: string;
  visualMode?: "winkel" | "marketing";
}): string {
  const marketing = input.visualMode === "marketing";
  const wantsPhoto =
    !marketing &&
    /\b(photo|fotorealist|photoreal|stock\s*photo|kamera|dslr)\b/i.test(
      `${input.imagePromptTemplate} ${input.extraInstruction ?? ""}`,
    );

  const scene =
    sanitizeFluxVisualCue(input.sceneDescription, 900) ||
    (marketing
      ? "Joyful leseno product-benefit scene with the familiar freckled messy-hair illustrated kid hero, same 2D craft as Winkel posts, warm orange–gold energy"
      : "Lively family living-room reading adventure, warm orange glow, full environment");

  const framing = marketing
    ? "Marketing composition with brand-character recognition: STRICT square 1024 frame, full illustration (no photo background), familiar leseno kid as hero when a child appears, edge-to-edge fill, leave a slightly calmer upper band for a title card and a quiet lower strip for a brand bar."
    : "Full lively situation with environment and action, square crop, illustration fills the frame, slightly calmer lower third for overlay space.";

  return [
    wantsPhoto ? null : FLUX_ILLUSTRATION_STYLE_LOCK,
    wantsPhoto
      ? null
      : marketing
        ? LESENO_MARKETING_FLUX_PALETTE_LOCK
        : LESENO_FLUX_PALETTE_LOCK,
    `Scene: ${scene}.`,
    fluxDayVisualVariation(input.postDate),
    framing,
    FLUX_SOCIAL_NO_TEXT,
  ]
    .filter(Boolean)
    .join(" ");
}
