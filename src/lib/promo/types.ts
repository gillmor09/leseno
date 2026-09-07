/**
 * Promo catalog types (Admin + Checkout). Stripe owns the money math.
 */

import type { PaidMembershipPackageId } from "@/lib/stripe/config";
import { PAID_MEMBERSHIP_PACKAGE_IDS } from "@/lib/stripe/config";

export type PromoDiscountKind = "percent" | "amount" | "free";
export type PromoDurationKind = "once" | "repeating" | "forever";

export type Promo = {
  id: string;
  code: string;
  label: string;
  discountKind: PromoDiscountKind;
  percentOff: number | null;
  amountOffEur: number | null;
  durationKind: PromoDurationKind;
  durationMonths: number | null;
  packageIds: PaidMembershipPackageId[];
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parsePromoPackageIds(raw: unknown): PaidMembershipPackageId[] {
  if (!Array.isArray(raw)) {
    return [...PAID_MEMBERSHIP_PACKAGE_IDS];
  }
  const ids = raw.filter(
    (value): value is PaidMembershipPackageId =>
      typeof value === "string" &&
      (PAID_MEMBERSHIP_PACKAGE_IDS as readonly string[]).includes(value),
  );
  return ids.length > 0 ? ids : [...PAID_MEMBERSHIP_PACKAGE_IDS];
}

/** Whether the promo may be applied right now for this package. */
export function isPromoApplicable(
  promo: Promo,
  packageId: PaidMembershipPackageId,
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (!promo.active) {
    return { ok: false, reason: "Dieser Promo-Code ist deaktiviert." };
  }
  if (promo.startsAt && new Date(promo.startsAt) > now) {
    return { ok: false, reason: "Dieser Promo-Code gilt noch nicht." };
  }
  if (promo.endsAt && new Date(promo.endsAt) < now) {
    return { ok: false, reason: "Dieser Promo-Code ist abgelaufen." };
  }
  if (
    promo.maxRedemptions != null &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return {
      ok: false,
      reason: "Dieser Promo-Code wurde bereits zu oft eingelöst.",
    };
  }
  if (!promo.packageIds.includes(packageId)) {
    return {
      ok: false,
      reason: "Dieser Promo-Code gilt nicht für dieses Paket.",
    };
  }
  if (!promo.stripePromotionCodeId) {
    return {
      ok: false,
      reason: "Promo ist nicht mit Stripe verknüpft. Bitte im Admin neu anlegen.",
    };
  }
  return { ok: true };
}
