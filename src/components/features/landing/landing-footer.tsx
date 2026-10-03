import Link from "next/link";
import Image from "next/image";

const linkClass =
  "text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline";

const footerBlocks = [
  {
    title: "Entdecken",
    links: [
      { href: "/#anders", label: "Was anders ist" },
      { href: "/motivation", label: "Motivation" },
      { href: "/beispiele", label: "Beispiele" },
      { href: "/clever-erzaehlt", label: "Clever erzählt" },
      { href: "/buch-der-woche", label: "Buch der Woche" },
      { href: "/spiele", label: "Spiele" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Angebot",
    links: [
      { href: "/kostenlos", label: "Kostenlos starten" },
      { href: "/preise", label: "Alle Preise" },
      { href: "/kontakt", label: "Kontakt" },
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
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(3,1fr)] lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <Image
                src="/landing/vogel-hell.webp"
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
            <a
              href="https://www.instagram.com/leseno.de/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Auf Instagram öffnen"
              title="Instagram"
              className="mt-5 inline-flex size-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden
              >
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
            </a>
          </div>

          {footerBlocks.map((block) => (
            <nav key={block.title} aria-label={block.title}>
              <p className="text-xs font-extrabold tracking-[0.14em] text-zinc-400 uppercase">
                {block.title}
              </p>
              <ul className="mt-3 space-y-2.5">
                {block.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
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
