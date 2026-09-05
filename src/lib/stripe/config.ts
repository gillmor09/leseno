/**
 * Stripe env + price mapping for membership packages and credit packs.
 * Create Products/Prices in Stripe Dashboard, then set the price ids in env.
 */

import type { UserPackageId } from "@/lib/users/packages";
import type { MembershipRoleId } from "@/lib/users/catalog";

export const STRIPE_CREDITS_PACK_AMOUNT = 300;

/** Marketing / checkout pack: 5 € → 300 Credits (see `/preise`). */
export const STRIPE_CREDITS_PACK_PRICE_EUR = 5;

export type PaidMembershipPackageId = Exclude<UserPackageId, "basis">;

export const PAID_MEMBERSHIP_PACKAGE_IDS = [
  "plus",
  "pro",
  "ultimate",
] as const satisfies readonly PaidMembershipPackageId[];

/** Package id → Auth role / story page (`paket1`…`paket3`). */
export const PACKAGE_TO_MEMBERSHIP_ROLE: Record<
  PaidMembershipPackageId,
  MembershipRoleId
> = {
  plus: "paket1",
  pro: "paket2",
  ultimate: "paket3",
};

export function isPaidMembershipPackageId(
  value: string,
): value is PaidMembershipPackageId {
  return (PAID_MEMBERSHIP_PACKAGE_IDS as readonly string[]).includes(value);
}

export function hasStripeSecretConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function hasStripeWebhookConfig(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

/**
 * True when secret key + all required price ids are present (Checkout usable).
 */
export function hasStripeCheckoutConfig(): boolean {
  if (!hasStripeSecretConfig()) return false;
  return (
    Boolean(getStripePriceIdForPackage("plus")) &&
    Boolean(getStripePriceIdForPackage("pro")) &&
    Boolean(getStripePriceIdForPackage("ultimate")) &&
    Boolean(getStripeCreditsPriceId())
  );
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY fehlt.");
  }
  return key;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET fehlt.");
  }
  return secret;
}

/** Recurring price id for Plus / Pro / Ultimate. */
export function getStripePriceIdForPackage(
  packageId: PaidMembershipPackageId,
): string | null {
  const envKey =
    packageId === "plus"
      ? "STRIPE_PRICE_PLUS"
      : packageId === "pro"
        ? "STRIPE_PRICE_PRO"
        : "STRIPE_PRICE_ULTIMATE";
  const value = process.env[envKey]?.trim() ?? "";
  return value || null;
}

/** One-time price id for the credits top-up pack. */
export function getStripeCreditsPriceId(): string | null {
  const value = process.env.STRIPE_PRICE_CREDITS?.trim() ?? "";
  return value || null;
}

/** Resolve package from a Stripe Price id (subscription line items). */
export function packageIdFromStripePriceId(
  priceId: string,
): PaidMembershipPackageId | null {
  for (const packageId of PAID_MEMBERSHIP_PACKAGE_IDS) {
    if (getStripePriceIdForPackage(packageId) === priceId) {
      return packageId;
    }
  }
  return null;
}
