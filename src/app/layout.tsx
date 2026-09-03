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
  title: "Leseno — Eigene Geschichten mit echten Fakten",
  description:
    "Die Leseapp für Kinder von 5 bis 10. Thema wählen, Alter angeben, Stimmung setzen — und beim Lesen echte Fakten entdecken.",
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
