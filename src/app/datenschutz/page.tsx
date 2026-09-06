import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

export const metadata: Metadata = {
  title: "Datenschutz — Leseno",
  description:
    "Datenschutzerklärung der Leseno-Leseapp nach DSGVO: Konto, Meine Welt, Zahlungen, Analytics.",
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
 * Privacy policy tailored to Leseno’s processing (auth, world profiles, AI, Stripe, GA).
 * Draft for operator review — not a substitute for individual legal advice.
 */
export default function DatenschutzPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Rechtliches
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Datenschutzerklärung
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Stand: September 2026. Diese Erklärung informiert dich darüber, wie
            wir personenbezogene Daten bei der Nutzung von Leseno
            (leseno.de) verarbeiten.
          </p>

          <div className="mt-10 space-y-10">
            <Section id="verantwortlicher" title="1. Verantwortlicher">
              <p>
                Verantwortlicher im Sinne der Datenschutz-Grundverordnung
                (DSGVO) ist:
              </p>
              <p className="font-semibold text-zinc-950">
                Bernd Krpec
                <br />
                Wupperweg 14, Gebäude 44
                <br />
                46286 Dorsten
                <br />
                Deutschland
              </p>
              <p>
                Telefon:{" "}
                <a
                  href="tel:+4915734344185"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  01573 4344185
                </a>
                <br />
                E-Mail:{" "}
                <a
                  href="mailto:info@leseno.de"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  info@leseno.de
                </a>
              </p>
              <p>
                Ein betrieblicher Datenschutzbeauftragter ist derzeit nicht
                bestellt. Bei Fragen zum Datenschutz genügt die Kontaktaufnahme
                unter den oben genannten Daten.
              </p>
            </Section>

            <Section id="ueberblick" title="2. Überblick über die Verarbeitung">
              <p>
                Leseno ist eine webbasierte Lese- und Lernanwendung. Wir
                verarbeiten Daten, die du uns mitteilst (z. B. bei Registrierung
                und in „Meine Welt“) sowie technische Daten, die bei der
                Nutzung anfallen. Zweck ist der Betrieb der Plattform, die
                Erstellung personalisierter Geschichten, die Abwicklung von
                Mitgliedschaften und Zahlungen sowie die sichere und stabile
                Bereitstellung des Angebots.
              </p>
              <p>
                Leseno richtet sich an Familien. Konten werden in der Regel von
                Erwachsenen angelegt. Angaben zu Kindern in Profilen („Meine
                Welt“) erfolgen unter Verantwortung der erziehungsberechtigten
                Person.
              </p>
            </Section>

            <Section id="rechtsgrundlagen" title="3. Rechtsgrundlagen">
              <p>Soweit in den folgenden Abschnitten nicht anders genannt, stützen wir uns insbesondere auf:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-zinc-950">Art. 6 Abs. 1 lit. b DSGVO</strong>{" "}
                  (Vertrag bzw. vorvertragliche Maßnahmen) — z. B. Konto,
                  Geschichten, Abos;
                </li>
                <li>
                  <strong className="text-zinc-950">Art. 6 Abs. 1 lit. c DSGVO</strong>{" "}
                  (rechtliche Pflicht) — z. B. handels- und steuerrechtliche
                  Aufbewahrung von Rechnungsdaten;
                </li>
                <li>
                  <strong className="text-zinc-950">Art. 6 Abs. 1 lit. f DSGVO</strong>{" "}
                  (berechtigtes Interesse) — z. B. IT-Sicherheit, Missbrauchs-
                  und Bot-Schutz, Reichweitenmessung in datensparsamer Form;
                </li>
                <li>
                  <strong className="text-zinc-950">Art. 6 Abs. 1 lit. a DSGVO</strong>{" "}
                  (Einwilligung) — sofern wir eine Einwilligung einholen (z. B.
                  für bestimmte Cookies oder optionale Funktionen); widerrufbar
                  jederzeit mit Wirkung für die Zukunft.
                </li>
              </ul>
            </Section>

            <Section id="hosting" title="4. Hosting und Server-Logfiles">
              <p>
                Die Website und zugehörige Dienste werden auf eigener bzw.
                gemieteter Infrastruktur betrieben (u. a. Deployment über
                Coolify auf einem Server unter der Domain leseno.de bzw.
                zugehörigen Subdomains wie der Datenbank-API).
              </p>
              <p>
                Beim Aufruf der Seiten können automatisch technische Daten
                verarbeitet werden, z. B. IP-Adresse, Datum und Uhrzeit der
                Anfrage, aufgerufene URL, User-Agent (Browser/Gerät) und
                Statuscodes. Das dient der Auslieferung der Inhalte, der
                Stabilität und der Abwehr von Angriffen (berechtigtes Interesse
                gem. Art. 6 Abs. 1 lit. f DSGVO). Logdaten werden in der Regel
                nur kurzfristig vorgehalten, soweit nicht eine längere
                Speicherung zur Aufklärung von Sicherheitsvorfällen erforderlich
                ist.
              </p>
            </Section>

            <Section id="konto" title="5. Benutzerkonto und Authentifizierung">
              <p>
                Für die Nutzung persönlicher Funktionen ist eine Registrierung
                erforderlich. Dabei verarbeiten wir insbesondere:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>E-Mail-Adresse</li>
                <li>Passwort (nur in gehashter Form beim Auth-Dienst)</li>
                <li>Rollen-/Mitgliedschaftsinformationen (z. B. Basis, Plus)</li>
                <li>Zeitpunkte von Anmeldung und relevanten Kontoaktionen</li>
              </ul>
              <p>
                Die Authentifizierung erfolgt über unseren Auth- und
                Datenbankdienst (Supabase / Postgres, erreichbar u. a. über
                supabase-api.leseno.de). Die Verarbeitung ist für die
                Vertragserfüllung erforderlich (Art. 6 Abs. 1 lit. b DSGVO).
              </p>
              <p>
                Für E-Mails zur Registrierung und zum Zurücksetzen des Passworts
                nutzen wir SMTP-Versand. Dabei werden Empfängeradresse und
                notwendige Inhalte der Nachricht an den jeweiligen
                E-Mail-Transportanbieter übermittelt.
              </p>
            </Section>

            <Section id="meine-welt" title="6. „Meine Welt“ und Kinderprofile">
              <p>
                In „Meine Welt“ kannst du Profile anlegen (z. B. Name, Alter bzw.
                Schulstufe, Interessen, Vorlieben). Diese Angaben dienen der
                personalisierten Geschichtenerstellung und werden mit deinem
                Benutzerkonto verknüpft.
              </p>
              <p>
                Bitte gib nur Daten ein, die für den Zweck nötig sind. Angaben zu
                Minderjährigen solltest du nur als erziehungsberechtigte Person
                bzw. mit entsprechender Berechtigung hinterlegen. Rechtsgrundlage
                ist Art. 6 Abs. 1 lit. b DSGVO (Nutzung des Dienstes) sowie ggf.
                Art. 6 Abs. 1 lit. f DSGVO für die technische Speicherung.
              </p>
            </Section>

            <Section id="geschichten" title="7. Geschichten, KI und Medien">
              <p>
                Zur Erzeugung von Geschichten, Faktenhinweisen, Illustrationen
                und optionaler Vorlese-Funktion übermitteln wir die von dir
                gewählten Eingaben (Thema, Länge, Profilkontext usw.) an
                externe KI- bzw. Medien-Dienste (u. a. Modelle über Google Gemini
                bzw. vergleichbare Textmodelle sowie Bilddienste wie IONOS
                FLUX). Die Anbieter verarbeiten die übermittelten Inhalte, um die
                Antwort zu erzeugen.
              </p>
              <p>
                Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Soweit Anbieter
                Daten in Drittländern (z. B. USA) verarbeiten, erfolgt dies —
                soweit einschlägig — auf Grundlage geeigneter Garantien (z. B.
                Standardvertragsklauseln / Angemessenheitsbeschlüsse) der
                jeweiligen Anbieter. Einzelheiten ergeben sich aus deren
                Datenschutzhinweisen.
              </p>
              <p>
                Generierte Inhalte können in deinem Konto gespeichert werden,
                soweit die Funktion das vorsieht. Nutzungs- und Aktionsdaten
                (z. B. dass eine Geschichte erzeugt wurde) können in einem
                Aktivitätsprotokoll für Support, Missbrauchsschutz und
                Produktverbesserung gespeichert werden (Art. 6 Abs. 1 lit. b und
                f DSGVO).
              </p>
            </Section>

            <Section id="zahlungen" title="8. Mitgliedschaften, Credits und Zahlungen">
              <p>
                Für kostenpflichtige Pakete und Credit-Zubuchungen nutzen wir den
                Zahlungsdienstleister Stripe (Stripe Payments Europe, Ltd. bzw.
                verbundene Unternehmen). Bei Checkout und Abos werden
                Zahlungsdaten (z. B. Karte, PayPal, SEPA-Lastschrift) in der Regel
                direkt bei Stripe eingegeben und dort verarbeitet. Wir erhalten
                typischerweise Bestätigungen, Kunden- und Abo-Kennungen, Beträge,
                Status sowie die für Freischaltung nötigen Metadaten — nicht den
                vollständigen Kartendatensatz.
              </p>
              <p>
                Rechtsgrundlagen: Art. 6 Abs. 1 lit. b DSGVO (Vertragsabwicklung)
                und Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Aufbewahrung). Details:
                Datenschutzhinweise von Stripe (
                <a
                  href="https://stripe.com/de/privacy"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  stripe.com/de/privacy
                </a>
                ).
              </p>
            </Section>

            <Section id="kontakt" title="9. Kontaktformular">
              <p>
                Über das Kontaktformular unter{" "}
                <a
                  href="/kontakt"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  /kontakt
                </a>{" "}
                kannst du uns eine Nachricht senden. Als personenbezogene Angabe
                erheben wir dafür deine{" "}
                <strong className="text-zinc-950">E-Mail-Adresse</strong>, damit
                wir dir antworten können, sowie den Inhalt deiner Nachricht und
                den Zeitpunkt der Absendung.
              </p>
              <p>
                Die Daten speichern wir in unserer Datenbank, bis die Anfrage
                erledigt ist und gesetzliche oder berechtigte Aufbewahrungsgründe
                entfallen — in der Regel bis zum Abschluss der Kommunikation,
                längstens soweit für Nachweiszwecke erforderlich. Rechtsgrundlage
                ist Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche / vertragliche
                Anfrage) bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
                an der Bearbeitung von Anfragen).
              </p>
              <p>
                Name, Telefonnummer oder weitere Kontaktdaten werden über dieses
                Formular nicht abgefragt.
              </p>
            </Section>

            <Section id="analytics" title="10. Google Analytics">
              <p>
                Sofern konfiguriert, setzen wir Google Analytics 4 (Google Ireland
                Limited / Google LLC) zur Reichweitenanalyse ein. Dabei können
                Cookies bzw. vergleichbare Technologien verwendet und u. a.
                gekürzte IP-Adressen, Geräte-/Browserinformationen und
                Nutzungsereignisse (z. B. Seitenaufrufe) verarbeitet werden. Wir
                aktivieren die IP-Anonymisierung, soweit technisch vorgesehen.
              </p>
              <p>
                Zweck ist die Verbesserung von Angebot und Stabilität.
                Rechtsgrundlage ist — je nach Einwilligungskonfiguration —
                Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) oder Art. 6 Abs. 1 lit. f
                DSGVO (berechtigtes Interesse an Reichweitenmessung). Du kannst
                der Analyse durch entsprechende Browser-Einstellungen
                widersprechen bzw. Tracking-Schutz nutzen. Weitere Informationen:{" "}
                <a
                  href="https://policies.google.com/privacy"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  policies.google.com/privacy
                </a>
                .
              </p>
            </Section>

            <Section id="cookies" title="11. Cookies und ähnliche Technologien">
              <p>
                Wir verwenden technisch notwendige Cookies bzw. lokale Speicher
                (z. B. für die Sitzung nach dem Login). Diese sind für den
                Betrieb erforderlich (Art. 6 Abs. 1 lit. b bzw. f DSGVO).
              </p>
              <p>
                Analytische oder Marketing-Cookies setzen wir nur, soweit sie
                über eingebundene Dienste (z. B. Google Analytics) anfallen und
                die jeweilige Rechtsgrundlage greift. Du kannst Cookies in deinem
                Browser einschränken; dann stehen ggf. nicht alle Funktionen zur
                Verfügung.
              </p>
            </Section>

            <Section id="speicherdauer" title="12. Speicherdauer">
              <p>
                Wir speichern personenbezogene Daten nur so lange, wie es für die
                genannten Zwecke erforderlich ist oder gesetzliche
                Aufbewahrungsfristen bestehen. Kontodaten bleiben bis zur Löschung
                des Kontos bzw. bis zum Ablauf gesetzlicher Fristen erhalten.
                Zahlungs- und Buchhaltungsrelevante Daten können länger
                aufbewahrt werden (typischerweise bis zu 10 Jahre nach
                handels-/steuerrechtlichen Vorgaben). Kontaktanfragen löschen
                bzw. anonymisieren wir nach Bearbeitung, soweit keine längere
                Aufbewahrung nötig ist. Server- und Sicherheitslogs werden
                zeitnah gelöscht oder anonymisiert, soweit nicht ein Vorfall eine
                längere Aufbewahrung erfordert.
              </p>
            </Section>

            <Section id="empfaenger" title="13. Empfänger und Auftragsverarbeitung">
              <p>
                Daten können an technische Dienstleister übermittelt werden, die
                uns beim Betrieb unterstützen (Hosting, Datenbank/Auth,
                E-Mail-Versand, Zahlungsabwicklung, KI-/Medienanbieter,
                Analyse). Diese handeln, soweit erforderlich, nach Weisung auf
                Grundlage von Auftragsverarbeitungsverträgen gem. Art. 28 DSGVO
                bzw. als eigenständige Verantwortliche (z. B. Zahlungsdienst).
              </p>
            </Section>

            <Section id="rechte" title="14. Deine Rechte">
              <p>Du hast nach der DSGVO — soweit die Voraussetzungen vorliegen — insbesondere das Recht auf:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Auskunft (Art. 15 DSGVO)</li>
                <li>Berichtigung (Art. 16 DSGVO)</li>
                <li>Löschung (Art. 17 DSGVO)</li>
                <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
                <li>Widerspruch gegen Verarbeitungen auf Basis von Art. 6 Abs. 1 lit. f DSGVO (Art. 21 DSGVO)</li>
                <li>Widerruf erteilter Einwilligungen (Art. 7 Abs. 3 DSGVO)</li>
              </ul>
              <p>
                Zur Ausübung deiner Rechte genügt eine Nachricht an{" "}
                <a
                  href="mailto:info@leseno.de"
                  className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                >
                  info@leseno.de
                </a>
                . Außerdem hast du das Recht, dich bei einer Aufsichtsbehörde zu
                beschweren, z. B. bei der für dich zuständigen Behörde. Für NRW
                ist das typischerweise die Landesbeauftragte für Datenschutz und
                Informationsfreiheit Nordrhein-Westfalen (LDI NRW).
              </p>
            </Section>

            <Section id="sicherheit" title="15. Sicherheit">
              <p>
                Wir treffen angemessene technische und organisatorische Maßnahmen
                (u. a. TLS-Verschlüsselung der Verbindungen, Zugriffsbeschränkungen,
                Bot-Schutz), um Daten vor Verlust, Manipulation und unbefugtem
                Zugriff zu schützen. Absolute Sicherheit kann kein
                Internetangebot garantieren.
              </p>
            </Section>

            <Section id="aenderungen" title="16. Änderungen">
              <p>
                Wir können diese Datenschutzerklärung anpassen, wenn sich das
                Angebot, die Rechtslage oder eingesetzte Dienste ändern. Es gilt
                die jeweils auf dieser Seite veröffentlichte Fassung.
              </p>
            </Section>
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
