/**
 * Roman book-cover pipeline:
 * Art director (visual, no text) → Gemini 3 Pro Image artwork →
 * Marketing typography brief → exact title overlay + author (top-center) +
 * Untertitel + leseno mark (bottom-right).
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
 * Distilled emotional core for this novel's cover (all prior brief improvements):
 * luminous invitation + social contrast + moral tension → one unanswered question.
 */
const COVER_EMOTIONAL_CORE = [
  "EMOTIONAL CORE (answer this visually, do NOT paint any words): „Wann ist es genug?“",
  "Meaning: the ache between enough-for-the-family and never-enough status money — security that tips into excess, conscience that still smiles",
  "Show that question through contrast in ONE frame: warm Vorort / family life against distant glass skyscrapers or banking towers; home-scale tenderness against career-scale pressure",
  "Feeling to hit: warm irony + quiet moral unease — inviting light, not gloom; recognition, not horror",
].join(". ");

/**
 * Marketing art lock: readable, content-true literary cover —
 * bright enough to invite, sharp on the book's moral/social contrasts.
 */
const COVER_STYLE_LOCK = [
  "German literary TRADE BOOK COVER — contemporary fiction / Gesellschaftssatire energy: emotionally clear, imaginative, morally charged",
  COVER_EMOTIONAL_CORE,
  "LIGHTING: inviting and luminous — golden hour, clear daylight, soft bright interiors, crisp sky — NOT gloom, noir, muddy dusk, or horror darkness",
  "CONTENT FIRST: mirror the book's core tensions so a stranger senses the story — suburb vs skyline, secure family vs too much money, conscience vs comfort",
  "Creative metaphor + juxtaposition in ONE inventive frame (window, reflection, scale contrast, two worlds) — not stickers, not a car ad or real-estate brochure",
  "Art technique FREE (painterly, illustrative, graphic, atmospheric photo, conceptual montage) IF it feels like a novel cover — never like advertising",
  "HARD FORBIDDEN: car advertisement, dealership brochure, eBay Kleinanzeigen / classified listing, product catalog, sterile stock lifestyle, shiny brand vehicle hero, oppressive blacked-out thriller palette",
  "Status objects (cars, houses, phones) only as SYMBOLS of „is this enough?“ — never as polished merchandise",
  "Finished imprint quality from a major house — not Midjourney sludge, not flat clipart",
  "Only use Pixar / 3D animation CGI when the brief explicitly asks for it (e.g. children's knowledge series)",
].join(". ");

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

/**
 * Gemini plans the illustration only (title is composited later from a type brief).
 */
export function buildRomanCoverScenePlanPrompt(input: {
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

  const systemInstruction = `You are a senior cover art director at a German literary trade publisher (Romane / Jugendbuch / Gesellschaftssatire).
Your concepts are signed off by an acquisitions editor who wants ONE clear emotional message — inviting light, sharp content, moral heart.

# Emotional core (mandatory — answer visually, NEVER paint these words)
The cover must make a stranger feel the unanswered question „Wann ist es genug?“
That is the distilled core of this book:
- Vorort / family security  vs  skyline / finance / too much money
- warmth at home  vs  career pressure and status hunger
- conscience that knows something is wrong  vs  the comfort of looking away
Warm irony + quiet moral unease in luminous light — not gloom, not a product pitch.

Goal: ONE cover IMAGE that feels like that question without writing it.

Hard rules:
- English only; image brief only — no markdown, no quotes wrapping the whole answer.
- LIGHT FIRST: BRIGHT / luminous (daylight, golden hour, clear sky, soft bright rooms). Avoid noir, underexposed gloom, muddy brown-black, “dark prestige” thriller looks.
- CONTENT MIRROR: pull concrete contrasts from premise/idea/places and stage them in ONE inventive frame (window, reflection, scale contrast, two worlds sharing one light). Typical motifs:
  - suburb / tidy family home / garden fence  vs  glass skyscrapers, banking towers
  - secure family warmth  vs  excess money / status
  - conscience  vs  comfortable blindness
- Every prop must serve „is this enough?“ — not generic mood, not a car-ad hero shot.
- HARD BAN: automotive ads, dealership campaigns, eBay Kleinanzeigen / classified photos, product catalogs, sterile stock lifestyle, oppressive blacked-out covers. Do NOT paint any letters or the question as text.
- Art technique free (painterly, illustrative, graphic, atmospheric photo, conceptual montage) only when it reads as a NOVEL cover.
- ZERO text/letters/numbers/signs/logos/UI/title on the image — typography is added later.
- Fixed chrome (composited later — protect quiet pictorial space, do NOT paint text/logos):
  - AUTHOR name: top-center band
  - TITLE + subtitle: prefer lower/bottom (or center when art opens there) — never top/upper
  - PUBLISHER mark: bottom-right corner
- Leave quiet pictorial space — NEVER paint a dark header bar, gradient strip, banner, UI chrome, or dimmed slab.
- Motif AND palette must fit genre AND Altersklasse; still feel premium when parents buy.
- Match the book's Kernaussage / premise tightly — not a generic genre cliché.
- Compose for a tall portrait cover exactly 1600×2560 px (5:8, print @ 300 ppi), full-bleed.
- Do not invent spoilers that contradict the premise; stay faithful to the book's world.
- About 90–160 words.
- Mention briefly where the title will sit later (e.g. “title zone: lower third, center”) without darkening it into a bar.`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();
  const idee = (input.ideeKurz ?? "").trim().slice(0, 4_000);

  const userText = `Brief the cover artwork as an emotional literary hit (image only — no painted text).

# Working title (for context / title-zone planning only — do NOT write it in the image)
${title}

# Genre
${input.genre.trim() || "(unspecified)"}

# Reader age group (Altersklasse) + parent buyers
${input.alterLabel?.trim() || "(unspecified)"}
Design must speak to this age with feeling — and still feel like a book worth giving.

# Premise / Kernaussage
${input.praemisse.trim() || "(none)"}

# Idea dossier (short)
${idee || "(none)"}

# Tonality & style
${input.tonalitaet.trim() || "(unspecified)"}

# Key places (sensory atmosphere — not product locations)
${input.weltSchauplaetze.trim().slice(0, 2_000) || "(none)"}

# Characters (emotion / relationship — faces or silhouettes welcome; not catalog models)
${chars || "(none listed)"}

# Outline / manuscript excerpt
${manuskript || "(empty — invent from premise/genre/age only)"}

${extra ? `# Extra art direction\n${extra}\n` : ""}
Write the image brief now:
1) State how the image answers „Wann ist es genug?“ without any painted words (one sentence).
2) Name the CONTENT CONTRASTS you will show (Vorort/family vs skyline/finance; secure home vs too much money; conscience vs comfort) — pull them from premise/places above.
3) Describe ONE inventive visual that stages those contrasts as the emotional core — not a literal product scene.
4) Lighting + palette: LUMINOUS / inviting overall; reserved calm title zone; age-true; absolutely no text.
Forbidden: car ads, Kleinanzeigen/listing photos, dealership shine, sterile stock lifestyle, dark noir thriller look.`;

  return { systemInstruction, userText };
}

/** Final Flux prompt: artwork only, hard no-text (strip title leaks). */
export function buildRomanCoverFluxPrompt(
  sceneDescription: string,
  title = "",
  styleMandate = "",
): string {
  const cleanedScene = stripTitleLeakFromScene(sceneDescription, title);
  const scene =
    sanitizeFluxVisualCue(cleanedScene, 1_100) ||
    "Atmospheric literary book-cover scene, strong focal silhouette, moody premium light";
  const style = sanitizeFluxStyleCue(styleMandate, 1_000);

  return [
    COVER_STYLE_LOCK,
    style
      ? `MANDATORY TONALITY (emotion/mood only — keep it luminous; serve „Wann ist es genug?“; never a car ad, classified listing, or noir gloom): ${style}.`
      : "",
    FLUX_NO_TEXT_BLOCK,
    `Literary cover brief (visual answer to „Wann ist es genug?“ — no painted words): ${scene}.`,
    "Portrait full-bleed novel cover 1600×2560 (5:8, print @ 300 ppi), luminous inviting light, Vorort/family vs skyline/money contrast, calm title zone.",
    "Not an advertisement. Not a product photo. Not eBay Kleinanzeigen. Not a dark thriller poster. A bright, human cover that makes the viewer feel: when is it enough?",
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
- Prefer zone "lower" or "bottom" (or "center" when art clearly opens there). NEVER "top"/"upper" — author name is fixed in the top band; publisher mark is bottom-right.
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
};

/**
 * Art direction → Gemini 3 Pro Image → title overlay + author / subtitle / leseno.
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

  const plan = buildRomanCoverScenePlanPrompt({
    ...input,
    manuskriptRaw: outlineOrProse,
  });
  const sceneRaw = await generateText({
    model: textModel,
    systemInstruction: plan.systemInstruction,
    userText: plan.userText,
  });
  const sceneDescription = sceneRaw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!sceneDescription) {
    throw new Error("Gemini hat keine Cover-Szene geliefert.");
  }

  const title = input.title.trim();
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
  const chromeBlock = `\n\n— Chrome (code) —\nAutor oben mittig: ${author}\nUntertitel: ${untertitel || "(leer)"}\nleseno-Logo: unten rechts`;

  const debugPrompt = `— Art Direction (Bild ohne Text) —\n${sceneDescription}\n\n— Image Prompt —\n${promptUsed}${designBlock}${chromeBlock}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
  };
}
