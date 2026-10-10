import Link from "next/link";
import Image from "next/image";

const linkClass =
  "text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline";

const angebotLinks = [
  { href: "/kostenlos", label: "Kostenlos starten" },
  { href: "/preise", label: "Alle Preise" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

/** Former „Entdecken“ — split into story vs. books/play. */
const footerBlocks = [
  {
    title: "Entdecken",
    links: [
      { href: "/#anders", label: "Was anders ist" },
      { href: "/motivation", label: "Motivation" },
      { href: "/beispiele", label: "Beispiele" },
      { href: "/blog", label: "Blog" },
      {
        href: "https://www.instagram.com/leseno.de/",
        label: "Instagram",
        external: true,
      },
    ],
  },
  {
    title: "Bücher & Spiele",
    links: [
      { href: "/clever-erzaehlt", label: "Clever erzählt" },
      { href: "/buch-der-woche", label: "Buch der Woche" },
      { href: "/spiele", label: "Spiele" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { href: "/impressum", label: "Impressum" },
      { href: "/datenschutz", label: "Datenschutz" },
      { href: "/agb", label: "AGB" },
      { href: "/widerruf", label: "Widerruf" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="bg-zinc-800 text-zinc-200">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/leseno-vogel-neu.png"
                alt="Logo der Lese-App"
                width={36}
                height={36}
                className="size-9 rounded-full"
                sizes="36px"
                loading="lazy"
              />
              <div>
                <p className="text-lg font-extrabold tracking-tight text-white">
                  leseno
                </p>
                <p className="text-sm text-zinc-300">
                  Lesen, das zu dir gehört.
                </p>
              </div>
            </div>
            <nav aria-label="Angebot" className="mt-8">
              <p className="text-xs font-extrabold tracking-[0.14em] text-zinc-400 uppercase">
                Angebot
              </p>
              <ul className="mt-3 space-y-2.5">
                {angebotLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {footerBlocks.map((block) => (
            <nav key={block.title} aria-label={block.title}>
              <p className="text-xs font-extrabold tracking-[0.14em] text-zinc-400 uppercase">
                {block.title}
              </p>
              <ul className="mt-3 space-y-2.5">
                {block.links.map((link) => (
                  <li key={link.href}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
