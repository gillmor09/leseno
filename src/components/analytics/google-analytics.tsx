import Script from "next/script";

/**
 * Google Analytics 4 (gtag). Loads only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set.
 * Must render inside `<head>` so Google Search Console can verify site ownership via GA.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="beforeInteractive"
      />
      <Script id="google-analytics" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
