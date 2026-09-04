"use client";

/**
 * Editable "Meine Welt" form: name, friends, interests, wish-list experiences.
 * `experiences` = "Das möchte ich mal erleben" (aspirational, not past events).
 */

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { saveMyWorldAction } from "@/app/actions/user-world";
import type { UserWorldProfile } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

type ListKey = "friends" | "interests" | "experiences";

const LIST_COPY: Record<
  ListKey,
  { title: string; hint: string; placeholder: string; addLabel: string }
> = {
  friends: {
    title: "Freundesliste",
    hint: "Wen magst du dabei haben? Schreib Namen oder Spitznamen.",
    placeholder: "z. B. Mia",
    addLabel: "Freund:in hinzufügen",
  },
  interests: {
    title: "Interessen",
    hint: "Was magst du besonders? Dinosaurier, Fußball, Sterne …",
    placeholder: "z. B. Weltall",
    addLabel: "Interesse hinzufügen",
  },
  experiences: {
    title: "Das möchte ich mal erleben",
    hint: "Wünsche und Träume für später — nicht schon Erlebtes. z. B. einmal im Weltall sein, einen echten Dino treffen …",
    placeholder: "z. B. einmal im Weltall sein",
    addLabel: "Wunsch hinzufügen",
  },
};

export function MyWorldForm({
  initialProfile,
}: {
  initialProfile: UserWorldProfile;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [drafts, setDrafts] = useState<Record<ListKey, string>>({
    friends: "",
    interests: "",
    experiences: "",
  });
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function addItem(key: ListKey) {
    const value = drafts[key].trim();
    if (!value) return;
    if (profile[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      toast.error("Das steht schon auf deiner Liste.");
      return;
    }
    setProfile((current) => ({
      ...current,
      [key]: [...current[key], value],
    }));
    setDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removeItem(key: ListKey, index: number) {
    setProfile((current) => ({
      ...current,
      [key]: current[key].filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setPending(true);

    const result = await saveMyWorldAction(profile);
    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("Deine Welt ist gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Dein Name
        </p>
        <label htmlFor="world-display-name" className="mt-1 block text-sm text-zinc-600">
          So nennen wir dich in Leseno.
        </label>
        <input
          id="world-display-name"
          type="text"
          value={profile.displayName}
          onChange={(event) =>
            setProfile((current) => ({
              ...current,
              displayName: event.target.value,
            }))
          }
          maxLength={80}
          className="mt-3 w-full rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
          placeholder="z. B. Leo"
        />
      </section>

      {(Object.keys(LIST_COPY) as ListKey[]).map((key) => {
        const copy = LIST_COPY[key];
        return (
          <section
            key={key}
            className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
          >
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              {copy.title}
            </p>
            <p className="mt-1 text-sm text-zinc-600">{copy.hint}</p>

            <ul className="mt-4 flex flex-wrap gap-2">
              {profile[key].length === 0 ? (
                <li className="text-sm text-zinc-500">Noch nichts eingetragen.</li>
              ) : (
                profile[key].map((item, index) => (
                  <li key={`${key}-${item}-${index}`}>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1.5 pr-1.5 pl-3 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                      {item}
                      <button
                        type="button"
                        onClick={() => removeItem(key, index)}
                        className="inline-flex size-7 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-white hover:text-orange-700"
                        aria-label={`${item} entfernen`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={drafts[key]}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addItem(key);
                  }
                }}
                maxLength={120}
                placeholder={copy.placeholder}
                className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
              <button
                type="button"
                onClick={() => addItem(key)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-yellow-400 px-4 py-3 text-sm font-bold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-yellow-300"
              >
                <Plus className="size-4" aria-hidden />
                {copy.addLabel}
              </button>
            </div>
          </section>
        );
      })}

      {fieldError ? (
        <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          pending && "opacity-70",
        )}
      >
        {pending ? "Speichert …" : "Speichern"}
      </button>
    </form>
  );
}
