import type { Metadata } from "next";
import { UserActivitiesAdminView } from "@/components/features/admin/user-activities-admin-view";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  loadActivitiesForAdmin,
  type UserActivityActionCount,
  type UserActivityAdminRow,
} from "@/lib/users/activity";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Aktivitäten — Leseno Admin",
  description: "User-Aktivitäten: Übersicht und durchsuchbare Einzelliste.",
};

/**
 * Admin overview of `leseno.user_activities` (counts + searchable table).
 */
export default async function AdminActivitiesPage() {
  let rows: UserActivityAdminRow[] = [];
  let counts: UserActivityActionCount[] = [];
  let loadNotice: string | null = null;

  try {
    if (!hasServiceRoleConfig()) {
      loadNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    } else {
      const loaded = await loadActivitiesForAdmin({ limit: 1000 });
      rows = loaded.rows;
      counts = loaded.counts;
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      loadNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    } else {
      const message =
        error instanceof Error
          ? error.message
          : "Aktivitäten konnten nicht geladen werden.";
      loadNotice = `Vorschau: ${message}. Bitte Migrationen bis \`20260905144000_delete_user_activities_before.sql\` prüfen.`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Aktivitäten
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Übersicht nach Aktionsart und chronologische Liste — durchsuchbar
            nach E-Mail, Aktion, Pfad und mehr. Es werden die neuesten 1.000
            Einträge geladen.
          </p>
          <div className="mt-10">
            <UserActivitiesAdminView
              rows={rows}
              counts={counts}
              loadNotice={loadNotice}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
