import Image from "next/image";
import {
  BookOpen,
  Check,
  Lightbulb,
  Smile,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { LandingHeader } from "@/components/features/landing/landing-header";

const steps = [
  {
    number: "01",
    title: "Thema wählen",
    text: "Dinosaurier, Freundschaft, Weltall oder der eigene Hund: Kinder bringen mit, worauf sie Lust haben.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Passend machen",
    text: "Alter angeben. Die Sprache wächst mit — von ersten Sätzen bis zu richtigen Kapiteln.",
    icon: Target,
  },
  {
    number: "03",
    title: "Ton setzen",
    text: "Lustig, spannend oder informativ. Jede Geschichte trägt echte Fakten, die nach dem Lesen bleiben.",
    icon: BookOpen,
  },
] as const;

const moods = [
  {
    title: "Lustig",
    text: "Kichern erlaubt. Der Witz sitzt — und trotzdem steckt in der Geschichte etwas, das man nachher weiß.",
    image: "/landing/mood-lustig.webp",
    imageAlt:
      "Kind lacht über ein aufgeschlagenes Buch, aus dem der Leseno-Vogel steigt",
    icon: Smile,
  },
  {
    title: "Spannend",
    text: "Herzklopfen zum Umblättern. Abenteuer, die fesseln, ohne zu ängstigen — mit echtem Wissen im Gepäck.",
    image: "/landing/mood-spannend.webp",
    imageAlt:
      "Kind liest gebannt, während der Leseno-Vogel und ein Blitz aus dem Buch aufsteigen",
    icon: Zap,
  },
  {
    title: "Informativ",
    text: "Neugierig und klar. Erklärt, was Kinder wirklich verstehen wollen — in einer Geschichte, nicht im Lehrbuch.",
    image: "/landing/mood-informativ.webp",
    imageAlt:
      "Kind betrachtet nachdenklich ein Buch, aus dem der leuchtende Leseno-Vogel steigt",
    icon: Lightbulb,
  },
] as const;

const parentPoints = [
  "Echte Fakten in jeder Geschichte — Lesespaß mit Substanz.",
  "Sprache nach Alter, nicht nach einem Einheitsmaß.",
  "Freemium: erst ausprobieren, dann entscheiden, was die Familie braucht.",
  "Keine Werbeflut, kein alberner Ton. Ernst gemeinte Lesefreude.",
] as const;

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <LandingHeader />
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
            Für Kinder von 5 bis 10
          </p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Geschichten, die Kinder selbst starten.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            Thema wählen, Alter angeben, Stimmung bestimmen. Leseno schreibt
            daraus eine Geschichte — lustig, spannend oder informativ. Mit
            echten Fakten, die hängen bleiben.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/kostenlos"
              className="inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Kostenlos starten
            </a>
            <a
              href="#so-gehts"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-bold text-zinc-950 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              So funktioniert’s
            </a>
          </div>
          <p className="mt-5 text-sm font-semibold text-zinc-500">
            Für Familien · 5–10 Jahre · Freemium
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
              Fakt: Lava ist oft über 700 °C heiß — heißer als ein Backofen.
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
          Drei Angaben. Eine Geschichte, die passt.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Kein langes Formular. Kinder sagen, worum es gehen soll — Leseno
          macht daraus eine lesbare Geschichte auf dem richtigen Niveau.
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
          Lustig, spannend oder informativ — ihr entscheidet.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Dieselbe Neugier, drei Wege. Der Ton ändert die Geschichte. Die
          Fakten bleiben.
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
            Beim Lesen nebenbei klüger.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-300">
            Jede Leseno-Geschichte trägt echte Fakten. Nicht als Test danach —
            sondern mitten im Abenteuer. Kinder lesen, weil es Spaß macht. Und
            nehmen etwas mit, das stimmt.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Wusstest du? Ein Kolibri kann rückwärts fliegen.",
            "Fakt: Bienen tanzen, um den Weg zur Blüte zu zeigen.",
            "Fakt: Der Mond hat keine eigene Luft zum Atmen.",
            "Wusstest du? Vulkane können unter dem Meer liegen.",
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
            Lesefreude, der ihr trauen könnt.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Leseno ist für Kinder gemacht — und so gebaut, dass Erwachsene
            mitgehen. Fröhlich, klar, ohne Klamauk. Ihr seht, worum es geht:
            eigene Geschichten, passende Sprache, echtes Wissen.
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
          Erst lesen. Dann entscheiden.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600">
          Loslegen kostet nichts. Wenn die Familie mehr Geschichten, mehr
          Themen und einen Blick auf den Lesefortschritt will, gibt es Plus.
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
                Erste eigene Geschichten
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
                Thema, Alter und Stimmung wählen
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-orange-700" aria-hidden />
                Echte Fakten in jeder Geschichte
              </li>
            </ul>
            <a
              href="/kostenlos"
              className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
            >
              Kostenlos starten
            </a>
          </article>

          <article className="rounded-[1.75rem] bg-zinc-800 p-8 text-white shadow-xl">
            <p className="text-sm font-extrabold tracking-wide text-yellow-400 uppercase">
              Plus
            </p>
            <p className="mt-2 text-3xl font-extrabold">Für Familien</p>
            <p className="mt-1 text-sm text-zinc-400">
              Wenn Leseno fest zum Alltag gehört
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
              Bald für Familien
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
          Bereit für die erste eigene Geschichte?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Sagt, worum es gehen soll. Leseno schreibt. Ihr lest — und lernt
          nebenbei etwas, das stimmt.
        </p>
        <a
          href="/kostenlos"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-base font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
        >
          Kostenlos starten
        </a>
      </div>
    </section>
  );
}
