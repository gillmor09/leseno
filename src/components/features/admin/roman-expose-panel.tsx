"use client";

/**
 * Exposé panel: manual edit + save (stage KI via Erzeugen/Verbessern).
 */

import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";
const textareaClass = `${inputClass} min-h-[14rem]`;

export function RomanExposePanel({
  ideeKurz,
  value,
  onChange,
  canSave,
  disabled,
  savePending,
  onSave,
}: {
  ideeKurz: string;
  value: string;
  onChange: (next: string) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
}) {
  const hasIdee = ideeKurz.trim().length >= 40;
  const busy = Boolean(disabled || savePending);

  return (
    <div className="space-y-5">
      {!hasIdee ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für die Pipeline brauchst du zuerst eine Ideendokumentation (Schritt
          Idee).
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Exposé · grobe Handlung
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canSave || busy}
          rows={16}
          className={textareaClass}
          placeholder={
            "## Anfang\n…\n\n## Mitte\n…\n\n## Ende\n…"
          }
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={onSave}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {savePending ? "Speichern …" : "Exposé speichern"}
        </button>
      </div>
    </div>
  );
}
