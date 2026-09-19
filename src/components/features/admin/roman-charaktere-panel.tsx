"use client";

/**
 * Character sheets: manual edit + save (stage KI via Erzeugen/Verbessern).
 */

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { emptyCharakter } from "@/lib/roman/fundament";
import type { RomanCharakter } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";
const textareaClass = `${inputClass} font-sans min-h-[5rem]`;

const FIELDS: Array<{
  key: keyof RomanCharakter;
  label: string;
  multiline?: boolean;
  rows?: number;
}> = [
  { key: "name", label: "Name" },
  { key: "alter", label: "Alter" },
  { key: "rolle", label: "Rolle" },
  { key: "wesenszuege", label: "Wesenszüge", multiline: true, rows: 3 },
  { key: "motivation", label: "Ziel/Motiv", multiline: true, rows: 3 },
  { key: "schwaeche", label: "Schwäche / Reaktion unter Druck", multiline: true, rows: 3 },
  { key: "bogen", label: "Bogen/Wandel", multiline: true, rows: 3 },
  { key: "sprachstil", label: "Tonalität/Sprache", multiline: true, rows: 2 },
];

function normalizeList(list: RomanCharakter[]): RomanCharakter[] {
  return list.map((c) => ({
    ...emptyCharakter(),
    ...c,
    wesenszuege: c.wesenszuege ?? "",
    bogen: c.bogen ?? "",
  }));
}

export function RomanCharakterePanel({
  ideeKurz,
  value,
  onChange,
  canSave,
  disabled,
  savePending,
  onSave,
}: {
  ideeKurz: string;
  value: RomanCharakter[];
  onChange: (next: RomanCharakter[]) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
}) {
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const list = value.length ? normalizeList(value) : [emptyCharakter()];
  const hasIdee = ideeKurz.trim().length >= 40;
  const busy = Boolean(disabled || savePending);

  function patchAt(index: number, partial: Partial<RomanCharakter>) {
    const next = list.map((c, i) => (i === index ? { ...c, ...partial } : c));
    onChange(next);
  }

  function addCharakter() {
    if (!canSave || busy) return;
    if (list.length >= 40) {
      toast.message("Maximal 40 Charaktere.");
      return;
    }
    onChange([...list, emptyCharakter()]);
  }

  function confirmRemove() {
    if (deleteIndex == null) return;
    const next = list.filter((_, i) => i !== deleteIndex);
    onChange(next.length ? next : [emptyCharakter()]);
    setDeleteIndex(null);
  }

  const deleteTarget = deleteIndex != null ? list[deleteIndex] : null;
  const deleteLabel =
    deleteTarget?.name.trim() ||
    deleteTarget?.rolle.trim() ||
    `Figur ${(deleteIndex ?? 0) + 1}`;

  return (
    <div className="space-y-5">
      <ConfirmDeleteDialog
        open={deleteIndex != null}
        title="Charakter entfernen?"
        description={`„${deleteLabel}“ wird aus der Liste entfernt. Speichern erst mit „Charaktere speichern“.`}
        confirmLabel="Entfernen"
        onCancel={() => setDeleteIndex(null)}
        onConfirm={confirmRemove}
      />

      {!hasIdee ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für die Pipeline brauchst du zuerst eine Ideendokumentation (Schritt
          Idee).
        </p>
      ) : null}

      <div className="space-y-6">
        {list.map((char, index) => (
          <article
            key={index}
            className="space-y-4 rounded-3xl bg-zinc-50/80 p-4 ring-1 ring-zinc-950/10 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-zinc-950">
                {char.name.trim() || char.rolle.trim() || `Figur ${index + 1}`}
              </h3>
              <button
                type="button"
                disabled={!canSave || busy || list.length <= 1}
                onClick={() => setDeleteIndex(index)}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-red-800 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40"
              >
                Entfernen
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <label
                  key={field.key}
                  className={cn(
                    "block",
                    field.multiline ? "sm:col-span-2" : undefined,
                  )}
                >
                  <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    {field.label}
                  </span>
                  {field.multiline ? (
                    <textarea
                      value={char[field.key]}
                      onChange={(e) =>
                        patchAt(index, { [field.key]: e.target.value })
                      }
                      disabled={!canSave || busy}
                      rows={field.rows ?? 3}
                      className={textareaClass}
                    />
                  ) : (
                    <input
                      value={char[field.key]}
                      onChange={(e) =>
                        patchAt(index, { [field.key]: e.target.value })
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  )}
                </label>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={addCharakter}
          className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white disabled:opacity-50"
        >
          Charakter hinzufügen
        </button>
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={onSave}
          className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {savePending ? "Speichern …" : "Charaktere speichern"}
        </button>
      </div>
    </div>
  );
}
