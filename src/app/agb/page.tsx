import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "AGB — Leseno",
  description:
    "Allgemeine Geschäftsbedingungen für Leseno: Mitgliedschaften, Credits und Nutzung der Leseapp.",
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
 * Terms of service for Leseno (subscriptions, credits, digital content).
 * Draft for operator/legal review.
 */
export default function AgbPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Rechtliches
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Allgemeine Geschäftsbedingungen
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Stand: September 2026. Diese AGB gelten für die Nutzung der
            Leseno-Plattform unter leseno.de und zugehörigen Domains.
          </p>

          <div className="mt-10 space-y-10">
            <Section id="geltung" title="1. Geltungsbereich">
              <p>
                Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle
                Verträge zwischen Bernd Krpec, Wupperweg 14, Gebäude 44, 46286
                Dorsten („Anbieter“, „wir“) und Nutzerinnen und Nutzern
                („Nutzer“, „du“) über die Nutzung von Leseno sowie über den
                Erwerb von Mitgliedschaften und Credits.
              </p>
              <p>
                Abweichende Bedingungen des Nutzers werden nicht Vertragsinhalt,
                es sei denn, wir stimmen ihrer Geltung ausdrücklich zu.
              </p>
            </Section>

            <Section id="anbieter" title="2. Anbieter und Kontakt">
              <p className="font-semibold text-zinc-950">
                Bernd Krpec
                <br />
                Wupperweg 14, Gebäude 44
                <br />
                46286 Dorsten
              </p>
              <p>
                E-Mail:{" "}
                <a
                  href="mailto:info@leseno.de"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  info@leseno.de
                </a>
                <br />
                Telefon:{" "}
                <a
                  href="tel:+4915734344185"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  01573 4344185
                </a>
              </p>
              <p>
                Weitere Angaben:{" "}
                <Link
                  href="/impressum"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Impressum
                </Link>
                .
              </p>
            </Section>

            <Section id="leistung" title="3. Leistungsbeschreibung">
              <p>
                Leseno ist eine webbasierte Anwendung zur Erstellung und Nutzung
                von Kindergeschichten mit begleitenden Lern- und Lesefunktionen
                (u. a. Themenwahl, personalisierte Profile in „Meine Welt“,
                optionale Illustrationen, Silbenhilfe, Vorlesen, Export,
                Hintergrund-/Warum-Inhalte — je nach gebuchtem Paket).
              </p>
              <p>Insbesondere bieten wir an:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-zinc-950">Basis</strong> — kostenlose
                  Nutzung in eingeschränktem Umfang;
                </li>
                <li>
                  <strong className="text-zinc-950">Mitgliedschaften</strong>{" "}
                  (z. B. Plus, Pro, Ultimate) als wiederkehrende
                  Monatsabonnements mit den jeweils ausgewiesenen Funktionen und
                  ggf. enthaltenen Credits;
                </li>
                <li>
                  <strong className="text-zinc-950">Credits</strong> —
                  einmalig zubuchbare Nutzungseinheiten für zusätzliche
                  Geschichten bzw. Leistungen laut aktueller Preisübersicht.
                </li>
              </ul>
              <p>
                Die konkrete Leistungsbeschreibung und Preise ergeben sich aus
                der Darstellung auf der Website zum Zeitpunkt der Bestellung
                (insbesondere unter{" "}
                <Link
                  href="/preise"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  /preise
                </Link>
                ). Geschichten werden unter Einsatz von KI-Diensten erzeugt; Inhalt
                und Qualität können variieren. Eine bestimmte literarische oder
                didaktische Wirkung wird nicht geschuldet.
              </p>
            </Section>

            <Section id="konto" title="4. Registrierung und Konto">
              <p>
                Für die Nutzung persönlicher Funktionen ist ein Benutzerkonto
                erforderlich. Du verpflichtest dich, wahrheitsgemäße Angaben zu
                machen und Zugangsdaten geheim zu halten. Konten sind nicht
                übertragbar.
              </p>
              <p>
                Leseno richtet sich an Familien. Die Registrierung und Buchung
                erfolgen durch volljährige Nutzer. Profile und Angaben zu Kindern
                in „Meine Welt“ legst du nur als erziehungsberechtigte Person
                bzw. mit entsprechender Berechtigung an und verantwortest deren
                Inhalte.
              </p>
              <p>
                Wir können Konten sperren oder löschen, wenn gegen diese AGB
                verstoßen wird, missbräuchliche Nutzung vorliegt oder zwingende
                Gründe (Sicherheit, Rechtsverstöße) dies erfordern.
              </p>
            </Section>

            <Section id="vertrag" title="5. Vertragsschluss">
              <p>
                Die Darstellung von Paketen und Credits auf der Website ist kein
                verbindliches Angebot, sondern eine Aufforderung zur Bestellung.
                Mit Abschluss des Bestellvorgangs über den Zahlungsdienstleister
                (Stripe Checkout) gibst du ein verbindliches Angebot zum
                Abschluss des jeweiligen Vertrags ab. Der Vertrag kommt zustande,
                wenn wir die Bestellung annehmen — in der Regel durch Bestätigung
                der Zahlung bzw. Freischaltung der Leistung.
              </p>
              <p>
                Der Vertragstext wird von uns gespeichert. Die maßgeblichen AGB
                und die{" "}
                <Link
                  href="/widerruf"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Widerrufsbelehrung
                </Link>{" "}
                kannst du jederzeit auf dieser Website abrufen.
              </p>
            </Section>

            <Section id="preise" title="6. Preise und Zahlung">
              <p>
                Alle Preise verstehen sich in Euro und — soweit nicht anders
                angegeben — inklusive der gesetzlichen Umsatzsteuer. Maßgeblich
                sind die zum Bestellzeitpunkt ausgewiesenen Preise.
              </p>
              <p>
                Die Zahlung erfolgt über Stripe. Akzeptierte Zahlungsmittel
                ergeben sich aus dem Checkout (z. B. Karte, SEPA-Lastschrift,
                PayPal, soweit freigeschaltet). Bei Abos ermächtigst du uns bzw.
                den Zahlungsdienstleister, fällige Beträge wiederkehrend
                einzuziehen, bis du kündigst oder das Abo endet.
              </p>
              <p>
                Bei fehlgeschlagenen Zahlungen können wir den Zugang zu
                kostenpflichtigen Leistungen aussetzen, bis der Rückstand
                ausgeglichen ist.
              </p>
            </Section>

            <Section id="abo" title="7. Laufzeit, Verlängerung und Kündigung von Abos">
              <p>
                Mitgliedschaften laufen zunächst für die gebuchte Periode
                (typischerweise ein Monat) und verlängern sich automatisch um
                dieselbe Periode, sofern sie nicht rechtzeitig gekündigt werden.
              </p>
              <p>
                Du kannst das Abo jederzeit zum Ende der laufenden
                Abrechnungsperiode kündigen — insbesondere über das
                Stripe-Kundenportal („Abo verwalten“) oder durch Mitteilung an{" "}
                <a
                  href="mailto:info@leseno.de"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  info@leseno.de
                </a>
                . Nach wirksamer Kündigung bleibt der Zugang bis zum Periodenende
                erhalten; danach entfallen die paketgebundenen Leistungen
                (Rückfall auf Basis, soweit nichts anderes vereinbart ist).
              </p>
              <p>
                Das Recht zur außerordentlichen Kündigung aus wichtigem Grund
                bleibt unberührt.
              </p>
            </Section>

            <Section id="credits" title="8. Credits">
              <p>
                Credits sind digitale Nutzungseinheiten. Der Verbrauch richtet
                sich nach der jeweils ausgewiesenen Credit-Logik (z. B. Länge
                der Geschichte). Enthaltene Credits aus einem Abo und zugekaufte
                Credits werden dem Konto gutgeschrieben.
              </p>
              <p>
                Credits verfallen nicht automatisch zum Monatsende, soweit auf
                der Website nichts Abweichendes angegeben ist. Eine Auszahlung
                von Credits in Geld ist ausgeschlossen. Bereits verbrauchte
                Credits werden nicht erstattet.
              </p>
            </Section>

            <Section id="nutzungsrechte" title="9. Nutzungsrechte an Inhalten">
              <p>
                An der Software, dem Design und den Marken von Leseno bleiben wir
                bzw. unsere Lizenzgeber Rechteinhaber. Dir wird ein einfaches,
                nicht übertragbares Recht eingeräumt, Leseno für den privaten
                bzw. familiären Gebrauch im Rahmen des Vertrags zu nutzen.
              </p>
              <p>
                Für von dir erzeugte Geschichten und zugehörige Ausgaben räumen
                wir dir ein einfaches Nutzungsrecht zur privaten Verwendung ein
                (Lesen, Vorlesen, Speichern, Export soweit freigeschaltet). Eine
                kommerzielle Weiterverwertung oder das systematische
                Weiterverkaufen von Ausgaben ist ohne unsere Zustimmung nicht
                gestattet.
              </p>
              <p>
                Du sicherst zu, keine rechtswidrigen, beleidigenden oder
                fremde Rechte verletzenden Eingaben zu machen.
              </p>
            </Section>

            <Section id="verfuegbarkeit" title="10. Verfügbarkeit und Änderungen">
              <p>
                Wir bemühen uns um eine möglichst unterbrechungsfreie
                Verfügbarkeit. Wartung, Störungen bei Drittanbietern (z. B. KI-
                oder Zahlungsdienste) oder höhere Gewalt können die Nutzung
                zeitweise einschränken. Ein Anspruch auf jederzeitige
                Verfügbarkeit besteht nicht.
              </p>
              <p>
                Wir dürfen Funktionen weiterentwickeln, anpassen oder — bei
                berechtigtem Interesse und unter Wahrung der Zumutbarkeit —
                einschränken. Wesentliche Verschlechterungen der Hauptleistung
                eines laufenden Abos teilen wir angemessen mit; dir stehen dann
                die gesetzlichen Rechte zu.
              </p>
            </Section>

            <Section id="haftung" title="11. Haftung">
              <p>
                Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit
                sowie nach dem Produkthaftungsgesetz und bei Verletzung von Leben,
                Körper oder Gesundheit.
              </p>
              <p>
                Bei leichter Fahrlässigkeit haften wir nur bei Verletzung
                wesentlicher Vertragspflichten (Kardinalpflichten), und der Höhe
                nach begrenzt auf den vorhersehbaren, vertragstypischen Schaden.
                Im Übrigen ist die Haftung ausgeschlossen.
              </p>
              <p>
                Für Inhalte, die durch KI erzeugt werden, übernehmen wir keine
                Garantie auf Vollständigkeit, Richtigkeit oder Eignung für einen
                bestimmten Lernzweck. Eltern bzw. Begleitpersonen bleiben für die
                altersgerechte Nutzung verantwortlich.
              </p>
            </Section>

            <Section id="widerruf" title="12. Widerrufsrecht">
              <p>
                Als Verbraucher steht dir grundsätzlich ein Widerrufsrecht zu.
                Einzelheiten sowie Hinweise zum Erlöschen des Widerrufsrechts bei
                digitalen Inhalten und Dienstleistungen (u. a. wenn die
                Ausführung mit deiner ausdrücklichen Zustimmung vor Ablauf der
                Widerrufsfrist beginnt) findest du in der gesonderten{" "}
                <Link
                  href="/widerruf"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Widerrufsbelehrung
                </Link>
                .
              </p>
              <p>
                Der wirksame Verzicht bzw. das Erlöschen setzt neben dieser
                Information typischerweise deine ausdrückliche Zustimmung im
                Bestellprozess voraus.
              </p>
            </Section>

            <Section id="datenschutz" title="13. Datenschutz">
              <p>
                Hinweise zur Verarbeitung personenbezogener Daten enthält unsere{" "}
                <Link
                  href="/datenschutz"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </Section>

            <Section id="schluss" title="14. Schlussbestimmungen">
              <p>
                Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss
                des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des
                Staates, in dem du dich gewöhnlich aufhältst, bleiben unberührt.
              </p>
              <p>
                Sollte eine Bestimmung dieser AGB unwirksam sein oder werden,
                bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
              </p>
              <p>
                Wir können diese AGB mit Wirkung für die Zukunft anpassen, wenn
                sachliche Gründe vorliegen (z. B. Gesetzesänderungen,
                Funktionserweiterungen). Über wesentliche Änderungen informieren
                wir in geeigneter Weise. Widersprichst du nicht innerhalb einer
                angemessenen Frist und nutzt du den Dienst weiter, gelten die
                neuen AGB als angenommen — darauf weisen wir in der Mitteilung
                hin. Bei Widerspruch können wir den Vertrag ordentlich beenden.
              </p>
            </Section>
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
