import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { AppToaster } from "@/components/ui/app-toaster";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leseno — Eigene Geschichten mit Wissen und Staunen",
  description:
    "Die Leseapp für Kinder von 5 bis 10: eigene Geschichten mit Bildern, echtem Wissen und „Warum?“ zum Nachforschen — altersgerecht und mit Vorlesen.",
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
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
