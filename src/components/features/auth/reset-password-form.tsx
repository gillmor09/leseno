"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetPasswordAction } from "@/app/actions/auth";
import {
  authInputClassName,
  authLabelClassName,
} from "@/components/features/auth/auth-form-styles";
import { cn } from "@/lib/utils";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await resetPasswordAction({ password, confirmPassword });

      if (!result.success) {
        setFieldError(result.error ?? "Passwort konnte nicht gespeichert werden.");
        toast.error(result.error ?? "Passwort konnte nicht gespeichert werden.");
        return;
      }

      const successMessage =
        typeof result.data === "string"
          ? result.data
          : "Dein Passwort wurde aktualisiert.";
      setMessage(successMessage);
      toast.success(successMessage);
      setPassword("");
      setConfirmPassword("");
    });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
    >
      <div className="grid gap-5">
        <label className="block">
          <span className={authLabelClassName}>Neues Passwort</span>
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
          {isPending ? "Speichert …" : "Passwort speichern"}
        </button>
      </div>

      <div className="mt-6 text-sm font-semibold text-zinc-600">
        <Link href="/anmelden" className="hover:text-orange-700">
          Zur Anmeldung
        </Link>
      </div>
    </form>
  );
}
