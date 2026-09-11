"use client";

/**
 * Marketing chrome for signed-out visitors.
 * Desktop: section links + auth buttons. Mobile: hamburger only (auth in panel).
 */

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { hash: "so-gehts", label: "So geht’s" },
  { hash: "staerken", label: "Stärken" },
  { hash: "probieren", label: "Ausprobieren" },
  { hash: "eltern", label: "Für Eltern" },
  { hash: "anders", label: "Unterschied" },
  { hash: "preise", label: "Preise" },
] as const;

const headerBtnBase =
  "rounded-full px-3 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out sm:px-4";
const headerBtnIdle = "bg-zinc-800 hover:bg-zinc-900";

export function LandingMarketingHeader({
  registerActive = false,
  signInActive = false,
}: {
  registerActive?: boolean;
  signInActive?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const registerClass = registerActive
    ? "bg-orange-700 hover:bg-orange-800"
    : headerBtnIdle;
  const signInClass = signInActive
    ? "bg-orange-700 hover:bg-orange-800"
    : headerBtnIdle;

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-zinc-950/10 bg-white/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a
          href="/#start"
          className="flex min-w-0 shrink items-center gap-2.5 transition-all duration-200 ease-in-out"
          onClick={closeMenu}
        >
          <Image
            src="/landing/vogel-hell.webp"
            alt="Logo der Lese-App"
            width={40}
            height={40}
            className="size-9 shrink-0 sm:size-10"
            sizes="40px"
            priority
          />
          <span className="truncate text-xl font-extrabold tracking-tight text-zinc-950">
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
          <a
            href="/blog"
            className={cn(
              "text-sm font-semibold transition-all duration-200 ease-in-out hover:text-orange-700",
              pathname.startsWith("/blog")
                ? "text-orange-800"
                : "text-zinc-600",
            )}
          >
            Blog
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Display class must not fight `inline-flex` from a shared base — only md+. */}
          <a
            href="/registrieren"
            className={cn(
              "hidden md:inline-flex",
              headerBtnBase,
              registerClass,
            )}
          >
            Jetzt registrieren
          </a>
          <a
            href="/anmelden"
            className={cn("hidden md:inline-flex", headerBtnBase, signInClass)}
          >
            Anmelden
          </a>

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100 md:hidden"
            aria-expanded={open}
            aria-controls={panelId}
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
        id={panelId}
        className={cn(
          "border-t border-zinc-950/10 bg-white md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav
          className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
          aria-label="Mobiles Menü"
        >
          {navItems.map((item) => (
            <a
              key={item.hash}
              href={`/#${item.hash}`}
              onClick={closeMenu}
              className="rounded-xl px-3 py-2.5 text-base font-semibold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100"
            >
              {item.label}
            </a>
          ))}
          <a
            href="/blog"
            onClick={closeMenu}
            className={cn(
              "rounded-xl px-3 py-2.5 text-base font-semibold transition-all duration-200 ease-in-out hover:bg-gray-100",
              pathname.startsWith("/blog")
                ? "text-orange-800"
                : "text-zinc-950",
            )}
          >
            Blog
          </a>
          <a
            href="/registrieren"
            onClick={closeMenu}
            className={cn(
              "mt-2 inline-flex justify-center",
              headerBtnBase,
              registerClass,
            )}
          >
            Jetzt registrieren
          </a>
          <a
            href="/anmelden"
            onClick={closeMenu}
            className={cn("inline-flex justify-center", headerBtnBase, signInClass)}
          >
            Anmelden
          </a>
        </nav>
      </div>
    </header>
  );
}
