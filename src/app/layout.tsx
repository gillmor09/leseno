import type { Metadata } from "next";
import { Suspense } from "react";
import { Nunito, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CaptureReferral } from "@/components/features/marketing/capture-referral";
import { AppToaster } from "@/components/ui/app-toaster";
import { getMetadataBaseUrl, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const defaultTitle =
  "leseno — Lesen üben mit eigenen Geschichten für Grundschulkinder";
const defaultDescription =
  "Eigene Geschichten für Grundschulkinder: Lesen üben, Wissen staunen — altersgerecht für Klasse 1 bis 4. Kostenlos mit Basis starten.";

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: {
    default: defaultTitle,
    template: `%s — ${SITE_NAME}`,
  },
  description: defaultDescription,
  keywords: [
    "Lesen üben",
    "Grundschule",
    "Geschichten für Kinder",
    "Vorlesen App",
    "Erstlesen",
    "Silbenhilfe",
    "Leseförderung",
    "Leseapp Kinder",
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
      className={`${nunito.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <GoogleAnalytics />
        <Suspense fallback={null}>
          <CaptureReferral />
        </Suspense>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
