/**
 * Social Media marketing post bank: 1–2 product highlights.
 * Angle ids are namespaced `mkt:feature` or `mkt:a+b` (sorted) — see Winkel angles in `motivation.ts`.
 *
 * Extras (`wissen`, `spass_ohne_druck`, …) are marketing-only — not package flags.
 * Package features reuse `PACKAGE_FEATURE_*` / landing blurbs.
 */

import { LANDING_FEATURE_BLURBS } from "@/lib/users/package-marketing";
import {
  isPackageFeatureId,
  PACKAGE_FEATURE_IDS,
  PACKAGE_FEATURE_LABELS,
  type PackageFeatureId,
} from "@/lib/users/packages";

export const MARKETING_ANGLE_PREFIX = "mkt:";

/**
 * Marketing-only highlights (story craft + Meine Welt personalization).
 * Order = picker order before package features.
 */
export const MARKETING_EXTRA_IDS = [
  "wissen",
  "spass_ohne_druck",
  "themen",
  "aengste",
  "wuensche",
  "interessen",
  "eigener_name",
  "freunde",
] as const;
export type MarketingExtraId = (typeof MARKETING_EXTRA_IDS)[number];

export type MarketingFeatureId = PackageFeatureId | MarketingExtraId;

/** Features offered in the Social marketing picker. */
export const SOCIAL_MARKETING_FEATURE_IDS: MarketingFeatureId[] = [
  ...MARKETING_EXTRA_IDS,
  ...PACKAGE_FEATURE_IDS,
];

const MARKETING_EXTRA_COPY: Record<
  MarketingExtraId,
  { title: string; blurb: string; sceneHint: string }
> = {
  wissen: {
    title: "Wissen",
    blurb:
      "Echte Infos aus dem wahren Leben fließen in die Geschichte — am Ende siehst du unter „Wissen“, was es war. Neugierige können dort mit „Warum?“ tiefer eintauchen.",
    sceneHint:
      "Familiar freckled messy-hair leseno kid mid-adventure with soft golden knowledge sparks settling into a warm lightbulb cluster at the end — facts woven in, revealed after reading, not mid-story UI",
  },
  spass_ohne_druck: {
    title: "Spaß ohne Druck",
    blurb:
      "Lesen aus Lust und Neugier — kein Schulgefühl, keine Bewertung, kein „musst du“. Die Geschichte soll Spaß machen; was hängen bleibt, kommt nebenbei.",
    sceneHint:
      "Familiar freckled messy-hair leseno kid mid-adventure with a glowing book, playful orange–gold energy, zero classroom pressure",
  },
  themen: {
    title: "Themen & Nebenthemen",
    blurb:
      "Freie Themenwahl — und ab Familie mit Mehr Tiefgang optional ein Nebenthema mit Mix-Muster. So entsteht genau die Geschichte, auf die man Lust hat.",
    sceneHint:
      "Familiar leseno kid stepping between two theme worlds as orange and gold portals overlapping into one adventure path — topic choice / mix metaphor",
  },
  aengste: {
    title: "Ängste behutsam",
    blurb:
      "In Meine Welt hinterlegte Ängste werden respektiert — und können bei Abenteuer/Motivierend ganz sanft eingebaut werden: ein kleiner Moment, den die Hauptfigur sicher meistert.",
    sceneHint:
      "Familiar freckled leseno kid facing a soft shadowy shape that turns into warm golden light — safe, kind, never scary",
  },
  wuensche: {
    title: "Wünsche",
    blurb:
      "„Das möchte ich mal erleben“ aus Meine Welt kann die Geschichte tragen — eigene Wünsche werden zum Abenteuerkern.",
    sceneHint:
      "Familiar leseno kid watching a soft glowing wish-orb open into an orange–gold story landscape — dream-to-story moment",
  },
  interessen: {
    title: "Eigene Interessen",
    blurb:
      "Was das Kind wirklich mag, fließt ein: Interessen aus Meine Welt werden zum Thema — die Geschichte fühlt sich persönlich an.",
    sceneHint:
      "Personal interest icons (shapes only, no text) orbiting the familiar freckled messy-hair leseno kid on cream — individuality, bold and clear",
  },
  eigener_name: {
    title: "Eigener Name",
    blurb:
      "Die Hauptfigur heißt wie das Kind — der eigene Name steht mitten in der Geschichte. Das macht Lesen persönlich und stolz.",
    sceneHint:
      "Proud familiar freckled messy-hair leseno kid at the center of a warm story world with soft name-badge shapes left blank (no letters)",
  },
  freunde: {
    title: "Freunde in der Geschichte",
    blurb:
      "Freundesliste aus Meine Welt: echte Freund:innen können mitspielen — als Nebenfiguren, die zur Geschichte gehören.",
    sceneHint:
      "Familiar leseno kid with a small crew of kid companions on an adventure path with orange–gold connection threads — no name tags",
  },
};

/** Visual direction per package feature — marketing/product energy. */
const MARKETING_SCENE_HINTS: Record<PackageFeatureId, string> = {
  lesemodus:
    "Familiar freckled messy-hair leseno kid calmly reading on a warm cream full-bleed surface with soft orange glow — same craft as Winkel, clearer product staging",
  buchclub:
    "Two illustrated kids (familiar leseno craft) connected by warm orange light threads / shared glowing story orbs — friendship product vibe",
  meine_welt:
    "Familiar freckled messy-hair leseno kid with floating interest icons (shapes only) around them on cream — personal world product highlight",
  meine_welt_familie:
    "Several illustrated kids under one warm parent umbrella of orange–gold light — multi-profile metaphor, same character craft as Winkel",
  buecherei:
    "Shelves of glowing story cards in orange–gold on cream — library product showcase, bold composition",
  fortsetzen:
    "Story path forking into a brighter next chapter portal of golden light — sequential product metaphor",
  mehr_tiefgang:
    "Layered story depths as translucent orange–gold planes with a small emotional beat — sophisticated product graphic",
  adventskalender:
    "24 soft doors in a warm orange–cream calendar grid with one door glowing gold — festive product marketing",
  export:
    "Story pages becoming a neat glowing PDF stack floating on cream — clean product benefit graphic",
  bilder:
    "Story page with a vivid illustrated panel bursting into the scene — illustration-in-story product highlight",
  warum:
    "After-reading knowledge moment: warm lightbulb / fact cards at the story's end with a soft golden dig-deeper glow — never a mid-story interrupt",
  hintergrund:
    "Deeper knowledge layers peeling open after Warum — richer warm glow behind a fact card at the end of the story",
  silbenmethode:
    "Gentle syllable rhythm as soft orange pulse marks under floating word shapes (shapes only, no letters) — literacy product vibe",
  vorlesen:
    "Warm sound waves / soft speaker glow near a parent–child reading silhouette — audio product marketing",
  markierung:
    "A single soft golden highlight bar gliding under abstract word-shapes (no readable text) — follow-along product cue",
};

export type MarketingFeatureHighlight = {
  id: MarketingFeatureId;
  title: string;
  blurb: string;
  sceneHint: string;
};

export type MarketingTopic = {
  /** Stable id stored as `social_media_posts.angle_id` for marketing posts. */
  id: string;
  /** Overlay / headline text (feature title or “A · B”). */
  title: string;
  /** Prompt insight: combined feature blurbs. */
  insight: string;
  sceneHint: string;
  features: MarketingFeatureHighlight[];
};

export function isMarketingExtraId(value: string): value is MarketingExtraId {
  return (MARKETING_EXTRA_IDS as readonly string[]).includes(value);
}

export function isMarketingFeatureId(
  value: string,
): value is MarketingFeatureId {
  return isPackageFeatureId(value) || isMarketingExtraId(value);
}

export function marketingFeatureHighlight(
  id: MarketingFeatureId,
): MarketingFeatureHighlight {
  if (isMarketingExtraId(id)) {
    const extra = MARKETING_EXTRA_COPY[id];
    return {
      id,
      title: extra.title,
      blurb: extra.blurb,
      sceneHint: extra.sceneHint,
    };
  }
  return {
    id,
    title: PACKAGE_FEATURE_LABELS[id],
    blurb: LANDING_FEATURE_BLURBS[id],
    sceneHint: MARKETING_SCENE_HINTS[id],
  };
}

/**
 * Builds a stable marketing angle id from 1–2 feature ids (sorted, unique).
 */
export function buildMarketingAngleId(
  featureIds: readonly MarketingFeatureId[],
): string {
  const unique = [...new Set(featureIds)];
  if (unique.length < 1 || unique.length > 2) {
    throw new Error("Marketing-Posts brauchen genau 1 oder 2 Funktionen.");
  }
  const sorted = [...unique].sort();
  return `${MARKETING_ANGLE_PREFIX}${sorted.join("+")}`;
}

/** Parses `mkt:…` angle ids; returns null if not a marketing id. */
export function parseMarketingAngleId(
  angleId: string,
): MarketingFeatureId[] | null {
  const raw = angleId.trim();
  if (!raw.startsWith(MARKETING_ANGLE_PREFIX)) return null;
  const body = raw.slice(MARKETING_ANGLE_PREFIX.length);
  if (!body) return null;
  const parts = body.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  const features: MarketingFeatureId[] = [];
  for (const part of parts) {
    if (!isMarketingFeatureId(part)) return null;
    if (features.includes(part)) return null;
    features.push(part);
  }
  return features;
}

export function getMarketingTopicByAngleId(
  angleId: string,
): MarketingTopic | null {
  const featureIds = parseMarketingAngleId(angleId);
  if (!featureIds) return null;
  return buildMarketingTopic(featureIds);
}

export function buildMarketingTopic(
  featureIds: readonly MarketingFeatureId[],
): MarketingTopic {
  const highlights = featureIds.map(marketingFeatureHighlight);
  const id = buildMarketingAngleId(featureIds);
  const title = highlights.map((h) => h.title).join(" · ");
  const insight = highlights.map((h) => `${h.title}: ${h.blurb}`).join("\n");
  const sceneHint =
    highlights.length === 1
      ? highlights[0]!.sceneHint
      : `Combine both product highlights in one joyful composition: (1) ${highlights[0]!.sceneHint}; (2) ${highlights[1]!.sceneHint}. Same illustrated leseno kid craft as Winkel posts; orange–gold–cream brand; never photo backgrounds.`;

  return { id, title, insight, sceneHint, features: highlights };
}

export function isMarketingAngleId(angleId: string): boolean {
  return parseMarketingAngleId(angleId) !== null;
}

export function marketingFeatureLabel(id: MarketingFeatureId): string {
  return marketingFeatureHighlight(id).title;
}
