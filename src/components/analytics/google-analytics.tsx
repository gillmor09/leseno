"use client";

/**
 * GA4 loader: after first interaction or a short idle timeout.
 * Skipped in the Amazon/Fire Capacitor shell (Kids / Appstore rules).
 * Sends page_view on App Router navigations once loaded.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

/** Load even without interaction so Realtime / first paint still count. */
const IDLE_LOAD_MS = 2_500;

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
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.async = true;
  document.head.appendChild(script);
}

function trackPageView(url: string) {
  if (!MEASUREMENT_ID || !window.gtag) return;
  window.gtag("config", MEASUREMENT_ID, {
    page_path: url,
    anonymize_ip: true,
  });
}

/**
 * Watches App Router URL changes and sends GA4 page_view after the tag is ready.
 */
function GoogleAnalyticsRouteListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readyRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    if (shouldSkipGoogleAnalytics()) return;

    let cancelled = false;
    let loaded = false;
    let idleTimer = 0;

    const load = () => {
      if (loaded || cancelled) return;
      loaded = true;
      cleanup();
      injectGoogleAnalytics(MEASUREMENT_ID);
      readyRef.current = true;
      lastPathRef.current =
        window.location.pathname + window.location.search;
    };

    const onInteract = () => load();

    function cleanup() {
      window.removeEventListener("scroll", onInteract);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      if (idleTimer) window.clearTimeout(idleTimer);
    }

    window.addEventListener("scroll", onInteract, {
      once: true,
      passive: true,
    });
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    idleTimer = window.setTimeout(load, IDLE_LOAD_MS);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    if (shouldSkipGoogleAnalytics()) return;

    const url =
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    // Initial config already sends the first page_view; skip duplicate.
    if (!readyRef.current) {
      lastPathRef.current = url;
      return;
    }
    if (lastPathRef.current === url) return;
    lastPathRef.current = url;
    trackPageView(url);
  }, [pathname, searchParams]);

  return null;
}

export function GoogleAnalytics() {
  if (!MEASUREMENT_ID) return null;

  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsRouteListener />
    </Suspense>
  );
}
