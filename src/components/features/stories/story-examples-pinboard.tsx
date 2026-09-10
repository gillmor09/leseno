/**
 * Pinboard of public story excerpts and Wissen facts — sticky-note collage.
 */

import type { PinboardPin } from "@/lib/stories/public-samples";
import { cn } from "@/lib/utils";

export function StoryExamplesPinboard({ pins }: { pins: PinboardPin[] }) {
  if (pins.length === 0) {
    return (
      <div className="rounded-[1.75rem] bg-[linear-gradient(145deg,#f5e6c8_0%,#e8d4a8_50%,#f0e0b8_100%)] px-6 py-16 text-center shadow-inner ring-1 ring-amber-900/10 sm:px-10">
        <p className="text-lg font-extrabold text-amber-950">
          Die Pinwand füllt sich noch
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-amber-950/80">
          Sobald Mitglieder Geschichten im Buchclub als „Öffentlich“ teilen,
          erscheinen hier Ausschnitte und Wissens-Häppchen — wie Post-its auf
          einer Pinnwand.
        </p>
        <a
          href="/kostenlos"
          className="mt-6 inline-flex rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
        >
          Selbst eine Geschichte starten
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(145deg,#f5e6c8_0%,#e8d4a8_45%,#decaa0_100%)] p-4 shadow-inner ring-1 ring-amber-900/15 sm:p-6 md:p-8"
      style={{
        backgroundImage:
          "radial-gradient(rgba(120,80,30,0.08) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {pins.map((pin, index) => (
          <li
            key={pin.id}
            className="relative"
            style={{
              transform: `translate(${pin.offsetX}px, ${pin.offsetY}px) rotate(${pin.rotateDeg}deg)`,
              zIndex: (index % 5) + 1,
            }}
          >
            <article
              className={cn(
                "relative rounded-sm px-4 pb-5 pt-6 shadow-lg ring-1 transition-transform duration-300 hover:z-20 hover:rotate-0 hover:scale-[1.02]",
                pin.colorClass,
              )}
            >
              <span
                aria-hidden
                className="absolute top-2 left-1/2 size-3 -translate-x-1/2 rounded-full bg-orange-700 shadow-sm ring-2 ring-orange-900/20"
              />
              <p className="text-[10px] font-extrabold tracking-wide text-orange-800 uppercase">
                {pin.kind === "fact" ? "Wissen" : "Geschichte"}
              </p>
              <h2 className="mt-1 text-base font-extrabold leading-snug text-zinc-950">
                {pin.title}
              </h2>
              {(pin.moodLabel || pin.basedOn) && (
                <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                  {[pin.moodLabel, pin.basedOn].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                {pin.body}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
