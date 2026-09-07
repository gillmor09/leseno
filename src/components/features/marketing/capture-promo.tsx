"use client";

/**
 * Captures `?promo=` into localStorage (same pattern as referral `?ref=`).
 */

import { useEffect } from "react";
import {
  normalizePromoCode,
  persistPromoCode,
  PROMO_QUERY_PARAM,
} from "@/lib/promo/marketing";

export function CapturePromo() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = normalizePromoCode(params.get(PROMO_QUERY_PARAM));
      if (code) {
        persistPromoCode(code);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}
