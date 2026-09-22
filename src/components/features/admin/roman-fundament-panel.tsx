"use client";

/**
 * Basics fields: genre, title, age, length, optional Richtungen, Basis-Regeln.
 * Clever: Themen-Haltung (Stance) on book level.
 * Basis-Regeln are auto-filled from the selected fields (standard presets).
 */

import { useEffect, useMemo, useRef } from "react";
import {
  ROMAN_ALTER_PRESETS,
  ROMAN_BUCHLAENGE_OPTIONS,
  ROMAN_RICHTUNG_MAX,
  ROMAN_RICHTUNG_OPTIONS,
  buildBasisRegeln,
  findAlterPresetId,
  genreOptionsForBuchTyp,
  nearestBuchlaengeWords,
  normalizeRichtungen,
  type RomanBuchTyp,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  CLEVER_STANCE_ARCHETYPES,
  buildCleverThemaStanceForThema,
  formatStanceListText,
  parseStanceListText,
  stanceFromArchetype,
  type CleverSensibilisierungsModus,
  type CleverStanceArchetype,
  type CleverThemaStance,
} from "@/lib/roman/clever-thema-stance";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";
const textareaClass = `${inputClass} font-sans min-h-[12rem] resize-none overflow-hidden`;
const listTextareaClass = `${inputClass} font-sans min-h-[5.5rem] resize-y`;

export type FundamentBasics = {
  title: string;
  genre: string;
  alterPresetId: string;
  zielWortzahlRoman: number | "";
  richtungen: string[];
  grobRegeln: string;
  /** Clever only — book-level Themen-Stance. */
  cleverThemaStance: CleverThemaStance | null;
};

export function fundamentBasicsFromState(input: {
  title: string;
  genre: string;
  editorial: RomanEditorial;
}): FundamentBasics {
  const length = nearestBuchlaengeWords(input.editorial.zielWortzahlRoman);
  const alterPresetId = findAlterPresetId(input.editorial);
  const zielWortzahlRoman: number | "" = length === "" ? "" : length;
  const richtungen = normalizeRichtungen(input.editorial.richtungen);
  const stored = (input.editorial.grobRegeln ?? "").trim();
  const generated = buildBasisRegeln({
    buchTyp: input.editorial.buchTyp,
    genre: input.genre,
    alterPresetId,
    zielWortzahlRoman,
    richtungen,
  });
  const isClever = input.editorial.buchTyp === "clever_erzaehlt";
  const stance =
    input.editorial.cleverThemaStance ??
    (isClever && input.genre.trim()
      ? buildCleverThemaStanceForThema(input.genre)
      : null);
  return {
    title: input.title,
    genre: input.genre,
    alterPresetId,
    zielWortzahlRoman,
    richtungen,
    grobRegeln: stored || generated,
    cleverThemaStance: isClever ? stance : null,
  };
}

/** @deprecated Prefer import from `@/lib/roman/editorial`. */
export { applyAlterPresetToEditorial } from "@/lib/roman/editorial";

export function RomanFundamentPanel({
  buchTyp,
  value,
  onChange,
  canSave,
  disabled,
  savePending,
  onSave,
  mode,
  showRichtungen = true,
}: {
  buchTyp: RomanBuchTyp;
  value: FundamentBasics;
  onChange: (next: FundamentBasics) => void;
  canSave: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave: () => void;
  /** fields = selects + Speichern; rules-save = Basis-Regeln only */
  mode: "fields" | "rules-save";
  /** Optional reader-promise chips (hidden for Clever erzählt). */
  showRichtungen?: boolean;
}) {
  const genres = useMemo(() => genreOptionsForBuchTyp(buchTyp), [buchTyp]);
  const busy = Boolean(disabled || savePending);
  const prevBuchTyp = useRef(buchTyp);
  const grobRegelnRef = useRef<HTMLTextAreaElement>(null);
  const showFields = mode === "fields";
  const showRules = mode === "rules-save";
  const showSave = mode === "fields";
  const isClever = buchTyp === "clever_erzaehlt";
  const stance = value.cleverThemaStance;

  const genreOptions = useMemo(() => {
    if (value.genre && !genres.includes(value.genre)) {
      return [value.genre, ...genres];
    }
    return [...genres];
  }, [genres, value.genre]);

  useEffect(() => {
    if (!showFields) return;
    if (prevBuchTyp.current === buchTyp) return;
    prevBuchTyp.current = buchTyp;
    onChange(
      withAutoBasisRegeln({
        ...value,
        genre: value.genre,
        cleverThemaStance:
          buchTyp === "clever_erzaehlt"
            ? value.cleverThemaStance ??
              (value.genre.trim()
                ? buildCleverThemaStanceForThema(value.genre)
                : null)
            : null,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to buchTyp switches
  }, [buchTyp, showFields]);

  /** Grow Basis-Regeln textarea so the full text is visible without a scrollbar. */
  useEffect(() => {
    if (!showRules) return;
    const el = grobRegelnRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 192)}px`;
  }, [value.grobRegeln, showRules]);

  function withAutoBasisRegeln(next: FundamentBasics): FundamentBasics {
    const richtungen = showRichtungen ? next.richtungen : [];
    return {
      ...next,
      richtungen,
      grobRegeln: buildBasisRegeln({
        buchTyp,
        genre: next.genre,
        alterPresetId: next.alterPresetId,
        zielWortzahlRoman: next.zielWortzahlRoman,
        richtungen,
      }),
    };
  }

  function patch(partial: Partial<FundamentBasics>, autoBasis = false) {
    const next = { ...value, ...partial };
    onChange(autoBasis ? withAutoBasisRegeln(next) : next);
  }

  function patchStance(partial: Partial<CleverThemaStance>) {
    if (!stance) return;
    patch({ cleverThemaStance: { ...stance, ...partial } });
  }

  function onArchetypeChange(archetype: CleverStanceArchetype) {
    patch({ cleverThemaStance: stanceFromArchetype(archetype) });
  }

  function onAlterChange(alterPresetId: string) {
    const preset = ROMAN_ALTER_PRESETS.find((p) => p.id === alterPresetId);
    const nextLength =
      value.zielWortzahlRoman === "" && preset?.apply.zielWortzahlRoman
        ? nearestBuchlaengeWords(preset.apply.zielWortzahlRoman)
        : value.zielWortzahlRoman;
    patch(
      {
        alterPresetId,
        zielWortzahlRoman:
          nextLength === "" ? value.zielWortzahlRoman : nextLength,
      },
      true,
    );
  }

  function toggleRichtung(id: string) {
    const current = normalizeRichtungen(value.richtungen);
    const has = current.includes(id);
    let next: string[];
    if (has) {
      next = current.filter((x) => x !== id);
    } else if (current.length >= ROMAN_RICHTUNG_MAX) {
      next = [...current.slice(1), id];
    } else {
      next = [...current, id];
    }
    patch({ richtungen: next }, true);
  }

  return (
    <div className="space-y-5">
      {showFields ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Titel
            </span>
            <input
              value={value.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={!canSave || busy}
              className={inputClass}
              placeholder="Arbeitstitel"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              {isClever ? "Thema" : "Genre"}
            </span>
            <select
              value={value.genre}
              onChange={(e) => patch({ genre: e.target.value }, true)}
              disabled={!canSave || busy}
              className={inputClass}
            >
              <option value="">— wählen —</option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Altersgruppe
            </span>
            <select
              value={value.alterPresetId}
              onChange={(e) => onAlterChange(e.target.value)}
              disabled={!canSave || busy}
              className={inputClass}
            >
              <option value="">— wählen —</option>
              {ROMAN_ALTER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Buchlänge
            </span>
            <select
              value={
                value.zielWortzahlRoman === ""
                  ? ""
                  : String(value.zielWortzahlRoman)
              }
              onChange={(e) => {
                const v = e.target.value;
                patch(
                  {
                    zielWortzahlRoman: v ? Number(v) : "",
                  },
                  true,
                );
              }}
              disabled={!canSave || busy}
              className={inputClass}
            >
              <option value="">— wählen —</option>
              {ROMAN_BUCHLAENGE_OPTIONS.map((o) => (
                <option key={o.words} value={o.words}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {showRichtungen ? (
            <div className="sm:col-span-2 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Richtung (optional)
                </span>
                <span className="text-xs font-semibold text-zinc-500">
                  Max. {ROMAN_RICHTUNG_MAX} · leer = keine Extra-Vorgabe
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROMAN_RICHTUNG_OPTIONS.map((opt) => {
                  const selected = value.richtungen.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!canSave || busy}
                      title={opt.hint}
                      onClick={() => toggleRichtung(opt.id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition",
                        selected
                          ? "bg-orange-700 text-white ring-orange-700"
                          : "bg-white text-zinc-700 ring-zinc-950/10 hover:bg-zinc-50",
                        (!canSave || busy) && "opacity-60",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs font-semibold text-zinc-500">
                Wenn gesetzt: verbindliches Leserversprechen für Ton und
                Buchverlauf (auch Marktanalyse).
              </p>
            </div>
          ) : null}

          {isClever && stance ? (
            <div className="sm:col-span-2 space-y-4 rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/8">
              <div>
                <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Themen-Haltung
                </p>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  Steuert Ton für Unterthemen, Fakten und Geschichten —
                  Abenteuer bleibt, Sensibilisierung ohne Zeigefinger.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Archetyp
                </span>
                <select
                  value={stance.archetype}
                  onChange={(e) =>
                    onArchetypeChange(
                      e.target.value as CleverStanceArchetype,
                    )
                  }
                  disabled={!canSave || busy}
                  className={inputClass}
                >
                  {CLEVER_STANCE_ARCHETYPES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs font-semibold text-zinc-500">
                  {
                    CLEVER_STANCE_ARCHETYPES.find(
                      (a) => a.id === stance.archetype,
                    )?.help
                  }
                </p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Kind-Motiv (würdigen)
                </span>
                <input
                  value={stance.kindMotiv}
                  onChange={(e) => patchStance({ kindMotiv: e.target.value })}
                  disabled={!canSave || busy}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Orientierungsziel
                </span>
                <input
                  value={stance.orientierungsZiel}
                  onChange={(e) =>
                    patchStance({ orientierungsZiel: e.target.value })
                  }
                  disabled={!canSave || busy}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Sensibilisierung
                </span>
                <select
                  value={stance.sensibilisierungsModus}
                  onChange={(e) =>
                    patchStance({
                      sensibilisierungsModus: e.target
                        .value as CleverSensibilisierungsModus,
                    })
                  }
                  disabled={!canSave || busy}
                  className={inputClass}
                >
                  <option value="erleben">Im Abenteuer erleben</option>
                  <option value="mitgeben">Freundlich mitgeben</option>
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Darf
                  </span>
                  <textarea
                    value={formatStanceListText(stance.darf)}
                    onChange={(e) =>
                      patchStance({
                        darf: parseStanceListText(e.target.value),
                      })
                    }
                    disabled={!canSave || busy}
                    className={listTextareaClass}
                    rows={4}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Muss nicht
                  </span>
                  <textarea
                    value={formatStanceListText(stance.mussNicht)}
                    onChange={(e) =>
                      patchStance({
                        mussNicht: parseStanceListText(e.target.value),
                      })
                    }
                    disabled={!canSave || busy}
                    className={listTextareaClass}
                    rows={4}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                    Rotlinien
                  </span>
                  <textarea
                    value={formatStanceListText(stance.rotlinien)}
                    onChange={(e) =>
                      patchStance({
                        rotlinien: parseStanceListText(e.target.value),
                      })
                    }
                    disabled={!canSave || busy}
                    className={listTextareaClass}
                    rows={4}
                  />
                </label>
              </div>
              <p className="text-[11px] font-semibold text-zinc-500">
                Listen: eine Zeile pro Punkt. Archetyp wechseln setzt die
                Vorlagen neu.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {showSave ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={onSave}
            className={cn(
              "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
            )}
          >
            {savePending ? "Speichern …" : "Speichern"}
          </button>
        </div>
      ) : null}

      {showRules ? (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Basis-Regeln
            </span>
            <textarea
              ref={grobRegelnRef}
              value={value.grobRegeln}
              onChange={(e) => patch({ grobRegeln: e.target.value })}
              disabled={!canSave || busy}
              className={textareaClass}
              rows={8}
            />
          </label>
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={onSave}
            className={cn(
              "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
            )}
          >
            {savePending ? "Speichern …" : "Speichern"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
