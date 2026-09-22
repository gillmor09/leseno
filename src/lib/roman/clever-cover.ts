/**
 * Clever erzählt cover pipeline:
 * 1) Cover-Art-Director (DB role) → Gemini 3 Pro Image artwork (no text/logos)
 * 2) Fixed PNG logos: series badge top-center, leseno mark bottom-right
 * 3) Cover-Typograf (DB role) → Nunito title overlay in upper third (topic only; series is the badge)
 */

import { generateImage } from "@/lib/ai/generate-image";
import {
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import { compressCoverDataUrl } from "@/lib/roman/cover-compress";
import {
  CLEVER_SERIES_BADGE_FILE,
  LESENO_MARK_FILE,
  overlayCleverCoverLogos,
} from "@/lib/roman/clever-cover-logos";
import {
  buildCleverMandatoryArtStyleBlock,
  CLEVER_COVER_COMPOSITION_LOCK,
  wrapCleverSeriesImagePrompt,
} from "@/lib/roman/clever-visual-style";
import {
  normalizeCoverTitleLines,
  overlayCoverTitleByDesign,
  splitSeriesTitle,
  stripTitleLeakFromScene,
  type CoverTitleAlign,
  type CoverTitleDesign,
  type CoverTitleScrim,
  type CoverTitleTone,
  type CoverTitleZone,
} from "@/lib/roman/cover-title-overlay";
import { resolveRomanCoverImagesModel } from "@/lib/roman/model";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanCharakter } from "@/lib/roman/types";

export type CleverCoverGenerateInput = {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  weltSchauplaetze?: string;
  charaktere?: RomanCharakter[];
  manuskriptRaw: string;
  ideeKurz?: string;
  alterLabel?: string;
  manuskriptText?: string;
  extraInstruction?: string;
};

export type CleverCoverGenerateResult = {
  dataUrl: string;
  sceneDescription: string;
  promptUsed: string;
};

/** Image models paint fake logos/bars if you mention badges or title zones — strip those cues. */
const CLEVER_BRAND_LEAK =
  /\b(clever\s*erz[aä]hlt|leseno|series\s*badge|publisher\s*mark|logo|badge|emblem|shield|banner|watermark|brand\s*mark|yellow\s*banner|phoenix\s*logo)\b/gi;

const CLEVER_FAKE_UI_ZONE =
  /\b(quiet\s+)?(top\s+)?strip\b|\b(calm\s+)?(open\s+)?(upper|top)\s+third\b|\btitle\s+zone\b|\bheader\s+bar\b|\bgradient\s+(strip|bar|band|panel)\b|\bdark\s+(bar|band|strip|panel)\b|\b(reserved|empty)\s+(area|space|zone)\s+for\s+(later\s+)?title\b|\bquieter\s+bottom[\s-]*right\b|\bUI\s+chrome\b/gi;

/**
 * Remove brand/logo and fake title-bar wording from the art brief so the
 * image model paints one continuous scene (overlays are added in code).
 */
export function stripCleverBrandLeakFromScene(scene: string): string {
  return scene
    .replace(CLEVER_BRAND_LEAK, " ")
    .replace(CLEVER_FAKE_UI_ZONE, " ")
    .replace(/\b(calm\s+)?(badge|logo|publisher|brand)\s+zone\b[^.]*[.]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Title shown as type overlay: topic after `:` when present (series badge already says Clever erzählt).
 */
export function cleverCoverOverlayTitle(fullTitle: string): string {
  const clean = fullTitle.trim().replace(/\s+/g, " ");
  const { series, topic } = splitSeriesTitle(clean);
  if (series && topic) return topic;
  return clean;
}

function asZone(v: unknown): CoverTitleZone {
  // Clever: title always in the upper third (below series badge), centered.
  void v;
  return "upper";
}

function asAlign(v: unknown): CoverTitleAlign {
  const s = String(v ?? "").toLowerCase();
  if (s === "left" || s === "right") return s;
  return "center";
}

function asTone(v: unknown): CoverTitleTone {
  const s = String(v ?? "").toLowerCase();
  if (s === "light" || s === "dark") return s;
  return "auto";
}

function asScrim(v: unknown): CoverTitleScrim {
  const s = String(v ?? "").toLowerCase();
  if (s === "soft" || s === "strong") return s;
  return "none";
}

function defaultCleverTitleDesign(topicTitle: string): CoverTitleDesign {
  const clean = topicTitle.trim().replace(/\s+/g, " ");
  const words = clean.split(/\s+/).filter(Boolean);
  // Short topics stay one hero line (e.g. "Wald & Bäume") — series badge owns the brand.
  let lines: CoverTitleDesign["lines"];
  if (words.length <= 4) {
    lines = clean ? [{ text: clean, role: "primary" }] : [];
  } else {
    const mid = Math.ceil(words.length / 2);
    lines = [
      { text: words.slice(0, mid).join(" "), role: "primary" },
      { text: words.slice(mid).join(" "), role: "secondary" },
    ];
  }
  return {
    lines,
    zone: "upper",
    align: "center",
    size: "hero",
    tone: "auto",
    scrim: "none",
    publisherNote:
      "Clever fallback: Nunito title upper-third center; series via badge PNG",
  };
}

async function planCleverCoverTitle(input: {
  topicTitle: string;
  genre: string;
  alterLabel?: string;
  sceneDescription: string;
}): Promise<CoverTitleDesign> {
  const clean = input.topicTitle.trim().replace(/\s+/g, " ");
  if (!clean) return defaultCleverTitleDesign("");

  try {
    const { rolle, model } = await resolveRomanKiRolle("clever_cover_typograf");
    const raw = await generateText({
      model,
      preferJson: true,
      maxTokens: 500,
      timeoutMs: 45_000,
      systemInstruction: rolle.systemPrompt,
      userText: `Exact title text to set (topic only — series badge is already on the cover):\n${clean}

Genre: ${input.genre.trim() || "(unspecified)"}
Age group: ${input.alterLabel?.trim() || "(unspecified)"}

Art brief (for tone/contrast only):
${input.sceneDescription.slice(0, 2_000)}

Propose the upper-third centered title hierarchy now.`,
    });

    const parsed = parseModelJsonObject(raw) as Record<string, unknown>;
    let lines = normalizeCoverTitleLines(clean, parsed.lines).filter(
      (l) => l.role !== "eyebrow",
    );
    // Short topics: keep as one primary line so "& …" never outranks the first noun.
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 4) {
      lines = [{ text: clean, role: "primary" }];
    } else if (lines.length === 0) {
      lines = defaultCleverTitleDesign(clean).lines;
    } else if (!lines.some((l) => l.role === "primary")) {
      lines = lines.map((l, i) =>
        i === 0
          ? { ...l, role: "primary" as const }
          : { ...l, role: "secondary" as const },
      );
    }

    return {
      lines,
      zone: asZone(parsed.zone),
      align: asAlign(parsed.align),
      size: "hero",
      tone: asTone(parsed.tone),
      scrim: asScrim(parsed.scrim),
      publisherNote: String(parsed.publisherNote ?? "")
        .trim()
        .slice(0, 240),
    };
  } catch {
    return defaultCleverTitleDesign(clean);
  }
}

function buildCleverFluxPrompt(
  sceneDescription: string,
  title: string,
  styleBlock: string,
): string {
  const cleanedScene = stripCleverBrandLeakFromScene(
    stripTitleLeakFromScene(sceneDescription, title),
  );
  const scene =
    sanitizeFluxVisualCue(cleanedScene, 1_100) ||
    "Curious child explorer with large expressive eyes as hero, topic world as colorful CGI support, open pictorial areas without props that look like labels";

  return wrapCleverSeriesImagePrompt({
    styleBlock: `${CLEVER_COVER_COMPOSITION_LOCK}\n\n${styleBlock}`,
    contentBrief: scene,
    tailExtras: [
      FLUX_NO_TEXT_BLOCK,
      "ONE continuous full-bleed illustration only — edge to edge, no separate layers.",
      "ABSOLUTELY NO logos, badges, emblems, shields, banners, stickers, seals, crests, brand marks, publisher marks, or fake UI chrome anywhere.",
      "Do NOT paint yellow ribbons, blue-outlined badges, bird/phoenix logos, or any graphic that looks like a brand sticker.",
      "CRITICAL: do NOT paint any header bar, title band, dark strip, gradient slab, panel, frame, or reserved empty rectangle in the upper third — continuous scene only (title/logos are composited later in code).",
      "Portrait full-bleed eBook cover 1200×1920 (5:8), single cinematic still, no collage.",
      FLUX_NO_TEXT_BLOCK,
    ],
  });
}

/**
 * Clever cover: Art Director role → Flux → logo PNGs → Typograf role → title.
 */
export async function generateCleverCover(
  input: CleverCoverGenerateInput,
): Promise<CleverCoverGenerateResult> {
  const outlineOrProse =
    input.manuskriptRaw.trim().length >= 40
      ? input.manuskriptRaw
      : (input.manuskriptText ?? "");
  const title = input.title.trim();
  const topicTitle = cleverCoverOverlayTitle(title);
  const hasMaterial =
    outlineOrProse.trim().length >= 40 ||
    input.praemisse.trim().length >= 20 ||
    (input.ideeKurz ?? "").trim().length >= 40 ||
    input.genre.trim().length >= 2 ||
    topicTitle.length >= 2;
  if (!hasMaterial) {
    throw new Error(
      "Für ein Clever-Cover brauchst du Thema/Titel, Idee, Prämisse oder zumindest ein Genre.",
    );
  }

  const [{ rolle: artRolle, model: artModel, imageModel: roleImageModel }, coverImages] =
    await Promise.all([
      resolveRomanKiRolle("clever_cover_artdirector"),
      resolveRomanCoverImagesModel(),
    ]);
  // Prefer role image model when the Art-Director role points at an image endpoint.
  const imagesModel =
    roleImageModel?.isActive ? roleImageModel : coverImages;

  const alter = input.alterLabel?.trim() || "(unspecified)";
  const extra = input.extraInstruction?.trim();
  const userText = `# Brief
Design ONE full-bleed portrait cover SCENE for a three-dimensional CGI feature-animation still (Disney/Pixar quality).
You plan STAGING only — art style is locked in production code. Do NOT invent watercolor, photo, flat clipart, or rival media.

# Working title (context only — do NOT paint any of these words)
${title || "(untitled)"}

# Topic focus (world / supporting motifs around the hero)
${topicTitle || title || "(unspecified)"}

# Genre
${input.genre.trim() || "Kinderwissen / Abenteuer"}

# Reader age group + parent buyers
${alter}

# Premise / Kernaussage
${input.praemisse.trim() || "(none)"}

# Idea dossier (short)
${(input.ideeKurz ?? "").trim().slice(0, 3_000) || "(none)"}

# Tonality (reinforce CGI animation only — do not switch media)
${input.tonalitaet.trim() || "(friendly adventurous knowledge)"}

# Outline / manuscript excerpt
${outlineOrProse.trim().slice(0, 6_000) || "(empty — invent from topic/age only)"}

${extra ? `# Extra art direction (MANDATORY — carry into staging, keep CGI look)\n${extra}\n` : ""}
Write the English scene brief now (~90–140 words). Structure:
1) HERO: one child (or child + friendly animal companion) with large expressive eyes, soft cheeks, clear emotion, appeal silhouette — ALWAYS required, even for nature/knowledge topics.
2) TOPIC WORLD: how forest / machines / sea / … wraps around the hero as colorful CGI support (not a landscape plate without a face).
3) LIGHT + COLOR: warm cinematic key/fill/rim, soft magic glow, soft saturated palette.
4) COMPOSITION: one continuous full-bleed scene — hero readable as a thumbnail. Do NOT reserve title zones, top strips, empty bands, bars, panels, or frames (title and logos are added later in code).
Do NOT mention logos, badges, brands, publisher marks, titles, title zones, or paint style recipes (no “photoreal”, no “watercolor”).`;

  const sceneRaw = await generateText({
    model: artModel,
    systemInstruction: artRolle.systemPrompt,
    userText,
    timeoutMs: 60_000,
  });
  const sceneDescription = sceneRaw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!sceneDescription) {
    throw new Error("Cover-Art-Director hat keine Szene geliefert.");
  }

  const styleBlock = buildCleverMandatoryArtStyleBlock({
    tonalitaet: input.tonalitaet,
    extraInstruction: extra,
    roleSystemPrompt: artRolle.systemPrompt,
  });
  const fluxPrompt = buildCleverFluxPrompt(
    sceneDescription,
    title,
    styleBlock,
  );
  const image = await generateImage({
    model: imagesModel,
    prompt: fluxPrompt,
    sizePx: 2048,
    aspectRatio: "5:8",
    outputFormat: "jpeg",
  });

  let dataUrl = await overlayCleverCoverLogos({
    imageDataUrl: image.dataUrl,
  });

  let design: CoverTitleDesign | null = null;
  if (topicTitle) {
    design = await planCleverCoverTitle({
      topicTitle,
      genre: input.genre,
      alterLabel: input.alterLabel,
      sceneDescription,
    });
    dataUrl = await overlayCoverTitleByDesign({
      imageDataUrl: dataUrl,
      design,
    });
  }

  dataUrl = await compressCoverDataUrl(dataUrl);

  const designBlock = design
    ? `\n\n— Typografie (Cover-Typograf) —\n${JSON.stringify(design, null, 2)}`
    : "";

  const debugPrompt = `— Cover-Art-Director (${artRolle.modelSlug} → Text ${artModel.label}) —\n${sceneDescription}\n\n— Image (${imagesModel.label}) —\n${fluxPrompt}\n\n— Logos (code, 1:1 PNG, no AI) —\n${CLEVER_SERIES_BADGE_FILE} top-center + ${LESENO_MARK_FILE} bottom-right${designBlock}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
  };
}
