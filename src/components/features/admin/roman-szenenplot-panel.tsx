"use client";

/**
 * Kapitelgerüst panel: markdown mirror + structured scene summary.
 * Structured JSON lives in `editorial.szenenplotStructured` (Erzeugen);
 * markdown in `manuskriptRaw` for edit/save.
 */

import { countWords, formatWordCount } from "@/lib/roman/editorial";
import type { RomanSzenenplotStructured } from "@/lib/roman/szenenplot-structured";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 font-sans";
const textareaClass = `${inputClass} min-h-[16rem]`;

export function RomanSzenenplotPanel({
  hasExpose,
  value,
  onChange,
  structured,
  canSave,
  disabled,
  savePending,
  onSave,
}: {
  hasExpose: boolean;
  value: string;
  onChange: (next: string) => void;
  structured?: RomanSzenenplotStructured | null;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
}) {
  const busy = Boolean(disabled || savePending);
  const sceneTotal =
    structured?.chapters.reduce((n, c) => n + c.scenes.length, 0) ?? 0;

  return (
    <div className="space-y-5">
      {!hasExpose ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für das Kapitelgerüst brauchst du zuerst einen Spec (Idee + Figuren /
          Welt / Exposé unter „Spec“).
        </p>
      ) : null}

      {structured && structured.chapters.length > 0 ? (
        <div className="space-y-3 rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/10">
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Strukturierter Szenenplot · {structured.chapters.length} Kap. /{" "}
            {sceneTotal} Szenen
            {structured.modelLabel ? ` · ${structured.modelLabel}` : ""}
          </p>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm font-semibold text-zinc-800">
            {structured.chapters.map((ch) => (
              <li key={ch.number}>
                <span className="text-zinc-950">
                  Kap. {ch.number} — {ch.title}
                </span>
                <span className="text-zinc-500">
                  {" "}
                  · {ch.scenes.length} Szene
                  {ch.scenes.length === 1 ? "" : "n"}
                </span>
                {ch.scenes.length > 0 ? (
                  <ul className="mt-1 ml-3 list-disc space-y-0.5 text-xs font-semibold text-zinc-600">
                    {ch.scenes.map((s) => (
                      <li key={s.scene_id}>
                        {s.scene_id}: {s.heading}
                        {s.dramaturgy.outcome_value_change
                          ? ` → ${s.dramaturgy.outcome_value_change.slice(0, 80)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs font-semibold text-zinc-500">
            Dramaturgie, Informationsfluss und Continuity stecken im JSON
            (Datenbank). Manuskript-Erzeugen liest diese Szenen verbindlich.
            Freitext unten ist die lesbare Spiegelung — nach Handedit bitte
            erneut Erzeugen, damit JSON und Text wieder synchron sind.
          </p>
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          Kapitelgerüst · Markdown-Spiegel
        </span>
        <textarea
          id="roman-szenenplot-editor"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canSave || busy}
          rows={22}
          className={textareaClass}
          placeholder={
            "## Kapitel 1 — Kurztitel\nKernsatz: …\n\n### SZ_01 — INT. ORT - ZEIT\n…"
          }
        />
        <p className="mt-1.5 text-xs font-semibold text-zinc-500">
          {formatWordCount(countWords(value))} Wörter · Pro Kapitel N Szenen
          mit Ziel, Hindernis, Wendepunkt und Wertänderung. Persistiert als
          Markdown (`manuskript_raw`) plus strukturiertes JSON im Editorial.
        </p>
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
          {savePending ? "Speichern …" : "Kapitelgerüst speichern"}
        </button>
      </div>
    </div>
  );
}
