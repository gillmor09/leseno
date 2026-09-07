import Link from "next/link";
import Image from "next/image";

export function LandingFooter() {
  return (
    <footer className="bg-zinc-800 text-zinc-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/landing/vogel-hell.webp"
            alt=""
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
        <nav aria-label="Fußzeile" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/preise"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Preise
          </Link>
          <Link
            href="/kontakt"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Kontakt
          </Link>
          <Link
            href="/impressum"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Impressum
          </Link>
          <Link
            href="/datenschutz"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Datenschutz
          </Link>
          <Link
            href="/agb"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            AGB
          </Link>
          <Link
            href="/widerruf"
            className="text-sm font-semibold text-zinc-300 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Widerruf
          </Link>
          <a
            href="https://www.instagram.com/leseno.de/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="leseno auf Instagram"
            title="Instagram"
            className="inline-flex size-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
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
        </nav>
      </div>
    </footer>
  );
}
