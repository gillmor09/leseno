"use client";

/**
 * Admin cog + role-test overlay. Loaded only when the viewer is admin /
 * impersonating — keeps marketing header bundles free of admin actions.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, X } from "lucide-react";
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

const adminItems = [
  { href: "/admin/users", label: "User" },
  { href: "/admin/aktivitaeten", label: "Aktivitäten" },
  { href: "/admin/kontakt", label: "Kontaktanfragen" },
  { href: "/admin/pakete", label: "Pakete" },
  { href: "/admin/textlaenge", label: "Textlängen" },
  { href: "/admin/schrifteinstellung", label: "Schrifteinstellung" },
  { href: "/admin/ki-modelle", label: "KI-Modelle" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/emails", label: "Auth-E-Mails" },
] as const;

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
        onClick={() => setAdminOpen(true)}
      >
        <Settings className="size-5" aria-hidden />
        <span className="sr-only">Admin öffnen</span>
      </button>

      {adminOpen ? (
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
