"use client";

/**
 * World/setup panel: manual edit + save (vertical pipeline owns KI).
 */

import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";
const textareaClass = `${inputClass} min-h-[10rem]`;

export type WeltBasics = {
  weltSchauplaetze: string;
  weltRegeln: string;
};

export function RomanWeltPanel({
  ideeKurz,
  value,
  onChange,
  canSave,
  disabled,
  savePending,
  onSave,
}: {
  ideeKurz: string;
  value: WeltBasics;
  onChange: (next: WeltBasics) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
}) {
  const hasIdee = ideeKurz.trim().length >= 40;
  const busy = Boolean(disabled || savePending);

  function patch(partial: Partial<WeltBasics>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="space-y-5">
      {!hasIdee ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für die Pipeline brauchst du zuerst eine Ideendokumentation (Schritt
          Idee).
        </p>
      ) : null}

      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Schauplätze / Setup
          </span>
          <textarea
            value={value.weltSchauplaetze}
            onChange={(e) => patch({ weltSchauplaetze: e.target.value })}
            disabled={!canSave || busy}
            rows={8}
            className={textareaClass}
            placeholder="Orte, Atmosphäre, Setup …"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Regeln &amp; Grenzen
          </span>
          <textarea
            value={value.weltRegeln}
            onChange={(e) => patch({ weltRegeln: e.target.value })}
            disabled={!canSave || busy}
            rows={8}
            className={textareaClass}
            placeholder="Weltregeln, Genre-Logik, Tabus, Grenzen …"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={onSave}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {savePending ? "Speichern …" : "Welt speichern"}
        </button>
      </div>
    </div>
  );
}
