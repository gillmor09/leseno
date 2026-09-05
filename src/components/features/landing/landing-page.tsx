import Image from "next/image";
import {
  BookOpen,
  Check,
  BicepsFlexed,
  HelpCircle,
  ImageIcon,
  Lightbulb,
  Smile,
  Sparkles,
  Target,
  Users,
  Volume2,
  Zap,
} from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { StoryFactsList } from "@/components/features/stories/story-facts-list";

const steps = [
  {
    number: "01",
    title: "Wähl dein Thema",
    text: "Dinos, Weltall, Fußball oder dein Hund — sag, worauf du Lust hast. Leseno macht daraus dein Abenteuer.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Triff deine Stufe",
    text: "Wähl deine Schulstufe. Die Sätze wachsen mit dir — von kurzen Zeilen bis zu richtig starken Kapiteln.",
    icon: Target,
  },
  {
    number: "03",
    title: "Dreh am Ton",
    text: "Lustig, spannend oder motivierend: Du wählst die Art der Geschichte. Mitten drin wartet echtes Wissen zum Staunen.",
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
    title: "Wissen im Abenteuer",
    text: "Echte Fakten stecken mitten in der Geschichte — nicht als Test danach. Lesen macht Spaß und klüger.",
    icon: Lightbulb,
  },
  {
    title: "Mit Bildern erleben",
    text: "Deine Geschichte kommt mit eigenen Illustrationen. Text und Bilder gehören zusammen — du siehst, was du liest.",
    icon: ImageIcon,
  },
  {
    title: "Warum? — tiefer eintauchen",
    text: "Neugierig? Tippe auf „Warum?“ und hol dir den Hintergrund. Mit „Ich will mehr wissen“ gehst du noch einen Schritt weiter — wann immer du Lust hast.",
    icon: HelpCircle,
  },
  {
    title: "Sprache, die passt",
    text: "Schulstufe und Textlänge steuerst du selbst. So bleibt Lesen machbar — und trotzdem spannend.",
    icon: Target,
  },
  {
    title: "Silbenhilfe & Vorlesen",
    text: "Schwierige Wörter in Silben teilen oder vorlesen lassen — mit Tempo und optionaler Wort-Markierung.",
    icon: Volume2,
  },
  {
    title: "Eine Familie, ein Konto",
    text: "Leg für jedes Kind ein eigenes Profil an — mit Lesewünschen, Erlebnissen und Freunden. Alles unter einem Konto.",
    icon: Users,
  },
] as const;

const parentPoints = [
  "Mehrwert klar: Lesespaß, Bilder und echtes Wissen in einer Geschichte — ohne Quiz-Druck.",
  "Tiefer eintauchen: Mit „Warum?“ und „Ich will mehr wissen“ folgt Neugier dem eigenen Tempo.",
  "Altersgerecht: Sprache und Länge folgen der Schulstufe, nicht einem Einheitsmaß.",
  "Lesepartner: Silbenhilfe und Vorlesen unterstützen, wenn’s mal hakt.",
  "Familie unter einem Konto: Jedes Kind bekommt ein eigenes Profil mit Lesewünschen und Erlebnissen — ihr verwaltet alles zentral.",
  "Persönlich: Mit „Meine Welt“ wird der Alltag jedes Kindes zur eigenen Geschichte.",
  "Risikofrei starten: Erst ausprobieren, dann entscheiden.",
] as const;

const trySteps = [
  {
    number: "1",
    title: "Öffne und leg los",
    text: "Kein Abo nötig. Tippe auf Start und wähl dein Thema.",
  },
  {
    number: "2",
    title: "Geschichte mit Bildern",
    text: "Schulstufe und Ton setzen — Leseno liefert Text und Illustrationen.",
  },
  {
    number: "3",
    title: "Lies, staune, frag nach",
    text: "Probiere Silbenhilfe, Vorlesen — und „Warum?“ bei den Fakten.",
  },
] as const;

/**
 * Marketing home: child-forward active copy, clear parent value, try-it CTA.
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
            Für dich von 5 bis 10
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Lies mit. Staune mit. Will mehr.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            Bring dein Thema. Setz die Schulstufe. Dreh am Ton. Leseno macht
            daraus deine Geschichte — mit eigenen Bildern und echtem Wissen
            mitten drin. Du liest. Du staunst. Und wenn du willst, tauchst du
            mit „Warum?“ noch tiefer ein.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/registrieren"
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Jetzt mit Basis starten
            </a>
            <a
              href="#probieren"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              Probiere es aus
            </a>
          </div>
          <p className="mt-5 text-sm font-semibold text-zinc-500">
            Geschichte mit Bildern · Wissen zum Mitnehmen · Warum? zum
            Nachforschen
          </p>
        </div>

        <div className="relative pb-16 sm:pb-12">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
            <Image
              src="/landing/hero-lesen.webp"
              alt="Kind liest am Fenster, aus dem Buch steigt der leuchtende Leseno-Vogel"
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
                8 Jahre
              </span>
              <span className="rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold text-zinc-950">
                Spannend
              </span>
            </div>
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs leading-relaxed font-semibold text-orange-900">
              Mit Bildern & Staunen: Lava ist oft über 700 °C heiß — heißer als
              ein Backofen. Frage „Warum?“, wenn du mehr willst.
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
          Drei Klicks. Dein Abenteuer startet.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Kein langes Formular. Du sagst, was du willst — Leseno macht daraus
          eine Geschichte mit Bildern, die zu dir passt.
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
                  {step.text}
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
          Mehr als nur eine Geschichte.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Text, Bilder und Wissen gehören zusammen — plus die Chance, bei jedem
          Fakt tiefer einzutauchen. Eltern sehen den Mehrwert. Kinder spüren den
          Spaß.
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
            Lies dich klüger — und frag nach, wenn du willst.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            Jede Leseno-Geschichte trägt echtes Wissen und Staunen mitten im
            Abenteuer. Reicht dir das? Super. Willst du mehr? Tippe auf
            „Warum?“ — und mit „Ich will mehr wissen“ gehst du noch tiefer ins
            Thema, ganz nach Lust und Tempo.
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
                Probiere es aus
              </p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                In wenigen Minuten deine erste Geschichte.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-600">
                Kein Risiko. Kein Abo. Du bekommst Text und Bilder, testest
                Silbenhilfe und Vorlesen — und kannst bei den Fakten direkt
                tiefer nachfragen.
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
                        {step.text}
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
                  "Geschichte mit eigenen Illustrationen",
                  "Echtes Wissen zum Staunen im Text",
                  "„Warum?“ und „Ich will mehr wissen“",
                  "Silbenhilfe und Vorlesen",
                  "Optional: Familie mit Meine Welt — mehrere Profile, ein Konto",
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
                Für Eltern: Ihr seht sofort, ob Leseno zu eurem Kind passt —
                ohne Verpflichtung.
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
            Lesefreude mit echtem Mehrwert.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Kinder wollen Abenteuer. Ihr wollt Fortschritt und Substanz. Leseno
            verbindet beides: eigene Geschichten, passende Sprache, Wissen im
            Text — plus Hilfen, wenn das Lesen noch Übung braucht. Und wenn mehr
            als ein Kind liest: unter einem Konto legt ihr für jedes Kind ein
            Profil mit eigenen Lesewünschen und Erfahrungen an.
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
                {point}
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
          Probier Leseno ohne Druck. Wenn ihr mehr Geschichten und mehr Alltag
          mit Leseno wollt, wartet Plus auf euch.
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
                Deine ersten Geschichten mit Bildern
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
                Wissen, „Warum?“ und Vorlesen testen
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
              Für dich und deine Familie
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Wenn Leseno zu eurem Alltag gehört
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-200">
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Mehr Geschichten im Monat
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Lieblingsthemen und Familien-Profile in Meine Welt
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Einblick in den Lesefortschritt
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
          Bereit? Deine Geschichte wartet.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Sag, worum es gehen soll. Leseno legt los — mit Text und Bildern. Du
          liest, staunst und kannst bei den Fakten tiefer nachfragen.
        </p>
      </div>
    </section>
  );
}
