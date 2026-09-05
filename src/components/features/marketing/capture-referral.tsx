"use client";

/**
 * Captures `?ref=` on first paint and stores it for signup attribution.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  normalizeReferralCode,
  persistReferralCode,
  REFERRAL_QUERY_PARAM,
} from "@/lib/marketing/referral";

export function CaptureReferral() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = normalizeReferralCode(
      searchParams.get(REFERRAL_QUERY_PARAM),
    );
    if (code) {
      persistReferralCode(code);
    }
  }, [searchParams]);

  return null;
}
