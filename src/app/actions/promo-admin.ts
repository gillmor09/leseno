"use server";

/**
 * Admin CRUD for promo codes (creates Stripe Coupon + Promotion Code).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  deactivateStripePromotionCode,
  createStripePromoObjects,
  setStripePromotionCodeActive,
} from "@/lib/promo/stripe-sync";
import {
  deletePromo,
  getPromoByCode,
  insertPromo,
  listPromosForAdmin,
  updatePromo,
} from "@/lib/promo/repository";
import type { ActionResult } from "@/lib/types/actions";
import {
  createPromoAdminSchema,
  deletePromoAdminSchema,
  updatePromoAdminSchema,
} from "@/lib/validations/promo-admin";
import { hasStripeSecretConfig } from "@/lib/stripe/config";
import { buildPromoUrl } from "@/lib/promo/marketing";

function revalidatePromoPaths() {
  revalidatePath("/admin/promo");
  revalidatePath("/preise");
}

export async function listPromosAdminAction(): Promise<
  ActionResult<{ promos: Awaited<ReturnType<typeof listPromosForAdmin>> }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };
  try {
    const promos = await listPromosForAdmin();
    return { success: true, data: { promos } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Laden fehlgeschlagen.",
    };
  }
}

export async function createPromoAction(
  input: unknown,
): Promise<ActionResult<{ id: string; link: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  if (!hasStripeSecretConfig()) {
    return {
      success: false,
      error: "STRIPE_SECRET_KEY fehlt — Promo braucht Stripe.",
    };
  }

  const parsed = createPromoAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  const data = parsed.data;
  try {
    const existing = await getPromoByCode(data.code);
    if (existing) {
      return { success: false, error: "Dieser Code existiert bereits." };
    }

    const stripe = await createStripePromoObjects({
      code: data.code,
      label: data.label,
      discountKind: data.discountKind,
      percentOff: data.percentOff ?? null,
      amountOffEur: data.amountOffEur ?? null,
      durationKind: data.durationKind,
      durationMonths: data.durationMonths ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      endsAt: data.endsAt ?? null,
    });

    const id = await insertPromo({
      code: data.code,
      label: data.label,
      discountKind: data.discountKind,
      percentOff:
        data.discountKind === "percent" ? (data.percentOff ?? null) : null,
      amountOffEur:
        data.discountKind === "amount" ? (data.amountOffEur ?? null) : null,
      durationKind: data.durationKind,
      durationMonths:
        data.durationKind === "repeating" ? (data.durationMonths ?? null) : null,
      packageIds: data.packageIds,
      active: data.active,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      stripeCouponId: stripe.couponId,
      stripePromotionCodeId: stripe.promotionCodeId,
      notes: data.notes ?? null,
    });

    revalidatePromoPaths();
    return {
      success: true,
      data: { id, link: buildPromoUrl(data.code, "/registrieren") },
    };
  } catch (error) {
    console.error("[createPromoAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Promo konnte nicht angelegt werden.",
    };
  }
}

export async function updatePromoAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = updatePromoAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const promos = await listPromosForAdmin();
    const current = promos.find((p) => p.id === parsed.data.id);
    if (!current) {
      return { success: false, error: "Promo nicht gefunden." };
    }

    await updatePromo({
      id: parsed.data.id,
      label: parsed.data.label,
      packageIds: parsed.data.packageIds,
      active: parsed.data.active,
      startsAt: parsed.data.startsAt ?? null,
      endsAt: parsed.data.endsAt ?? null,
      maxRedemptions: parsed.data.maxRedemptions ?? null,
      notes: parsed.data.notes ?? null,
    });

    if (
      current.stripePromotionCodeId &&
      current.active !== parsed.data.active
    ) {
      await setStripePromotionCodeActive(
        current.stripePromotionCodeId,
        parsed.data.active,
      );
    }

    revalidatePromoPaths();
    return { success: true };
  } catch (error) {
    console.error("[updatePromoAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Speichern hat nicht geklappt.",
    };
  }
}

export async function deletePromoAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = deletePromoAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const promos = await listPromosForAdmin();
    const current = promos.find((p) => p.id === parsed.data.id);
    if (current?.stripePromotionCodeId) {
      await deactivateStripePromotionCode(current.stripePromotionCodeId);
    }
    const deleted = await deletePromo(parsed.data.id);
    if (!deleted) {
      return { success: false, error: "Promo nicht gefunden." };
    }
    revalidatePromoPaths();
    return { success: true };
  } catch (error) {
    console.error("[deletePromoAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Löschen hat nicht geklappt.",
    };
  }
}
