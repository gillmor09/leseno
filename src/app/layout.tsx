import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CapturePromo } from "@/components/features/marketing/capture-promo";
import { CaptureReferral } from "@/components/features/marketing/capture-referral";
import { LazyAppToaster } from "@/components/ui/lazy-app-toaster";
import {
  DEFAULT_META_DESCRIPTION,
  getMetadataBaseUrl,
  SITE_NAME,
} from "@/lib/seo";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  // Only weights used in UI (regular / semibold / bold / extrabold).
  weight: ["400", "600", "700", "800"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

const defaultTitle = "Eigene Kindergeschichten aus Spaß und Neugier";
const defaultDescription = DEFAULT_META_DESCRIPTION;

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: {
    default: defaultTitle,
    template: `%s — ${SITE_NAME}`,
  },
  description: defaultDescription,
  // No keywords meta — outdated and tools flag repeated brand tags.
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      {
        url: "/leseno-vogel-256.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/leseno-vogel-256.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: SITE_NAME,
    title: `${defaultTitle} — ${SITE_NAME}`,
    description: defaultDescription,
    url: "/",
    images: [
      {
        url: "/landing/hero-lesen.webp",
        width: 1536,
        height: 1024,
        alt: "Kind liest eine Leseno-Geschichte",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${defaultTitle} — ${SITE_NAME}`,
    description: defaultDescription,
    images: ["/landing/hero-lesen.webp"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${nunito.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        <CaptureReferral />
        <CapturePromo />
        {children}
        <LazyAppToaster />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
