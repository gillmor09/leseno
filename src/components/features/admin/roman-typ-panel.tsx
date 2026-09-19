"use client";

/**
 * Basics step: Belletristik vs Sachbuch; fields live on the same tab.
 */

import { BUCHTYP_HINTS, BUCHTYP_LABELS, type RomanBuchTyp } from "@/lib/roman/editorial";
import { cn } from "@/lib/utils";

const CHOICES = ["belletristik", "sachbuch"] as const;

export function RomanTypPanel({
  buchTyp,
  onSelect,
  disabled,
}: {
  buchTyp: RomanBuchTyp;
  onSelect: (typ: "belletristik" | "sachbuch") => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-zinc-600">
        Wähle den Buchtyp. Darunter legst du Titel, Genre, Alter und
        Basis-Regeln fest.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CHOICES.map((typ) => {
          const selected = buchTyp === typ;
          return (
            <button
              key={typ}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(typ)}
              className={cn(
                "rounded-2xl px-4 py-4 text-left ring-1 transition",
                selected
                  ? "bg-orange-50 ring-orange-300"
                  : "bg-zinc-50 ring-zinc-950/8 hover:bg-white",
                disabled && "opacity-70",
              )}
            >
              <p className="text-sm font-extrabold text-zinc-950">
                {typ === "belletristik" ? "Belletristik" : BUCHTYP_LABELS[typ]}
              </p>
              <p className="mt-2 text-xs font-semibold text-zinc-600">
                {BUCHTYP_HINTS[typ]}
              </p>
            </button>
          );
        })}
      </div>
      {buchTyp === "serie_welt" ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-200">
          Bisher „Serie / Weltbau“ — bitte Belletristik oder Sachbuch wählen und
          speichern.
        </p>
      ) : null}
    </div>
  );
}
