import type { Metadata } from "next";
import { ContactRequestsAdminView } from "@/components/features/admin/contact-requests-admin-view";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import {
  loadContactRequestsForAdmin,
  type ContactRequestAdminRow,
} from "@/lib/contact/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Kontaktanfragen — Leseno Admin",
  description: "Eingegangene Nachrichten vom Kontaktformular.",
};

/**
 * Admin inbox for public contact form submissions.
 */
export default async function AdminKontaktPage() {
  let rows: ContactRequestAdminRow[] = [];
  let loadNotice: string | null = null;

  try {
    if (!hasServiceRoleConfig()) {
      loadNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    } else {
      rows = await loadContactRequestsForAdmin({ limit: 500 });
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      loadNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` / Coolify prüfen.";
    } else {
      const message =
        error instanceof Error
          ? error.message
          : "Kontaktanfragen konnten nicht geladen werden.";
      loadNotice = `Vorschau: ${message}. Bitte Migrationen bis \`20260905171000_list_contact_requests_admin.sql\` prüfen.`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Kontaktanfragen
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Nachrichten vom öffentlichen Kontaktformular — neueste zuerst.
            Zum Lesen anklicken, per E-Mail antworten oder löschen.
          </p>
          <div className="mt-10">
            <ContactRequestsAdminView rows={rows} loadNotice={loadNotice} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
