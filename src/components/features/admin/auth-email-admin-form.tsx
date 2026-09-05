"use client";

/**
 * Admin editor for Supabase Auth email templates (register + forget hooks).
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveAuthEmailTemplatesAction } from "@/app/actions/auth-email-templates";
import { AuthEmailHtmlEditor } from "@/components/features/admin/auth-email-html-editor";
import {
  AUTH_EMAIL_PLACEHOLDERS,
  type AuthEmailTemplate,
} from "@/lib/auth/email-templates";
import { cn } from "@/lib/utils";

export function AuthEmailAdminForm({
  templates: initialTemplates,
  canSave,
  registerHookUrl,
  forgetHookUrl,
  sendEmailHookUrl,
  readOnlyNotice,
}: {
  templates: AuthEmailTemplate[];
  canSave: boolean;
  registerHookUrl: string;
  forgetHookUrl: string;
  sendEmailHookUrl: string;
  readOnlyNotice?: string;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patch(
    id: string,
    field: "subject" | "htmlBody" | "enabled",
    value: string | boolean,
  ) {
    setTemplates((current) =>
      current.map((template) =>
        template.id === id ? { ...template, [field]: value } : template,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar — Migration oder Service-Role prüfen.",
      );
      return;
    }
    setFieldError(null);
    setPending(true);

    const result = await saveAuthEmailTemplatesAction({
      templates: templates.map((template) => ({
        id: template.id,
        subject: template.subject,
        htmlBody: template.htmlBody,
        enabled: template.enabled,
      })),
    });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("E-Mail-Templates gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {readOnlyNotice ??
            "Vorschau: Templates konnten nicht geladen werden. Bitte Migration `auth_email_templates` ausführen."}
        </p>
      ) : null}

      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Supabase-Hooks
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Unter Authentication → Hooks → <strong>Send Email</strong> die URL{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            /hooks/auth/send-email
          </code>{" "}
          eintragen (leitet signup/recovery weiter). Alternativ die Einzel-Hooks
          unten. Secret als{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            AUTH_EMAIL_HOOK_SECRET
          </code>{" "}
          in der App setzen. Versand über SMTP (
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            SMTP_*
          </code>
          ).
        </p>
        <ul className="mt-4 space-y-2 text-sm font-semibold text-zinc-800">
          <li>
            Empfohlen (ein Hook):{" "}
            <a
              href={sendEmailHookUrl}
              className="break-all font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              {sendEmailHookUrl}
            </a>
          </li>
          <li>
            Nur Registrierung:{" "}
            <a
              href={registerHookUrl}
              className="break-all font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              {registerHookUrl}
            </a>
          </li>
          <li>
            Nur Passwort vergessen:{" "}
            <a
              href={forgetHookUrl}
              className="break-all font-bold text-orange-800 underline-offset-2 hover:underline"
            >
              {forgetHookUrl}
            </a>
          </li>
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Platzhalter:{" "}
          {AUTH_EMAIL_PLACEHOLDERS.map((name) => `{{${name}}}`).join(", ")}
        </p>
      </section>

      {templates.map((template) => {
        const hookUrl =
          template.id === "register" ? registerHookUrl : forgetHookUrl;
        return (
          <article
            key={template.id}
            className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-extrabold text-zinc-950">
                  {template.label}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {template.description}
                </p>
                <p className="mt-2 text-xs font-semibold text-zinc-500">
                  Hook:{" "}
                  <a
                    href={hookUrl}
                    className="text-orange-800 underline-offset-2 hover:underline"
                  >
                    {hookUrl}
                  </a>
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={template.enabled}
                disabled={!canSave}
                onClick={() => patch(template.id, "enabled", !template.enabled)}
                className={cn(
                  "relative h-8 w-14 shrink-0 rounded-full transition-all duration-200 ease-in-out disabled:opacity-50",
                  template.enabled ? "bg-yellow-400" : "bg-zinc-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-all duration-200 ease-in-out",
                    template.enabled && "translate-x-6",
                  )}
                />
                <span className="sr-only">Aktiv</span>
              </button>
            </div>

            <div className="space-y-4 p-6">
              <label className="block">
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  Betreff
                </span>
                <input
                  type="text"
                  value={template.subject}
                  disabled={!canSave}
                  maxLength={200}
                  onChange={(event) =>
                    patch(template.id, "subject", event.target.value)
                  }
                  className="mt-1 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                />
              </label>
              <div>
                <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                  E-Mail-Inhalt
                </span>
                <AuthEmailHtmlEditor
                  value={template.htmlBody}
                  disabled={!canSave}
                  onChange={(html) => patch(template.id, "htmlBody", html)}
                />
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Platzhalter unverändert lassen, z.&nbsp;B.{" "}
                  <code className="rounded bg-gray-100 px-1 py-0.5">
                    {"{{confirmation_url}}"}
                  </code>
                  .
                </p>
              </div>
            </div>
          </article>
        );
      })}

      {fieldError ? (
        <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSave || pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          (!canSave || pending) && "opacity-70",
        )}
      >
        {pending ? "Speichert …" : "Speichern"}
      </button>
    </form>
  );
}
