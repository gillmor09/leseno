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
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
  "fortsetzen",
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
  meine_welt: "Persönliches Kinderprofil",
  meine_welt_familie: "Mehrere Kinder-Profile",
  buecherei: "Geschichten speichern & erneut lesen",
  fortsetzen: "„Wie könnte es weitergehen?“",
  adventskalender: "24 Tage, tagesweise öffnen",
  export: "Als PDF speichern",
  bilder: "Illustrationen in der Geschichte",
  warum: "Hintergrund zu Aha-Momenten",
  hintergrund: "„Ich will mehr wissen“",
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
  plus: "Jeden Monat Credits zum Buchungstag — und sie verfallen nie. Dazu Meine Bücherei, ein Kinderprofil und PDF-Export.",
  pro: "Mehrere Kinder-Profile, Bücherei, Bilder, „Warum?“ und Fortsetzungen — wenn leseno zum Familien-Ritual wird.",
  ultimate:
    "Alles aus Pro plus Silbenhilfe, Vorlesen mit Wort-Markierung, PDF-Export, tieferes Hintergrundwissen und das Adventskalenderbuch.",
};

/** Pricing-card bullet: inherited tier vs. incremental extras. */
export type MarketingBullet = {
  text: string;
  /** `included` = check (Alles von …); `extra` = plus (Zusatz). */
  kind: "included" | "extra";
};

const FEATURE_BULLET_ORDER: PackageFeatureId[] = [
  "lesemodus",
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
  "fortsetzen",
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
    case "adventskalender":
      return "Adventskalenderbuch: 24 Tage mit PIN-Vorschau für Eltern";
    case "export":
      return "Export als PDF zum Offline-Lesen";
    case "bilder":
      return "Bilder in den Geschichten";
    case "warum":
      return "„Warum?“ zu Aha-Momenten in der Geschichte";
    case "hintergrund":
      return "„Ich will mehr wissen“ für tieferen Hintergrund";
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
 * - Pro / Ultimate: „Alles von …“ (check) + only incremental extras (plus).
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
    return "Konto anlegen, Geschichten erzeugen und im Lesemodus fullscreen lesen — weitere Extras mit Plus, Pro oder Ultimate.";
  }
  return PAID_BLURBS[pkg.id];
}

export function featureLabel(feature: PackageFeatureId): string {
  return PACKAGE_FEATURE_LABELS[feature];
}
