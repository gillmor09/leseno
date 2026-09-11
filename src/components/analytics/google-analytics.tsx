"use client";

/**
 * GA4 loader on first scroll / pointer / key only.
 * Skipped in the Amazon/Fire Capacitor shell (Kids / Appstore rules).
 */

import { useEffect } from "react";

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

/**
 * True for the native Android WebView app (especially Amazon/Fire).
 * Browser visitors on leseno.de keep analytics.
 */
export function shouldSkipGoogleAnalytics(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("leseno_store") === "amazon") return true;
  } catch {
    // ignore
  }

  const ua = navigator.userAgent ?? "";
  if (/LesenoApp\/Amazon/i.test(ua)) return true;

  // Capacitor injects the bridge into the remote WebView.
  if (window.Capacitor?.isNativePlatform?.()) return true;

  return false;
}

function injectGoogleAnalytics(measurementId: string) {
  if (window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true });

  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.async = true;
  document.head.appendChild(script);
}

export function GoogleAnalytics() {
  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    if (shouldSkipGoogleAnalytics()) return;

    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      cleanup();
      injectGoogleAnalytics(MEASUREMENT_ID);
    };

    const onInteract = () => load();
    window.addEventListener("scroll", onInteract, { once: true, passive: true });
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });

    function cleanup() {
      window.removeEventListener("scroll", onInteract);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    }

    return cleanup;
  }, []);

  return null;
}
