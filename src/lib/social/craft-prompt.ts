/**
 * Builds CRAFT-style prompts for social captions and FLUX image prompts.
 * Captions: manifesto + one motivation angle (not a long storyline essay).
 * Images: Gemini plans a lively full scene, then FLUX + no-text guards.
 */

import {
  FLUX_ILLUSTRATION_STYLE_LOCK,
  FLUX_NO_TEXT_BLOCK,
  fluxDayVisualVariation,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import {
  LESENO_FLUX_PALETTE_LOCK,
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

/**
 * Gemini plans a FLUX scene: brand style system + caption mood → lively full situation.
 */
export function buildSocialImageScenePlanPrompt(input: {
  imagePromptTemplate: string;
  caption: string;
  channel: SocialChannel;
  postDate: string;
  extraInstruction?: string;
  sceneHint?: string;
}): { systemInstruction: string; userText: string } {
  const channelLabel = SOCIAL_CHANNEL_LABELS[input.channel];
  const styleGuide = input.imagePromptTemplate.trim() || LESENO_SOCIAL_STYLE_GUIDE;

  const systemInstruction = `You are the visual art director for leseno (reading joy for kids and families).
Your job: turn a social-media caption into ONE detailed image brief for FLUX.

Brand / style system (follow literally — especially ART STYLE, COLOR PALETTE, SCENES):
"""
${styleGuide}
"""

Hard rules:
- English only; image brief only — no markdown, no quotes around the whole answer.
- Describe a FULL lively situation (environment + action + relationships), not a portrait of a kid holding a book.
- Name brand colors (warm orange, golden yellow, cream).
- Purely visual — do not paint caption words.
- ZERO text/letters/numbers/signs/logos/UI in the image.
- Illustrated 2D digital art unless style system asks for photo.
- About 80–160 words.`;

  const extra = input.extraInstruction?.trim();
  const hint = input.sceneHint?.trim();
  const userText = `Plan the illustration for this ${channelLabel} post (day ${input.postDate} = mood variation only, never paint the date).

# Caption (mood inspiration only — do not paint these words)
${input.caption.trim() || "(no caption — invent a warm leseno reading situation)"}

${hint ? `# Suggested situation direction\n${hint}\n` : ""}
${extra ? `# Extra visual direction from editor\n${extra}\n` : ""}
Write the FLUX brief now: full scene, orange–gold–cream, illustrated not photo.`;

  return { systemInstruction, userText };
}

/**
 * Final FLUX pixel prompt from Gemini scene + shared guards.
 */
export function buildSocialFluxPromptFromScene(input: {
  sceneDescription: string;
  imagePromptTemplate: string;
  postDate: string;
  extraInstruction?: string;
}): string {
  const wantsPhoto = /\b(photo|fotorealist|photoreal|stock\s*photo|kamera|dslr)\b/i.test(
    `${input.imagePromptTemplate} ${input.extraInstruction ?? ""}`,
  );

  const scene =
    sanitizeFluxVisualCue(input.sceneDescription, 900) ||
    "Lively family living-room reading adventure, warm orange glow, full environment";

  return [
    wantsPhoto ? null : FLUX_ILLUSTRATION_STYLE_LOCK,
    wantsPhoto ? null : LESENO_FLUX_PALETTE_LOCK,
    FLUX_NO_TEXT_BLOCK,
    `Scene: ${scene}.`,
    fluxDayVisualVariation(input.postDate),
    "Full situation with environment and action, square crop, illustration fills the frame.",
    FLUX_NO_TEXT_BLOCK,
    "Again: absolutely no text, letters, numbers, signs, or logos in the picture.",
  ]
    .filter(Boolean)
    .join(" ");
}
