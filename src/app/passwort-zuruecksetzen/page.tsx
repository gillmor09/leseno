import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen — Leseno",
  description: "Neues Passwort für dein Leseno-Konto festlegen.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Konto"
      title="Passwort zurücksetzen"
      description="Wenn du über den Link aus der E-Mail hier gelandet bist, kannst du jetzt ein neues Passwort speichern."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
