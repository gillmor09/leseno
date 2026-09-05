"use client";

/**
 * Public contact form: reply email + message only (bot-guarded).
 */

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { submitContactRequestAction } from "@/app/actions/contact";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const botGuard = useBotGuardFields();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    startTransition(async () => {
      const result = await submitContactRequestAction({
        email,
        message,
        ...botGuard.getBotGuardPayload(),
      });
      if (!result.success) {
        setFieldError(result.error ?? "Senden hat nicht geklappt.");
        toast.error(result.error ?? "Senden hat nicht geklappt.");
        return;
      }
      setSent(true);
      setEmail("");
      setMessage("");
      toast.success("Danke — deine Nachricht ist angekommen.");
    });
  }

  if (sent) {
    return (
      <div className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10">
        <p className="text-lg font-extrabold text-zinc-950">
          Nachricht gesendet
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Wir melden uns an die angegebene E-Mail-Adresse, sobald wir können.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 inline-flex rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900"
        >
          Weitere Nachricht
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="rounded-[1.75rem] bg-white p-8 shadow-xl ring-1 ring-zinc-950/10"
    >
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />

      <label className="block">
        <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
          Deine E-Mail (für die Antwort)
        </span>
        <input
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
          placeholder="name@beispiel.de"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
          Deine Nachricht
        </span>
        <textarea
          required
          rows={6}
          disabled={pending}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 w-full resize-y rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
          placeholder="Wobei können wir helfen?"
        />
      </label>

      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Wir speichern deine E-Mail nur, um dir zu antworten, sowie den Inhalt
        deiner Anfrage. Details:{" "}
        <a
          href="/datenschutz#kontakt"
          className="font-semibold text-orange-700 underline-offset-2 hover:underline"
        >
          Datenschutzerklärung
        </a>
        .
      </p>

      {fieldError ? (
        <p className="mt-4 text-sm font-semibold text-red-700" role="alert">
          {fieldError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "mt-6 inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          pending && "cursor-wait opacity-70",
        )}
      >
        {pending ? "Sendet…" : "Nachricht senden"}
      </button>
    </form>
  );
}
