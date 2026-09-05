"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { signUpAction } from "@/app/actions/auth";
import {
  authInputClassName,
  authLabelClassName,
} from "@/components/features/auth/auth-form-styles";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import {
  clearStoredReferralCode,
  readStoredReferralCode,
} from "@/lib/marketing/referral";
import { cn } from "@/lib/utils";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();

  useEffect(() => {
    setReferralCode(readStoredReferralCode());
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await signUpAction({
        email,
        password,
        confirmPassword,
        ...(referralCode ? { referralCode } : {}),
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success) {
        setFieldError(result.error ?? "Registrierung fehlgeschlagen.");
        toast.error(result.error ?? "Registrierung fehlgeschlagen.");
        return;
      }

      clearStoredReferralCode();
      setMessage(
        typeof result.data === "string"
          ? result.data
          : "Bitte bestätige jetzt die E-Mail in deinem Postfach.",
      );
      toast.success("Registrierung gestartet.");
    });
  }

  // Show a clear success state instead of the form after signup.
  if (message) {
    return (
      <div className="rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700 text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-extrabold text-zinc-950">Fast geschafft!</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">{message}</p>
        <p className="mt-2 text-xs text-zinc-400">
          Schau auch im Spam-Ordner nach, falls die E-Mail nicht ankommt.
        </p>
        <Link
          href="/anmelden"
          className="mt-6 inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
        >
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="relative rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
    >
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />
      <div className="grid gap-5">
        <label className="block">
          <span className={authLabelClassName}>E-Mail</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authInputClassName}
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Passwort</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authInputClassName}
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Passwort wiederholen</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
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
          {isPending ? "Konto wird angelegt …" : "Konto anlegen"}
        </button>
      </div>

      <div className="mt-6 text-sm font-semibold text-zinc-600">
        Schon registriert?{" "}
        <Link href="/anmelden" className="hover:text-orange-700">
          Zur Anmeldung
        </Link>
      </div>
    </form>
  );
}
