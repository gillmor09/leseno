import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignInForm } from "@/components/features/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Anmelden — Leseno",
  description: "Mit E-Mail und Passwort bei Leseno anmelden.",
};

function safeEmailQuery(raw: string | undefined): string {
  const email = raw?.trim() ?? "";
  if (!email || email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    bestaetigt?: string;
    bestaetigung?: string;
    email?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/geschichte";

  return (
    <AuthShell
      eyebrow="Konto"
      title="Anmelden"
      description="Melde dich mit deiner E-Mail-Adresse und deinem Passwort an, um weiterzulesen und später Geschichten zu verwalten."
    >
      <SignInForm
        emailConfirmed={params.bestaetigt === "1"}
        confirmationFailed={params.bestaetigung === "fehlgeschlagen"}
        initialEmail={safeEmailQuery(params.email)}
        nextPath={nextPath}
      />
    </AuthShell>
  );
}
