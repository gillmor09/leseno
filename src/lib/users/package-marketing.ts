/**
 * Marketing copy helpers for packages — aligned with `membership_packages.features`.
 */

import {
  PACKAGE_FEATURE_LABELS,
  packageHasFeature,
  type MembershipPackage,
  type PackageFeatureId,
  type UserPackageId,
} from "@/lib/users/packages";

/** Feature rows for the comparison matrix (order = scan order for parents). */
export const PACKAGE_COMPARE_FEATURE_IDS: PackageFeatureId[] = [
  "lesemodus",
  "buchclub",
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
  "fortsetzen",
  "mehr_tiefgang",
  "adventskalender",
  "export",
  "bilder",
  "warum",
  "hintergrund",
  "silbenmethode",
  "vorlesen",
  "markierung",
];

export const PACKAGE_COMPARE_FEATURE_HINTS: Partial<
  Record<PackageFeatureId, string>
> = {
  lesemodus: "Vollbild mit Schrift & Abständen",
  buchclub: "Freunde, Likes & geteilte Geschichten",
  meine_welt: "Persönliches Kinderprofil",
  meine_welt_familie: "Mehrere Kinder-Profile",
  buecherei: "Geschichten speichern & erneut lesen",
  fortsetzen: "„Wie könnte es weitergehen?“",
  mehr_tiefgang: "Nebenthema-Mix & realistische Konflikte",
  adventskalender: "24 Tage, tagesweise öffnen",
  export: "Als PDF speichern",
  bilder: "Illustrationen in der Geschichte",
  warum: "Am Ende bei Wissen: „Warum?“ zum Fakt",
  hintergrund: "Noch mehr Wissen nach dem „Warum?“",
  silbenmethode: "Silbenhilfe beim Lesen",
  vorlesen: "Vorlesen mit Tempo",
  markierung: "Wort-Markierung beim Vorlesen",
};

const PAID_TAGLINES: Record<Exclude<UserPackageId, "basis">, string> = {
  plus: "Mehr Geschichten im Alltag",
  pro: "Für die ganze Lesefamilie",
  ultimate: "Alles für Lesefluss & Vorlesen",
};

const PAID_BLURBS: Record<Exclude<UserPackageId, "basis">, string> = {
  plus: "Jeden Monat Credits zum Buchungstag — und sie verfallen nie. Dazu Meine Bücherei, ein Kinderprofil, PDF-Export und der Buchclub.",
  pro: "Mehrere Kinder-Profile, Bücherei, Buchclub, Bilder, „Warum?“, Fortsetzungen und Mehr Tiefgang — wenn leseno zum Familien-Ritual wird.",
  ultimate:
    "Alles aus Familie plus Silbenhilfe, Vorlesen mit Wort-Markierung, PDF-Export, tieferes Hintergrundwissen und das Adventskalenderbuch.",
};

/** Pricing-card bullet: inherited tier vs. incremental extras. */
export type MarketingBullet = {
  text: string;
  /** `included` = check (Alles von …); `extra` = plus (Zusatz). */
  kind: "included" | "extra";
};

const FEATURE_BULLET_ORDER: PackageFeatureId[] = [
  "lesemodus",
  "buchclub",
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
  "fortsetzen",
  "mehr_tiefgang",
  "adventskalender",
  "export",
  "bilder",
  "warum",
  "hintergrund",
  "silbenmethode",
  "vorlesen",
  "markierung",
];

function featureBulletText(
  pkg: MembershipPackage,
  feature: PackageFeatureId,
): string | null {
  switch (feature) {
    case "lesemodus":
      return "Lesemodus: Vollbild mit Schrift & Abständen";
    case "buchclub":
      return "Mein Buchclub: Freunde einladen und Geschichten teilen";
    case "meine_welt_familie":
      return "Meine Welt für beliebig viele Kinder";
    case "meine_welt":
      return packageHasFeature(pkg, "meine_welt_familie")
        ? null
        : "Meine Welt für ein Kind";
    case "buecherei":
      return "Meine Bücherei: Geschichten speichern und erneut lesen";
    case "fortsetzen":
      return "Geschichten fortsetzen („Wie könnte es weitergehen?“)";
    case "mehr_tiefgang":
      return "Mehr Tiefgang: Nebenthema-Mix und realistische Konflikte";
    case "adventskalender":
      return "Adventskalenderbuch: 24 Tage mit PIN-Vorschau für Eltern";
    case "export":
      return "Export als PDF zum Offline-Lesen";
    case "bilder":
      return "Bilder in den Geschichten";
    case "warum":
      return "Nach der Geschichte unter Wissen: „Warum?“ erklärt den Hintergrund zu einem Fakt";
    case "hintergrund":
      return "„Ich will mehr wissen“ für noch tieferes Wissen nach dem „Warum?“";
    case "silbenmethode":
      return "Silbenhilfe für den Lesefluss";
    case "vorlesen":
      return "Vorlesen mit einstellbarem Tempo";
    case "markierung":
      return "Wort-Markierung beim Vorlesen";
    default:
      return null;
  }
}

function creditsBulletText(credits: number): string {
  const sehrKurz = Math.floor(credits / 10);
  const mittel = Math.floor(credits / 30);
  return `jeden Monat ${credits} Credits (verfallen nie; z. B. bis ca. ${sehrKurz} sehr kurze oder ca. ${mittel} mittlere Geschichten)`;
}

function previousPackageInCatalog(
  pkg: MembershipPackage,
  catalog: readonly MembershipPackage[],
): MembershipPackage | null {
  const ordered = [...catalog].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((row) => row.id === pkg.id);
  if (index <= 0) return null;
  return ordered[index - 1] ?? null;
}

/**
 * Pricing-card bullets.
 * - Plus: flat checklist (check icons), credits first — no „Alles von Basis“.
 * - Familie / Komplett: „Alles von …“ (check) + only incremental extras (plus).
 */
export function marketingBulletsForPackage(
  pkg: MembershipPackage,
  catalog: readonly MembershipPackage[] = [],
): MarketingBullet[] {
  if (pkg.id === "plus") {
    const bullets: MarketingBullet[] = [];
    if (pkg.credits > 0) {
      bullets.push({ kind: "included", text: creditsBulletText(pkg.credits) });
    }
    for (const feature of FEATURE_BULLET_ORDER) {
      if (!packageHasFeature(pkg, feature)) continue;
      const text = featureBulletText(pkg, feature);
      if (!text) continue;
      bullets.push({ kind: "included", text });
    }
    return bullets;
  }

  const previous =
    catalog.length > 0 ? previousPackageInCatalog(pkg, catalog) : null;
  const bullets: MarketingBullet[] = [];

  if (previous) {
    bullets.push({
      kind: "included",
      text: `Alles von ${previous.label}`,
    });
  }

  const previousFeatures = new Set(previous?.features ?? []);
  for (const feature of FEATURE_BULLET_ORDER) {
    if (!packageHasFeature(pkg, feature)) continue;
    if (previousFeatures.has(feature)) continue;
    const text = featureBulletText(pkg, feature);
    if (!text) continue;
    bullets.push({ kind: "extra", text });
  }

  const previousCredits = previous?.credits ?? 0;
  if (pkg.credits > previousCredits) {
    bullets.push({
      kind: "extra",
      text: creditsBulletText(pkg.credits),
    });
  }

  return bullets;
}

export function marketingTaglineForPackage(pkg: MembershipPackage): string {
  if (pkg.id === "basis") return "Kostenlos starten";
  return PAID_TAGLINES[pkg.id];
}

export function marketingBlurbForPackage(pkg: MembershipPackage): string {
  if (pkg.id === "basis") {
    return "Konto anlegen, Geschichten erzeugen und im Lesemodus fullscreen lesen — weitere Extras mit Plus, Familie oder Komplett.";
  }
  return PAID_BLURBS[pkg.id];
}

export function featureLabel(feature: PackageFeatureId): string {
  return PACKAGE_FEATURE_LABELS[feature];
}

/** Lowest package that includes the feature (for landing „ab …“ badges). */
export const FEATURE_FROM_PACKAGE: Record<PackageFeatureId, UserPackageId> = {
  lesemodus: "basis",
  buchclub: "plus",
  meine_welt: "plus",
  buecherei: "plus",
  export: "plus",
  meine_welt_familie: "pro",
  fortsetzen: "pro",
  mehr_tiefgang: "pro",
  bilder: "pro",
  warum: "pro",
  hintergrund: "ultimate",
  silbenmethode: "ultimate",
  vorlesen: "ultimate",
  markierung: "ultimate",
  adventskalender: "ultimate",
};

const FROM_PACKAGE_BADGE: Record<UserPackageId, string> = {
  basis: "ab Basis",
  plus: "ab Plus",
  pro: "ab Familie",
  ultimate: "ab Komplett",
};

/** Longer parent-facing blurbs for the landing feature gallery. */
export const LANDING_FEATURE_BLURBS: Record<PackageFeatureId, string> = {
  lesemodus:
    "Vollbild ohne Ablenkung — Schriftgröße, Abstände und Breite so, dass Lesen sich gut anfühlt.",
  buchclub:
    "Freunde per Kennung verbinden, Geschichten freigeben und liken.",
  meine_welt:
    "Kinderprofil mit Interessen und Erlebnissen — und ein eigenes Kind-Login mit Kennung und Passwort.",
  meine_welt_familie:
    "Mehrere Kinder-Profile unter einem Elternkonto — jedes mit eigener Welt und Login.",
  buecherei:
    "Geschichten speichern, Favoriten setzen und später wiederlesen.",
  fortsetzen:
    "Nach dem Ende fragen: „Wie könnte es weitergehen?“ — und die nächste Episode erzeugen.",
  mehr_tiefgang:
    "Realistische Konflikte und optional ein Nebenthema mit Mix — Geschichten mit mehr Gefühl und Twists.",
  adventskalender:
    "24 Tage, eine fortlaufende Geschichte — Türen öffnen sich erst am richtigen Dezember-Tag.",
  export: "Als PDF speichern und offline weiterlesen.",
  bilder: "Illustrationen mitten in der Geschichte — zum Mitfiebern und Vorstellen.",
  warum:
    "Nach dem Lesen unter „Wissen“: Bei einem Fakt „Warum?“ tippen und den Hintergrund verstehen — nicht mitten in der Geschichte.",
  hintergrund:
    "Nach dem „Warum?“ noch tiefer eintauchen: „Ich will mehr wissen“ für mehr Kontext zum Fakt.",
  silbenmethode: "Silbenhilfe für den Lesefluss — besonders beim Lesenlernen.",
  vorlesen: "Vorlesen mit einstellbarem Tempo — zum Mitlesen oder Entspannen.",
  markierung: "Das gerade gesprochene Wort wird beim Vorlesen markiert.",
};

export type LandingFeatureShowcaseItem = {
  id: PackageFeatureId;
  title: string;
  blurb: string;
  fromPackage: UserPackageId;
  fromBadge: string;
};

/**
 * Ordered feature gallery for the landing page — same IDs as the package matrix.
 */
export function landingFeatureShowcase(): LandingFeatureShowcaseItem[] {
  return PACKAGE_COMPARE_FEATURE_IDS.map((id) => {
    const fromPackage = FEATURE_FROM_PACKAGE[id];
    return {
      id,
      title: PACKAGE_FEATURE_LABELS[id],
      blurb: LANDING_FEATURE_BLURBS[id],
      fromPackage,
      fromBadge: FROM_PACKAGE_BADGE[fromPackage],
    };
  });
}
