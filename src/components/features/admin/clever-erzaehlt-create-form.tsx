"use client";

/**
 * Clever erzählt create: title + Altersgruppe (with story length) + Thema (Top 20 or custom).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { saveRomanKontextAction } from "@/app/actions/roman-admin";
import {
  CLEVER_ALTER_OPTIONS,
  buildCleverCreateEditorial,
  topThemenForCleverAlter,
} from "@/lib/roman/clever-erzaehlt";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { emptyRomanUpsertFields } from "@/lib/roman/fundament";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";

export function CleverErzaehltCreateForm({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [alterOptionId, setAlterOptionId] = useState(
    CLEVER_ALTER_OPTIONS[0]?.id ?? "",
  );
  const [themaMode, setThemaMode] = useState<"top20" | "custom">("top20");
  const [themaTop, setThemaTop] = useState("");
  const [themaCustom, setThemaCustom] = useState("");
  const [pending, setPending] = useState(false);

  const topThemen = useMemo(
    () => topThemenForCleverAlter(alterOptionId),
    [alterOptionId],
  );

  const selectedAlter = CLEVER_ALTER_OPTIONS.find((o) => o.id === alterOptionId);

  function onAlterChange(nextId: string) {
    setAlterOptionId(nextId);
    setThemaTop("");
  }

  async function handleCreate() {
    if (!canSave || pending) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Namen angeben.");
      return;
    }
    if (!alterOptionId) {
      toast.error("Altersgruppe wählen.");
      return;
    }
    const thema =
      themaMode === "top20" ? themaTop.trim() : themaCustom.trim();
    if (!thema) {
      toast.error(
        themaMode === "top20"
          ? "Thema aus der Liste wählen."
          : "Thema eingeben.",
      );
      return;
    }

    let built: ReturnType<typeof buildCleverCreateEditorial>;
    try {
      built = buildCleverCreateEditorial({ alterOptionId, thema });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Angaben prüfen.",
      );
      return;
    }

    setPending(true);
    const fields = emptyRomanUpsertFields({
      title: trimmedTitle,
      genre: built.genre,
    });
    const result = await saveRomanKontextAction({
      ...fields,
      id: null,
      editorial: {
        ...emptyRomanEditorial(),
        ...built.editorial,
        buchTyp: "clever_erzaehlt",
      },
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Anlegen fehlgeschlagen.");
      return;
    }
    toast.success("Buch angelegt.");
    router.push(`/admin/clever-erzaehlt/${result.data!.roman.id}`);
    router.refresh();
  }

  return (
    <form
      noValidate
      className="space-y-6 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        void handleCreate();
      }}
    >
      <Link
        href="/admin/clever-erzaehlt"
        className="text-sm font-bold text-orange-800 hover:underline"
      >
        ← Alle Bücher
      </Link>

      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Name
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canSave || pending}
          className={inputClass}
          placeholder="z. B. Clever erzählt: Dinosaurier"
          autoComplete="off"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Altersgruppe (mit Geschichtenlänge)
        </legend>
        <div className="space-y-2">
          {CLEVER_ALTER_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ring-1 transition",
                alterOptionId === opt.id
                  ? "bg-orange-50 ring-orange-700/40"
                  : "bg-gray-100 ring-zinc-950/10 hover:bg-white",
              )}
            >
              <input
                type="radio"
                name="alter"
                className="mt-1"
                checked={alterOptionId === opt.id}
                disabled={!canSave || pending}
                onChange={() => onAlterChange(opt.id)}
              />
              <span>
                <span className="block text-sm font-bold text-zinc-950">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-zinc-600">
                  ca. {opt.wortMin}–{opt.wortMax} Wörter · {opt.lesestufe}
                </span>
              </span>
            </label>
          ))}
        </div>
        {selectedAlter ? (
          <p className="text-xs font-semibold text-zinc-500">
            Erzählstil: {selectedAlter.erzaehlstil}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Thema
        </legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => setThemaMode("top20")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold ring-1",
              themaMode === "top20"
                ? "bg-orange-700 text-white ring-orange-700"
                : "bg-gray-100 text-zinc-800 ring-zinc-950/10",
            )}
          >
            Top 20 fürs Alter
          </button>
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={() => setThemaMode("custom")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold ring-1",
              themaMode === "custom"
                ? "bg-orange-700 text-white ring-orange-700"
                : "bg-gray-100 text-zinc-800 ring-zinc-950/10",
            )}
          >
            Selbst vorgeben
          </button>
        </div>

        {themaMode === "top20" ? (
          <label className="block">
            <span className="sr-only">Thema aus Top 20</span>
            <select
              value={themaTop}
              onChange={(e) => setThemaTop(e.target.value)}
              disabled={!canSave || pending}
              className={inputClass}
            >
              <option value="">Thema wählen …</option>
              {topThemen.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="sr-only">Eigenes Thema</span>
            <input
              value={themaCustom}
              onChange={(e) => setThemaCustom(e.target.value)}
              disabled={!canSave || pending}
              className={inputClass}
              placeholder="z. B. Bienen und Bestäubung"
              autoComplete="off"
            />
          </label>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={!canSave || pending}
        className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
      >
        {pending ? "Speichern …" : "Speichern"}
      </button>
    </form>
  );
}
