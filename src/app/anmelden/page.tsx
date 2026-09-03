import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignInForm } from "@/components/features/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Anmelden — Leseno",
  description: "Mit E-Mail und Passwort bei Leseno anmelden.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ bestaetigt?: string; bestaetigung?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      eyebrow="Konto"
      title="Anmelden"
      description="Melde dich mit deiner E-Mail-Adresse und deinem Passwort an, um weiterzulesen und später Geschichten zu verwalten."
    >
      <SignInForm
        emailConfirmed={params.bestaetigt === "1"}
        confirmationFailed={params.bestaetigung === "fehlgeschlagen"}
      />
    </AuthShell>
  );
}
