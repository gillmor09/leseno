import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/features/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Passwort vergessen — Leseno",
  description: "Passwort per E-Mail-Link zurücksetzen.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Konto"
      title="Passwort vergessen"
      description="Gib die E-Mail-Adresse deines Kontos an. Wir senden dir einen Link, mit dem du ein neues Passwort setzen kannst."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
