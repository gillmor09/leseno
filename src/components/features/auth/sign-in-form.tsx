"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { signInAction } from "@/app/actions/auth";
import {
  authInputClassName,
  authLabelClassName,
} from "@/components/features/auth/auth-form-styles";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { cn } from "@/lib/utils";

export function SignInForm({
  emailConfirmed = false,
  confirmationFailed = false,
  initialEmail = "",
  nextPath = "/geschichte",
}: {
  emailConfirmed?: boolean;
  confirmationFailed?: boolean;
  /** Prefill after email confirmation (new account); password stays empty. */
  initialEmail?: string;
  nextPath?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();
  /** Remount inputs after confirm so browsers don’t keep the previous account’s autofill. */
  const fieldKey = emailConfirmed
    ? `confirmed:${initialEmail || "empty"}`
    : "signin";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);

    startTransition(async () => {
      const result = await signInAction({
        email,
        password,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success) {
        setFieldError(result.error ?? "Anmeldung fehlgeschlagen.");
        toast.error(result.error ?? "Anmeldung fehlgeschlagen.");
        return;
      }

      toast.success("Du bist jetzt angemeldet.");
      window.location.href = nextPath.startsWith("/")
        ? nextPath
        : "/geschichte";
    });
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={handleSubmit}
      className="relative rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
    >
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />
      <div className="grid gap-5">
        {emailConfirmed ? (
          <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 ring-1 ring-green-700/10">
            Deine E-Mail ist bestätigt. Du kannst dich jetzt anmelden.
          </p>
        ) : null}
        {confirmationFailed ? (
          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
            Die Bestätigung hat nicht geklappt. Bitte den Link aus der E-Mail
            noch einmal öffnen oder dich neu registrieren.
          </p>
        ) : null}
        <label className="block">
          <span className={authLabelClassName}>E-Mail</span>
          <input
            key={`${fieldKey}-email`}
            type="email"
            name="email"
            autoComplete={emailConfirmed ? "username" : "email"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authInputClassName}
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Passwort</span>
          <input
            key={`${fieldKey}-password`}
            type="password"
            name="password"
            autoComplete={emailConfirmed ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authInputClassName}
          />
        </label>

        {fieldError ? (
          <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "inline-flex justify-center rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
            isPending && "opacity-70",
          )}
        >
          {isPending ? "Meldet an …" : "Anmelden"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-zinc-600">
        <Link href="/passwort-vergessen" className="hover:text-orange-700">
          Passwort vergessen
        </Link>
        <Link href="/email-vergessen" className="hover:text-orange-700">
          E-Mail vergessen
        </Link>
      </div>
    </form>
  );
}
