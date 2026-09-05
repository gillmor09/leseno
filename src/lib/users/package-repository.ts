/**
 * Load/update `leseno.membership_packages` via public RPCs (service role for writes).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FALLBACK_MEMBERSHIP_PACKAGES,
  isUserPackageId,
  parsePackageFeatures,
  type MembershipPackage,
  type UserPackageId,
} from "@/lib/users/packages";

type PackageRow = {
  id: string;
  label: string;
  price_eur: number | string;
  credits: number;
  features: unknown;
  sort_order: number;
};

function mapRow(row: PackageRow): MembershipPackage | null {
  if (!isUserPackageId(row.id)) return null;
  return {
    id: row.id,
    label: row.label,
    priceEur: Number(row.price_eur),
    credits: typeof row.credits === "number" ? row.credits : 0,
    features: parsePackageFeatures(row.features),
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

function mapRows(rows: PackageRow[]): MembershipPackage[] {
  return rows
    .map(mapRow)
    .filter((pkg): pkg is MembershipPackage => pkg !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function mergeWithFallback(packages: MembershipPackage[]): MembershipPackage[] {
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  return FALLBACK_MEMBERSHIP_PACKAGES.map(
    (fallback) => byId.get(fallback.id) ?? fallback,
  );
}

/** Public catalog (marketing / feature gates). Falls back to seed if RPC missing. */
export async function loadMembershipPackages(): Promise<MembershipPackage[]> {
  try {
    const supabase = await createClient(null);
    const { data, error } = await supabase.rpc("list_membership_packages");
    if (error || !data?.length) {
      return FALLBACK_MEMBERSHIP_PACKAGES;
    }
    const mapped = mapRows(data as PackageRow[]);
    return mapped.length > 0 ? mergeWithFallback(mapped) : FALLBACK_MEMBERSHIP_PACKAGES;
  } catch {
    return FALLBACK_MEMBERSHIP_PACKAGES;
  }
}

/** Admin load — throws when the RPC/table is unavailable. */
export async function loadMembershipPackagesForAdmin(): Promise<
  MembershipPackage[]
> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("list_membership_packages");
  if (error) {
    throw new Error(error.message);
  }
  const mapped = mapRows((data ?? []) as PackageRow[]);
  if (mapped.length === 0) {
    return FALLBACK_MEMBERSHIP_PACKAGES;
  }
  return mergeWithFallback(mapped);
}

/** Persists package rows (label, price, credits, features). */
export async function updateMembershipPackages(
  packages: MembershipPackage[],
): Promise<void> {
  const supabase = createServiceClient(null);

  for (const pkg of packages) {
    const { error } = await supabase.rpc("update_membership_package", {
      p_id: pkg.id,
      p_label: pkg.label,
      p_price_eur: pkg.priceEur,
      p_credits: pkg.credits,
      p_features: pkg.features,
      p_sort_order: pkg.sortOrder,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
}

/** List monthly price for a package id (DB, else fallback constant). */
export async function getPackageMonthlyPrice(
  packageId: UserPackageId,
): Promise<number> {
  const packages = await loadMembershipPackages();
  const match = packages.find((pkg) => pkg.id === packageId);
  return match?.priceEur ?? 0;
}
