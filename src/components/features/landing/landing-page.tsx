import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import {
  BookMarked,
  BookOpen,
  Check,
  BicepsFlexed,
  CalendarDays,
  Download,
  Globe,
  Highlighter,
  Layers,
  Lightbulb,
  Maximize2,
  Smile,
  Sparkles,
  Target,
  Users,
  Volume2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { InviteFriendsCard } from "@/components/features/marketing/invite-friends-card";
import { landingFeatureShowcase } from "@/lib/users/package-marketing";
import type { PackageFeatureId } from "@/lib/users/packages";

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
    text: "Dinos, Fußball, Weltall oder dein Hund — sag, worauf du Lust hast. leseno macht daraus eine Geschichte nur für dich.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Passende Lesestufe",
    text: "Die Sätze sollen sich gut anfühlen: leicht genug zum Mitfiebern, spannend genug zum Weitermachen — ohne Druck.",
    icon: Target,
  },
  {
    number: "03",
    title: "Lesen und Staunen",
    text: "Einfach eintauchen. Unterwegs bleiben echte Aha-Momente hängen. Mit den Paketen kommen Silbenhilfe, Vorlesen oder Bilder dazu — wenn du willst.",
    icon: BookOpen,
  },
] as const;

const moods = [
  {
    title: "Lustig",
    text: "Komödie mit Klamauk: Missgeschicke, Quatsch und Lacher — und zwischendrin Dinge, über die man danach noch reden will.",
    image: "/landing/mood-lustig.webp",
    imageAlt:
      "Kind lacht über ein aufgeschlagenes Buch, aus dem der Leseno-Vogel steigt",
    icon: Smile,
  },
  {
    title: "Abenteuer",
    text: "Hindernis, Plan, Höhepunkt: echte Abenteuer-Spannung — optional mit Rätsel, kindgerecht und ohne Angstmachen.",
    image: "/landing/mood-spannend.webp",
    imageAlt:
      "Kind liest gebannt, während der Leseno-Vogel und ein Blitz aus dem Buch aufsteigen",
    icon: Zap,
  },
  {
    title: "Motivierend",
    text: "Wachstum und Mut: üben, Rückschlag, Durchbruch — danach das Gefühl: Wenn ich will, schaff ich das.",
    image: "/landing/mood-motivierend.webp",
    imageAlt:
      "Kind betrachtet zuversichtlich ein Buch, aus dem der leuchtende Leseno-Vogel steigt",
    icon: BicepsFlexed,
  },
] as const;

const strengths = [
  {
    title: "Geschichten nur für dich",
    text: "Thema, Lesestufe und Ton — die Geschichte fühlt sich an wie für dich gemacht. Du liest, weil du willst.",
    icon: Sparkles,
  },
  {
    title: "Meine Welt & Kind-Login",
    text: "Ab Plus: eigenes Profil mit Interessen — und Kennung plus Passwort, damit Kinder selbst einsteigen.",
    icon: Globe,
  },
  {
    title: "Lesemodus",
    text: "Vollbild ohne Ablenkung. Schriftgröße, Abstände und Breite so einstellen, dass Lesen sich gut anfühlt.",
    icon: Maximize2,
  },
  {
    title: "Mehr Tiefgang",
    text: "Ab Familie: realistische Konflikte und optional ein Nebenthema — Geschichten mit mehr Gefühl und Twists.",
    icon: Layers,
  },
  {
    title: "Bücherei & Buchclub",
    text: "Ab Plus speichern und Favoriten setzen — Freunde einladen, teilen und liken. Mit Familie: „Wie könnte es weitergehen?“",
    icon: BookMarked,
  },
  {
    title: "Vorlesen, Silben & Advent",
    text: "Komplett: Vorlesen mit Markierung, Silbenhilfe — und 24 Tage Adventskalenderbuch.",
    icon: CalendarDays,
  },
] as const;

const FEATURE_SHOWCASE_ICONS: Record<PackageFeatureId, LucideIcon> = {
  lesemodus: Maximize2,
  buchclub: Users,
  meine_welt: Globe,
  meine_welt_familie: Users,
  buecherei: BookMarked,
  fortsetzen: BookOpen,
  mehr_tiefgang: Layers,
  adventskalender: CalendarDays,
  export: Download,
  bilder: Sparkles,
  warum: Lightbulb,
  hintergrund: Target,
  silbenmethode: BookOpen,
  vorlesen: Volume2,
  markierung: Highlighter,
};

const parentPoints = [
  "Eigenmotivation statt Druck: Kinder lesen, weil sie die Geschichte wollen — nicht weil jemand bewertet.",
  "Kein Schulgefühl: eigene Abenteuer statt starrer Lesebücher oder Übungsblätter.",
  "Passend zum Kind: Sprache und Länge fühlen sich gut an — ohne Test- oder Notenstimmung.",
  "Credits verfallen nie: Monatliche Gutschrift am Buchungstag; Rest bleibt fair in Folgemonaten liegen.",
  "Neugier inklusive: echtes Wissen steckt mitten im Abenteuer; mit Familie gibt’s „Warum?“ zum Nachforschen.",
  "Pakete nach Bedarf: Basis mit Lesemodus, Plus für Credits, Bücherei, Buchclub & Kind-Login, Familie für Mehr Tiefgang & Fortsetzen, Komplett für Silbenhilfe, Vorlesen & Adventskalenderbuch.",
  "Meine Welt: ab Plus ein Kinderprofil (Interessen & Erlebnisse) mit eigenem Kind-Login; mit Familie beliebig viele unter einem Konto.",
  "Mehr Tiefgang ab Familie: realistische Konflikte und optional Nebenthema — ohne Schul- oder Moralton.",
  "Mein Buchclub: ab Plus Freunde per Kennung einladen, freigegebene Geschichten lesen und liken.",
  "Risikofrei starten: Erst kostenlos ausprobieren, dann entscheiden. Abo zum Periodenende kündbar.",
  "Weiterempfehlen leicht: Link teilen — Freundinnen starten kostenlos mit Basis.",
] as const;

const trySteps = [
  {
    number: "1",
    title: "Öffne und leg los",
    text: "Kein Abo nötig. Tippe auf Start und wähl ein Thema, das dich neugierig macht.",
  },
  {
    number: "2",
    title: "Kurze Probe-Geschichte",
    text: "Im Testmodus: leichte Lesestufe, Textlänge bis mittel — ideal zum Schnuppern.",
  },
  {
    number: "3",
    title: "Dann mit Konto weiter",
    text: "Mit Basis starten; mit Plus Credits, Meine Bücherei, Buchclub, Meine Welt und PDF — Mehr Tiefgang, Bilder, Silbenhilfe und Vorlesen in den höheren Paketen.",
  },
] as const;

/**
 * Marketing home: joy of reading + curiosity — not a school/learning-app pitch.
 * Header is Suspense-wrapped so auth does not block streaming the LCP hero.
 */
export function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <Suspense fallback={<LandingHeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main id="main">
        <HeroSection />
        <StepsSection />
        <StrengthsSection />
        <FeaturesSection />
        <MoodsSection />
        <FactsSection />
        <TrySection />
        <ParentsSection />
        <PricingSection />
        <InviteFriendsCard />
        <ClosingSection />
      </main>
      <LandingFooter />
    </div>
  );
}

/** Same height as sticky header — avoids CLS while auth resolves. */
function LandingHeaderFallback() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-950/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="size-9 rounded-full bg-gray-100 sm:size-10" aria-hidden />
          <span className="text-xl font-extrabold tracking-tight text-zinc-950">
            leseno
          </span>
        </div>
        <span className="h-9 w-28 rounded-full bg-gray-100" aria-hidden />
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section id="start" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Geschichten aus Neugier
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Lesen, weil’s Spaß macht. Staunen, weil’s weitergeht.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            {withLesenoBrand(
              "leseno macht eigene Geschichten, die Kinder freiwillig lesen wollen — aus Lust und Neugier, ohne Druck und ohne Schulgefühl. Was dabei hängen bleibt, kommt nebenbei. Kostenlos mit Basis starten; Bücherei, Kind-Login, Mehr Tiefgang, Silbenhilfe, Vorlesen und Bilder freischalten, wenn ihr wollt.",
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
          <p className="mt-5 text-sm font-semibold text-zinc-600">
            Spaß · Neugier · Kind-Login · Mehr Tiefgang · Pakete für Bilder,
            Silbenhilfe &amp; Vorlesen
          </p>
        </div>

        <div className="relative pb-16 sm:pb-12">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
            <Image
              src="/landing/hero-lesen.webp"
              alt="Kind liest am Fenster eine Leseno-Geschichte, aus dem Buch steigt der Leseno-Vogel"
              width={1536}
              height={1024}
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              fetchPriority="high"
            />
          </div>
          <div className="absolute -bottom-5 left-4 right-4 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-950/10 sm:left-8 sm:right-auto sm:w-72">
            <p className="text-xs font-extrabold tracking-wide text-orange-800 uppercase">
              So sieht’s aus
            </p>
            <p className="mt-1 text-sm font-extrabold text-zinc-950">
              Lava und der mutige Käfer
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
                Vulkane
              </span>
              <span className="rounded-full bg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold text-zinc-950">
                Abenteuer
              </span>
            </div>
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs leading-relaxed font-semibold text-orange-900">
              Mitten im Abenteuer: Lava ist oft über 700 °C heiß. Mit Familie fragst
              du „Warum?“ — mit Komplett lässt du vorlesen.
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
        <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
          So geht’s
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Drei Schritte zum eigenen Abenteuer.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Thema wählen, Lesestufe setzen, Ton drehen — dann eintauchen. Extra
          wie Silben, Vorlesen oder Bilder kommen mit den Paketen, wenn ihr sie
          wollt.
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
                  <span className="text-sm font-extrabold text-zinc-700">
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
        <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
          Deine Superkräfte
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Sechs Dinge, die Lesen leichter machen.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Die Highlights: eigene Geschichten, Meine Welt mit Kind-Login,
          Lesemodus, Mehr Tiefgang, Bücherei &amp; Buchclub sowie Vorlesen,
          Silben und Advent — je nach Paket freischaltbar.
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
        <p className="mt-8 text-sm text-zinc-600">
          Alle Funktionen im Überblick?{" "}
          <a
            href="#funktionen"
            className="font-bold text-orange-800 underline-offset-2 hover:underline"
          >
            Was leseno kann
          </a>
        </p>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = landingFeatureShowcase();

  return (
    <section id="funktionen" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
          Funktionen
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Was leseno kann.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Die einzelnen Bausteine — mit dem Paket, ab dem sie freischalten. Auf{" "}
          <a
            href="/preise"
            className="font-bold text-orange-800 underline-offset-2 hover:underline"
          >
            Preise
          </a>{" "}
          siehst du den direkten Vergleich.
        </p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => {
            const Icon = FEATURE_SHOWCASE_ICONS[item.id];
            return (
              <li
                key={item.id}
                className="flex gap-4 rounded-2xl bg-white px-5 py-4 shadow-md ring-1 ring-zinc-950/10"
              >
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-base font-extrabold text-zinc-950">
                      {item.title}
                    </h3>
                    <span className="text-xs font-bold tracking-wide text-orange-800 uppercase">
                      {item.fromBadge}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    {item.blurb}
                  </p>
                </div>
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
        <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
          Drei Töne
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Dreh am Gefühl. Die Neugier bleibt.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Dieselbe Geschichte — drei Wege. Du entscheidest, wie sie sich
          anfühlt.
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
                  width={720}
                  height={720}
                  className="aspect-square h-auto w-full object-cover"
                  // ~360px in 3-col max-w-6xl; avoid `33vw` (viewport) → wrongly picks 640w
                  sizes="(max-width: 767px) calc(100vw - 2rem), 360px"
                  quality={70}
                  loading="lazy"
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
            Mitten im Abenteuer staunen.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            Jede Geschichte trägt echte Aha-Momente mit — ohne Test, ohne
            Bewertung. Du liest, weil’s dich packt; was hängen bleibt, kommt
            nebenbei. Mit Familie kannst du bei „Warum?“ tiefer nachfragen.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Beispiel-Fakten">
          {landingDemoFacts.map((fact) => (
            <li
              key={fact}
              className="flex gap-3 rounded-2xl bg-zinc-700 px-4 py-3 text-sm leading-relaxed font-semibold text-white"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-zinc-950">
                <Lightbulb className="size-3.5" aria-hidden />
              </span>
              <p>{fact}</p>
            </li>
          ))}
        </ul>
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
                  "Kein Konto, kein Abo: Teste leseno mit einer kurzen Geschichte — und spür, ob Lesen so Spaß macht.",
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
              <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
                Was du bekommst
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  "Thema und Ton selbst wählen",
                  "Kurze Geschichten zum Eintauchen",
                  "Sofort loslegen — ohne Registrierung",
                  "Danach: Konto mit Basis — Pakete nach Bedarf",
                  "Plus mit Bücherei, Buchclub, Meine Welt und PDF",
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
                  "Für Eltern: Ihr seht in Minuten, ob leseno zu eurem Kind passt — ohne Verpflichtung.",
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
            sizes="(max-width: 1024px) 100vw, 50vw"
            loading="lazy"
          />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
            Für Eltern
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Lesen ohne Druck — aus eigenem Antrieb.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            {withLesenoBrand(
              "Kinder wollen Abenteuer und Neugier — nicht Übungsblätter und Bewertung. leseno setzt genau da an: eigene Geschichten, die man freiwillig liest. Was an Lesefertigkeit und Wissen hängen bleibt, kommt nebenbei. Mit Plus speichert ihr in der Bücherei, teilt im Buchclub und richtet Kind-Login ein; mit Familie mehrere Profile und Mehr Tiefgang; mit Komplett Silbenhilfe und Vorlesen.",
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
        <p className="text-sm font-extrabold tracking-wide text-orange-800 uppercase">
          Freemium
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Starte frei. Steig später auf.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          {withLesenoBrand(
            "Probier leseno ohne Druck. Wenn Lesen zum Ritual wird, bringt Plus Credits, Meine Bücherei, Buchclub, Meine Welt mit Kind-Login und PDF — Mehr Tiefgang ab Familie; Vorlesen und Silbenhilfe mit Komplett.",
          )}
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10">
            <p className="text-sm font-extrabold tracking-wide text-zinc-600 uppercase">
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
                Erste eigene Geschichten
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Lesemodus: Vollbild mit Schrift &amp; Abständen
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Thema, Lesestufe und Ton wählen
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-orange-700"
                  aria-hidden
                />
                Ideal zum Einstieg — ohne Abo
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
              Mehr Geschichten im Alltag
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {withLesenoBrand(
                "Monatliche Credits, die nie verfallen — plus Bücherei, Meine Welt mit Kind-Login, PDF und Buchclub",
              )}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-200">
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Jeden Monat Credits — Rest bleibt liegen
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
                Meine Welt &amp; Kind-Login · PDF-Export
              </li>
              <li className="flex gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-yellow-400"
                  aria-hidden
                />
                Mein Buchclub für Freunde und geteilte Geschichten
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
          sizes="64px"
          loading="lazy"
        />
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Bereit für die nächste Geschichte?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          {withLesenoBrand(
            "Sag, worum es gehen soll. leseno legt los — dein Kind liest, staunt und bleibt gerne hängen. Teilen geht in einem Klick.",
          )}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
      </div>
    </section>
  );
}
