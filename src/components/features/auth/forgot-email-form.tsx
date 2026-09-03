"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { requestEmailReminderAction } from "@/app/actions/auth";
import {
  authInputClassName,
  authLabelClassName,
} from "@/components/features/auth/auth-form-styles";
import { cn } from "@/lib/utils";

export function ForgotEmailForm() {
  const [contactEmail, setContactEmail] = useState("");
  const [rememberedName, setRememberedName] = useState("");
  const [guessedEmail, setGuessedEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await requestEmailReminderAction({
        contactEmail,
        rememberedName,
        guessedEmail,
        notes,
      });

      if (!result.success) {
        setFieldError(result.error ?? "Anfrage konnte nicht gespeichert werden.");
        toast.error(result.error ?? "Anfrage konnte nicht gespeichert werden.");
        return;
      }

      setMessage(
        typeof result.data === "string"
          ? result.data
          : "Deine Anfrage wurde gespeichert.",
      );
      toast.success("Anfrage gespeichert.");
      setRememberedName("");
      setGuessedEmail("");
      setNotes("");
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
          <span className={authLabelClassName}>Deine Kontakt-E-Mail</span>
          <input
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            className={authInputClassName}
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Erinnerter Name</span>
          <input
            type="text"
            value={rememberedName}
            onChange={(event) => setRememberedName(event.target.value)}
            className={authInputClassName}
            placeholder="z. B. dein Vorname oder der Name des Kindes"
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Vermutete E-Mail</span>
          <input
            type="text"
            value={guessedEmail}
            onChange={(event) => setGuessedEmail(event.target.value)}
            className={authInputClassName}
            placeholder="z. B. alte Adresse oder nur ein Teil davon"
          />
        </label>

        <label className="block">
          <span className={authLabelClassName}>Zusatzinfos</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-[1.25rem] bg-gray-100 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
            placeholder="Alles, was bei der Zuordnung helfen kann."
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
          {isPending ? "Speichert …" : "Anfrage senden"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-zinc-600">
        <Link href="/anmelden" className="hover:text-orange-700">
          Zur Anmeldung
        </Link>
        <Link href="/passwort-vergessen" className="hover:text-orange-700">
          Passwort vergessen
        </Link>
      </div>
    </form>
  );
}
