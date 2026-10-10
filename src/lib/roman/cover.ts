/**
 * Roman book-cover pipeline:
 * Art director derives a book-specific emotional core, proposes 3 concepts,
 * picks one → GPT Image / catalog image model → Marketing typography brief →
 * exact title overlay + author (top-center) + Untertitel + leseno mark (bottom-center).
 */

import { generateImage } from "@/lib/ai/generate-image";
import { sanitizeFluxStyleCue } from "@/lib/ai/flux-prompt-guards";
import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  resolveRomanCoverImagesModel,
  resolveRomanLayoutModel,
  resolveRomanTextModel,
} from "@/lib/roman/model";
import { ensureRomanCoverExactSize } from "@/lib/roman/cover-compress";
import { ROMAN_COVER_GENERATE_SIZE } from "@/lib/roman/cover-size";
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
import type { RomanWissensGraph } from "@/lib/roman/editorial";
import { ROMAN_DEFAULT_AUTHOR } from "@/lib/roman/front-matter";
import type { RomanCharakter, RomanKontext } from "@/lib/roman/types";

/** Skip generic placeholders that are not real marketing subtitles. */
function usableCoverSubtitle(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 3) return "";
  if (/^roman$/i.test(s)) return "";
  return s;
}

/**
 * Soft sanitize for cover image prompts (GPT Image era).
 * Keep numbers/counts (two figures, f/2.8) — only strip quote glyphs that invite painted type.
 */
function sanitizeCoverImageCue(text: string, maxLen: number): string {
  return text
    .replace(/[„“”"«»'’']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Compact no-text guard — one short block; do not drown the creative brief. */
const COVER_NO_TEXT =
  "Absolutely no text, letters, numbers as glyphs, signs, logos, watermarks, UI, or captions anywhere in the artwork.";

export { ROMAN_COVER_SIZE } from "@/lib/roman/cover-size";

const MAX_MANUSCRIPT_FOR_SCENE = 10_000;

/**
 * Positive creative mandate for contemporary German trade covers.
 * GPT Image defaults to bland photorealism unless style is locked hard up front.
 */
const COVER_IMAGE_STYLE_LOCK = [
  "Award-winning contemporary German trade BOOK COVER — radical, shelf-stopping, instantly ownable",
  "ILLUSTRATED / GRAPHIC / PAINTED / PRINTED look — NOT generic photorealism, NOT a normal DSLR photo, NOT stock lifestyle",
  "FULL COLOR is mandatory — at least two clear chromatic hues (not grey, not charcoal-on-cream, not B&W, not silver monochrome)",
  "The mandatory art technique must dominate every pixel — brush, ink, collage grain, poster flatness, or stylized grade",
  "Extreme crop OR impossible scale OR hard graphic clash — polite mid-courage covers are a FAIL",
  "High chroma, tactile materials, thumbnail-readable silhouette",
  "Not Midjourney sludge, not flat clipart, not a product ad, not a dealership brochure, not a classified listing",
  "Pixar / 3D CGI only when the brief explicitly demands it",
].join(". ");

/** Hard ban on the greyscale / noir default GPT Image loves. */
const COVER_COLOR_LOCK = [
  "COLOR LOCK: paint a vivid multi-hue cover — name and use real colors (e.g. cadmium orange, teal, wine red, chrome yellow)",
  "FORBIDDEN default: black-and-white, greyscale, charcoal monochrome, silver-on-grey, ink-only noir without chromatic accents",
  "Shadows may be deep, but midtones and accents MUST carry saturated color — a grey book spine on the shelf is a FAIL",
].join(". ");

/** Genre/tone → concrete technique menu so the AD does not default to photo. */
export type CoverArtStyleMenu = {
  lane: string;
  /** Why this visual language fits books like this. */
  rationale: string;
  /** Techniques the three concepts should pick from (use DISTINCT ones). */
  techniques: string[];
  /** Looks that kill shelf impact for this lane. */
  avoid: string[];
  /** Clean photoreal only if true — still must be heavily graded/stylized. */
  allowStylizedPhoto: boolean;
};

/**
 * Picks a trade-cover visual lane from genre + tonality + age.
 * Used as a hard menu in the art-director prompt (not a soft hint).
 */
export function coverArtStyleMenuForBook(input: {
  genre: string;
  tonalitaet?: string;
  alterLabel?: string;
}): CoverArtStyleMenu {
  const g = `${input.genre} ${input.tonalitaet ?? ""} ${input.alterLabel ?? ""}`.toLowerCase();

  if (
    /kinder|bilderbuch|clever|erstleser|vorschule|8–10|8-10|10–12|10-12/.test(g)
  ) {
    return {
      lane: "children-adventure",
      rationale:
        "Children's / knowledge adventure: character-forward CGI or bold picture-book illustration — never adult photoreal.",
      techniques: [
        "Pixar-like 3D feature-animation still with tactile materials",
        "bold flat gouache picture-book illustration",
        "chunky graphic poster shapes with friendly hero face",
        "paper-cut collage with saturated adventure colors",
      ],
      avoid: [
        "adult photoreal lifestyle",
        "horror noir",
        "beige prestige photo",
      ],
      allowStylizedPhoto: false,
    };
  }

  if (/thriller|krimi|crime|suspense|spannung|horror|noir|agent/.test(g)) {
    return {
      lane: "thriller-noir",
      rationale:
        "Thriller/crime bestsellers win with graphic punch and COLOR accents (blood red, toxic green, sodium orange) — never plain greyscale noir.",
      techniques: [
        "high-contrast black-and-red linocut / woodcut with warm paper tint",
        "neon-noir illustration in cyan + magenta on deep indigo (stylized, not clean photo)",
        "silkscreen poster with crushed blacks and electric orange/yellow accent",
        "graphic crime poster painting with toxic green fog and scarlet prop",
        "stylized cinematic illustration with sodium-vapor amber and cold blue clash",
      ],
      avoid: [
        "clean photoreal DSLR",
        "plain black-and-white / greyscale noir",
        "golden-hour suburb photo",
        "soft beige prestige",
      ],
      allowStylizedPhoto: true,
    };
  }

  if (/fantasy|magie|myth|saga|dark.?fantasy/.test(g)) {
    return {
      lane: "fantasy-epic",
      rationale:
        "Fantasy covers sell through painterly or graphic myth — not photoreal cosplay.",
      techniques: [
        "oil-impasto epic illustration",
        "luminous fantasy poster painting",
        "etched ink + gold-accent graphic",
        "matte digital painting with sculptural light",
      ],
      avoid: ["photoreal cosplay", "stock forest photo", "soft lifestyle"],
      allowStylizedPhoto: false,
    };
  }

  if (/ya|jugend|young.?adult|abenteuer/.test(g)) {
    return {
      lane: "ya-contemporary",
      rationale:
        "YA hits use bold graphic/illustrated covers with electric color — not adult stock photography.",
      techniques: [
        "bold graphic-novel illustration",
        "saturated enamel poster with hard shapes",
        "risograph-inspired limited-palette print",
        "stylized cinematic illustration (painted, not photo)",
      ],
      avoid: ["adult photoreal", "muted beige", "generic mist silhouette"],
      allowStylizedPhoto: false,
    };
  }

  if (/satire|humor|komödie|ironisch|gesellschaft/.test(g)) {
    return {
      lane: "gesellschaftssatire",
      rationale:
        "German Gesellschaftssatire / Feuilleton hits look designed: enamel, collage, flat graphic wit in ACID or POP color — never greyscale suburbia.",
      techniques: [
        "bold enamel advertising-poster illustration with satirical twist and loud brand-like colors",
        "cut-paper / magazine collage montage in clashy CMYK hues",
        "flat gouache with hard shadows and acid yellow / coral / teal",
        "silkscreen pop-graphic with one oversized story object in primary colors",
        "German book-design constructivist geometry + one figurative anchor in two strong hues",
      ],
      avoid: [
        "generic photorealism",
        "black-and-white / greyscale satire",
        "car brochure chrome",
        "soft lifestyle stock",
        "misty literary fog",
      ],
      allowStylizedPhoto: false,
    };
  }

  if (
    /literar|belletristik|feuilleton|poetisch|gesellschaftsroman|gegenwart/.test(
      g,
    )
  ) {
    return {
      lane: "literary-trade",
      rationale:
        "Literary trade covers earn attention with printmaking and conceptual metaphor in a CHROMATIC limited palette — not grey aquatint.",
      techniques: [
        "color aquatint / etching with indigo and warm ochre",
        "limited-palette oil painterly illustration (two vivid hues + deep accent)",
        "risograph literary poster in fluorescent pink + teal",
        "conceptual collage with tactile paper grain and saturated scraps",
        "flat modernist book-design graphic with one sharp object in bold color field",
      ],
      avoid: [
        "photoreal lifestyle",
        "beige prestige wash",
        "greyscale / monochrome literary fog",
        "stock couple photo",
      ],
      allowStylizedPhoto: false,
    };
  }

  if (/romance|liebe|feel.?good|womens?.fiction/.test(g)) {
    return {
      lane: "romance-commercial",
      rationale:
        "Commercial romance/feel-good: painterly or graphic warmth — not Instagram couple photos.",
      techniques: [
        "warm painterly illustration with decisive color",
        "soft gouache with bold silhouette",
        "graphic poster with romantic accent color",
      ],
      avoid: ["photoreal couple stock", "generic sunset photo"],
      allowStylizedPhoto: false,
    };
  }

  // Default: contemporary commercial DE fiction
  return {
    lane: "commercial-contemporary",
    rationale:
      "Broad-audience contemporary fiction: designed graphic/illustrated covers beat anonymous photoreal every time.",
    techniques: [
      "bold commercial enamel poster illustration",
      "high-chroma graphic collage",
      "flat gouache with hard cinematic light",
      "silkscreen-inspired limited palette",
      "stylized cinematic painting (clearly painted, not photo)",
    ],
    avoid: [
      "generic photorealism 0815",
      "black-and-white / greyscale",
      "soft stock lifestyle",
      "dealership car photo",
      "beige prestige",
    ],
    allowStylizedPhoto: false,
  };
}

function formatCoverArtStyleMenuForPrompt(menu: CoverArtStyleMenu): string {
  return [
    `Visual lane: ${menu.lane}`,
    `Why: ${menu.rationale}`,
    `Pick artTechnique for each concept from this menu (use THREE DIFFERENT techniques):`,
    ...menu.techniques.map((t) => `  • ${t}`),
    `Avoid: ${menu.avoid.join("; ")}`,
    "COLOR: every concept needs a chromatic colorStory (2+ named hues). Greyscale / B&W / silver monochrome is FORBIDDEN unless the manuscript is literally about blindness to color.",
    menu.allowStylizedPhoto
      ? "Stylized graded photo is allowed ONLY as one of three concepts — and must still look designed with color grade (not B&W), never clean DSLR photoreal."
      : "Photorealism is BANNED for this book. Every concept must be clearly illustrated, printed, painted, or poster-graphic — in color.",
  ].join("\n");
}

/** Story-true props (cars, places, objects) — never invent a different make/color/era. */
const COVER_STORY_FIDELITY_LOCK = [
  "STORY FIDELITY: every visible vehicle, building landmark, costume era, and signature prop MUST match the book canon below",
  "If a car appears: use the EXACT make/model/color/condition/era from the book — never a random shiny sedan or luxury hero shot",
  "Vehicles are narrative props or metaphors (wreck, fragment, reflection, extreme crop) — NEVER a car-advertisement product plate",
  "If canon is silent on a detail, omit that detail or keep it generic — do NOT invent a conflicting brand or color",
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
  /** Named palette: dominant + accents — never default beige/grey prestige. */
  colorStory: string;
  /** One-line hook a stranger notices at thumbnail size. */
  visualHook: string;
  /** Composition risk that makes this concept non-safe (crop / scale / clash). */
  boldRisk: string;
};

/** Book-specific cover plan: unique thesis → 3 concepts → one pick. */
export type CoverConceptPlan = {
  /** One visual question only THIS book answers (not a universal motto). */
  emotionalCore: string;
  /** Dominant metaphor pulled from premise / places / tone. */
  dominantMetaphor: string;
  /** Why THIS illustrated/graphic language fits genre + content. */
  styleThesis: string;
  /** Genre lane id from {@link coverArtStyleMenuForBook}. */
  visualLane: string;
  /** Canon props locked for the image model (vehicles, places, objects). */
  lockedProps: string[];
  concepts: CoverConcept[];
  chosenId: string;
  chosenRationale: string;
};

function formatCharBrief(chars: RomanCharakter[]): string {
  return chars
    .filter((c) => c.name.trim())
    .slice(0, 8)
    .map((c) => {
      const bits = [
        c.name.trim(),
        c.alter.trim() && `Alter ${c.alter.trim()}`,
        c.rolle.trim(),
        c.wesenszuege.trim() && `Wesenszüge: ${c.wesenszuege.trim().slice(0, 120)}`,
        c.motivation.trim() && `will ${c.motivation.trim().slice(0, 100)}`,
        c.schwaeche.trim() && `Schwäche: ${c.schwaeche.trim().slice(0, 80)}`,
      ].filter(Boolean);
      return `– ${bits.join("; ")}`;
    })
    .join("\n");
}

const VEHICLE_HINT =
  /\b(auto|wagen|fahrzeug|pkw|lkw|bus|motorrad|scooter|cabrio|limousine|kombi|suv|transporter|golf|passat|polo|bmw|audi|mercedes|opel|vw|volkswagen|ford|toyota|tesla|porsche|fiat|renault|peugeot|citroen|skoda|seat|hyundai|kia|mazda|nissan|volvo|trabant|wartburg)\b/i;

/**
 * Compact canon lines for cover art: props/places (+ vehicle-ish persons facts)
 * with frozen attrs so the image model cannot invent a different car/color.
 */
export function formatCoverCanonProps(
  graph: RomanWissensGraph | null | undefined,
): string {
  if (!graph?.nodes?.length) return "";
  const lines: string[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== "prop" && n.kind !== "place" && n.kind !== "motif") {
      continue;
    }
    const blob = `${n.label} ${n.summary} ${Object.values(n.attrs).join(" ")}`;
    const isVehicle =
      n.kind === "prop" &&
      (VEHICLE_HINT.test(blob) ||
        Object.keys(n.attrs).some((k) =>
          /marke|modell|farbe|kennzeichen|baujahr|typ|fahrzeug/i.test(k),
        ));
    if (n.kind === "motif" && !isVehicle && !VEHICLE_HINT.test(blob)) {
      continue;
    }
    const attrBits = Object.entries(n.attrs)
      .filter(
        ([k, v]) =>
          v.trim() &&
          !/^(status|introducedChapter|resolvedChapter)$/i.test(k),
      )
      .slice(0, 10)
      .map(([k, v]) => `${k}=${v.trim().slice(0, 80)}`);
    const tag = isVehicle ? "VEHICLE" : n.kind.toUpperCase();
    lines.push(
      `– [${tag}] ${n.label}${n.summary ? `: ${n.summary.slice(0, 160)}` : ""}${
        attrBits.length ? ` | ${attrBits.join("; ")}` : ""
      }`,
    );
    if (lines.length >= 18) break;
  }
  for (const inv of graph.hardInvariants ?? []) {
    const t = inv.trim();
    if (!t) continue;
    if (
      VEHICLE_HINT.test(t) ||
      /\b(farbe|marke|modell|kennzeichen|ort|haus|straße)\b/i.test(t)
    ) {
      lines.push(`– [INVARIANT] ${t.slice(0, 220)}`);
    }
    if (lines.length >= 24) break;
  }
  return lines.join("\n");
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
    sceneBrief: sceneBrief.slice(0, 2_800),
    artTechnique: String(o.artTechnique ?? o.technique ?? "")
      .trim()
      .slice(0, 280),
    lighting: String(o.lighting ?? o.mood ?? "")
      .trim()
      .slice(0, 280),
    colorStory: String(o.colorStory ?? o.palette ?? "")
      .trim()
      .slice(0, 280),
    visualHook: String(o.visualHook ?? o.hook ?? "")
      .trim()
      .slice(0, 200),
    boldRisk: String(o.boldRisk ?? o.risk ?? "")
      .trim()
      .slice(0, 240),
  };
}

function asLockedProps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter((s) => s.length >= 4)
    .slice(0, 12)
    .map((s) => s.slice(0, 200));
}

/**
 * Fallback when the planner JSON fails: one symbolic brief from raw prose.
 */
function fallbackCoverConceptPlan(
  sceneRaw: string,
  title: string,
): CoverConceptPlan {
  const brief =
    sceneRaw.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 2_800) ||
    `Bold cinematic book-cover for ${title || "untitled"} — one sharp metaphor, dramatic color, no painted text.`;
  const concept: CoverConcept = {
    id: "A",
    approach: "symbolic",
    label: "Fallback single concept",
    sceneBrief: brief,
    artTechnique: "bold enamel advertising-poster illustration with satirical twist",
    lighting: "hard graphic poster light, no soft golden fog",
    colorStory:
      "petrol teal field plus cadmium orange accent and warm bone highlight — never greyscale",
    visualHook: "one oversized story object cutting the frame",
    boldRisk: "extreme close crop on the story object, half out of frame",
  };
  return {
    emotionalCore: `What does ${title || "this book"} make a stranger feel before they open it?`,
    dominantMetaphor: "one strong story-true visual metaphor",
    styleThesis: "Commit to a bold non-photoreal technique so the cover is designed, not stock.",
    visualLane: "commercial-contemporary",
    lockedProps: [],
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
  /** Frozen props/places from Wissensgraph (vehicles with make/color…). */
  coverCanonProps?: string;
}): { systemInstruction: string; userText: string } {
  const title = input.title.trim() || "(untitled)";
  const styleMenu = coverArtStyleMenuForBook({
    genre: input.genre,
    tonalitaet: input.tonalitaet,
    alterLabel: input.alterLabel,
  });
  const styleMenuBlock = formatCoverArtStyleMenuForPrompt(styleMenu);

  const systemInstruction = `You are a ruthless senior cover art director for Spiegel/Amazon-DE bestsellers.
Safe photorealism and mid-courage covers get you fired. You pitch DESIGNED images a stranger would screenshot.

GPT Image 2.5 defaults to boring photorealism unless you LOCK a print/illustration technique in every brief. Vague = boring. Photo 0815 = FAIL.

# Process (mandatory)
1) Distill ONE book-specific emotionalCore (1 short sentence).
2) Name ONE dominantMetaphor — concrete object + twist from THIS book.
3) styleThesis: one sentence — why the chosen illustrated/graphic language fits THIS genre + THIS content (not a universal motto).
4) visualLane: must be "${styleMenu.lane}".
5) lockedProps: 2–8 canon facts (cars/places/objects with make/color/era). Never invent conflicting brands.
6) Propose EXACTLY 3 concepts with DISTINCT artTechnique values taken from the STYLE MENU below — never three variants of the same photo look:
   - A symbolic — impossible scale / reflection / two worlds in one object
   - B figurative — charged story beat — NOT a posed catalog portrait into mist
   - C graphic — hardest crop / poster clash (ZERO painted letters)
7) Each concept MUST have boldRisk (a risk a timid AD would reject). Mid courage = invalid.
8) chosenId = bravest canon-true concept. Prefer louder COLOR + harder technique commitment over "pretty photo" or greyscale.
9) colorStory: name at least TWO chromatic hues (e.g. "petrol teal field, cadmium orange car fragment, warm bone highlight"). FORBIDDEN: beige/taupe/dusty grey prestige, soft cream lifestyle, black-and-white, greyscale, charcoal-only, silver monochrome.
10) visualHook: thumbnail read in 0.3s — color must help the hook.

# STYLE MENU (hard — do not ignore)
${styleMenuBlock}

# ANTI-PHOTOREALISM
- Do NOT write "photorealistic", "realistic photo", "DSLR", "cinematic still photo", or "stock photo" unless the menu explicitly allows stylized photo — and even then only for ONE concept, heavily graded.
- Every sceneBrief MUST start with: "Rendered as <artTechnique>:" so the image model cannot drift into 0815 photo.
- Technique must be visible: ink edges, brush strokes, paper grain, flat poster ink, collage cuts, crushed duotone — not invisible "polish".

# STORY FIDELITY (non-negotiable)
- Vehicles/props/landmarks: ONLY book make/model/color/condition/era.
- Cars as narrative metaphor (crop, wreck, reflection) — never dealership/Kleinanzeigen product hero.
- If canon is silent, do not invent a conflicting brand/color.

# sceneBrief craft (each concept, 140–220 English words)
- FIRST LINE: "Rendered as <artTechnique>:"
- Then HOOK + risky camera/crop.
- Explicitly name the hues in the scene (not just "dark" / "moody").
- Materials/textures; foreground / mid / background.
- Restate canon identity of any vehicle/prop (including its COLOR).
- Lower-third breathing room for title — no painted UI bars.
- Do not paint author or publisher mark.

# HARD BAN
- Generic photorealism / clean lifestyle photo
- Black-and-white, greyscale, monochrome ink, silver-on-grey "prestige noir"
- Lone mist silhouette, floating objects on soft gradient
- Back-to-camera horizon pose
- Beige prestige wash, car brochure chrome
- Mid-courage "pretty book photo" that could sell any novel

Hard rules:
- English only. ONLY valid JSON (no markdown fences).
- ZERO painted text/letters/logos/UI.
- Tall portrait 1600×2400 (2:3).

JSON shape:
{
  "emotionalCore": "…",
  "dominantMetaphor": "…",
  "styleThesis": "why this visual language fits THIS book…",
  "visualLane": "${styleMenu.lane}",
  "lockedProps": ["canon fact…", "…"],
  "concepts": [
    {
      "id": "A",
      "approach": "symbolic",
      "label": "short punchy name",
      "visualHook": "thumbnail hook…",
      "boldRisk": "what makes this non-safe…",
      "colorStory": "dominant + accents…",
      "artTechnique": "exact technique from STYLE MENU…",
      "lighting": "…",
      "sceneBrief": "Rendered as …: full brief…"
    },
    { "id": "B", "approach": "figurative", "label": "…", "visualHook": "…", "boldRisk": "…", "colorStory": "…", "artTechnique": "…", "lighting": "…", "sceneBrief": "Rendered as …: …" },
    { "id": "C", "approach": "graphic", "label": "…", "visualHook": "…", "boldRisk": "…", "colorStory": "…", "artTechnique": "…", "lighting": "…", "sceneBrief": "Rendered as …: …" }
  ],
  "chosenId": "A"|"B"|"C",
  "chosenRationale": "name boldRisk + technique + canon fidelity"
}`;

  let manuskript = input.manuskriptRaw.trim();
  if (manuskript.length > MAX_MANUSCRIPT_FOR_SCENE) {
    manuskript = `${manuskript.slice(0, MAX_MANUSCRIPT_FOR_SCENE)}\n\n[… truncated …]`;
  }

  const chars = formatCharBrief(input.charaktere);
  const extra = input.extraInstruction?.trim();
  const idee = (input.ideeKurz ?? "").trim().slice(0, 4_000);
  const canon = (input.coverCanonProps ?? "").trim();

  const userText = `Plan the cover (JSON only). First lock STYLE from the menu for lane "${styleMenu.lane}", then three RISKY non-photo concepts, then pick the bravest canon-true one.

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

# Tonality & style (use this to refine technique choice inside the lane)
${input.tonalitaet.trim() || "(unspecified)"}

# Key places (sensory atmosphere — steal textures from here)
${input.weltSchauplaetze.trim().slice(0, 2_000) || "(none)"}

# Characters
${chars || "(none listed)"}

# Canon props / vehicles / places (LOCKED)
${canon || "(no graph props — mine only from premise/idea/places/manuscript; stay consistent)"}

# Outline / manuscript excerpt
${manuskript || "(empty — invent from premise/genre/age only)"}

${extra ? `# Extra art direction\n${extra}\n` : ""}
Remember: styleThesis + three DIFFERENT menu techniques → NO photoreal 0815 → chosenId = loudest faithful. Cars must be the book's car.`;

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
    const styleThesis =
      String(parsed.styleThesis ?? "").trim().slice(0, 360) ||
      "Designed illustrated/graphic cover language — not photoreal stock.";
    const visualLane =
      String(parsed.visualLane ?? "").trim().slice(0, 80) ||
      "commercial-contemporary";
    const lockedProps = asLockedProps(parsed.lockedProps);

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
      styleThesis,
      visualLane,
      lockedProps,
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

/**
 * Final image prompt for GPT Image / catalog cover models.
 * Scene leads; technique/color reinforce; short no-text — no FLUX sludge walls.
 */
export function buildRomanCoverFluxPrompt(
  sceneDescription: string,
  title = "",
  styleMandate = "",
  plan?: Pick<
    CoverConceptPlan,
    | "emotionalCore"
    | "dominantMetaphor"
    | "lockedProps"
    | "styleThesis"
    | "visualLane"
  > & {
    artTechnique?: string;
    lighting?: string;
    colorStory?: string;
    visualHook?: string;
    boldRisk?: string;
  },
): string {
  const cleanedScene = stripTitleLeakFromScene(sceneDescription, title);
  const scene =
    sanitizeCoverImageCue(cleanedScene, 2_400) ||
    "Bold designed book-cover scene, one sharp focal silhouette, decisive color, tactile print texture";
  const style = sanitizeFluxStyleCue(styleMandate, 800);
  const core = sanitizeCoverImageCue(plan?.emotionalCore ?? "", 320);
  const metaphor = sanitizeCoverImageCue(plan?.dominantMetaphor ?? "", 240);
  const technique =
    sanitizeCoverImageCue(plan?.artTechnique ?? "", 280) ||
    "bold enamel advertising-poster illustration";
  const lighting = sanitizeCoverImageCue(plan?.lighting ?? "", 280);
  const colorStory = sanitizeCoverImageCue(plan?.colorStory ?? "", 280);
  const visualHook = sanitizeCoverImageCue(plan?.visualHook ?? "", 200);
  const boldRisk = sanitizeCoverImageCue(plan?.boldRisk ?? "", 240);
  const styleThesis = sanitizeCoverImageCue(plan?.styleThesis ?? "", 320);
  const visualLane = sanitizeCoverImageCue(plan?.visualLane ?? "", 80);
  const locked =
    plan?.lockedProps
      ?.map((p) => sanitizeCoverImageCue(p, 180))
      .filter(Boolean)
      .slice(0, 10) ?? [];

  // Technique + color FIRST — GPT Image otherwise collapses to grey photorealism.
  return [
    `MANDATORY ART TECHNIQUE (every pixel — NOT photorealism, NOT a normal photo): ${technique}.`,
    COVER_COLOR_LOCK,
    colorStory
      ? `Color story (obey — full color, no B&W/greyscale): ${colorStory}.`
      : "Color story: use at least two vivid chromatic hues — never greyscale.",
    styleThesis ? `STYLE THESIS: ${styleThesis}.` : "",
    visualLane ? `Visual lane: ${visualLane}.` : "",
    visualHook ? `THUMBNAIL HOOK: ${visualHook}.` : "",
    boldRisk ? `BOLD RISK (must be visible): ${boldRisk}.` : "",
    `COVER SCENE (execute in the mandatory technique, in color): ${scene}`,
    locked.length
      ? `LOCKED CANON PROPS (do not substitute): ${locked.join(" | ")}.`
      : "",
    COVER_STORY_FIDELITY_LOCK,
    COVER_IMAGE_STYLE_LOCK,
    `Again: render strictly as ${technique} in FULL COLOR — reject greyscale, B&W, and clean DSLR photorealism.`,
    core
      ? `Emotional core to answer visually (never paint these words): ${core}.`
      : "",
    metaphor ? `Dominant metaphor: ${metaphor}.` : "",
    lighting
      ? `Lighting (serve the technique + genre — colored light welcome): ${lighting}.`
      : "",
    style
      ? `Tonality cues from the manuscript (serve the book): ${style}.`
      : "",
    "Full-bleed portrait novel cover 1600×2400 (2:3), breathing room in the lower third for later typography and a bottom-center publisher mark, no painted UI bars or reserved empty rectangles.",
    "This must feel like ONLY this book — designed print/illustration energy in color, not stock, not a car ad, not a grey art print.",
    COVER_NO_TEXT,
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
- Prefer zone "lower" or "bottom" (or "center" when art clearly opens there). NEVER "top"/"upper" — author name is fixed in the top band; publisher mark is bottom-center.
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
  /** Frozen vehicle/place props from editorial Wissensgraph. */
  wissensGraph?: RomanWissensGraph | null;
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

  const coverCanonProps = formatCoverCanonProps(input.wissensGraph);
  const planPrompt = buildRomanCoverConceptPlanPrompt({
    ...input,
    manuskriptRaw: outlineOrProse,
    coverCanonProps,
  });
  const planRaw = await generateText({
    model: textModel,
    preferJson: true,
    maxTokens: 4_000,
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
    throw new Error("Art Direction hat keine Cover-Szene geliefert.");
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
      styleThesis: conceptPlan.styleThesis,
      visualLane: conceptPlan.visualLane,
      lockedProps: conceptPlan.lockedProps,
      artTechnique: chosen.artTechnique,
      lighting: chosen.lighting,
      colorStory: chosen.colorStory,
      visualHook: chosen.visualHook,
      boldRisk: chosen.boldRisk,
    },
  );
  const result = await generateImage({
    model: imagesModel,
    prompt: promptUsed,
    sizePx: 2048,
    aspectRatio: "2:3",
    // GPT Image 2.5: native 1600×2400 — do not generate smaller then upscale.
    sizeExact: ROMAN_COVER_GENERATE_SIZE,
    outputFormat: "jpeg",
    quality: "xhigh",
  });

  // Snap API output to exact 1600×2400 before typography (no-op when already exact).
  let dataUrl = await ensureRomanCoverExactSize(result.dataUrl);
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
  // Overlay composites on a fixed 1600×2400 canvas → exact pixel size out.
  dataUrl = await overlayCoverTitleByDesign({
    imageDataUrl: dataUrl,
    design: design ?? defaultCoverTitleDesign(title, genreFont),
    author,
    subtitle: untertitel,
    lesenoMark: true,
  });
  dataUrl = await ensureRomanCoverExactSize(dataUrl);

  const designBlock = design
    ? `\n\n— Typografie (Bestseller-Display) —\n${JSON.stringify(design, null, 2)}`
    : "";
  const chromeBlock = `\n\n— Chrome (code) —\nAutor oben mittig: ${author}\nUntertitel: ${untertitel || "(leer)"}\nleseno-Logo: unten mittig`;
  const conceptBlock = `\n\n— Konzeptplan —\nLane: ${conceptPlan.visualLane}\nStyle-Thesis: ${conceptPlan.styleThesis}\nKern: ${conceptPlan.emotionalCore}\nMetapher: ${conceptPlan.dominantMetaphor}\nLocked Props: ${conceptPlan.lockedProps.join(" · ") || "(keine)"}\nGewählt: ${chosen.id} (${chosen.approach}) — ${chosen.label}\nHook: ${chosen.visualHook || "(n/a)"}\nBold Risk: ${chosen.boldRisk || "(n/a)"}\nFarbe: ${chosen.colorStory || "(n/a)"}\nTechnik: ${chosen.artTechnique || "(n/a)"}\nLicht: ${chosen.lighting || "(n/a)"}\nWarum: ${conceptPlan.chosenRationale || "(n/a)"}\nAlternativen: ${conceptPlan.concepts
    .filter((c) => c.id !== chosen.id)
    .map(
      (c) =>
        `${c.id}/${c.approach}: ${c.label} [${c.artTechnique || "?"}]`,
    )
    .join("; ") || "(keine)"}${
    coverCanonProps
      ? `\nCanon (Wissensgraph):\n${coverCanonProps}`
      : ""
  }`;

  const debugPrompt = `— Art Direction (Buch-Kern + 3 Konzepte → Wahl) —\n${sceneDescription}${conceptBlock}\n\n— Image Prompt —\n${promptUsed}${designBlock}${chromeBlock}`;

  return {
    dataUrl,
    sceneDescription,
    promptUsed: debugPrompt,
    conceptPlan,
  };
}
