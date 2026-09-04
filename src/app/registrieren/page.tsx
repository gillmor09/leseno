import type { Metadata } from "next";
import { AuthShell } from "@/components/features/auth/auth-shell";

export const metadata: Metadata = {
  title: "Registrieren — Leseno",
  description: "Konto anlegen und mit Basis starten.",
};

/**
 * Registration entry from landing „Basis“ CTAs.
 * Form content follows later; shell is ready for the signup flow.
 */
export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Basis"
      title="Registrieren"
      description="Hier legst du dein Konto an und startest mit Basis. Das Formular folgt in Kürze."
    >
      <div className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10 sm:p-10">
        <p className="text-sm leading-relaxed text-zinc-600">
          Die Registrierung wird hier ergänzt.
        </p>
        <a
          href="/anmelden"
          className="mt-6 inline-flex rounded-full bg-zinc-800 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900"
        >
          Bereits ein Konto? Anmelden
        </a>
      </div>
    </AuthShell>
  );
}
