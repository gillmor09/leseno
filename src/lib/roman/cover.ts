/**
 * Roman book-cover pipeline:
 * Art director derives a book-specific emotional core, proposes 3 concepts,
 * picks one → image model artwork → Marketing typography brief →
 * exact title overlay + author (top-center) + Untertitel + leseno mark (bottom-left).
 */

import { generateImage } from "@/lib/ai/generate-image";
import {
  FLUX_NO_TEXT_BLOCK,
  sanitizeFluxStyleCue,
  sanitizeFluxVisualCue,
} from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  resolveRomanCoverImagesModel,
  resolveRomanLayoutModel,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { compressCoverDataUrl } from "@/lib/roman/cover-compress";
import {
  coverFontCatalogForPrompt,
  coverFontFamilyForGenre,
  parseCoverFontFamily,
} from "@/lib/roman/cover-fonts";
import {
  defaultCoverTitleDesign,
  normalizeCoverTitleLines,
  overlayCoverTitleByDesign,
  stripTitleLeakFromScene,
  type CoverTitleAlign,
  type CoverTitleDesign,
  type CoverTitleScrim,
  type CoverTitleSize,
  type CoverTitleTone,
  type CoverTitleZone,
} from "@/lib/roman/cover-title-overlay";
import { ROMAN_DEFAULT_AUTHOR } from "@/lib/roman/front-matter";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

/** Skip generic placeholders that are not real marketing subtitles. */
function usableCoverSubtitle(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 3) return "";
  if (/^roman$/i.test(s)) return "";
  return s;
}

export { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const MAX_MANUSCRIPT_FOR_SCENE = 10_000;

/**
 * Quality floor for trade covers — no universal book thesis.
 * Emotional core + technique come from the per-book concept plan.
 */
const COVER_STYLE_LOCK = [
  "German literary TRADE BOOK COVER — emotionally clear, imaginative, content-true",
  "Finished imprint quality from a major house — not Midjourney sludge, not flat clipart",
  "Creative metaphor + juxtaposition in ONE inventive frame — not stickers, not a product ad",
  "HARD FORBIDDEN: car advertisement, dealership brochure, eBay Kleinanzeigen / classified listing, product catalog, sterile stock lifestyle, shiny brand vehicle hero",
  "Only use Pixar / 3D animation CGI when the brief explicitly asks for it (e.g. children's knowledge series)",
].join(". ");

export type CoverConceptApproach =
  | "symbolic"
  | "figurative"
  | "graphic";

/** One of three competing cover directions before a single render. */
export type CoverConcept = {
  id: string;
  approach: CoverConceptApproach;
  label: string;
  /** Full image brief for this direction (no painted text). */
  sceneBrief: string;
  /** Concrete technique (linocut, painterly, collage, hard-light photo, …). */
  artTechnique: string;
  /** Lighting / mood for THIS book — genre may be dark, bright, or mixed. */
  lighting: string;
};

/** Book-specific cover plan: unique thesis → 3 concepts → one pick. */
export type CoverConceptPlan = {
  /** One visual question only THIS book answers (not a universal motto). */
  emotionalCore: string;
  /** Dominant metaphor pulled from premise / places / tone. */
  dominantMetaphor: string;
  concepts: CoverConcept[];
  chosenId: string;
  chosenRationale: string;
};

function formatCharBrief(chars: RomanCharakter[]): string {
  return chars
    .filter((c) => c.name.trim())
    .slice(0, 6)
    .map((c) => {
      const bits = [
        c.name.trim(),
        c.alter.trim() && `Alter ${c.alter.trim()}`,
        c.rolle.trim(),
        c.motivation.trim() && `will ${c.motivation.trim()}`,
      ].filter(Boolean);
      return `– ${bits.join(", ")}`;
    })
    .join("\n");
}

function asApproach(v: unknown): CoverConceptApproach {
  const s = String(v ?? "").toLowerCase();
  if (s === "figurative" || s === "graphic") return s;
  return "symbolic";
}

function sanitizeConcept(raw: unknown, index: number): CoverConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sceneBrief = String(o.sceneBrief ?? o.brief ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  if (sceneBrief.length < 40) return null;
  const id =
    String(o.id ?? "").trim() ||
    ["A", "B", "C"][index] ||
    `C${index + 1}`;
  return {
    id,
    approach: asApproach(o.approach),
    label: String(o.label ?? o.name ?? id).trim().slice(0, 80) || id,
    sceneBrief: sceneBrief.slice(0, 2_200),
    artTechnique: String(o.artTechnique ?? o.technique ?? "")
      .trim()
      .slice(0, 240),
    lighting: String(o.lighting ?? o.mood ?? "")
      .trim()
      .slice(0, 240),
  };
}

/**
 * Fallback when the planner JSON fails: one symbolic brief from raw prose.
 */
function fallbackCoverConceptPlan(
  sceneRaw: string,
  title: string,
): CoverConceptPlan {
  const brief =
    sceneRaw.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 2_200) ||
    `Atmospheric literary book-cover for „${title || "untitled"}“ — one strong metaphor, calm title zone, no painted text.`;
  const concept: CoverConcept = {
    id: "A",
    approach: "symbolic",
    label: "Fallback single concept",
    sceneBrief: brief,
    artTechnique: "painterly atmospheric illustration",
    lighting: "genre-true light with a calm title zone",
  };
  return {
    emotionalCore: `What does „${title || "this book"}“ make a stranger feel before they open it?`,
    dominantMetaphor: "one strong story-true visual metaphor",
    concepts: [concept],
    chosenId: "A",
    chosenRationale: "Planner JSON unavailable — render the single recovered brief.",
  };
}

/**
 * Art director: book-specific emotional core + 3 concepts + pick (JSON).
 * Universal mottos (e.g. suburb vs skyline) only if the book truly is about that.
 */
export function buildRomanCoverConceptPlanPrompt(input: {
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  weltSchauplaetze: string;
  charaktere: RomanCharakter[];
  manuskriptRaw: string;
  ideeKurz?: string;
  alterLabel?: string;
  extraInstruction?: string;
}): { systemInstruction: string; userText: string } {
  const title = input.title.trim() || "(untitled)";

  const systemInstruction = `You are a senior cover art director at a German literary trade publisher.
Your job: invent a UNIQUE visual promise for THIS book — not a house-style template reused for every title.

# Process (mandatory)
1) Distill ONE book-specific emotionalCore: a visual question or tension only THIS story answers (1 short sentence). Do NOT reuse a universal motto unless the book truly is about that exact theme.
2) Name ONE dominantMetaphor grounded in premise / places / characters / tone.
3) Propose EXACTLY 3 competing concepts with distinct approaches:
   - A symbolic — conceptual metaphor / juxtaposition (object, scale, reflection, two worlds)
   - B figurative — a charged human/story moment (silhouette or face welcome)
   - C graphic — bold graphic / abstract-literary / typographic-space-aware composition (still ZERO painted letters)
4) Pick exactly ONE concept to render (chosenId). Prefer the boldest shelf-stopper that stays faithful to the book — not the safest average.
5) Commit to a concrete artTechnique per concept (e.g. linocut, flat gouache, oil-painterly, collage montage, hard-light photography, grainy documentary still). Never say "art technique free".
6) Lighting follows genre + Altersklasse: thriller may be dark; satire may be garish; YA may be clear and bright. Do NOT force golden-hour warmth on every book.

Hard rules:
- English only in string values. Return ONLY valid JSON (no markdown fences).
- ZERO text/letters/numbers/signs/logos/UI/title painted in any sceneBrief — typography is composited later.
- Fixed chrome later (protect quiet pictorial space, do NOT paint):
  - AUTHOR: top-center band
  - TITLE + subtitle: prefer lower/bottom (or center when art opens there) — never top/upper
  - PUBLISHER mark: bottom-left corner
- Leave quiet pictorial space — NEVER describe a dark header bar, gradient strip, banner, or UI chrome.
- Motif AND palette must fit genre AND Altersklasse; still feel premium when parents buy.
- Match Kernaussage / premise tightly — forbid generic genre clichés that ignore THIS book.
- Compose for tall portrait 1600×2560 (5:8). About 70–140 words per sceneBrief.
- No spoilers that contradict the premise.
- HARD BAN in briefs: automotive ads, dealership shine, Kleinanzeigen/listing photos, product catalogs, sterile stock lifestyle.

JSON shape:
{
  "emotionalCore": "…",
  "dominantMetaphor": "…",
  "concepts": [
    {
      "id": "A",
      "approach": "symbolic",
      "label": "short name",
      "sceneBrief": "full image brief…",
      "artTechnique": "…",
      "lighting": "…"
    },
    { "id": "B", "approach": "figurative", "label": "…", "sceneBrief": "…", "artTechnique": "…", "lighting": "…" },
    { "id": "C", "approach": "graphic", "label": "…", "sceneBrief": "…", "artTechnique": "…", "lighting": "…" }
  ],
  "chosenId": "A"|"B"|"C",
  "chosenRationale": "one sentence why this wins the shelf for THIS book"
}`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();
  const idee = (input.ideeKurz ?? "").trim().slice(0, 4_000);

  const userText = `Plan the cover for this book (JSON only — three concepts, then pick one).

# Working title (context only — do NOT write it in any sceneBrief)
${title}

# Genre
${input.genre.trim() || "(unspecified)"}

# Reader age group (Altersklasse) + parent buyers
${input.alterLabel?.trim() || "(unspecified)"}

# Premise / Kernaussage
${input.praemisse.trim() || "(none)"}

# Idea dossier (short)
${idee || "(none)"}

# Tonality & style
${input.tonalitaet.trim() || "(unspecified)"}

# Key places (sensory atmosphere)
${input.weltSchauplaetze.trim().slice(0, 2_000) || "(none)"}

# Characters (emotion / relationship)
${chars || "(none listed)"}

# Outline / manuscript excerpt
${manuskript || "(empty — invent from premise/genre/age only)"}

${extra ? `# Extra art direction\n${extra}\n` : ""}
Remember: unique thesis for THIS book → bold technique → 3 concepts → 1 chosenId.`;

  return { systemInstruction, userText };
}

/** @deprecated Use buildRomanCoverConceptPlanPrompt — kept for callers/tests. */
export function buildRomanCoverScenePlanPrompt(
  input: Parameters<typeof buildRomanCoverConceptPlanPrompt>[0],
): { systemInstruction: string; userText: string } {
  return buildRomanCoverConceptPlanPrompt(input);
}

function parseCoverConceptPlan(
  raw: string,
  title: string,
): CoverConceptPlan {
  try {
    const parsed = parseModelJsonObject(raw) as Record<string, unknown>;
    const conceptsRaw = Array.isArray(parsed.concepts)
      ? parsed.concepts
      : [];
    const concepts = conceptsRaw
      .map((c, i) => sanitizeConcept(c, i))
      .filter((c): c is CoverConcept => Boolean(c))
      .slice(0, 3);

    if (concepts.length === 0) {
      return fallbackCoverConceptPlan(raw, title);
    }

    const emotionalCore =
      String(parsed.emotionalCore ?? "").trim().slice(0, 320) ||
      `What unique tension does „${title || "this book"}“ put on the shelf?`;
    const dominantMetaphor =
      String(parsed.dominantMetaphor ?? "").trim().slice(0, 240) ||
      "one story-true metaphor";

    const chosenRaw = String(parsed.chosenId ?? "").trim();
    const chosen =
      concepts.find(
        (c) =>
          c.id === chosenRaw ||
          c.id.toLowerCase() === chosenRaw.toLowerCase(),
      ) ?? concepts[0]!;

    return {
      emotionalCore,
      dominantMetaphor,
      concepts,
      chosenId: chosen.id,
      chosenRationale: String(parsed.chosenRationale ?? "")
        .trim()
        .slice(0, 320),
    };
  } catch {
    return fallbackCoverConceptPlan(raw, title);
  }
}

/** Final image prompt: artwork only, hard no-text (strip title leaks). */
export function buildRomanCoverFluxPrompt(
  sceneDescription: string,
  title = "",
  styleMandate = "",
  plan?: Pick<
    CoverConceptPlan,
    "emotionalCore" | "dominantMetaphor"
  > & {
    artTechnique?: string;
    lighting?: string;
  },
): string {
  const cleanedScene = stripTitleLeakFromScene(sceneDescription, title);
  const scene =
    sanitizeFluxVisualCue(cleanedScene, 1_100) ||
    "Atmospheric literary book-cover scene, strong focal silhouette, premium light";
  const style = sanitizeFluxStyleCue(styleMandate, 1_000);
  const core = (plan?.emotionalCore ?? "").trim();
  const metaphor = (plan?.dominantMetaphor ?? "").trim();
  const technique = (plan?.artTechnique ?? "").trim();
  const lighting = (plan?.lighting ?? "").trim();

  return [
    COVER_STYLE_LOCK,
    core
      ? `BOOK-SPECIFIC EMOTIONAL CORE (answer visually, never paint these words): ${core}.`
      : "",
    metaphor ? `DOMINANT METAPHOR: ${metaphor}.` : "",
    technique
      ? `MANDATORY ART TECHNIQUE (commit — do not default to generic AI sludge): ${technique}.`
      : "",
    lighting
      ? `LIGHTING / MOOD (genre-true for THIS book): ${lighting}.`
      : "",
    style
      ? `ADDITIONAL TONALITY (serve the book — never a car ad or classified listing): ${style}.`
      : "",
    FLUX_NO_TEXT_BLOCK,
    `Literary cover brief (visual only — no painted words): ${scene}.`,
    "Portrait full-bleed novel cover 1600×2560 (5:8, print @ 300 ppi), calm title zone, publisher mark reserved bottom-left.",
    "Not an advertisement. Not a product photo. Not eBay Kleinanzeigen. A cover that feels like THIS book alone.",
    FLUX_NO_TEXT_BLOCK,
  ]
    .filter(Boolean)
    .join(" ");
}

function asZone(v: unknown): CoverTitleZone {
  const s = String(v ?? "").toLowerCase();
  if (s === "top" || s === "upper" || s === "center" || s === "lower") {
    return s;
  }
  return "bottom";
}

function asAlign(v: unknown): CoverTitleAlign {
  const s = String(v ?? "").toLowerCase();
  if (s === "left" || s === "right") return s;
  return "center";
}

function asSize(): CoverTitleSize {
  // Marketing covers always render hero; planner compact/standard is ignored.
  return "hero";
}

function asTone(v: unknown): CoverTitleTone {
  const s = String(v ?? "").toLowerCase();
  if (s === "light" || s === "dark") return s;
  return "auto";
}

function asScrim(v: unknown): CoverTitleScrim {
  const s = String(v ?? "").toLowerCase();
  if (s === "none" || s === "strong") return s;
  return "soft";
}

/**
 * Senior typographer + publisher QC: hierarchy + bestseller display font;
 * spelling locked to title. Font is NOT product-UI Nunito.
 */
async function planCoverTitleDesign(input: {
  title: string;
  genre: string;
  alterLabel?: string;
  sceneDescription: string;
}): Promise<CoverTitleDesign> {
  const clean = input.title.trim().replace(/\s+/g, " ");
  const genreFallback = coverFontFamilyForGenre(
    input.genre,
    input.alterLabel,
  );
  if (!clean) return defaultCoverTitleDesign("", genreFallback);

  try {
    const layoutModel = await resolveRomanLayoutModel();
    const raw = await generateText({
      model: layoutModel,
      preferJson: true,
      maxTokens: 550,
      timeoutMs: 45_000,
      systemInstruction: `You are a marketing cover typographer for German trade bestsellers.
Your job: make the TITLE stop the scroll — like current Spiegel/Amazon DE hits in this genre.
Glyphs are composited later from a curated display-font set (NOT the app UI font Nunito).
You plan hierarchy, placement, tone, scrim, AND pick fontFamily. You NEVER invent or respell the title.

Available fontFamily values (pick ONE that matches bestsellers in this genre):
${coverFontCatalogForPrompt()}

Return ONLY JSON:
{
  "fontFamily": "literary"|"impact"|"commercial"|"modern"|"friendly",
  "lines": [
    { "text": "...", "role": "eyebrow"|"primary"|"secondary" }
  ],
  "zone": "top"|"upper"|"center"|"lower"|"bottom",
  "align": "left"|"center"|"right",
  "size": "compact"|"standard"|"hero",
  "tone": "light"|"dark"|"auto",
  "scrim": "none"|"soft"|"strong",
  "publisherNote": "one short QC sentence: why this type + face wins the shelf in this genre"
}

Hard rules:
- Concatenating line texts with spaces MUST equal the exact title (same words, same order). Keep punctuation attached as in the title (e.g. trailing colon on the series line).
- Exactly ONE line with role "primary". Other lines: eyebrow and/or secondary.
- SERIES TITLES with a colon (e.g. "Clever erzählt: Wald & Bäume"):
  - Everything BEFORE the colon (including the colon) = ONE eyebrow line — quiet series label.
  - Everything AFTER the colon = the TOPIC and must dominate the cover.
  - First strong topic noun is primary (e.g. "Wald"). Lines that start with "&" / "und" are secondary — NEVER primary.
- Prefer 2–3 short lines when the title has 3+ words so EACH topic line can be huge; one line only for 1–2 word titles.
- ALWAYS set size to "hero". Never "compact". Thumbnail readability beats clever micro type.
- Prefer zone "lower" or "bottom" (or "center" when art clearly opens there). NEVER "top"/"upper" — author name is fixed in the top band; publisher mark is bottom-left.
- Contrast comes from the type itself (opaque halo). Default scrim to "none". Never plan a header bar. Only allow "soft"/"strong" for a subtle bottom fade when type sits in the lower third on busy art.
- Prefer "light" tone (white type) on mid/dark fields.
- Plan ONLY the book title lines — no author, no subtitle, no imprint, no ALL-CAPS unless the source title is already all caps.
- Choose fontFamily for marketing punch in THIS genre (e.g. impact for Thriller, literary/commercial for Gesellschaftssatire) — never default to "friendly" unless it is children's.`,
      userText: `Exact title:\n${clean}

Genre: ${input.genre.trim() || "(unspecified)"}
Age group: ${input.alterLabel?.trim() || "(unspecified)"}
Suggested fontFamily fallback if unsure: ${genreFallback}

Art director scene brief (title zone hint):
${input.sceneDescription.slice(0, 2_500)}

Propose bestseller title typography now (title only — author/subtitle/logo are fixed overlays).`,
    });

    const parsed = parseModelJsonObject(raw) as Record<string, unknown>;
    const lines = normalizeCoverTitleLines(clean, parsed.lines);
    const fontFamily = parseCoverFontFamily(parsed.fontFamily, genreFallback);

    return {
      lines,
      zone: asZone(parsed.zone),
      align: asAlign(parsed.align),
      size: asSize(),
      tone: asTone(parsed.tone),
      scrim: asScrim(parsed.scrim),
      fontFamily,
      publisherNote: String(parsed.publisherNote ?? "")
        .trim()
        .slice(0, 240),
    };
  } catch {
    return defaultCoverTitleDesign(clean, genreFallback);
  }
}

export type RomanCoverGenerateInput = Pick<
  RomanKontext,
  | "title"
  | "genre"
  | "praemisse"
  | "tonalitaet"
  | "weltSchauplaetze"
  | "charaktere"
  | "manuskriptRaw"
> & {
  ideeKurz?: string;
  alterLabel?: string;
  /** Prefer continuous prose when outline is thin. */
  manuskriptText?: string;
  extraInstruction?: string;
  /** Cover author line (top-center); defaults to Jannis Fynk. */
  autorName?: string;
  /** Marketing subtitle under the title (Einzeiler / Vorsatz-Untertitel). */
  untertitel?: string;
};

export type RomanCoverGenerateResult = {
  dataUrl: string;
  sceneDescription: string;
  promptUsed: string;
  /** Book-specific concept plan (debug / UI). */
  conceptPlan?: CoverConceptPlan;
};

/**
 * Concept plan → image → title overlay + author / subtitle / leseno.
 */
export async function generateRomanCover(
  input: RomanCoverGenerateInput,
): Promise<RomanCoverGenerateResult> {
  const outlineOrProse =
    input.manuskriptRaw.trim().length >= 40
      ? input.manuskriptRaw
      : (input.manuskriptText ?? "");
  const hasMaterial =
    outlineOrProse.trim().length >= 40 ||
    input.praemisse.trim().length >= 20 ||
    (input.ideeKurz ?? "").trim().length >= 40 ||
    input.genre.trim().length >= 2;
  if (!hasMaterial) {
    throw new Error(
      "Für ein Cover brauchst du Idee, Prämisse, Manuskript oder zumindest ein Genre.",
    );
  }

  const [textModel, imagesModel] = await Promise.all([
    resolveRomanTextModel(),
    resolveRomanCoverImagesModel(),
  ]);

  const planPrompt = buildRomanCoverConceptPlanPrompt({
    ...input,
    manuskriptRaw: outlineOrProse,
  });
  const planRaw = await generateText({
    model: textModel,
    preferJson: true,
    maxTokens: 2_400,
    timeoutMs: 90_000,
    systemInstruction: planPrompt.systemInstruction,
    userText: planPrompt.userText,
  });

  const title = input.title.trim();
  const conceptPlan = parseCoverConceptPlan(planRaw, title);
  const chosen =
    conceptPlan.concepts.find((c) => c.id === conceptPlan.chosenId) ??
    conceptPlan.concepts[0];
  if (!chosen?.sceneBrief) {
    throw new Error("Gemini hat keine Cover-Szene geliefert.");
  }

  const sceneDescription = chosen.sceneBrief;
  const author =
    (input.autorName ?? "").trim() || ROMAN_DEFAULT_AUTHOR;
  const untertitel = usableCoverSubtitle(input.untertitel);
  const styleMandate = [input.tonalitaet, input.extraInstruction]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const promptUsed = buildRomanCoverFluxPrompt(
    sceneDescription,
    title,
    styleMandate,
    {
      emotionalCore: conceptPlan.emotionalCore,
      dominantMetaphor: conceptPlan.dominantMetaphor,
      artTechnique: chosen.artTechnique,
      lighting: chosen.lighting,
    },
  );
  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    sizePx: 2048,
    aspectRatio: "5:8",
    outputFormat: "jpeg",
  });

  let dataUrl = result.dataUrl;
  const genreFont = coverFontFamilyForGenre(input.genre, input.alterLabel);
  let design: CoverTitleDesign | null = null;
  if (title) {
    design = await planCoverTitleDesign({
      title,
      genre: input.genre,
      alterLabel: input.alterLabel,
      sceneDescription,
    });
  } else {
    design = defaultCoverTitleDesign("", genreFont);
  }
  dataUrl = await overlayCoverTitleByDesign({
    imageDataUrl: result.dataUrl,
    design: design ?? defaultCoverTitleDesign(title, genreFont),
    author,
    subtitle: untertitel,
    lesenoMark: true,
  });

  // Compact JPEG — multi-MB PNG data URLs crash the IDE on Server Action save.
  dataUrl = await compressCoverDataUrl(dataUrl);

  const designBlock = design
    ? `\n\n— Typografie (Bestseller-Display) —\n${JSON.stringify(design, null, 2)}`
    : "";
  const chromeBlock = `\n\n— Chrome (code) —\nAutor oben mittig: ${author}\nUntertitel: ${untertitel || "(leer)"}\nleseno-Logo: unten links`;
  const conceptBlock = `\n\n— Konzeptplan —\nKern: ${conceptPlan.emotionalCore}\nMetapher: ${conceptPlan.dominantMetaphor}\nGewählt: ${chosen.id} (${chosen.approach}) — ${chosen.label}\nTechnik: ${chosen.artTechnique || "(n/a)"}\nLicht: ${chosen.lighting || "(n/a)"}\nWarum: ${conceptPlan.chosenRationale || "(n/a)"}\nAlternativen: ${conceptPlan.concepts
    .filter((c) => c.id !== chosen.id)
    .map((c) => `${c.id}/${c.approach}: ${c.label}`)
    .join("; ") || "(keine)"}`;

  const debugPrompt = `— Art Direction (Buch-Kern + 3 Konzepte → Wahl) —\n${sceneDescription}${conceptBlock}\n\n— Image Prompt —\n${promptUsed}${designBlock}${chromeBlock}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
    conceptPlan,
  };
}
