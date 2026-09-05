import Image from "next/image";
import type { ReactNode } from "react";
import {
  BookMarked,
  BookOpen,
  Check,
  BicepsFlexed,
  HelpCircle,
  ImageIcon,
  Smile,
  Sparkles,
  Target,
  Volume2,
  Zap,
} from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";

/** Brand name in body copy: always lowercase + bold. */
function withLesenoBrand(text: string): ReactNode {
  const parts = text.split(/(Leseno|leseno)/g);
  return parts.map((part, index) =>
    part.toLowerCase() === "leseno" ? (
      <strong key={index} className="font-extrabold">
        leseno
      </strong>
    ) : (
      part
    ),
  );
}

const steps = [
  {
    number: "01",
    title: "Wähl dein Thema",
    text: "Dinos, Fußball, Weltall oder dein Hund — sag, worauf du Lust hast. Leseno macht daraus eine Geschichte nur für dich.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Passende Schulstufe",
    text: "Von Erstlesern bis Klasse 4: Die Sätze passen zu dem, was du schon gut lesen kannst — zum Üben und zum Mitfiebern.",
    icon: Target,
  },
  {
    number: "03",
    title: "Lesen und Staunen",
    text: "Selbst lesen und Wissen mitnehmen. Mit den passenden Paketen kommen Silbenhilfe, Vorlesen oder Bilder dazu.",
    icon: BookOpen,
  },
] as const;

const moods = [
  {
    title: "Lustig",
    text: "Komödie mit Klamauk: Missgeschicke, Quatsch und Lacher — und trotzdem echtes Wissen dazwischen.",
    image: "/landing/mood-lustig.webp",
    imageAlt:
      "Kind lacht über ein aufgeschlagenes Buch, aus dem der Leseno-Vogel steigt",
    icon: Smile,
  },
  {
    title: "Spannend",
    text: "Detektivgeschichte mit Rätsel, Spuren und Auflösung — kindgerecht spannend, mit echten Fakten im Gepäck.",
    image: "/landing/mood-spannend.webp",
    imageAlt:
      "Kind liest gebannt, während der Leseno-Vogel und ein Blitz aus dem Buch aufsteigen",
    icon: Zap,
  },
  {
    title: "Motivierend",
    text: "Wie ein Motivationscoach: Wenn du willst, schaffst du alles — Mut, Durchhalten und Wissen für danach.",
    image: "/landing/mood-motivierend.webp",
    imageAlt:
      "Kind betrachtet zuversichtlich ein Buch, aus dem der leuchtende Leseno-Vogel steigt",
    icon: BicepsFlexed,
  },
] as const;

const strengths = [
  {
    title: "Lesen üben mit Spaß",
    text: "Keine trockenen Übungsblätter: Du liest echte Abenteuer — und trainierst dabei Wörter, Tempo und Verständnis.",
    icon: BookOpen,
  },
  {
    title: "Meine Bücherei (Plus)",
    text: "Fertige Geschichten speichern, Favoriten setzen und später erneut lesen — alles an einem Ort.",
    icon: BookMarked,
  },
  {
    title: "Vorlesen (Ultimate)",
    text: "Müde Augen? Mit Ultimate lass die Geschichte vorlesen — mit Tempo und optionaler Wort-Markierung.",
    icon: Volume2,
  },
  {
    title: "Silbenhilfe (Ultimate)",
    text: "Schwierige Wörter in Silben teilen: ideal zum Lesen lernen und Üben in der Grundschule.",
    icon: Target,
  },
  {
    title: "Mit Bildern erleben (Pro)",
    text: "Illustrationen zur Geschichte: Du siehst, was du liest — das hilft beim Verstehen und Bleiben-Wollen.",
    icon: ImageIcon,
  },
  {
    title: "Warum? (Pro)",
    text: "Neugierig? Tippe auf „Warum?“ und hol dir den Hintergrund. Mit Ultimate geht’s noch tiefer.",
    icon: HelpCircle,
  },
] as const;

const parentPoints = [
  "Zielgruppe klar: Grundschulkinder, die gerne lesen und Lesen üben wollen.",
  "Leseförderung ohne Druck: eigene Geschichten statt starrer Lesebücher — Motivation bleibt hoch.",
  "Altersgerecht: Sprache und Länge folgen der Schulstufe (Erstlesen bis Klasse 4).",
  "Pakete nach Bedarf: Plus für Credits, Bücherei & PDF, Pro für Familie & Bilder, Ultimate für Silbenhilfe & Vorlesen.",
  "Mehrwert: echtes Wissen in der Geschichte — mit Pro „Warum?“ zum Nachforschen.",
  "Meine Welt: ab Plus ein Kinderprofil, mit Pro beliebig viele unter einem Konto.",
  "Risikofrei starten: Erst kostenlos ausprobieren, dann entscheiden.",
] as const;

const trySteps = [
  {
    number: "1",
    title: "Öffne und leg los",
    text: "Kein Abo nötig. Tippe auf Start, wähl ein Thema und deine Klasse.",
  },
  {
    number: "2",
    title: "Kurze Probe-Geschichte",
    text: "Im Testmodus: 1. und 2. Klasse, Textlänge bis mittel — ideal zum Schnuppern.",
  },
  {
    number: "3",
    title: "Dann mit Konto weiter",
    text: "Mit Basis starten; mit Plus Credits, Meine Bücherei und PDF — Bilder, Silbenhilfe und Vorlesen in den höheren Paketen.",
  },
] as const;

/**
 * Marketing home: Grundschul-fokussierte Copy (lesen, üben, vorlesen lassen).
 * Visual language matches the rest of the landing chrome (Nunito, orange/yellow).
 */
export function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main>
        <HeroSection />
        <StepsSection />
        <StrengthsSection />
        <MoodsSection />
        <FactsSection />
        <TrySection />
        <ParentsSection />
        <PricingSection />
        <ClosingSection />
      </main>
      <LandingFooter />
    </div>
  );
}

function HeroSection() {
  return (
    <section id="start" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Leseapp für die Grundschule
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Lesen üben. Wissen staunen. Geschichten lieben.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            {withLesenoBrand(
              "Leseno macht für Grundschulkinder eigene Geschichten zum Lesen üben — altersgerecht, mit echtem Wissen im Abenteuer. Bücherei, Silbenhilfe, Vorlesen und Bilder schaltest du mit den passenden Paketen frei.",
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/registrieren"
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Kostenlos mit Basis starten
            </a>
            <a
              href="/kostenlos"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              Ohne Konto ausprobieren
            </a>
          </div>
          <p className="mt-5 text-sm font-semibold text-zinc-500">
            Lesen üben · Wissen · Bücherei · Pakete für Bilder, Silbenhilfe &amp;
            Vorlesen
          </p>
        </div>

        <div className="relative pb-16 sm:pb-12">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
            <Image
              src="/landing/hero-lesen.webp"
              alt="Grundschulkind liest am Fenster eine Leseno-Geschichte, aus dem Buch steigt der Leseno-Vogel"
              width={1536}
              height={1024}
              className="h-auto w-full"
              priority
            />
          </div>
          <div className="absolute -bottom-5 left-4 right-4 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-950/10 sm:left-8 sm:right-auto sm:w-72">
            <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
              So sieht’s aus
            </p>
            <p className="mt-1 text-sm font-extrabold text-zinc-950">
              Lava und der mutige Käfer
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
                Vulkane
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
                2. Klasse
              </span>
              <span className="rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold text-zinc-950">
                Spannend
              </span>
            </div>
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs leading-relaxed font-semibold text-orange-900">
              Zum Lesen üben und Staunen: Lava ist oft über 700 °C heiß. Mit Pro
              fragst du „Warum?“ — mit Ultimate lässt du vorlesen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section id="so-gehts" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          So geht’s
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Drei Schritte zum Lesen-Abenteuer.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Thema wählen, Schulstufe setzen, Ton drehen — dann liest und übst du.
          Extra-Hilfen wie Silben, Vorlesen oder Bilder kommen mit den Paketen.
        </p>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.number}
                className="rounded-[1.75rem] bg-gray-100 p-6 ring-1 ring-zinc-950/5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-orange-700 text-white">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-extrabold text-zinc-400">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-zinc-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {withLesenoBrand(step.text)}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function StrengthsSection() {
  return (
    <section id="staerken" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Deine Superkräfte
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Alles, was Grundschulkinder zum Lesen brauchen.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Lesen üben und Wissen mitnehmen gehört dazu. Meine Bücherei,
          Silbenhilfe, Vorlesen, Bilder und „Warum?“ findest du in den Paketen —
          siehe Preise.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strengths.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10"
              >
                <span className="flex size-11 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-zinc-950">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {item.text}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function MoodsSection() {
  return (
    <section id="stimmungen" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Drei Töne
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Dreh am Gefühl. Das Wissen bleibt.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Dieselbe Neugier — drei Wege. Du entscheidest, wie sich deine
          Geschichte anfühlt.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {moods.map((mood) => {
            const Icon = mood.icon;
            return (
              <article
                key={mood.title}
                className="overflow-hidden rounded-[1.75rem] bg-gray-100 shadow-xl ring-1 ring-zinc-950/10"
              >
                <Image
                  src={mood.image}
                  alt={mood.imageAlt}
                  width={900}
                  height={900}
                  className="aspect-square h-auto w-full object-cover"
                />
                <div className="bg-white p-6">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <h3 className="text-xl font-extrabold text-zinc-950">
                      {mood.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                    {mood.text}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const landingDemoFacts = [
  "Wusstest du? Ein Kolibri fliegt rückwärts.",
  "Neues: Bienen tanzen den Weg zur Blüte.",
  "Staunen: Der Mond hat keine eigene Luft.",
  "Neugier: Vulkane können unter dem Meer liegen.",
] as const;

function FactsSection() {
  return (
    <section className="bg-zinc-800">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
            Unser Unterschied
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Lesen üben — und staunen, was du lernst.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            Jede Geschichte trägt echtes Wissen mitten im Abenteuer. Du liest,
            merkst dir Fakten und kannst mit Pro bei „Warum?“ tiefer nachfragen —
            in deinem Tempo, ohne Test-Druck.
          </p>
        </div>
        <StoryFactsList
          facts={[...landingDemoFacts]}
          schoolStage="klasse_3"
          density="landing"
          showHeader={false}
        />
      </div>
    </section>
  );
}

function TrySection() {
  return (
    <section id="probieren" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
          <div className="grid lg:grid-cols-2">
            <div className="p-8 sm:p-10 lg:p-12">
              <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                Kostenlos schnuppern
              </p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                In wenigen Minuten deine erste Probe-Geschichte.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                {withLesenoBrand(
                  "Kein Konto, kein Abo: Teste Leseno mit kurzen Geschichten für 1. und 2. Klasse — und sieh, ob Lesen-üben so Spaß macht.",
                )}
              </p>
              <ol className="mt-8 space-y-4">
                {trySteps.map((step) => (
                  <li key={step.number} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-extrabold text-white">
                      {step.number}
                    </span>
                    <div>
                      <p className="text-base font-extrabold text-zinc-950">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">
                        {withLesenoBrand(step.text)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <a
                href="/kostenlos"
                className="mt-8 inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
              >
                Jetzt probieren
              </a>
            </div>
            <div className="relative min-h-64 bg-gradient-to-br from-orange-50 via-yellow-50 to-gray-100 p-8 sm:p-10 lg:flex lg:flex-col lg:justify-center lg:p-12">
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                Was du bekommst
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  "Thema und Schulstufe selbst wählen",
                  "Kurze Geschichten zum Lesen üben",
                  "Sofort loslegen — ohne Registrierung",
                  "Danach: Konto mit Basis — Pakete nach Bedarf",
                  "Plus mit Bücherei, Credits und PDF",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex gap-3 text-sm font-semibold leading-relaxed text-zinc-800"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-sm leading-relaxed text-zinc-600">
                {withLesenoBrand(
                  "Für Eltern: Ihr seht in Minuten, ob Leseno zu eurem Kind passt — ohne Verpflichtung.",
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ParentsSection() {
  return (
    <section id="eltern" className="scroll-mt-20 bg-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-14">
        <div className="overflow-hidden rounded-[2rem] shadow-xl ring-1 ring-zinc-950/10">
          <Image
            src="/landing/eltern-lesen.webp"
            alt="Elternteil und Kind lesen gemeinsam auf dem Sofa, der Leseno-Vogel sitzt daneben"
            width={1400}
            height={933}
            className="h-auto w-full"
          />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Für Eltern
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Leseförderung, die Kinder freiwillig machen.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            {withLesenoBrand(
              "Grundschulkinder wollen Abenteuer — ihr wollt Übung und Fortschritt. Leseno verbindet beides: eigene Geschichten zum Lesen üben und Wissen zum Mitnehmen. Mit Plus speichert ihr in der Bücherei, mit Pro mehrere Kinder-Profile, mit Ultimate Silbenhilfe und Vorlesen.",
            )}
          </p>
          <ul className="mt-6 space-y-3">
            {parentPoints.map((point) => (
              <li
                key={point}
                className="flex gap-3 text-sm leading-relaxed text-zinc-700"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {withLesenoBrand(point)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="preise" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Freemium
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Starte frei. Steig später auf.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          {withLesenoBrand(
            "Probier Leseno ohne Druck. Wenn euer Kind regelmäßig liest, bringt Plus Credits, Meine Bücherei, Meine Welt und PDF — Vorlesen und Silbenhilfe erst mit Ultimate.",
          )}
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10">
            <p className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
              Basis
            </p>
            <p className="mt-2 text-3xl font-extrabold text-zinc-950">0 €</p>
            <p className="mt-1 text-sm text-zinc-600">Sofort ausprobieren</p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-700">
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Erste Geschichten zum Lesen üben
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Thema, Schulstufe und Ton wählen
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Ideal zum Einstieg in der Grundschule
              </li>
            </ul>
            <a
              href="/registrieren"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Jetzt mit Basis starten
            </a>
          </article>

          <article className="rounded-[1.75rem] bg-zinc-800 p-8 text-white shadow-xl">
            <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
              Plus
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              Regelmäßig Lesen üben
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {withLesenoBrand(
                "Credits, Bücherei, Meine Welt und PDF — wenn Leseno zum Alltag wird",
              )}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-200">
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Credits für viele weitere Geschichten
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Meine Bücherei zum Speichern und Wiederlesen
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Meine Welt für ein Kind · PDF-Export
              </li>
            </ul>
            <a
              href="/preise"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-yellow-400 px-5 py-3 text-sm font-bold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-yellow-300"
            >
              Vorteile entdecken
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <Image
          src="/landing/vogel-hell.webp"
          alt=""
          width={80}
          height={80}
          className="mx-auto size-16"
        />
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Bereit zum Lesen üben?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          {withLesenoBrand(
            "Sag, worum es gehen soll. Leseno legt los — du liest, übst und staunst unterwegs.",
          )}
        </p>
      </div>
    </section>
  );
}
