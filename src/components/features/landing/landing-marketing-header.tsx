import Image from "next/image";

/**
 * Zero-JS marketing chrome for signed-out visitors.
 * Hash links use `/#…` (native smooth scroll via `html { scroll-behavior }`).
 * Mobile nav: `<details>` — no React state / layout reads.
 */

const navItems = [
  { hash: "so-gehts", label: "So geht’s" },
  { hash: "staerken", label: "Stärken" },
  { hash: "probieren", label: "Ausprobieren" },
  { hash: "eltern", label: "Für Eltern" },
  { hash: "preise", label: "Preise" },
  { hash: "empfehlen", label: "Empfehlen" },
] as const;

const headerBtnBase =
  "inline-flex rounded-full px-3 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out sm:px-4";
const headerBtnIdle = "bg-zinc-800 hover:bg-zinc-900";

export function LandingMarketingHeader({
  registerActive = false,
  signInActive = false,
}: {
  registerActive?: boolean;
  signInActive?: boolean;
}) {
  const registerClass = registerActive
    ? "bg-orange-700 hover:bg-orange-800"
    : headerBtnIdle;
  const signInClass = signInActive
    ? "bg-orange-700 hover:bg-orange-800"
    : headerBtnIdle;

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-950/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a
          href="/#start"
          className="flex items-center gap-2.5 transition-all duration-200 ease-in-out"
        >
          <Image
            src="/landing/vogel-hell.webp"
            alt=""
            width={40}
            height={40}
            className="size-9 sm:size-10"
            sizes="40px"
            priority
          />
          <span className="text-xl font-extrabold tracking-tight text-zinc-950">
            leseno
          </span>
        </a>

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Seitenbereiche"
        >
          {navItems.map((item) => (
            <a
              key={item.hash}
              href={`/#${item.hash}`}
              className="text-sm font-semibold text-zinc-600 transition-all duration-200 ease-in-out hover:text-orange-700"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/registrieren"
            className={`hidden sm:inline-flex ${headerBtnBase} ${registerClass}`}
          >
            Jetzt registrieren
          </a>
          <a
            href="/anmelden"
            className={`hidden sm:inline-flex ${headerBtnBase} ${signInClass}`}
          >
            Anmelden
          </a>

          <details className="relative md:hidden">
            <summary
              className="inline-flex size-10 list-none items-center justify-center rounded-full text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
              aria-label="Menü öffnen"
            >
              <span className="sr-only">Menü</span>
              <svg
                className="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-2xl border border-zinc-950/10 bg-white p-3 shadow-xl">
              <nav
                className="flex flex-col gap-1"
                aria-label="Mobiles Menü"
              >
                {navItems.map((item) => (
                  <a
                    key={item.hash}
                    href={`/#${item.hash}`}
                    className="rounded-xl px-3 py-2.5 text-base font-semibold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100"
                  >
                    {item.label}
                  </a>
                ))}
                <a
                  href="/registrieren"
                  className={`mt-2 rounded-full px-4 py-2.5 text-center text-sm font-bold text-white transition-all duration-200 ease-in-out ${registerClass}`}
                >
                  Jetzt registrieren
                </a>
                <a
                  href="/anmelden"
                  className={`rounded-full px-4 py-2.5 text-center text-sm font-bold text-white transition-all duration-200 ease-in-out ${signInClass}`}
                >
                  Anmelden
                </a>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
