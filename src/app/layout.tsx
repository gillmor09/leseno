import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
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
    "Die Leseapp für Kinder von 5 bis 10: Thema wählen, Schulstufe setzen, Ton drehen — und beim Lesen echtes Wissen mitnehmen. Mit Silbenhilfe, Vorlesen und Meine Welt.",
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
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
