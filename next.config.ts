import type { NextConfig } from "next";
import path from "path";

const modernPolyfill = path.join(__dirname, "src/lib/modern-polyfill.js");

/**
 * - `inlineCss`: styles in HTML (no render-blocking CSS request) for first visits.
 * - Polyfill alias: drop Next’s unconditional ES polyfills (Array.at, Object.hasOwn, …)
 *   that Lighthouse flags as unused on modern browsers (~13 KiB).
 */
const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
    optimizePackageImports: ["lucide-react", "sonner"],
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
