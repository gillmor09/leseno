import type { Metadata } from "next";
import { UsersAdminForm } from "@/components/features/admin/users-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { getCurrentUser } from "@/lib/auth/session";
import { loadUsersForAdmin } from "@/lib/users/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";
import type { UserAdminRow } from "@/lib/users/catalog";

export const metadata: Metadata = {
  title: "User — Leseno Admin",
  description: "E-Mail-Adressen und Rollen der User verwalten.",
};

/**
 * Admin page for user emails and app roles.
 * Guarded by `src/app/admin/layout.tsx` (admin role required).
 * Loads users at request time; failures show a read-only notice (no build crash).
 */
export default async function UsersAdminPage() {
  let users: UserAdminRow[] = [];
  let canSave = false;
  let readOnlyNotice: string | null = null;
  const currentUser = await getCurrentUser();

  try {
    users = await loadUsersForAdmin();
    canSave = hasServiceRoleConfig();
    if (!canSave) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    } else {
      const message =
        error instanceof Error
          ? error.message
          : "User konnten nicht geladen werden.";
      readOnlyNotice = `Vorschau: ${message}`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            User
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Verwalte hier die registrierten E-Mail-Adressen und weise die
            passende Rolle zu. User lassen sich inkl. Supabase-Auth-Account
            löschen.
          </p>
          <div className="mt-10">
            <UsersAdminForm
              users={users}
              canSave={canSave}
              readOnlyNotice={readOnlyNotice}
              currentUserId={currentUser?.id ?? null}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
