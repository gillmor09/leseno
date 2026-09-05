import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignUpForm } from "@/components/features/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Registrieren — Leseno",
  description: "Konto anlegen und mit Basis starten.",
};

/**
 * Registration entry: email + password via `SignUpForm` → `signUpAction`.
 */
export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Basis"
      title="Registrieren"
      description="Leg dein Konto an und starte mit Basis. Danach bestätigst du deine E-Mail."
    >
      <SignUpForm />
    </AuthShell>
  );
}
