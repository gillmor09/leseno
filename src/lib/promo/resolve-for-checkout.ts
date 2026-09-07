/**
 * Resolves a promo for membership Checkout (pending DB code or explicit code).
 */

import {
  getPromoByCode,
  getUserPromoPending,
} from "@/lib/promo/repository";
import { normalizePromoCode } from "@/lib/promo/marketing";
import { isPromoApplicable, type Promo } from "@/lib/promo/types";
import type { PaidMembershipPackageId } from "@/lib/stripe/config";

export async function resolvePromoForCheckout(input: {
  userId: string;
  packageId: PaidMembershipPackageId;
  /** From client localStorage / form; wins over pending when set. */
  promoCode?: string | null;
}): Promise<
  | { promo: Promo }
  | { promo: null; warning?: string }
> {
  const explicit = normalizePromoCode(input.promoCode ?? null);
  let code = explicit;
  if (!code) {
    try {
      code = await getUserPromoPending(input.userId);
    } catch (error) {
      console.warn("[promo] pending lookup failed", error);
      code = null;
    }
  }
  if (!code) {
    return { promo: null };
  }

  let promo: Promo | null;
  try {
    promo = await getPromoByCode(code);
  } catch (error) {
    console.warn("[promo] get by code failed", error);
    return {
      promo: null,
      warning: "Promo konnte nicht geprüft werden.",
    };
  }

  if (!promo) {
    return { promo: null, warning: "Unbekannter Promo-Code." };
  }

  const applicable = isPromoApplicable(promo, input.packageId);
  if (!applicable.ok) {
    return { promo: null, warning: applicable.reason };
  }

  return { promo };
}
