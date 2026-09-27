"use client";

/**
 * Create a new Sachbuch shell (title + Buchart).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createSachbuchAction } from "@/app/actions/sachbuch-admin";
import type { SachbuchMakroTyp } from "@/lib/sachbuch/types";
import {
  SACHBUCH_MAKRO_TYP_HINTS,
  SACHBUCH_MAKRO_TYP_LABELS,
  SACHBUCH_MAKRO_TYP_OPTIONS,
} from "@/lib/sachbuch/types";
import { cn } from "@/lib/utils";

export function SachbuchCreateForm({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [buchArt, setBuchArt] = useState<SachbuchMakroTyp>("journey");
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (!canSave || pending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Titel angeben.");
      return;
    }
    setPending(true);
    const result = await createSachbuchAction({
      title: trimmed,
      buchArt,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Anlegen fehlgeschlagen.");
      return;
    }
    toast.success("Sachbuch angelegt.");
    router.push(`/admin/sachbuch/${result.data!.book.id}`);
  }

  return (
    <div className="space-y-6 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
      <Link
        href="/admin/sachbuch"
        className="text-sm font-bold text-orange-800 hover:underline"
      >
        ← Alle Sachbücher
      </Link>
      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Arbeitstitel
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canSave || pending}
          className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
          placeholder="z. B. Arbeitsname des Sachbuchs"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Buchart
        </span>
        <div className="flex flex-wrap gap-2">
          {SACHBUCH_MAKRO_TYP_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!canSave || pending}
              onClick={() => setBuchArt(option)}
              className={cn(
                "rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50",
                buchArt === option
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-950/10",
              )}
            >
              {SACHBUCH_MAKRO_TYP_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          {SACHBUCH_MAKRO_TYP_HINTS[buchArt]}
        </p>
      </div>

      <button
        type="button"
        disabled={!canSave || pending}
        onClick={() => void handleCreate()}
        className={cn(
          "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
        )}
      >
        {pending ? "Anlegen …" : "Anlegen"}
      </button>
    </div>
  );
}
