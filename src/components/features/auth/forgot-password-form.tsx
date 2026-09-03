"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { requestPasswordResetAction } from "@/app/actions/auth";
import {
  authInputClassName,
  authLabelClassName,
} from "@/components/features/auth/auth-form-styles";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await requestPasswordResetAction({
        email,
        ...botGuard.getBotGuardPayload(),
      });

      if (!result.success) {
        setFieldError(result.error ?? "Link konnte nicht angefordert werden.");
        toast.error(result.error ?? "Link konnte nicht angefordert werden.");
        return;
      }

      setMessage(
        typeof result.data === "string"
          ? result.data
          : "Wenn die E-Mail bekannt ist, wurde ein Link versendet.",
      );
      toast.success("Wenn die E-Mail existiert, wurde ein Link versendet.");
    });
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

        {message ? (
          <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 ring-1 ring-green-700/10">
            {message}
          </p>
        ) : null}
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
          {isPending ? "Sendet …" : "Link senden"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-zinc-600">
        <Link href="/anmelden" className="hover:text-orange-700">
          Zur Anmeldung
        </Link>
        <Link href="/email-vergessen" className="hover:text-orange-700">
          E-Mail vergessen
        </Link>
      </div>
    </form>
  );
}
