"use client";

import { useState, type MouseEvent } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { hash: "#so-gehts", label: "So geht’s" },
  { hash: "#stimmungen", label: "Stimmungen" },
  { hash: "#eltern", label: "Für Eltern" },
  { hash: "#preise", label: "Preise" },
] as const;

function goToSection(href: string) {
  const id = href.startsWith("#") ? href.slice(1) : href;
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Shared chrome for marketing pages. Hash links stay on `/`; other routes go home first.
 */
export function LandingHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [open, setOpen] = useState(false);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, hash: string) {
    if (!onHome) {
      setOpen(false);
      return;
    }
    event.preventDefault();
    setOpen(false);
    window.setTimeout(() => {
      goToSection(hash);
    }, 50);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-950/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a
          href={onHome ? "#start" : "/"}
          className="flex items-center gap-2.5 transition-all duration-200 ease-in-out"
        >
          <Image
            src="/landing/vogel-hell.webp"
            alt=""
            width={40}
            height={40}
            className="size-9 sm:size-10"
            priority
          />
          <span className="text-xl font-extrabold tracking-tight text-zinc-950">
            leseno
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seitenbereiche">
          {navItems.map((item) => (
            <a
              key={item.hash}
              href={onHome ? item.hash : `/${item.hash}`}
              onClick={(event) => handleNavClick(event, item.hash)}
              className="text-sm font-semibold text-zinc-600 transition-all duration-200 ease-in-out hover:text-orange-700"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/admin/textlaenge"
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full transition-all duration-200 ease-in-out hover:bg-gray-100",
              pathname.startsWith("/admin")
                ? "text-orange-700"
                : "text-zinc-400 hover:text-zinc-700",
            )}
            title="Einstellungen"
          >
            <Settings className="size-5" aria-hidden />
            <span className="sr-only">Einstellungen</span>
          </a>
          <a
            href="/kostenlos"
            className={cn(
              "hidden rounded-full px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out sm:inline-flex",
              pathname === "/kostenlos"
                ? "bg-zinc-800 hover:bg-zinc-900"
                : "bg-orange-700 hover:bg-orange-800",
            )}
          >
            Kostenlos starten
          </a>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X className="size-6" aria-hidden />
            ) : (
              <Menu className="size-6" aria-hidden />
            )}
            <span className="sr-only">
              {open ? "Menü schließen" : "Menü öffnen"}
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={cn(
          "border-t border-zinc-950/10 bg-white md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Mobiles Menü">
          {navItems.map((item) => (
            <a
              key={item.hash}
              href={onHome ? item.hash : `/${item.hash}`}
              onClick={(event) => handleNavClick(event, item.hash)}
              className="rounded-xl px-3 py-2.5 text-base font-semibold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              {item.label}
            </a>
          ))}
          <a
            href="/kostenlos"
            onClick={() => setOpen(false)}
            className={cn(
              "mt-2 rounded-full px-4 py-2.5 text-center text-sm font-bold text-white transition-all duration-200 ease-in-out",
              pathname === "/kostenlos"
                ? "bg-zinc-800 hover:bg-zinc-900"
                : "bg-orange-700 hover:bg-orange-800",
            )}
          >
            Kostenlos starten
          </a>
        </nav>
      </div>
    </header>
  );
}
