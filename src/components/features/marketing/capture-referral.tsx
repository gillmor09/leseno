"use client";

/**
 * Captures `?ref=` once on the client without `useSearchParams`
 * (avoids an extra App Router client subscription on every page).
 */

import { useEffect } from "react";
import {
  normalizeReferralCode,
  persistReferralCode,
  REFERRAL_QUERY_PARAM,
} from "@/lib/marketing/referral";

export function CaptureReferral() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = normalizeReferralCode(params.get(REFERRAL_QUERY_PARAM));
      if (code) {
        persistReferralCode(code);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}
