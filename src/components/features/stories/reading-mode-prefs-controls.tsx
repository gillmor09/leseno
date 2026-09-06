"use client";

/**
 * Shared ± controls for Lesemodus typography (overlay + Meine Welt).
 */

import { Minus, Plus } from "lucide-react";
import {
  normalizeReadingModePrefs,
  nudgeStep,
  READING_MODE_FONT_STEPS,
  READING_MODE_LETTER_STEPS,
  READING_MODE_LINE_STEPS,
  READING_MODE_WEIGHT_STEPS,
  READING_MODE_WIDTH_STEPS,
  readingModeWeightLabel,
  readingModeWidthLabel,
  type ReadingModePrefs,
} from "@/lib/stories/reading-mode-prefs";

/**
 * Renders Schriftgröße / -stärke / Abstände / Spaltenbreite steppers.
 */
export function ReadingModePrefsControls({
  prefs,
  onChange,
}: {
  prefs: ReadingModePrefs;
  onChange: (next: ReadingModePrefs) => void;
}) {
  function patch(partial: Partial<ReadingModePrefs>) {
    onChange(normalizeReadingModePrefs({ ...prefs, ...partial }));
  }

  return (
    <div>
      <ReadingPrefRow
        label="Schriftgröße"
        onDecrease={() =>
          patch({
            fontScale: nudgeStep(prefs.fontScale, READING_MODE_FONT_STEPS, -1),
          })
        }
        onIncrease={() =>
          patch({
            fontScale: nudgeStep(prefs.fontScale, READING_MODE_FONT_STEPS, 1),
          })
        }
        valueLabel={`${Math.round(prefs.fontScale * 100)} %`}
      />
      <ReadingPrefRow
        label="Schriftstärke"
        onDecrease={() =>
          patch({
            fontWeight: nudgeStep(
              prefs.fontWeight,
              READING_MODE_WEIGHT_STEPS,
              -1,
            ),
          })
        }
        onIncrease={() =>
          patch({
            fontWeight: nudgeStep(
              prefs.fontWeight,
              READING_MODE_WEIGHT_STEPS,
              1,
            ),
          })
        }
        valueLabel={readingModeWeightLabel(prefs.fontWeight)}
      />
      <ReadingPrefRow
        label="Zeilenabstand"
        onDecrease={() =>
          patch({
            lineHeight: nudgeStep(prefs.lineHeight, READING_MODE_LINE_STEPS, -1),
          })
        }
        onIncrease={() =>
          patch({
            lineHeight: nudgeStep(prefs.lineHeight, READING_MODE_LINE_STEPS, 1),
          })
        }
        valueLabel={prefs.lineHeight.toFixed(2).replace(".", ",")}
      />
      <ReadingPrefRow
        label="Zeichenabstand"
        onDecrease={() =>
          patch({
            letterSpacingEm: nudgeStep(
              prefs.letterSpacingEm,
              READING_MODE_LETTER_STEPS,
              -1,
            ),
          })
        }
        onIncrease={() =>
          patch({
            letterSpacingEm: nudgeStep(
              prefs.letterSpacingEm,
              READING_MODE_LETTER_STEPS,
              1,
            ),
          })
        }
        valueLabel={
          prefs.letterSpacingEm === 0
            ? "Normal"
            : `+${prefs.letterSpacingEm.toFixed(2).replace(".", ",")} em`
        }
      />
      <ReadingPrefRow
        label="Spaltenbreite"
        onDecrease={() =>
          patch({
            contentMaxWidthRem: nudgeStep(
              prefs.contentMaxWidthRem,
              READING_MODE_WIDTH_STEPS,
              -1,
            ),
          })
        }
        onIncrease={() =>
          patch({
            contentMaxWidthRem: nudgeStep(
              prefs.contentMaxWidthRem,
              READING_MODE_WIDTH_STEPS,
              1,
            ),
          })
        }
        valueLabel={readingModeWidthLabel(prefs.contentMaxWidthRem)}
      />
    </div>
  );
}

function ReadingPrefRow({
  label,
  valueLabel,
  onDecrease,
  onIncrease,
}: {
  label: string;
  valueLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDecrease}
          className="inline-flex size-10 items-center justify-center rounded-full bg-gray-100 text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200"
          aria-label={`${label} verringern`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="min-w-[4.5rem] text-center text-sm font-extrabold tabular-nums text-zinc-950">
          {valueLabel}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          className="inline-flex size-10 items-center justify-center rounded-full bg-gray-100 text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200"
          aria-label={`${label} erhöhen`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
