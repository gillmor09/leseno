import type { Metadata } from "next";
import { UsersAdminForm } from "@/components/features/admin/users-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { loadUsersForAdmin } from "@/lib/users/repository";

export const metadata: Metadata = {
  title: "User — Leseno Admin",
  description: "E-Mail-Adressen und Rollen der User verwalten.",
};

/**
 * Admin page for user emails and app roles.
 * New signups appear here automatically with the default guest role.
 */
export default async function UsersAdminPage() {
  const users = await loadUsersForAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            User
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Verwalte hier die registrierten E-Mail-Adressen und weise die
            passende Rolle zu.
          </p>
          <div className="mt-10">
            <UsersAdminForm users={users} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
