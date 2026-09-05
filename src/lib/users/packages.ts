/**
 * Membership package catalog: labels, prices, credits, and feature flags.
 * DB table `leseno.membership_packages`; fallbacks mirror the seed migration.
 */

export const USER_PACKAGE_IDS = ["basis", "plus", "pro", "ultimate"] as const;

export type UserPackageId = (typeof USER_PACKAGE_IDS)[number];

/** Feature flags that packages can enable. */
export const PACKAGE_FEATURE_IDS = [
  "bilder",
  "silbenmethode",
  "markierung",
  "vorlesen",
  "export",
  "meine_welt",
  "meine_welt_familie",
  "buecherei",
  "warum",
  "hintergrund",
] as const;

export type PackageFeatureId = (typeof PACKAGE_FEATURE_IDS)[number];

export const PACKAGE_FEATURE_LABELS: Record<PackageFeatureId, string> = {
  bilder: "Bilder",
  silbenmethode: "Silbenmethode",
  markierung: "Markierung",
  vorlesen: "Vorlesen",
  export: "Export",
  meine_welt: "Meine Welt",
  meine_welt_familie: "Meine Welt - Familie",
  buecherei: "Meine Bücherei",
  warum: "Warum",
  hintergrund: "Hintergrund",
};

export type MembershipPackage = {
  id: UserPackageId;
  label: string;
  priceEur: number;
  credits: number;
  features: PackageFeatureId[];
  sortOrder: number;
};

export const FALLBACK_MEMBERSHIP_PACKAGES: MembershipPackage[] = [
  {
    id: "basis",
    label: "Basis",
    priceEur: 0,
    credits: 0,
    features: [],
    sortOrder: 0,
  },
  {
    id: "plus",
    label: "Plus",
    priceEur: 5,
    credits: 500,
    features: ["export", "meine_welt", "buecherei"],
    sortOrder: 1,
  },
  {
    id: "pro",
    label: "Pro",
    priceEur: 10,
    credits: 0,
    features: [
      "meine_welt",
      "meine_welt_familie",
      "buecherei",
      "bilder",
      "warum",
    ],
    sortOrder: 2,
  },
  {
    id: "ultimate",
    label: "Ultimate",
    priceEur: 15,
    credits: 0,
    features: [
      "meine_welt",
      "meine_welt_familie",
      "buecherei",
      "bilder",
      "warum",
      "export",
      "silbenmethode",
      "markierung",
      "vorlesen",
      "hintergrund",
    ],
    sortOrder: 3,
  },
];

/** List monthly prices in EUR (fallback when DB unavailable). */
export const USER_PACKAGE_MONTHLY_PRICE_EUR: Record<UserPackageId, number> =
  Object.fromEntries(
    FALLBACK_MEMBERSHIP_PACKAGES.map((pkg) => [pkg.id, pkg.priceEur]),
  ) as Record<UserPackageId, number>;

export const USER_PACKAGE_LABELS: Record<UserPackageId, string> =
  Object.fromEntries(
    FALLBACK_MEMBERSHIP_PACKAGES.map((pkg) => [pkg.id, pkg.label]),
  ) as Record<UserPackageId, string>;

export type UserPackageBooking = {
  id: string;
  userId: string;
  packageId: UserPackageId;
  startedAt: string;
  endedAt: string | null;
  monthlyPrice: number;
  actualPrice: number;
  notes: string;
  createdAt: string;
};

export function isUserPackageId(value: string): value is UserPackageId {
  return (USER_PACKAGE_IDS as readonly string[]).includes(value);
}

export function isPackageFeatureId(value: string): value is PackageFeatureId {
  return (PACKAGE_FEATURE_IDS as readonly string[]).includes(value);
}

/** Normalize a JSON features array from DB into known feature ids (order preserved). */
export function parsePackageFeatures(value: unknown): PackageFeatureId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<PackageFeatureId>();
  const result: PackageFeatureId[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isPackageFeatureId(entry) || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

export function packageHasFeature(
  pkg: MembershipPackage,
  feature: PackageFeatureId,
): boolean {
  return pkg.features.includes(feature);
}

/**
 * Auth membership role → catalog package id (`paket1` → `plus`, …).
 * Admin is not mapped; callers grant all features separately.
 */
export const MEMBERSHIP_ROLE_TO_PACKAGE_ID = {
  basis: "basis",
  paket1: "plus",
  paket2: "pro",
  paket3: "ultimate",
} as const satisfies Record<string, UserPackageId>;

export type MembershipRolePackageId =
  keyof typeof MEMBERSHIP_ROLE_TO_PACKAGE_ID;

export function isMembershipRolePackageId(
  value: string,
): value is MembershipRolePackageId {
  return value in MEMBERSHIP_ROLE_TO_PACKAGE_ID;
}

/** Resolve package id for a membership role string; null for admin/unknown. */
export function packageIdForMembershipRole(
  role: string | null | undefined,
): UserPackageId | null {
  if (!role || !isMembershipRolePackageId(role)) return null;
  return MEMBERSHIP_ROLE_TO_PACKAGE_ID[role];
}

/**
 * Features + display label for a role against a loaded package catalog.
 * Admin gets every feature; unknown roles get an empty Basis-like set.
 */
export function resolvePackageAccessForRole(
  role: string | null | undefined,
  packages: MembershipPackage[],
): { packageId: UserPackageId | null; label: string; features: PackageFeatureId[] } {
  if (role === "admin") {
    return {
      packageId: null,
      label: "Admin",
      features: [...PACKAGE_FEATURE_IDS],
    };
  }

  const packageId = packageIdForMembershipRole(role);
  if (!packageId) {
    const basis =
      packages.find((pkg) => pkg.id === "basis") ??
      FALLBACK_MEMBERSHIP_PACKAGES[0]!;
    return {
      packageId: "basis",
      label: basis.label,
      features: [],
    };
  }

  const pkg =
    packages.find((entry) => entry.id === packageId) ??
    FALLBACK_MEMBERSHIP_PACKAGES.find((entry) => entry.id === packageId) ??
    FALLBACK_MEMBERSHIP_PACKAGES[0]!;

  return {
    packageId: pkg.id,
    label: pkg.label,
    features: pkg.features,
  };
}

export function featuresInclude(
  features: readonly PackageFeatureId[],
  feature: PackageFeatureId,
): boolean {
  return features.includes(feature);
}
