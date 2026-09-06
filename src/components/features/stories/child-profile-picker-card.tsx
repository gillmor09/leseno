"use client";

/**
 * Story composer card: freies Lesen (default) or a child profile.
 * With a profile selected: shows length/mood defaults + link to edit them.
 */

import { Users, Lock } from "lucide-react";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

type ChildProfilePickerCardProps = {
  profiles: ChildProfileOption[];
  /** `null` = Freies lesen (no profile). */
  selectedId: string | null;
  /** Profile ids currently unlocked (or without PIN). */
  unlockedIds?: ReadonlySet<string>;
  onSelect: (profileId: string | null) => void;
  disabled?: boolean;
  /** Current length label when a profile is selected. */
  lengthLabel?: string | null;
  /** Current mood label when a profile is selected. */
  moodLabel?: string | null;
  /** Whether length/mood editors below are expanded. */
  lengthMoodOpen?: boolean;
  onToggleLengthMood?: () => void;
};

/**
 * Own card above the topic section on signed-in story pages.
 */
export function ChildProfilePickerCard({
  profiles,
  selectedId,
  unlockedIds,
  onSelect,
  disabled = false,
  lengthLabel = null,
  moodLabel = null,
  lengthMoodOpen = false,
  onToggleLengthMood,
}: ChildProfilePickerCardProps) {
  if (profiles.length === 0) {
    return (
      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
            <Users className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Für wen?
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
              Noch kein Kinder-Profil
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Lege in{" "}
              <a
                href="/meine-welt"
                className="font-bold text-orange-800 underline-offset-2 hover:underline"
              >
                Meine Welt
              </a>{" "}
              ein Profil an — dann kannst du mit dem Namen eine persönliche
              Geschichte starten.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const freeReading = selectedId === null;
  const showLengthMoodHint =
    !freeReading && Boolean(lengthLabel && moodLabel && onToggleLengthMood);

  return (
    <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
          <Users className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Für wen?
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
            Leser auswählen
          </h2>

          <div
            role="tablist"
            aria-label="Leser"
            className="mt-4 flex flex-wrap gap-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={freeReading}
              disabled={disabled}
              onClick={() => onSelect(null)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out disabled:opacity-50",
                freeReading
                  ? "bg-yellow-400 text-zinc-950 ring-1 ring-yellow-400"
                  : "bg-gray-100 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-white",
              )}
            >
              Freies lesen
            </button>
            {profiles.map((profile) => {
              const selected = selectedId === profile.id;
              const locked =
                profile.hasPin && !(unlockedIds?.has(profile.id) ?? false);
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => onSelect(profile.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ease-in-out disabled:opacity-50",
                    selected
                      ? "bg-yellow-400 text-zinc-950 ring-1 ring-yellow-400"
                      : "bg-gray-100 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  {locked ? <Lock className="size-3.5" aria-hidden /> : null}
                  {profile.displayName}
                  {profile.isDefault ? " · Standard" : ""}
                </button>
              );
            })}
          </div>

          {showLengthMoodHint ? (
            <div className="mt-4 border-t border-zinc-950/10 pt-4">
              <p className="text-sm leading-relaxed text-zinc-600">
                Textlänge & Art:{" "}
                <span className="font-extrabold text-zinc-950">
                  {lengthLabel}
                </span>
                {" · "}
                <span className="font-extrabold text-zinc-950">{moodLabel}</span>
                <span className="text-zinc-500"> (aus dem Profil)</span>
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={onToggleLengthMood}
                className="mt-2 text-sm font-bold text-orange-800 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {lengthMoodOpen
                  ? "Auswahl einklappen"
                  : "Textlänge oder Art ändern"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
