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
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
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
  meine_welt: "Persönliches Kinderprofil",
  meine_welt_familie: "Mehrere Kinder-Profile",
  buecherei: "Geschichten speichern & erneut lesen",
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
  plus: "Mehr Geschichten dank Credits, Meine Bücherei zum Wiederlesen, ein Kinderprofil und PDF-Export — wenn Lesen zum Ritual wird.",
  pro: "Mehrere Kinder-Profile, Bücherei, Bilder in den Geschichten und „Warum?“ zum Nachforschen — wenn leseno zum Familien-Ritual wird.",
  ultimate:
    "Alles aus Pro plus Silbenhilfe, Vorlesen mit Wort-Markierung, PDF-Export und tieferes Hintergrundwissen.",
};

/**
 * Short bullets for a pricing card, derived from package features + credits.
 */
export function marketingBulletsForPackage(pkg: MembershipPackage): string[] {
  if (pkg.id === "ultimate") {
    const bullets: string[] = [
      "Alles aus Pro (Familie, Bücherei, Bilder, Warum)",
    ];
    if (pkg.credits > 0) {
      const sehrKurz = Math.floor(pkg.credits / 10);
      const mittel = Math.floor(pkg.credits / 30);
      bullets.push(
        `inkl. ${pkg.credits} Credits (z. B. bis ca. ${sehrKurz} sehr kurze oder ca. ${mittel} mittlere Geschichten)`,
      );
    } else {
      bullets.push(
        "Credits separat nachladen (oder vorhandenes Guthaben nutzen)",
      );
    }
    if (packageHasFeature(pkg, "export")) {
      bullets.push("Export als PDF zum Offline-Lesen");
    }
    if (packageHasFeature(pkg, "buecherei")) {
      bullets.push("Meine Bücherei: Geschichten speichern und erneut lesen");
    }
    if (packageHasFeature(pkg, "silbenmethode")) {
      bullets.push("Silbenhilfe für den Lesefluss");
    }
    if (packageHasFeature(pkg, "vorlesen")) {
      bullets.push("Vorlesen mit einstellbarem Tempo");
    }
    if (packageHasFeature(pkg, "markierung")) {
      bullets.push("Wort-Markierung beim Vorlesen");
    }
    if (packageHasFeature(pkg, "hintergrund")) {
      bullets.push("„Ich will mehr wissen“ für tieferen Hintergrund");
    }
    return bullets;
  }

  const bullets: string[] = [];

  if (pkg.credits > 0) {
    const sehrKurz = Math.floor(pkg.credits / 10);
    const mittel = Math.floor(pkg.credits / 30);
    bullets.push(
      `inkl. ${pkg.credits} Credits (z. B. bis ca. ${sehrKurz} sehr kurze oder ca. ${mittel} mittlere Geschichten)`,
    );
  } else if (pkg.id !== "basis") {
    bullets.push(
      "Credits separat nachladen (oder vorhandenes Guthaben nutzen)",
    );
  }

  if (packageHasFeature(pkg, "meine_welt_familie")) {
    bullets.push("Meine Welt für beliebig viele Kinder");
  } else if (packageHasFeature(pkg, "meine_welt")) {
    bullets.push("Meine Welt für ein Kind");
  }

  if (packageHasFeature(pkg, "buecherei")) {
    bullets.push("Meine Bücherei: Geschichten speichern und erneut lesen");
  }

  if (packageHasFeature(pkg, "export")) {
    bullets.push("Export als PDF zum Offline-Lesen");
  }
  if (packageHasFeature(pkg, "bilder")) {
    bullets.push("Bilder in den Geschichten");
  }
  if (packageHasFeature(pkg, "warum")) {
    bullets.push("„Warum?“ zu Aha-Momenten in der Geschichte");
  }
  if (packageHasFeature(pkg, "hintergrund")) {
    bullets.push("„Ich will mehr wissen“ für tieferen Hintergrund");
  }
  if (packageHasFeature(pkg, "silbenmethode")) {
    bullets.push("Silbenhilfe für den Lesefluss");
  }
  if (packageHasFeature(pkg, "vorlesen")) {
    bullets.push("Vorlesen mit einstellbarem Tempo");
  }
  if (packageHasFeature(pkg, "markierung")) {
    bullets.push("Wort-Markierung beim Vorlesen");
  }

  return bullets;
}

export function marketingTaglineForPackage(pkg: MembershipPackage): string {
  if (pkg.id === "basis") return "Kostenlos starten";
  return PAID_TAGLINES[pkg.id];
}

export function marketingBlurbForPackage(pkg: MembershipPackage): string {
  if (pkg.id === "basis") {
    return "Konto anlegen und Geschichten erzeugen — Extra-Funktionen schaltest du mit Plus, Pro oder Ultimate frei.";
  }
  return PAID_BLURBS[pkg.id];
}

export function featureLabel(feature: PackageFeatureId): string {
  return PACKAGE_FEATURE_LABELS[feature];
}
