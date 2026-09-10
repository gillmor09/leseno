import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Anmelden — Leseno",
};

/** E-Mail-vergessen flow removed; send visitors to login. */
export default function EmailVergessenRedirectPage() {
  redirect("/anmelden");
}
