/**
 * Creates Stripe Coupon + Promotion Code for a Leseno promo.
 * Discount amounts are immutable in Stripe after create — deactivate + recreate to change.
 */

import { getStripe } from "@/lib/stripe/client";
import type {
  PromoDiscountKind,
  PromoDurationKind,
} from "@/lib/promo/types";

export async function createStripePromoObjects(input: {
  code: string;
  label: string;
  discountKind: PromoDiscountKind;
  percentOff: number | null;
  amountOffEur: number | null;
  durationKind: PromoDurationKind;
  durationMonths: number | null;
  maxRedemptions: number | null;
  endsAt: string | null;
}): Promise<{ couponId: string; promotionCodeId: string }> {
  const stripe = getStripe();

  const couponParams: Parameters<typeof stripe.coupons.create>[0] = {
    name: input.label.slice(0, 40),
    duration: input.durationKind,
    metadata: {
      leseno_promo_code: input.code,
    },
  };

  if (input.durationKind === "repeating") {
    couponParams.duration_in_months = input.durationMonths ?? 1;
  }

  if (input.discountKind === "amount") {
    couponParams.amount_off = Math.round((input.amountOffEur ?? 0) * 100);
    couponParams.currency = "eur";
  } else {
    // percent + free (100%)
    couponParams.percent_off =
      input.discountKind === "free" ? 100 : (input.percentOff ?? 0);
  }

  const coupon = await stripe.coupons.create(couponParams);

  const promoParams: Parameters<typeof stripe.promotionCodes.create>[0] = {
    promotion: { type: "coupon", coupon: coupon.id },
    code: input.code.toUpperCase(),
    metadata: { leseno_promo_code: input.code },
  };

  if (input.maxRedemptions != null) {
    promoParams.max_redemptions = input.maxRedemptions;
  }
  if (input.endsAt) {
    promoParams.expires_at = Math.floor(new Date(input.endsAt).getTime() / 1000);
  }

  const promotionCode = await stripe.promotionCodes.create(promoParams);

  return {
    couponId: coupon.id,
    promotionCodeId: promotionCode.id,
  };
}

/** Soft-deactivate Stripe promotion code when Leseno promo is deleted/disabled. */
export async function deactivateStripePromotionCode(
  promotionCodeId: string | null | undefined,
): Promise<void> {
  if (!promotionCodeId) return;
  const stripe = getStripe();
  try {
    await stripe.promotionCodes.update(promotionCodeId, { active: false });
  } catch (error) {
    console.warn("[promo] deactivate Stripe promotion code", error);
  }
}

export async function setStripePromotionCodeActive(
  promotionCodeId: string,
  active: boolean,
): Promise<void> {
  const stripe = getStripe();
  await stripe.promotionCodes.update(promotionCodeId, { active });
}
