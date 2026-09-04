"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { signOutAction } from "@/app/actions/auth";
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
 * Signed-in users: Meine Welt + Abmelden (middle marketing nav hidden).
 * Guests: Registrieren / Anmelden + section nav.
 */
export function LandingHeader({
  isAdmin = false,
  isSignedIn = false,
}: {
  isAdmin?: boolean;
  isSignedIn?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === "/";
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();

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

  function handleSignOut() {
    startSignOut(async () => {
      const result = await signOutAction();
      if (!result.success) {
        toast.error(result.error ?? "Abmelden hat nicht geklappt.");
        return;
      }
      setOpen(false);
      toast.success("Du bist abgemeldet.");
      router.push("/");
      router.refresh();
    });
  }

  const adminItems = [
    {
      href: "/admin/users",
      label: "User",
      description: "E-Mail-Adressen und Rollen der registrierten User verwalten.",
    },
    {
      href: "/admin/textlaenge",
      label: "Textlängen",
      description: "Wortspannen für die fünf Längenstufen pflegen.",
    },
    {
      href: "/admin/ki-modelle",
      label: "KI-Modelle",
      description: "Verfügbare Modelle, Provider und Fähigkeiten verwalten.",
    },
    {
      href: "/admin/prompts",
      label: "Prompts",
      description: "Prompt-Stufen, Platzhalter und Modellzuordnung steuern.",
    },
  ] as const;

  return (
    <>
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

          {!isSignedIn ? (
            <nav
              className="hidden items-center gap-8 md:flex"
              aria-label="Seitenbereiche"
            >
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
          ) : null}

          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <>
                <a
                  href="/meine-welt"
                  className={cn(
                    "inline-flex rounded-full px-3 py-2 text-sm font-bold transition-all duration-200 ease-in-out sm:px-4",
                    pathname === "/meine-welt"
                      ? "bg-zinc-800 text-white hover:bg-zinc-900"
                      : "bg-orange-700 text-white hover:bg-orange-800",
                  )}
                >
                  Meine Welt
                </a>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  title="Abmelden"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900 disabled:opacity-70"
                >
                  <LogOut className="size-5" aria-hidden />
                  <span className="sr-only">Abmelden</span>
                </button>
              </>
            ) : (
              <>
                <a
                  href="/registrieren"
                  className={cn(
                    "hidden rounded-full px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out sm:inline-flex",
                    pathname === "/registrieren"
                      ? "bg-zinc-800 hover:bg-zinc-900"
                      : "bg-orange-700 hover:bg-orange-800",
                  )}
                >
                  Jetzt registrieren
                </a>
                <a
                  href="/anmelden"
                  className={cn(
                    "hidden rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out sm:inline-flex",
                    pathname === "/anmelden" ||
                      pathname === "/registrieren" ||
                      pathname === "/passwort-vergessen" ||
                      pathname === "/passwort-zuruecksetzen" ||
                      pathname === "/email-vergessen"
                      ? "bg-zinc-800 text-white hover:bg-zinc-900"
                      : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-100",
                  )}
                >
                  Anmelden
                </a>
              </>
            )}

            {!isSignedIn ? (
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
            ) : null}

            {isAdmin ? (
              <button
                type="button"
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900",
                  (pathname.startsWith("/admin") || adminOpen) &&
                    "ring-2 ring-orange-700 ring-offset-2",
                )}
                title="Admin"
                aria-expanded={adminOpen}
                aria-controls="admin-overlay"
                onClick={() => setAdminOpen(true)}
              >
                <Settings className="size-5" aria-hidden />
                <span className="sr-only">Admin öffnen</span>
              </button>
            ) : null}
          </div>
        </div>

        {!isSignedIn ? (
          <div
            id="mobile-nav"
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
                  href={onHome ? item.hash : `/${item.hash}`}
                  onClick={(event) => handleNavClick(event, item.hash)}
                  className="rounded-xl px-3 py-2.5 text-base font-semibold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-gray-100"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/registrieren"
                onClick={() => setOpen(false)}
                className={cn(
                  "mt-2 rounded-full px-4 py-2.5 text-center text-sm font-bold text-white transition-all duration-200 ease-in-out",
                  pathname === "/registrieren"
                    ? "bg-zinc-800 hover:bg-zinc-900"
                    : "bg-orange-700 hover:bg-orange-800",
                )}
              >
                Jetzt registrieren
              </a>
              <a
                href="/anmelden"
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-full px-4 py-2.5 text-center text-sm font-bold transition-all duration-200 ease-in-out",
                  pathname === "/anmelden" ||
                    pathname === "/registrieren" ||
                    pathname === "/passwort-vergessen" ||
                    pathname === "/passwort-zuruecksetzen" ||
                    pathname === "/email-vergessen"
                    ? "bg-zinc-800 text-white hover:bg-zinc-900"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-gray-100",
                )}
              >
                Anmelden
              </a>
            </nav>
          </div>
        ) : null}
      </header>

      {isAdmin && adminOpen ? (
        <div
          id="admin-overlay"
          className="fixed inset-0 z-[70] flex items-start justify-center bg-zinc-950/45 px-4 py-20 backdrop-blur-sm"
          onClick={() => setAdminOpen(false)}
        >
          <section
            className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                  Admin
                </p>
                <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-zinc-950">
                  Bereich auswählen
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Wähle hier aus, was du im Hintergrund konfigurieren möchtest.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950"
                onClick={() => setAdminOpen(false)}
              >
                <X className="size-5" aria-hidden />
                <span className="sr-only">Admin schließen</span>
              </button>
            </div>

            <div className="mt-8 grid gap-3">
              {adminItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setAdminOpen(false)}
                  className={cn(
                    "rounded-[1.5rem] border border-zinc-950/10 bg-gray-100 px-5 py-4 transition-all duration-200 ease-in-out hover:border-orange-300 hover:bg-orange-50",
                    pathname === item.href && "border-orange-300 bg-orange-50",
                  )}
                >
                  <p className="text-base font-extrabold text-zinc-950">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    {item.description}
                  </p>
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
