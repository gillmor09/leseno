import type { Metadata } from "next";
import { AuthEmailAdminForm } from "@/components/features/admin/auth-email-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FALLBACK_AUTH_EMAIL_TEMPLATES } from "@/lib/auth/email-templates";
import { listAuthEmailTemplates } from "@/lib/auth/email-templates-repository";
import { getSiteUrl } from "@/lib/site-url";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Auth-E-Mails — Leseno Admin",
  description:
    "E-Mail-Templates für Registrierung und Passwort vergessen (Supabase Hooks).",
};

/**
 * Admin for Auth email HTML used by `/hooks/auth/register` and `/hooks/auth/forget`.
 */
export default async function AuthEmailsAdminPage() {
  let templates = FALLBACK_AUTH_EMAIL_TEMPLATES;
  let canSave = false;
  let readOnlyNotice =
    "Vorschau: Templates konnten nicht geladen werden. Bitte Migration `20260904192000_auth_email_templates.sql` ausführen.";

  const siteUrl = (await getSiteUrl()).replace(/\/$/, "");
  const registerHookUrl = `${siteUrl}/hooks/auth/register`;
  const forgetHookUrl = `${siteUrl}/hooks/auth/forget`;
  const sendEmailHookUrl = `${siteUrl}/hooks/auth/send-email`;

  try {
    templates = await listAuthEmailTemplates();
    canSave = hasServiceRoleConfig();
    if (!canSave) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    }
  } catch (error) {
    if (!hasServiceRoleConfig()) {
      readOnlyNotice =
        "Vorschau: `SUPABASE_SERVICE_ROLE_KEY` fehlt. Bitte `.env.local` prüfen.";
    } else {
      const message =
        error instanceof Error ? error.message : "Templates nicht verfügbar.";
      readOnlyNotice = `Vorschau: ${message}`;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Auth-E-Mails
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            HTML und Betreff für Registrierung und „Passwort vergessen“. Die
            Seiten unter Hooks werden von Supabase Auth aufgerufen und versenden
            die Mails über SMTP.
          </p>
          <div className="mt-10">
            <AuthEmailAdminForm
              templates={templates}
              canSave={canSave}
              registerHookUrl={registerHookUrl}
              forgetHookUrl={forgetHookUrl}
              sendEmailHookUrl={sendEmailHookUrl}
              readOnlyNotice={readOnlyNotice}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
