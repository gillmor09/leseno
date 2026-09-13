"use client";

/**
 * Numbered step cards for the roman admin pipeline —
 * task, effect, and save guidance in one place.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RomanSaveMode =
  | "none"
  | "kontext"
  | "eigen"
  | "auto"
  | "phase0";

const SAVE_HINT: Record<
  RomanSaveMode,
  { label: string; className: string; text: string } | null
> = {
  none: null,
  kontext: {
    label: "Kontext speichern",
    className: "bg-amber-100 text-amber-950 ring-amber-200",
    text: "Felder ändern sich nur lokal, bis du „Kontext speichern“ drückst (oder Phase 0, die vorher speichert).",
  },
  eigen: {
    label: "Eigener Speichern-Button",
    className: "bg-sky-100 text-sky-950 ring-sky-200",
    text: "Hat einen eigenen Speichern-Button — landet nicht im allgemeinen Kontext-Speichern.",
  },
  auto: {
    label: "Wird automatisch gespeichert",
    className: "bg-emerald-100 text-emerald-950 ring-emerald-200",
    text: "Ergebnis wird von der Aktion selbst in die Datenbank geschrieben.",
  },
  phase0: {
    label: "Speichert + erzeugt Roadmap",
    className: "bg-orange-100 text-orange-950 ring-orange-200",
    text: "Phase 0 speichert den aktuellen Kontext und legt danach die Szenen-Roadmap neu an.",
  },
};

/**
 * One numbered pipeline step: task, side effects, save rule, content.
 */
export function RomanStepCard({
  id,
  step,
  title,
  task,
  effect,
  save = "none",
  children,
  footer,
  className,
}: {
  id?: string;
  step: number | string;
  title: string;
  /** What the user should do in this step. */
  task: string;
  /** What the step / buttons change in the pipeline. */
  effect: string;
  save?: RomanSaveMode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const saveMeta = SAVE_HINT[save];

  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6",
        className,
      )}
    >
      <header className="space-y-3 border-b border-zinc-100 pb-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-700 text-sm font-extrabold text-white">
            {step}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-zinc-950">{title}</h2>
            {saveMeta ? (
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide uppercase ring-1",
                  saveMeta.className,
                )}
              >
                {saveMeta.label}
              </span>
            ) : null}
          </div>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-950/8">
            <dt className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Deine Aufgabe
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800">{task}</dd>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-950/8">
            <dt className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Wirkung
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800">{effect}</dd>
          </div>
        </dl>

        {saveMeta ? (
          <p className="text-xs font-semibold text-zinc-500">{saveMeta.text}</p>
        ) : null}
      </header>

      <div className="space-y-4">{children}</div>

      {footer ? (
        <footer className="border-t border-zinc-100 pt-4">{footer}</footer>
      ) : null}
    </section>
  );
}

/** Compact callout for a single action button. */
export function RomanActionNote({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "warn" | "ok";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-2.5 text-xs font-semibold leading-relaxed ring-1",
        tone === "warn" && "bg-amber-50 text-amber-950 ring-amber-200",
        tone === "ok" && "bg-emerald-50 text-emerald-950 ring-emerald-200",
        tone === "neutral" && "bg-zinc-50 text-zinc-700 ring-zinc-950/8",
      )}
    >
      <p className="font-extrabold tracking-wide uppercase">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Top-of-page legend: how saving works across the roman admin. */
export function RomanSaveLegend() {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-orange-50 to-white p-5 ring-1 ring-orange-200/80 sm:p-6">
      <h2 className="text-lg font-extrabold text-zinc-950">
        So arbeitest du hier
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-semibold text-zinc-700">
        <li>
          Schritte 1–5 ausfüllen (Idee, Fundament, Regeln, Umfang, Outline).
        </li>
        <li>
          <strong className="font-extrabold text-zinc-950">Kontext speichern</strong>{" "}
          — schreibt Titel, Fundament, Regeln, Umfang, Outline und Fan-Persona
          in die Datenbank. Ohne Speichern gehen Formular-Änderungen beim
          Neuladen verloren.
        </li>
        <li>
          <strong className="font-extrabold text-zinc-950">Phase 0</strong> —
          speichert zuerst denselben Kontext, löscht dann alle{" "}
          <em>nicht fertigen</em> Szenen und erzeugt eine neue Roadmap aus
          Outline/Fundament.
        </li>
        <li>
          Cover, Vorsatz und Ideen-Chat haben <strong>eigene</strong>{" "}
          Speichern-Buttons.
        </li>
        <li>
          Phase 1–3 schreibt Szenen-Text automatisch; PDF/EPUB sind nur Export.
        </li>
      </ol>
    </section>
  );
}

/** Shared primary save control for context steps. */
export function RomanKontextSaveBar({
  onSave,
  disabled,
  pending,
  note,
}: {
  onSave: () => void;
  disabled?: boolean;
  pending?: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onSave}
        className={cn(
          "rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800",
          (disabled || pending) && "opacity-70",
        )}
      >
        {pending ? "Speichern …" : "Kontext speichern"}
      </button>
      <p className="text-xs font-semibold text-zinc-500">
        {note ??
          "Schreibt Fundament, Regeln, Umfang, Outline und Fan-Persona in die DB."}
      </p>
    </div>
  );
}
