"use client";

/**
 * Admin cog + role-test overlay. Loaded only when the viewer is admin /
 * impersonating — keeps marketing header bundles free of admin actions.
 */

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Settings, X } from "lucide-react";
import {
  restoreAdminRoleAction,
  startAdminRoleTestAction,
} from "@/app/actions/admin-role-test";
import {
  MEMBERSHIP_ROLE_OPTIONS,
  type MembershipRoleId,
} from "@/lib/users/catalog";
import { cn } from "@/lib/utils";

async function toastError(message: string) {
  const { toast } = await import("sonner");
  toast.error(message);
}

async function toastSuccess(message: string) {
  const { toast } = await import("sonner");
  toast.success(message);
}

type AdminLink = { href: string; label: string };

type AdminGroup = {
  id: string;
  label: string;
  items: readonly AdminLink[];
};

const adminGroups: readonly AdminGroup[] = [
  {
    id: "nutzer",
    label: "Nutzer & Support",
    items: [
      { href: "/admin/users", label: "User" },
      { href: "/admin/aktivitaeten", label: "Aktivitäten" },
      { href: "/admin/kontakt", label: "Kontaktanfragen" },
    ],
  },
  {
    id: "abo",
    label: "Pakete & Promo",
    items: [
      { href: "/admin/pakete", label: "Pakete" },
      { href: "/admin/promo", label: "Promo-Codes" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Content",
    items: [
      { href: "/admin/social-media", label: "Social Media" },
      { href: "/admin/buch-der-woche", label: "Buch der Woche" },
      { href: "/admin/video-clips", label: "Video-Clips" },
      { href: "/admin/blog", label: "Blog" },
    ],
  },
  {
    id: "buecher",
    label: "Bücher",
    items: [
      { href: "/admin/clever-erzaehlt", label: "Clever erzählt" },
      { href: "/admin/roman", label: "Roman" },
      { href: "/admin/sachbuch", label: "Sachbuch" },
    ],
  },
  {
    id: "app",
    label: "App-Einstellungen",
    items: [
      { href: "/admin/textlaenge", label: "Textlängen" },
      { href: "/admin/schrifteinstellung", label: "Schrifteinstellung" },
      { href: "/admin/hilfe", label: "Hilfe" },
    ],
  },
  {
    id: "technik",
    label: "KI & Technik",
    items: [
      { href: "/admin/ki-modelle", label: "KI-Modelle" },
      { href: "/admin/prompts", label: "Prompts" },
      { href: "/admin/emails", label: "Auth-E-Mails" },
    ],
  },
] as const;

function groupContainingPath(pathname: string): string | null {
  for (const group of adminGroups) {
    if (group.items.some((item) => pathname.startsWith(item.href))) {
      return group.id;
    }
  }
  return null;
}

export function LandingAdminChrome({
  isAdmin,
  adminImpersonating,
  testRole,
  pathname,
}: {
  isAdmin: boolean;
  adminImpersonating: boolean;
  testRole: MembershipRoleId | null;
  pathname: string;
}) {
  const router = useRouter();
  const [adminOpen, setAdminOpen] = useState(false);
  const [roleSwitching, startRoleSwitch] = useTransition();
  const activeGroupId = useMemo(
    () => groupContainingPath(pathname),
    [pathname],
  );
  const [openGroupId, setOpenGroupId] = useState<string | null>(activeGroupId);

  const testRoleLabel =
    MEMBERSHIP_ROLE_OPTIONS.find((entry) => entry.id === testRole)?.label ??
    null;

  function handleStartRoleTest(role: MembershipRoleId) {
    startRoleSwitch(async () => {
      const result = await startAdminRoleTestAction(role);
      if (!result.success || !result.data) {
        await toastError(result.error ?? "Rollenwechsel fehlgeschlagen.");
        return;
      }
      setAdminOpen(false);
      await toastSuccess(`Testmodus: ${role}`);
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  function handleRestoreAdmin() {
    startRoleSwitch(async () => {
      const result = await restoreAdminRoleAction();
      if (!result.success || !result.data) {
        await toastError(result.error ?? "Zurück zu Admin fehlgeschlagen.");
        return;
      }
      setAdminOpen(false);
      await toastSuccess("Wieder als Admin angemeldet.");
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  function openAdmin() {
    setOpenGroupId(groupContainingPath(pathname));
    setAdminOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full bg-zinc-800 text-white transition-all duration-200 ease-in-out hover:bg-zinc-900",
          (pathname.startsWith("/admin") || adminOpen || adminImpersonating) &&
            "ring-2 ring-orange-700 ring-offset-2",
        )}
        title={
          adminImpersonating
            ? `Testmodus${testRoleLabel ? `: ${testRoleLabel}` : ""}`
            : "Admin"
        }
        aria-expanded={adminOpen}
        aria-controls="admin-overlay"
        onClick={openAdmin}
      >
        <Settings className="size-5" aria-hidden />
        <span className="sr-only">Admin öffnen</span>
      </button>

      {adminOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              id="admin-overlay"
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/45 px-4 py-12 backdrop-blur-sm sm:py-20"
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
                        : "Themen sind in Gruppen sortiert — Gruppe aufklappen und Seite wählen."}
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
                  <div className="mt-6 space-y-2">
                    {adminGroups.map((group) => {
                      const isOpen = openGroupId === group.id;
                      const groupActive = group.items.some((item) =>
                        pathname.startsWith(item.href),
                      );
                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-2xl ring-1 ring-zinc-950/10"
                        >
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() =>
                              setOpenGroupId((prev) =>
                                prev === group.id ? null : group.id,
                              )
                            }
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-extrabold transition-colors",
                              groupActive
                                ? "bg-orange-50 text-zinc-950"
                                : "bg-gray-100 text-zinc-950 hover:bg-zinc-200/70",
                            )}
                          >
                            <span>{group.label}</span>
                            <ChevronDown
                              className={cn(
                                "size-4 shrink-0 text-zinc-500 transition-transform",
                                isOpen && "rotate-180",
                              )}
                              aria-hidden
                            />
                          </button>
                          {isOpen ? (
                            <div className="grid gap-1 bg-white p-2">
                              {group.items.map((item) => (
                                <a
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setAdminOpen(false)}
                                  className={cn(
                                    "rounded-xl px-3 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-orange-50",
                                    pathname.startsWith(item.href) &&
                                      "bg-orange-50 text-orange-900",
                                  )}
                                >
                                  {item.label}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
