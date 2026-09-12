"use client";

/**
 * GA4 loader for leseno.de (skipped in Amazon/Fire Capacitor shell).
 * Critical: the gtag stub must `dataLayer.push(arguments)` — not a rest Array —
 * or queued config/page_view commands are ignored when gtag.js drains the queue.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: IArguments[];
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

  if (window.Capacitor?.isNativePlatform?.()) return true;

  return false;
}

function injectGoogleAnalytics(measurementId: string) {
  if (document.getElementById("leseno-ga4-gtag")) return;

  window.dataLayer = window.dataLayer || [];
  // Official GA stub shape — do not replace `arguments` with a rest array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- GA queue requires Arguments
    window.dataLayer!.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: true,
  });

  const script = document.createElement("script");
  script.id = "leseno-ga4-gtag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

function trackPageView(url: string) {
  if (!MEASUREMENT_ID || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_path: url,
    page_location: window.location.origin + url,
    page_title: document.title,
  });
}

function GoogleAnalyticsRouteListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loadedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  // Load GA as soon as the client mounts (browser only; still skipped in app shell).
  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    if (shouldSkipGoogleAnalytics()) return;
    if (loadedRef.current) return;

    loadedRef.current = true;
    injectGoogleAnalytics(MEASUREMENT_ID);
    lastPathRef.current =
      window.location.pathname + window.location.search;
  }, []);

  // Client-side navigations (App Router).
  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    if (shouldSkipGoogleAnalytics()) return;
    if (!loadedRef.current) return;

    const url =
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    if (lastPathRef.current === null) {
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
