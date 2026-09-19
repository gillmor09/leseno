"use client";

/**
 * Minimal create form for a new roman shell (title only).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveRomanKontextAction } from "@/app/actions/roman-admin";
import { emptyRomanEditorial } from "@/lib/roman/editorial";
import { emptyRomanUpsertFields } from "@/lib/roman/fundament";
import { cn } from "@/lib/utils";

export function RomanCreateForm({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    if (!canSave || pending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Titel angeben.");
      return;
    }
    setPending(true);
    const fields = emptyRomanUpsertFields({ title: trimmed });
    const result = await saveRomanKontextAction({
      ...fields,
      id: null,
      editorial: emptyRomanEditorial(),
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Anlegen fehlgeschlagen.");
      return;
    }
    toast.success("Buch angelegt.");
    router.push(`/admin/roman/${result.data!.roman.id}`);
  }

  return (
    <div className="space-y-6 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
      <Link
        href="/admin/roman"
        className="text-sm font-bold text-orange-800 hover:underline"
      >
        ← Alle Bücher
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
          placeholder="z. B. Arbeitsname des Buchs"
        />
      </label>
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
