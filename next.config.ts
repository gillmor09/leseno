import type { NextConfig } from "next";
import path from "path";

const modernPolyfill = path.join(__dirname, "src/lib/modern-polyfill.js");

/**
 * - `inlineCss`: styles in HTML (no render-blocking CSS request) for first visits.
 * - Polyfill alias: drop Next’s unconditional ES polyfills (Array.at, Object.hasOwn, …)
 *   that Lighthouse flags as unused on modern browsers (~13 KiB).
 * - `poweredByHeader: false`: hide `X-Powered-By` (SEO / hardening).
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native canvas must stay external for social image text overlay.
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "opentype.js"],
  // Vendored Nunito TTF + Frage background for social overlays.
  outputFileTracingIncludes: {
    "/*": [
      "./src/assets/fonts/Nunito-SemiBold.ttf",
      "./public/bg3.jpg",
      "./public/landing/vogel-hell.webp",
    ],
  },
  experimental: {
    inlineCss: true,
    optimizePackageImports: ["lucide-react", "sonner"],
    // Social „Übernehmen“ sends 1024² PNG/JPEG data-URLs back to the server action.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./src/lib/modern-polyfill.js",
      "next/dist/build/polyfills/polyfill-module": "./src/lib/modern-polyfill.js",
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "../build/polyfills/polyfill-module": modernPolyfill,
      "next/dist/build/polyfills/polyfill-module": modernPolyfill,
    };
    return config;
  },
};

export default nextConfig;
