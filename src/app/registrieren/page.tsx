import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignUpForm } from "@/components/features/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Registrieren — Leseno",
  description: "Ein neues Leseno-Konto mit E-Mail und Passwort anlegen.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Konto"
      title="Registrieren"
      description="Lege dein Elternkonto an. Nach der Registrierung bestätigst du deine E-Mail und kannst dich dann anmelden."
    >
      <SignUpForm />
    </AuthShell>
  );
}
