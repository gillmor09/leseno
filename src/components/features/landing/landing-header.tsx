"use client";

import { useState, useTransition, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { MembershipRoleId } from "@/lib/users/catalog";
import { cn } from "@/lib/utils";

async function toastError(message: string) {
  const { toast } = await import("sonner");
  toast.error(message);
}

async function toastSuccess(message: string) {
  const { toast } = await import("sonner");
  toast.success(message);
}

/** Admin chrome only when needed — not in anonymous marketing JS. */
const LandingAdminChrome = dynamic(
  () =>
    import("@/components/features/landing/landing-admin-chrome").then(
      (mod) => mod.LandingAdminChrome,
    ),
  { ssr: false },
);

const navItems = [
  { hash: "#so-gehts", label: "So geht’s" },
  { hash: "#staerken", label: "Stärken" },
  { hash: "#probieren", label: "Ausprobieren" },
  { hash: "#eltern", label: "Für Eltern" },
  { hash: "#preise", label: "Preise" },
  { hash: "#empfehlen", label: "Empfehlen" },
] as const;

function goToSection(href: string) {
  const id = href.startsWith("#") ? href.slice(1) : href;
  const target = document.getElementById(id);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  target?.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

/**
 * Shared chrome for marketing pages. Hash links stay on `/`; other routes go home first.
 * Signed-in users: Bücherei + Geschichte + Meine Welt + Abmelden (middle marketing nav hidden).
 * Admins: cog with admin areas + temporary membership-role testing (lazy chunk).
 */
export function LandingHeader({
  isAdmin = false,
  adminImpersonating = false,
  testRole = null,
  isSignedIn = false,
  storyHref = null,
  showMeineWelt = true,
  showMeineBuecherei = true,
}: {
  isAdmin?: boolean;
  /** Admin temporarily using a membership role; cog stays for restore. */
  adminImpersonating?: boolean;
  testRole?: MembershipRoleId | null;
  isSignedIn?: boolean;
  /** Membership composer path; falls back to `/geschichte`. */
  storyHref?: string | null;
  /** Package `meine_welt`: show Meine-Welt nav link. */
  showMeineWelt?: boolean;
  /** Package `buecherei`: show Meine-Bücherei nav link. */
  showMeineBuecherei?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === "/";
  const [open, setOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  const showAdminCog = isAdmin || adminImpersonating;

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
        await toastError(result.error ?? "Abmelden hat nicht geklappt.");
        return;
      }
      setOpen(false);
      await toastSuccess("Du bist abgemeldet.");
      router.push("/");
      router.refresh();
    });
  }

  const headerBtnBase =
    "inline-flex rounded-full px-3 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out sm:px-4";
  const headerBtnIdle = "bg-zinc-800 hover:bg-zinc-900";
  const headerBtnActive = "bg-orange-700 hover:bg-orange-800";

  const storyPath = storyHref ?? "/geschichte";
  const storyActive = pathname === storyPath;
  const libraryActive = pathname === "/meine-buecherei";
  const worldActive = pathname === "/meine-welt";
  const registerActive = pathname === "/registrieren";
  const signInActive =
    pathname === "/anmelden" ||
    pathname === "/passwort-vergessen" ||
    pathname === "/passwort-zuruecksetzen" ||
    pathname === "/email-vergessen";

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
            sizes="40px"
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
              {showMeineBuecherei ? (
                <a
                  href="/meine-buecherei"
                  className={cn(
                    headerBtnBase,
                    libraryActive ? headerBtnActive : headerBtnIdle,
                  )}
                >
                  Meine Bücherei
                </a>
              ) : null}
              <a
                href={storyPath}
                className={cn(
                  headerBtnBase,
                  storyActive ? headerBtnActive : headerBtnIdle,
                )}
              >
                Meine Geschichte
              </a>
              {showMeineWelt ? (
                <a
                  href="/meine-welt"
                  className={cn(
                    headerBtnBase,
                    worldActive ? headerBtnActive : headerBtnIdle,
                  )}
                >
                  Meine Welt
                </a>
              ) : null}
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
                  "hidden sm:inline-flex",
                  headerBtnBase,
                  registerActive ? headerBtnActive : headerBtnIdle,
                )}
              >
                Jetzt registrieren
              </a>
              <a
                href="/anmelden"
                className={cn(
                  "hidden sm:inline-flex",
                  headerBtnBase,
                  signInActive ? headerBtnActive : headerBtnIdle,
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

          {showAdminCog ? (
            <LandingAdminChrome
              isAdmin={isAdmin}
              adminImpersonating={adminImpersonating}
              testRole={testRole}
              pathname={pathname}
            />
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
                registerActive ? headerBtnActive : headerBtnIdle,
              )}
            >
              Jetzt registrieren
            </a>
            <a
              href="/anmelden"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-full px-4 py-2.5 text-center text-sm font-bold text-white transition-all duration-200 ease-in-out",
                signInActive ? headerBtnActive : headerBtnIdle,
              )}
            >
              Anmelden
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
