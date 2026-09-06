import type { Metadata } from "next";
import { MembershipStoryPage } from "@/components/features/stories/membership-story-page";

export const metadata: Metadata = {
  title: "Deine Geschichte — Leseno",
  description:
    "Wähl ein Top-Thema oder „Ganz persönlich“, stell Lesestufe und Länge ein — dann lies deine Geschichte und staune unterwegs.",
};

/**
 * Shared membership composer for all packages (`/geschichte`).
 * Legacy `/basis` and `/paket1`–`/paket3` redirect here.
 */
export default function GeschichtePage() {
  return <MembershipStoryPage />;
}
