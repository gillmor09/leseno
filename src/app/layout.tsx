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
  title: "Leseno — Deine Geschichten mit echten Fakten",
  description:
    "Die Leseapp für dich von 5 bis 10. Wähl dein Thema, gib deine Schulstufe an, setz den Ton — und entdecke beim Lesen echte Fakten.",
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
