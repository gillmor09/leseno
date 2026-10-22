"use client";

/**
 * Create Sachbuch: Idee first (paste or interview). Buchtyp comes later from Konzept.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createSachbuchAction } from "@/app/actions/sachbuch-admin";
import { cn } from "@/lib/utils";

type IdeaMode = "ready" | "interview";

export function SachbuchCreateForm({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<IdeaMode>("ready");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [pending, setPending] = useState(false);

  const canSubmit =
    canSave &&
    !pending &&
    (mode === "interview" || idea.trim().length >= 20);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      const result = await createSachbuchAction({
        title: title.trim() || undefined,
        ideaMode: mode,
        highConceptIdea: mode === "ready" ? idea : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Anlegen fehlgeschlagen.");
        return;
      }
      toast.success(
        mode === "interview"
          ? "Sachbuch angelegt — Idee im Interview erarbeiten."
          : "Sachbuch angelegt — als Nächstes Buchtyp aus der Idee.",
      );
      router.push(`/admin/sachbuch/${result.data.book.id}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-950/5">
        Start mit Idee/Konzept. Der passende Sachbuchtyp wird danach aus dem
        Konzept vorgeschlagen — nicht vorher gewählt.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-zinc-800">Idee-Modus</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={cn(
              "cursor-pointer rounded-2xl bg-white p-4 ring-1 transition",
              mode === "ready"
                ? "ring-2 ring-orange-600"
                : "ring-zinc-950/10 hover:ring-zinc-950/20",
            )}
          >
            <input
              type="radio"
              name="sachbuch-idea-mode"
              value="ready"
              checked={mode === "ready"}
              onChange={() => setMode("ready")}
              disabled={!canSave || pending}
              className="sr-only"
            />
            <span className="block text-sm font-extrabold text-zinc-950">
              Konzept vorhanden
            </span>
            <span className="mt-1 block text-xs font-semibold text-zinc-500">
              High-Concept / Buchkonzept einfügen — Typ kommt danach.
            </span>
          </label>
          <label
            className={cn(
              "cursor-pointer rounded-2xl bg-white p-4 ring-1 transition",
              mode === "interview"
                ? "ring-2 ring-orange-600"
                : "ring-zinc-950/10 hover:ring-zinc-950/20",
            )}
          >
            <input
              type="radio"
              name="sachbuch-idea-mode"
              value="interview"
              checked={mode === "interview"}
              onChange={() => setMode("interview")}
              disabled={!canSave || pending}
              className="sr-only"
            />
            <span className="block text-sm font-extrabold text-zinc-950">
              Idee erarbeiten
            </span>
            <span className="mt-1 block text-xs font-semibold text-zinc-500">
              Interviewer fragt, du antwortest — danach Typ-Vorschlag.
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="sachbuch-title"
          className="text-sm font-bold text-zinc-800"
        >
          Titel (optional)
        </label>
        <input
          id="sachbuch-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canSave || pending}
          className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-zinc-950/10 focus:outline-none focus:ring-2 focus:ring-orange-600"
          placeholder={
            mode === "ready"
              ? "Wird sonst aus der Idee abgeleitet"
              : "z. B. Arbeitstitel"
          }
        />
      </div>

      {mode === "ready" ? (
        <div>
          <label
            htmlFor="sachbuch-idea"
            className="text-sm font-bold text-zinc-800"
          >
            Idee / Buchkonzept
          </label>
          <textarea
            id="sachbuch-idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={!canSave || pending}
            rows={12}
            required
            className="mt-2 max-h-[30vh] min-h-[8rem] w-full resize-y overflow-y-auto rounded-2xl border-0 bg-white px-4 py-3 text-sm leading-relaxed ring-1 ring-zinc-950/10 focus:outline-none focus:ring-2 focus:ring-orange-600"
            placeholder="Thema, These, Leserversprechen, Abgrenzung, Ton — so ausführlich wie du willst."
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            {idea.trim().length.toLocaleString("de-DE")} Zeichen
          </p>
        </div>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-950/5">
          Nach dem Anlegen startet das Idee-Interview. Buchtyp und weitere
          Phasen folgen, sobald die Idee übernommen ist.
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        Sachbuch anlegen
      </button>
    </form>
  );
}
