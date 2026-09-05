/**
 * Resolve package features for the current session (story UI + Server Actions).
 */

import { getCurrentUser } from "@/lib/auth/session";
import { loadMembershipPackages } from "@/lib/users/package-repository";
import {
  featuresInclude,
  resolvePackageAccessForRole,
  type PackageFeatureId,
} from "@/lib/users/packages";

export type PackageAccess = {
  role: string;
  packageId: string | null;
  label: string;
  features: PackageFeatureId[];
};

/** Load catalog + map the signed-in user's role to features. Guests → empty. */
export async function loadPackageAccessForCurrentUser(): Promise<PackageAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const role =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : "";

  const packages = await loadMembershipPackages();
  const resolved = resolvePackageAccessForRole(role, packages);

  return {
    role,
    packageId: resolved.packageId,
    label: resolved.label,
    features: resolved.features,
  };
}

/** Convenience: feature list only (empty when signed out). */
export async function loadFeaturesForCurrentUser(): Promise<PackageFeatureId[]> {
  const access = await loadPackageAccessForCurrentUser();
  return access?.features ?? [];
}

export async function currentUserHasFeature(
  feature: PackageFeatureId,
): Promise<boolean> {
  const features = await loadFeaturesForCurrentUser();
  return featuresInclude(features, feature);
}
