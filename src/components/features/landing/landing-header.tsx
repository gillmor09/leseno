"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings, X } from "lucide-react";
import { toast } from "sonner";
import {
  restoreAdminRoleAction,
  startAdminRoleTestAction,
} from "@/app/actions/admin-role-test";
import { signOutAction } from "@/app/actions/auth";
import {
  MEMBERSHIP_ROLE_OPTIONS,
  type MembershipRoleId,
} from "@/lib/users/catalog";
import { cn } from "@/lib/utils";

const navItems = [
  { hash: "#so-gehts", label: "So geht’s" },
  { hash: "#staerken", label: "Stärken" },
  { hash: "#probieren", label: "Ausprobieren" },
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
 * Signed-in users: Bücherei + Geschichte + Meine Welt + Abmelden (middle marketing nav hidden).
 * Admins: cog with admin areas + temporary membership-role testing.
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
  const [adminOpen, setAdminOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  const [roleSwitching, startRoleSwitch] = useTransition();

  const showAdminCog = isAdmin || adminImpersonating;
  const testRoleLabel =
    MEMBERSHIP_ROLE_OPTIONS.find((entry) => entry.id === testRole)?.label ??
    null;

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

  function handleStartRoleTest(role: MembershipRoleId) {
    startRoleSwitch(async () => {
      const result = await startAdminRoleTestAction(role);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Rollenwechsel fehlgeschlagen.");
        return;
      }
      setAdminOpen(false);
      toast.success(`Testmodus: ${role}`);
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  function handleRestoreAdmin() {
    startRoleSwitch(async () => {
      const result = await restoreAdminRoleAction();
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Zurück zu Admin fehlgeschlagen.");
        return;
      }
      setAdminOpen(false);
      toast.success("Wieder als Admin angemeldet.");
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  const adminItems = [
    { href: "/admin/users", label: "User" },
    { href: "/admin/aktivitaeten", label: "Aktivitäten" },
    { href: "/admin/kontakt", label: "Kontaktanfragen" },
    { href: "/admin/pakete", label: "Pakete" },
    { href: "/admin/textlaenge", label: "Textlängen" },
    { href: "/admin/ki-modelle", label: "KI-Modelle" },
    { href: "/admin/prompts", label: "Prompts" },
    { href: "/admin/emails", label: "Auth-E-Mails" },
  ] as const;

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
              <button
                type="button"
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900",
                  (pathname.startsWith("/admin") ||
                    adminOpen ||
                    adminImpersonating) &&
                    "ring-2 ring-orange-700 ring-offset-2",
                )}
                title={
                  adminImpersonating
                    ? `Testmodus${testRoleLabel ? `: ${testRoleLabel}` : ""}`
                    : "Admin"
                }
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

      {showAdminCog && adminOpen ? (
        <div
          id="admin-overlay"
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-950/45 px-4 py-12 backdrop-blur-sm sm:py-20"
          onClick={() => setAdminOpen(false)}
        >
          <section
            className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
                  {adminImpersonating ? "Testmodus" : "Admin"}
                </p>
                <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-zinc-950">
                  {adminImpersonating
                    ? "Als Paket-Rolle testen"
                    : "Bereich auswählen"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {adminImpersonating
                    ? `Du bist gerade als ${testRoleLabel ?? "Paket-Rolle"} unterwegs. Wechsle die Rolle oder kehre zu Admin zurück.`
                    : "Wähle hier aus, was du im Hintergrund konfigurieren möchtest."}
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

            {isAdmin ? (
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
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-8">
              <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Rolle testen
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                Kurz eine Paket-Rolle annehmen — die Admin-Rechte bleiben
                wiederherstellbar.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MEMBERSHIP_ROLE_OPTIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={roleSwitching || testRole === entry.id}
                    onClick={() => handleStartRoleTest(entry.id)}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-sm font-bold transition-all duration-200 ease-in-out disabled:opacity-60",
                      testRole === entry.id
                        ? "border-orange-400 bg-orange-50 text-zinc-950"
                        : "border-zinc-950/10 bg-gray-100 text-zinc-950 hover:border-orange-300 hover:bg-orange-50",
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              {adminImpersonating ? (
                <button
                  type="button"
                  disabled={roleSwitching}
                  onClick={handleRestoreAdmin}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-zinc-800 px-4 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900 disabled:opacity-70"
                >
                  Zurück zu Admin
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
