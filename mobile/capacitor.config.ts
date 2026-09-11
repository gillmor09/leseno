import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android WebView shell for Leseno (Play AAB + Amazon/Fire APK).
 * Amazon/Fire: no Google Analytics — see `shouldSkipGoogleAnalytics`
 * (`leseno_store=amazon` + User-Agent `LesenoApp/Amazon`).
 */
const config: CapacitorConfig = {
  appId: "de.leseno.app",
  appName: "Leseno",
  webDir: "www",
  // Marks the WebView for kids-safe / store builds (disables GA on leseno.de).
  appendUserAgent: " LesenoApp/Amazon",
  server: {
    url: "https://leseno.de/?leseno_store=amazon",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
  },
};

export default config;
