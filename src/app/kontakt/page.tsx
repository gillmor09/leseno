import type { Metadata } from "next";
import { ContactForm } from "@/components/features/contact/contact-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "Kontakt — Leseno",
  description: "Schreib uns: Fragen zu Leseno, Paketen oder dem Konto.",
};

/**
 * Public contact page — email for reply + message body.
 */
export default function KontaktPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Kontakt
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Schreib uns
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Fragen zu Leseno, Buchung oder Technik? Hinterlass deine E-Mail für
            die Antwort und deine Nachricht — wir melden uns.
          </p>
          <div className="mt-10">
            <ContactForm />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
