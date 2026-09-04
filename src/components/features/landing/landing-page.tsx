import Image from "next/image";
import {
  BookOpen,
  Check,
  BicepsFlexed,
  Smile,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

const steps = [
  {
    number: "01",
    title: "Wähl dein Thema",
    text: "Dinosaurier, Freundschaft, Weltall oder dein Hund: Bring mit, worauf du Lust hast.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Mach sie passend",
    text: "Gib deine Schulstufe an. Die Sprache wächst mit dir — von ersten Sätzen bis zu richtigen Kapiteln.",
    icon: Target,
  },
  {
    number: "03",
    title: "Setz den Ton",
    text: "Lustig, spannend oder motivierend. In jeder Geschichte steckt echtes Wissen und Staunen, das nach dem Lesen bei dir bleibt.",
    icon: BookOpen,
  },
] as const;

const moods = [
  {
    title: "Lustig",
    text: "Kichern ist erlaubt. Der Witz sitzt — und trotzdem steckt etwas in der Geschichte, das du nachher weißt.",
    image: "/landing/mood-lustig.webp",
    imageAlt:
      "Kind lacht über ein aufgeschlagenes Buch, aus dem der Leseno-Vogel steigt",
    icon: Smile,
  },
  {
    title: "Spannend",
    text: "Herzklopfen zum Weiterlesen. Abenteuer, die dich fesseln, ohne dich zu ängstigen — mit echtem Wissen im Gepäck.",
    image: "/landing/mood-spannend.webp",
    imageAlt:
      "Kind liest gebannt, während der Leseno-Vogel und ein Blitz aus dem Buch aufsteigen",
    icon: Zap,
  },
  {
    title: "Motivierend",
    text: "Hol dir Mut und Lust. Geschichten, die dich anspornen — mit echtem Wissen, das bleibt.",
    image: "/landing/mood-motivierend.webp",
    imageAlt:
      "Kind betrachtet zuversichtlich ein Buch, aus dem der leuchtende Leseno-Vogel steigt",
    icon: BicepsFlexed,
  },
] as const;

const parentPoints = [
  "In jeder Geschichte stecken Neues und Staunen — Lesespaß mit Substanz.",
  "Die Sprache richtet sich nach dem Alter, nicht nach einem Einheitsmaß.",
  "Freemium: Probier erst aus, dann entscheidest du, was ihr braucht.",
  "Keine Werbeflut, kein alberner Ton. Ernst gemeinte Lesefreude.",
] as const;

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main>
        <HeroSection />
        <StepsSection />
        <MoodsSection />
        <FactsSection />
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
            Starte deine eigene Geschichte.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            Wähl ein Thema, gib deine Schulstufe an und such dir den Ton aus.
            Leseno schreibt daraus deine Geschichte — lustig, spannend oder
            motivierend. Mit Wissen und Neugier, die bei dir hängen bleiben.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/kostenlos"
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Jetzt kostenlos starten
            </a>
            <a
              href="#so-gehts"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              So funktioniert’s
            </a>
          </div>
          <p className="mt-5 text-sm font-semibold text-zinc-500">
            Für dich · 5–10 Jahre · Freemium
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
              Beispiel
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
              Staunen: Lava ist oft über 700 °C heiß — heißer als ein Backofen.
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
          Drei Angaben. Deine Geschichte, die passt.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Kein langes Formular. Du sagst, worum es gehen soll — Leseno macht
          daraus eine Geschichte, die du gut lesen kannst.
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

function MoodsSection() {
  return (
    <section id="stimmungen" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Drei Töne
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Lustig, spannend oder motivierend — du entscheidest.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Dieselbe Neugier, drei Wege. Du änderst den Ton. Das Wissen bleibt.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {moods.map((mood) => {
            const Icon = mood.icon;
            return (
              <article
                key={mood.title}
                className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
              >
                <Image
                  src={mood.image}
                  alt={mood.imageAlt}
                  width={900}
                  height={900}
                  className="aspect-square h-auto w-full object-cover"
                />
                <div className="p-6">
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

function FactsSection() {
  return (
    <section className="bg-zinc-800">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
            Der Unterschied
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Beim Lesen wirst du nebenbei klüger.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            Jede Leseno-Geschichte trägt echtes Wissen und Staunen. Nicht als
            Test danach — sondern mitten in deinem Abenteuer. Du liest, weil es
            Spaß macht. Und nimmst etwas mit, das stimmt.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Wusstest du? Ein Kolibri kann rückwärts fliegen.",
            "Neues: Bienen tanzen, um den Weg zur Blüte zu zeigen.",
            "Staunen: Der Mond hat keine eigene Luft zum Atmen.",
            "Neugier: Vulkane können unter dem Meer liegen.",
          ].map((fact) => (
            <li
              key={fact}
              className="rounded-2xl bg-zinc-700 px-4 py-4 text-sm leading-relaxed font-semibold text-white"
            >
              {fact}
            </li>
          ))}
        </ul>
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
            Lesefreude, der du trauen kannst.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Leseno ist für Kinder gemacht — und so gebaut, dass du als Mama,
            Papa oder Begleitung mitgehst. Fröhlich, klar, ohne Klamauk. Du
            siehst, worum es geht: eigene Geschichten, passende Sprache, echtes
            Wissen.
          </p>
          <ul className="mt-6 space-y-3">
            {parentPoints.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed text-zinc-700">
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
          Erst lesen. Dann entscheidest du.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Loslegen kostet dich nichts. Wenn du mehr Geschichten, mehr Themen und
          einen Blick auf den Lesefortschritt willst, gibt es Plus.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10">
            <p className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
              Frei
            </p>
            <p className="mt-2 text-3xl font-extrabold text-zinc-950">
              0 €
            </p>
            <p className="mt-1 text-sm text-zinc-600">Zum Ausprobieren</p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-700">
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
                Deine ersten eigenen Geschichten
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
                Thema, Schulstufe und Stimmung wählen
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
                Wissen und Staunen in jeder Geschichte
              </li>
            </ul>
            <a
              href="/kostenlos"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Jetzt kostenlos starten
            </a>
          </article>

          <article className="rounded-[1.75rem] bg-zinc-800 p-8 text-white shadow-xl">
            <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
              Plus
            </p>
            <p className="mt-2 text-3xl font-extrabold">Für dich und deine Familie</p>
            <p className="mt-1 text-sm text-zinc-400">
              Wenn Leseno fest zu deinem Alltag gehört
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-200">
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-yellow-400" aria-hidden />
                Mehr Geschichten im Monat
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-yellow-400" aria-hidden />
                Lieblingsthemen merken
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-yellow-400" aria-hidden />
                Einblick in den Lesefortschritt
              </li>
            </ul>
            <p className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-yellow-400 px-5 py-3 text-sm font-bold text-zinc-950">
              Bald für dich da
            </p>
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
          Bereit für deine erste eigene Geschichte?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Sag, worum es gehen soll. Leseno schreibt. Du liest — und lernst
          nebenbei etwas, das stimmt.
        </p>
        <a
          href="/kostenlos"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
        >
          Jetzt kostenlos starten
        </a>
      </div>
    </section>
  );
}
