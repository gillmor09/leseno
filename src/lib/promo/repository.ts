/**
 * Promo persistence via public service-role RPCs (`leseno.promos`).
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  parsePromoPackageIds,
  type Promo,
  type PromoDiscountKind,
  type PromoDurationKind,
} from "@/lib/promo/types";
import { normalizePromoCode } from "@/lib/promo/marketing";

type PromoRow = {
  id: string;
  code: string;
  label: string;
  discount_kind: string;
  percent_off: number | string | null;
  amount_off_eur: number | string | null;
  duration_kind: string;
  duration_months: number | null;
  package_ids: unknown;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: PromoRow): Promo {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    discountKind: row.discount_kind as PromoDiscountKind,
    percentOff:
      row.percent_off == null ? null : Number(row.percent_off),
    amountOffEur:
      row.amount_off_eur == null ? null : Number(row.amount_off_eur),
    durationKind: row.duration_kind as PromoDurationKind,
    durationMonths: row.duration_months,
    packageIds: parsePromoPackageIds(row.package_ids),
    active: Boolean(row.active),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count ?? 0,
    stripeCouponId: row.stripe_coupon_id,
    stripePromotionCodeId: row.stripe_promotion_code_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPromosForAdmin(): Promise<Promo[]> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_list_promos");
  if (error) throw new Error(error.message);
  return ((data ?? []) as PromoRow[]).map(mapRow);
}

export async function getPromoByCode(code: string): Promise<Promo | null> {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("get_promo_by_code", {
    p_code: normalized,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PromoRow[];
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

export type InsertPromoInput = {
  code: string;
  label: string;
  discountKind: PromoDiscountKind;
  percentOff: number | null;
  amountOffEur: number | null;
  durationKind: PromoDurationKind;
  durationMonths: number | null;
  packageIds: string[];
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  stripeCouponId: string;
  stripePromotionCodeId: string;
  notes: string | null;
};

export async function insertPromo(input: InsertPromoInput): Promise<string> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_insert_promo", {
    p_code: input.code,
    p_label: input.label,
    p_discount_kind: input.discountKind,
    p_percent_off: input.percentOff,
    p_amount_off_eur: input.amountOffEur,
    p_duration_kind: input.durationKind,
    p_duration_months: input.durationMonths,
    p_package_ids: input.packageIds,
    p_active: input.active,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_max_redemptions: input.maxRedemptions,
    p_stripe_coupon_id: input.stripeCouponId,
    p_stripe_promotion_code_id: input.stripePromotionCodeId,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updatePromo(input: {
  id: string;
  label: string;
  packageIds: string[];
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  notes: string | null;
  stripeCouponId?: string | null;
  stripePromotionCodeId?: string | null;
}): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("admin_update_promo", {
    p_id: input.id,
    p_label: input.label,
    p_package_ids: input.packageIds,
    p_active: input.active,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_max_redemptions: input.maxRedemptions,
    p_notes: input.notes,
    p_stripe_coupon_id: input.stripeCouponId ?? null,
    p_stripe_promotion_code_id: input.stripePromotionCodeId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deletePromo(id: string): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("admin_delete_promo", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function setUserPromoPending(
  userId: string,
  promoCode: string,
): Promise<void> {
  const normalized = normalizePromoCode(promoCode);
  if (!normalized) return;
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("set_user_promo_pending", {
    p_user_id: userId,
    p_promo_code: normalized,
  });
  if (error) throw new Error(error.message);
}

export async function getUserPromoPending(
  userId: string,
): Promise<string | null> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("get_user_promo_pending", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return normalizePromoCode(typeof data === "string" ? data : null);
}

export async function clearUserPromoPending(userId: string): Promise<void> {
  const supabase = createServiceClient(null);
  const { error } = await supabase.rpc("clear_user_promo_pending", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function recordPromoRedemption(input: {
  promoId: string;
  userId: string;
  packageId: string;
  checkoutSessionId: string | null;
  subscriptionId: string | null;
}): Promise<boolean> {
  const supabase = createServiceClient(null);
  const { data, error } = await supabase.rpc("record_promo_redemption", {
    p_promo_id: input.promoId,
    p_user_id: input.userId,
    p_package_id: input.packageId,
    p_stripe_checkout_session_id: input.checkoutSessionId,
    p_stripe_subscription_id: input.subscriptionId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
