import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CaptureReferral } from "@/components/features/marketing/capture-referral";
import { LazyAppToaster } from "@/components/ui/lazy-app-toaster";
import { getMetadataBaseUrl, SITE_NAME } from "@/lib/seo";
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

const defaultTitle =
  "leseno — Eigene Geschichten aus Spaß und Neugier";
const defaultDescription =
  "Eigene Geschichten, die Kinder freiwillig lesen wollen — aus Lust und Neugier, ohne Druck und ohne Schulgefühl. Kostenlos mit Basis starten.";

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: {
    default: defaultTitle,
    template: `%s — ${SITE_NAME}`,
  },
  description: defaultDescription,
  keywords: [
    "Geschichten für Kinder",
    "Kinder lesen",
    "Vorlesen App",
    "persönliche Geschichten",
    "Silbenhilfe",
    "Lesen ohne Druck",
    "Leseapp Kinder",
    "Neugier",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: SITE_NAME,
    title: defaultTitle,
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
    title: defaultTitle,
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
        {children}
        <LazyAppToaster />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
