/**
 * Clever erzählt series visual bible — shared by cover and chapter Infografiken.
 * Style is owned in code (not invented per topic). Scene briefs only stage WHAT
 * happens; HOW it looks is this module. Layout differs (cover = no text;
 * Infografik = DE labels) but the render language stays identical.
 */

import { sanitizeFluxStyleCue } from "@/lib/ai/flux-prompt-guards";

/**
 * Technical Pixar-feature render language (AI-expert + feature-animation AD).
 * Brand name alone is weak; these cues steer Gemini/FLUX toward character CGI.
 * Spelled “three-dimensional” so digit-stripping in scene cues cannot kill “3D”.
 */
export const CLEVER_SERIES_ART_STYLE = [
  "Premium three-dimensional CGI feature-animation look (modern Disney / Pixar feature quality)",
  "Hero character with large glassy expressive eyes, soft rounded cheeks, readable facial acting, appealing silhouette",
  "Slightly stylized proportions (gentle squash-and-stretch friendly shapes), never photoreal humans",
  "Subsurface-soft skin / fur, rich material detail, rounded forms, clear staging",
  "Cinematic three-point lighting: warm key, soft fill, gentle rim; volumetric god rays; cozy magic glow",
  "Soft saturated storybook color keys, friendly inviting world, high emotional appeal",
  "Looks like a still from a theatrical animated family feature — not a photo, not a flat vector poster",
].join(". ");

/**
 * Hard negatives — knowledge themes otherwise drift to nature photos / clipart.
 */
export const CLEVER_SERIES_ANTI_STYLE = [
  "NOT photorealistic",
  "NOT a nature documentary still",
  "NOT a stock photo",
  "NOT Unreal Engine live-action CGI realism",
  "NOT watercolor, NOT oil painting, NOT flat 2D clipart",
  "NOT dry editorial diagram icons or generic mascot stickers",
  "NOT muted corporate brochure art",
].join(". ");

/**
 * Every Clever frame needs an emotional anchor (Pixar principle: appeal + staging).
 * Topic = world around the hero; never a landscape-only plate.
 */
export const CLEVER_CHARACTER_APPEAL_LOCK = [
  "MANDATORY CHARACTER ANCHOR: at least one clear hero figure with a readable face and large expressive eyes as the emotional focal point",
  "Topic motifs (forest, animals, machines, …) support the hero — they must not replace the character with empty scenery",
  "Strong silhouette readable as a thumbnail; hero staged in the middle/lower half when a calm upper title zone is needed",
].join(". ");

/** Cover-only composition (logos/title overlays come later in code). */
export const CLEVER_COVER_COMPOSITION_LOCK = [
  "Professional children's knowledge-adventure book cover for the German market",
  "One continuous full-bleed cinematic hero still — single image, no collage, no UI chrome",
  "Premium parent-trustworthy finish, clear silhouette, scroll-stopping thumbnail",
].join(". ");

/**
 * Pull Pixar/Disney/animation lines from a KI-Rollen system prompt.
 * Avoid dumping the whole role text (dilutes style with layout rules).
 */
export function extractCleverAnimationStyleFromRole(
  systemPrompt: string | null | undefined,
): string {
  const raw = (systemPrompt ?? "").trim();
  if (!raw) return "";
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = lines.filter((l) =>
    /pixar|disney|animation|animiert|3\s*d|three[\s-]*dimensional|cgi|augen|gesicht|mimik|licht|magie|textur|farben|stil|style|überzeichnet|einladend|subsurface|god\s*rays/i.test(
      l,
    ),
  );
  if (hit.length > 0) {
    return sanitizeFluxStyleCue(hit.join(" "), 800);
  }
  if (/pixar|disney|animationsfilm|cgi/i.test(raw)) {
    return sanitizeFluxStyleCue(raw, 700);
  }
  return "";
}

/**
 * Hard style block for Clever image models (cover + Infografik).
 * Series canon first; book tonality may reinforce but must not invent a rival look.
 */
export function buildCleverMandatoryArtStyleBlock(input: {
  tonalitaet?: string | null;
  extraInstruction?: string | null;
  roleSystemPrompt?: string | null;
}): string {
  const book = sanitizeFluxStyleCue(
    [input.tonalitaet, input.extraInstruction]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" "),
    900,
  );
  const roleBits = extractCleverAnimationStyleFromRole(
    input.roleSystemPrompt,
  );

  return [
    `MANDATORY ART STYLE (series-wide — cover and chapter Infografiken MUST match): ${CLEVER_SERIES_ART_STYLE}`,
    `CHARACTER APPEAL LOCK: ${CLEVER_CHARACTER_APPEAL_LOCK}`,
    `ANTI-STYLE: ${CLEVER_SERIES_ANTI_STYLE}`,
    book
      ? `Book tonality / art direction (reinforce series CGI style only — do not switch media): ${book}`
      : "",
    roleBits
      ? `Role art direction (reinforce, do not contradict series CGI style): ${roleBits}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Sandwich prompt: style → content → style reprise.
 * Content models otherwise bury the look under long scene prose.
 */
export function wrapCleverSeriesImagePrompt(input: {
  styleBlock: string;
  contentBrief: string;
  tailExtras?: string[];
}): string {
  const content = input.contentBrief.trim();
  const reprise = [
    `STYLE LOCK REPRISE (do not drift): ${CLEVER_SERIES_ART_STYLE}`,
    CLEVER_SERIES_ANTI_STYLE,
  ].join(". ");

  return [
    input.styleBlock,
    content ? `CONTENT / SCENE (staging only — do not invent a different art style):\n${content}` : "",
    ...(input.tailExtras ?? []).filter((s) => s.trim().length > 0),
    reprise,
  ]
    .filter(Boolean)
    .join("\n\n");
}
