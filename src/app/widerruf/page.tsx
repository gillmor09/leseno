import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "Widerrufsbelehrung — Leseno",
  description:
    "Widerrufsbelehrung und Hinweise zum Erlöschen des Widerrufsrechts bei digitalen Leseno-Leistungen.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-extrabold tracking-tight text-zinc-950">
        {title}
      </h2>
      <div className="space-y-3 text-base leading-relaxed text-zinc-700">
        {children}
      </div>
    </section>
  );
}

/**
 * Withdrawal policy (Widerrufsbelehrung) for distance contracts + digital content.
 * The effective waiver still requires explicit consent at checkout.
 */
export default function WiderrufPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Rechtliches
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Widerrufsbelehrung
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Stand: September 2026. Für Verbraucherinnen und Verbraucher bei
            Fernabsatzverträgen über Leseno.
          </p>

          <div className="mt-10 space-y-10">
            <Section id="belehrung" title="Widerrufsrecht">
              <p>
                Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
                diesen Vertrag zu widerrufen.
              </p>
              <p>
                Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des
                Vertragsabschlusses.
              </p>
              <p>
                Um dein Widerrufsrecht auszuüben, musst du uns
              </p>
              <p className="font-semibold text-zinc-950">
                Bernd Krpec
                <br />
                Wupperweg 14, Gebäude 44
                <br />
                46286 Dorsten
                <br />
                E-Mail: info@leseno.de
                <br />
                Telefon: 01573 4344185
              </p>
              <p>
                mittels einer eindeutigen Erklärung (z. B. per E-Mail) über deinen
                Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst
                dafür das unten stehende Muster-Widerrufsformular verwenden, das
                jedoch nicht vorgeschrieben ist.
              </p>
              <p>
                Zur Wahrung der Widerrufsfrist reicht es aus, dass du die
                Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der
                Widerrufsfrist absendest.
              </p>
            </Section>

            <Section id="folgen" title="Folgen des Widerrufs">
              <p>
                Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen,
                die wir von dir erhalten haben, unverzüglich und spätestens
                binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die
                Mitteilung über deinen Widerruf dieses Vertrags bei uns
                eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe
                Zahlungsmittel, das du bei der ursprünglichen Transaktion
                eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas
                anderes vereinbart; in keinem Fall werden dir wegen dieser
                Rückzahlung Entgelte berechnet.
              </p>
            </Section>

            <Section id="digital" title="Vorzeitiges Erlöschen bei digitalen Leistungen">
              <p>
                Das Widerrufsrecht erlischt bei einem Vertrag über die Lieferung
                von nicht auf einem körperlichen Datenträger befindlichen
                digitalen Inhalten (und — soweit einschlägig — bei bestimmten
                Dienstleistungen), wenn wir mit der Ausführung begonnen haben,
                nachdem du ausdrücklich zugestimmt hast, dass wir mit der
                Ausführung vor Ablauf der Widerrufsfrist beginnen, und du deine
                Kenntnis davon bestätigt hast, dass du durch deine Zustimmung
                mit Beginn der Ausführung dein Widerrufsrecht verlierst
                (vgl. insbesondere § 356 Abs. 4 und Abs. 5 BGB).
              </p>
              <p>
                Das betrifft bei Leseno typischerweise den sofortigen Zugang zu
                digitalen Mitgliedschaften (Plus, Pro, Ultimate), die sofortige
                Gutschrift und Nutzung von Credits sowie die Nutzung der
                KI-gestützten Geschichtenfunktionen nach Freischaltung.
              </p>
              <p>
                <strong className="text-zinc-950">Wichtig:</strong> Allein der
                Hinweis in den AGB reicht für das Erlöschen nicht aus. Die
                ausdrückliche Zustimmung und Kenntnisbestätigung erfolgen im
                Bestell-/Checkout-Prozess. Bis dahin bleibt das Widerrufsrecht
                — soweit gesetzlich vorgesehen — bestehen.
              </p>
            </Section>

            <Section id="muster" title="Muster-Widerrufsformular">
              <p>
                (Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses
                Formular aus und sende es zurück.)
              </p>
              <div className="rounded-[1.5rem] bg-white p-6 ring-1 ring-zinc-950/10">
                <p>
                  An
                  <br />
                  Bernd Krpec
                  <br />
                  Wupperweg 14, Gebäude 44
                  <br />
                  46286 Dorsten
                  <br />
                  E-Mail: info@leseno.de
                </p>
                <p className="mt-4">
                  Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*)
                  abgeschlossenen Vertrag über den Kauf der folgenden Waren
                  (*)/die Erbringung der folgenden Dienstleistung (*)
                </p>
                <p className="mt-4">
                  — Bestellt am (*)/erhalten am (*)
                  <br />
                  — Name des/der Verbraucher(s)
                  <br />
                  — Anschrift des/der Verbraucher(s)
                  <br />
                  — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf
                  Papier)
                  <br />— Datum
                </p>
                <p className="mt-4 text-sm text-zinc-500">
                  (*) Unzutreffendes streichen.
                </p>
              </div>
            </Section>

            <Section id="agb" title="Weitere Vertragsbedingungen">
              <p>
                Ergänzend gelten unsere{" "}
                <Link
                  href="/agb"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Allgemeinen Geschäftsbedingungen
                </Link>{" "}
                und die{" "}
                <Link
                  href="/datenschutz"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </Section>
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
