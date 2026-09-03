import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { ForgotEmailForm } from "@/components/features/auth/forgot-email-form";

export const metadata: Metadata = {
  title: "E-Mail vergessen — Leseno",
  description: "Anfrage stellen, wenn die Anmelde-E-Mail nicht mehr bekannt ist.",
};

export default function ForgotEmailPage() {
  return (
    <AuthShell
      eyebrow="Konto"
      title="E-Mail vergessen"
      description="Wenn du nicht mehr weißt, mit welcher E-Mail du dich registriert hast, kannst du hier eine Zuordnungsanfrage hinterlassen."
    >
      <ForgotEmailForm />
    </AuthShell>
  );
}
