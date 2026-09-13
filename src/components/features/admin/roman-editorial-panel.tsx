"use client";

/**
 * Publisher controls on the roman admin page:
 * pipeline stages, length/age/series, hard rules, validation checklist.
 */

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { generateRomanMehrteilerAdviceAction, generateRomanHarteRegelnAction } from "@/app/actions/roman-admin";
import {
  MEHRTEILER_FORM_LABELS,
  ROMAN_ALTER_PRESETS,
  ROMAN_GENRE_RULE_PRESETS,
  countWords,
  formatWordCount,
  type RomanEditorial,
  type RomanMehrteilerForm,
  type RomanValidationItem,
} from "@/lib/roman/editorial";
import type {
  RomanCharakter,
  RomanSzenenRasterItem,
  Szene,
} from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";
const textareaClass = `${inputClass} font-sans`;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
      {children}
    </span>
  );
}

export const ROMAN_PIPELINE_STAGES = [
  { id: "idee", label: "1 Idee", href: "#roman-stage-idee" },
  { id: "fundament", label: "2 Fundament", href: "#roman-stage-fundament" },
  { id: "umfang", label: "3 Umfang", href: "#roman-stage-umfang" },
  { id: "regeln", label: "4 Regeln", href: "#roman-stage-regeln" },
  { id: "outline", label: "5 Outline", href: "#roman-stage-outline" },
  { id: "roadmap", label: "6 Roadmap", href: "#roman-stage-roadmap" },
  { id: "schreiben", label: "7 Schreiben", href: "#roman-stage-schreiben" },
  { id: "abschluss", label: "8 Abschluss", href: "#roman-stage-abschluss" },
] as const;

export function RomanPipelineNav({
  validation,
}: {
  validation: RomanValidationItem[];
}) {
  const byStage = useMemo(() => {
    const map = new Map<string, { ok: number; total: number }>();
    for (const item of validation) {
      const cur = map.get(item.stage) ?? { ok: 0, total: 0 };
      cur.total += 1;
      if (item.ok) cur.ok += 1;
      map.set(item.stage, cur);
    }
    return map;
  }, [validation]);

  return (
    <nav
      aria-label="Verlags-Pipeline"
      className="sticky top-0 z-20 -mx-1 overflow-x-auto rounded-3xl bg-white/95 px-3 py-3 shadow-sm ring-1 ring-zinc-950/10 backdrop-blur"
    >
      <ol className="flex min-w-max gap-1.5">
        {ROMAN_PIPELINE_STAGES.map((stage, i) => {
          const stats = byStage.get(stage.id);
          const done = stats && stats.total > 0 && stats.ok === stats.total;
          const partial = stats && stats.ok > 0 && !done;
          return (
            <li key={stage.id} className="flex items-center gap-1.5">
              {i > 0 ? (
                <span className="text-zinc-300" aria-hidden>
                  ·
                </span>
              ) : null}
              <a
                href={stage.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wide uppercase transition",
                  done && "bg-emerald-100 text-emerald-900",
                  partial && "bg-amber-100 text-amber-950",
                  !done && !partial && "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                )}
              >
                {stage.label}
                {stats ? (
                  <span className="ml-1 font-semibold normal-case tracking-normal opacity-70">
                    {stats.ok}/{stats.total}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function RomanValidationPanel({
  items,
}: {
  items: RomanValidationItem[];
}) {
  const okCount = items.filter((i) => i.ok).length;
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-zinc-950">
            Verlags-Checkliste
          </h2>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Orientierungshilfe — blockiert nichts. {okCount}/{items.length}{" "}
            Schwellen erreicht. Speichern bleibt immer möglich.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex gap-3 rounded-2xl px-3 py-2.5 ring-1",
              item.ok
                ? "bg-emerald-50/80 ring-emerald-200/80"
                : "bg-zinc-50 ring-zinc-950/8",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                item.ok
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-200 text-zinc-600",
              )}
              aria-hidden
            >
              {item.ok ? "✓" : "·"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-zinc-900">{item.label}</p>
              <p className="text-xs font-semibold text-zinc-500">{item.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RomanWordStats({
  szenen,
  editorial,
  manuskriptRaw,
}: {
  szenen: Szene[];
  editorial: RomanEditorial;
  manuskriptRaw: string;
}) {
  const revised = szenen
    .filter((s) => s.status === "COMPLETED")
    .reduce((sum, s) => sum + countWords(s.entwurfRevidiert), 0);
  const draft = szenen.reduce(
    (sum, s) => sum + countWords(s.entwurfRevidiert || s.entwurfRaw),
    0,
  );
  const outlineWords = countWords(manuskriptRaw);
  const target = editorial.zielWortzahlRoman;
  const pct =
    target && target > 0 ? Math.min(100, Math.round((revised / target) * 100)) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat
        label="Revidiert"
        value={`${formatWordCount(revised)} Wörter`}
        sub={
          target
            ? `Ziel ${formatWordCount(target)} · ${pct ?? 0}%`
            : "Kein Roman-Ziel gesetzt"
        }
      />
      <Stat
        label="Entwürfe gesamt"
        value={`${formatWordCount(draft)} Wörter`}
        sub={`${szenen.filter((s) => s.status === "COMPLETED").length}/${szenen.length || 0} Szenen fertig`}
      />
      <Stat
        label="Outline / Exposé"
        value={`${formatWordCount(outlineWords)} Wörter`}
        sub={
          editorial.zielWortzahlSzeneMin != null
            ? `Szene-Ziel ${editorial.zielWortzahlSzeneMin}–${editorial.zielWortzahlSzeneMax ?? "?"} Wörter`
            : "Szene-Ziel offen"
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-950/8">
      <p className="text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-base font-extrabold text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-zinc-500">{sub}</p>
    </div>
  );
}

export function RomanEditorialSection({
  editorial,
  onChange,
  canSave,
  busy,
  title,
  genre,
  praemisse,
  tonalitaet,
  perspektive = "",
  zeitform = "",
  stilbibel,
  kiRegelwerk,
  manuskriptRaw,
  charaktere,
  szenenRaster,
  parts = ["umfang", "regeln"],
  showHeadings = true,
}: {
  editorial: RomanEditorial;
  onChange: (next: RomanEditorial) => void;
  canSave: boolean;
  busy: boolean;
  title: string;
  genre: string;
  praemisse: string;
  tonalitaet: string;
  perspektive?: string;
  zeitform?: string;
  stilbibel: string;
  kiRegelwerk: string;
  manuskriptRaw: string;
  charaktere: RomanCharakter[];
  szenenRaster: RomanSzenenRasterItem[];
  parts?: Array<"umfang" | "regeln">;
  /** When false, omit inner H3s (parent StepCard already titles the block). */
  showHeadings?: boolean;
}) {
  const [advicePending, setAdvicePending] = useState(false);
  const [rulesPending, setRulesPending] = useState(false);
  const [alterPresetId, setAlterPresetId] = useState("");
  const [genrePresetId, setGenrePresetId] = useState("");
  const disabled = !canSave || busy;
  const showUmfang = parts.includes("umfang");
  const showRegeln = parts.includes("regeln");

  const alterHint =
    ROMAN_ALTER_PRESETS.find((p) => p.id === alterPresetId)?.hint ??
    "Vorgefertigte Verlags-Startwerte (Alter, Lesestufe, Wortzahl) — danach frei editierbar.";
  const genreHint =
    ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === genrePresetId)?.hint ??
    "Vorgefertigte harte Regeln je Genre — ersetzen die aktuelle Regelliste und sind danach editierbar.";

  function patch(partial: Partial<RomanEditorial>) {
    onChange({ ...editorial, ...partial });
  }

  function applyAlterPreset(id: string) {
    setAlterPresetId(id);
    if (!id) return;
    const preset = ROMAN_ALTER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onChange({ ...editorial, ...preset.apply });
    toast.success(`Alter/Umfang: ${preset.label} übernommen — bei Bedarf anpassen und speichern.`);
  }

  function applyGenrePreset(id: string) {
    setGenrePresetId(id);
    if (!id) return;
    const preset = ROMAN_GENRE_RULE_PRESETS.find((p) => p.id === id);
    if (!preset?.apply.harteRegeln) return;
    patch({ harteRegeln: [...preset.apply.harteRegeln] });
    toast.success(`Genre-Regeln: ${preset.label} eingefügt — bei Bedarf anpassen und speichern.`);
  }

  function setHarteRegelnText(text: string) {
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^[\s–\-•*]+/, "").trim())
      .filter(Boolean);
    patch({ harteRegeln: lines });
  }

  async function runSharpenRules() {
    if (!praemisse.trim() && !genre.trim() && !manuskriptRaw.trim()) {
      toast.error("Mindestens Prämisse, Genre oder Outline ausfüllen.");
      return;
    }
    setRulesPending(true);
    const result = await generateRomanHarteRegelnAction({
      title,
      genre,
      praemisse,
      tonalitaet,
      perspektive,
      zeitform,
      stilbibel,
      kiRegelwerk,
      manuskriptRaw,
      charaktere,
      szenenRaster,
      editorial,
      existingHarteRegeln: editorial.harteRegeln,
    });
    setRulesPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Harte Regeln erzeugen fehlgeschlagen.");
      return;
    }
    patch({ harteRegeln: result.data!.rules });
    toast.success(
      `Regeln geschärft (${result.data!.modelLabel}) — prüfen, dann Kontext speichern.`,
    );
  }

  async function runAdvice() {
    setAdvicePending(true);
    const result = await generateRomanMehrteilerAdviceAction({
      title,
      genre,
      praemisse,
      tonalitaet,
      stilbibel,
      kiRegelwerk,
      manuskriptRaw,
      charaktere,
      szenenRaster,
      editorial,
    });
    setAdvicePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Mehrteiler-Beratung fehlgeschlagen.");
      return;
    }
    patch({ mehrteilerBeratung: result.data!.advice });
    toast.success("Mehrteiler-Beratung erzeugt — bei Bedarf anpassen und Kontext speichern.");
  }

  return (
    <div className="space-y-6">
      {showUmfang ? (
      <div className="space-y-4">
        {showHeadings ? (
          <div>
            <h3 className="text-base font-extrabold text-zinc-950">
              Umfang, Zielalter & Serie
            </h3>
            <p className="mt-1 text-sm font-semibold text-zinc-600">
              Verbindlich für Outline, Roadmap und Szenen-Schreiben.
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-zinc-600">
            Werte steuern Sprache und Szenenlänge in allen späteren KI-Schritten.
          </p>
        )}

        <label className="block max-w-xl">
          <FieldLabel>Vorauswahl Alter / Umfang</FieldLabel>
          <select
            value={alterPresetId}
            disabled={disabled}
            onChange={(e) => applyAlterPreset(e.target.value)}
            className={inputClass}
          >
            <option value="">— manuell oder Preset wählen —</option>
            {ROMAN_ALTER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs font-semibold text-zinc-500">
            {alterHint} Quelle: feste Verlags-Presets in der App (kein KI-Output).
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <FieldLabel>Alter von</FieldLabel>
            <input
              type="number"
              min={0}
              max={120}
              value={editorial.zielAlterMin ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  zielAlterMin: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
              placeholder="8"
            />
          </label>
          <label className="block">
            <FieldLabel>Alter bis</FieldLabel>
            <input
              type="number"
              min={0}
              max={120}
              value={editorial.zielAlterMax ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  zielAlterMax: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
              placeholder="10"
            />
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel>Lesestufe</FieldLabel>
            <input
              value={editorial.lesestufe}
              disabled={disabled}
              onChange={(e) => patch({ lesestufe: e.target.value })}
              className={inputClass}
              placeholder="z. B. Kinderbuch / Vorlesen & erstes Selbstlesen"
            />
          </label>
          <label className="block">
            <FieldLabel>Zielwortzahl Roman</FieldLabel>
            <input
              type="number"
              min={500}
              value={editorial.zielWortzahlRoman ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  zielWortzahlRoman:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
              placeholder="28000"
            />
          </label>
          <label className="block">
            <FieldLabel>Szene min. Wörter</FieldLabel>
            <input
              type="number"
              min={100}
              value={editorial.zielWortzahlSzeneMin ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  zielWortzahlSzeneMin:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <FieldLabel>Szene max. Wörter</FieldLabel>
            <input
              type="number"
              min={100}
              value={editorial.zielWortzahlSzeneMax ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  zielWortzahlSzeneMax:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <FieldLabel>Band-Nr.</FieldLabel>
            <input
              type="number"
              min={1}
              max={99}
              value={editorial.bandNr ?? ""}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  bandNr: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className={inputClass}
              placeholder="1"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>Serientitel</FieldLabel>
            <input
              value={editorial.serieTitel}
              disabled={disabled}
              onChange={(e) => patch({ serieTitel: e.target.value })}
              className={inputClass}
              placeholder="optional"
            />
          </label>
          <label className="block">
            <FieldLabel>Mehrteiler-Form</FieldLabel>
            <select
              value={editorial.mehrteilerForm}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  mehrteilerForm: e.target.value as RomanMehrteilerForm,
                })
              }
              className={inputClass}
            >
              {(Object.keys(MEHRTEILER_FORM_LABELS) as RomanMehrteilerForm[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {MEHRTEILER_FORM_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <FieldLabel>Mehrteiler-Notizen</FieldLabel>
            <textarea
              value={editorial.mehrteilerNotizen}
              disabled={disabled}
              onChange={(e) => patch({ mehrteilerNotizen: e.target.value })}
              rows={3}
              className={textareaClass}
              placeholder="Was muss in Band 1 stehen? Offene Bögen? Verbote für Cliffhanger?"
            />
          </label>
        </div>

        <div className="space-y-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel>KI-Beratung: lohnt sich ein Mehrteiler?</FieldLabel>
            <button
              type="button"
              disabled={disabled || advicePending}
              onClick={() => void runAdvice()}
              className="rounded-2xl bg-orange-700 px-4 py-2 text-xs font-extrabold tracking-wide text-white uppercase hover:bg-orange-800 disabled:opacity-50"
            >
              {advicePending ? "Beratung …" : "Beratung erzeugen"}
            </button>
          </div>
          <textarea
            value={editorial.mehrteilerBeratung}
            disabled={disabled}
            onChange={(e) => patch({ mehrteilerBeratung: e.target.value })}
            rows={10}
            className={textareaClass}
            placeholder="Hier erscheint die Verlagsberatung — editierbar. Danach Kontext speichern."
          />
          <p className="text-xs font-semibold text-zinc-500">
            Erzeugt nur Text im Formular — speichert noch nichts. Nach dem
            Anpassen: Kontext speichern.
          </p>
        </div>
      </div>
      ) : null}

      {showRegeln ? (
      <div className="space-y-3">
        {showHeadings ? (
        <div>
          <h3 className="text-base font-extrabold text-zinc-950">
            1. Harte Verlagsregeln
          </h3>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Buch-spezifische MUSS-Bulletins — stärkste Schicht im Prompt.
          </p>
        </div>
        ) : (
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-orange-900">
              1. Harte Verlagsregeln (stärkste Schicht)
            </h3>
            <p className="text-sm font-semibold text-zinc-600">
              Eine Regel pro Zeile. Für <em>dieses</em> Buch: Zielalter, Genre,
              Prämisse. Stehen im Prompt zuerst und schlagen bei Konflikt das
              allgemeine KI-Regelwerk.
            </p>
          </div>
        )}

        <label className="block max-w-xl">
          <FieldLabel>Vorauswahl Genre-Regeln (Startpunkt)</FieldLabel>
          <select
            value={genrePresetId}
            disabled={disabled}
            onChange={(e) => applyGenrePreset(e.target.value)}
            className={inputClass}
          >
            <option value="">— manuell oder Genre wählen —</option>
            {ROMAN_GENRE_RULE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs font-semibold text-zinc-500">
            {genreHint} Ersetzt die aktuelle Liste (nicht anhängen).
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || rulesPending}
            onClick={() => void runSharpenRules()}
            className="rounded-2xl bg-orange-700 px-4 py-2 text-xs font-extrabold tracking-wide text-white uppercase hover:bg-orange-800 disabled:opacity-50"
          >
            {rulesPending
              ? "Regeln werden geschärft …"
              : "Regeln für dieses Buch schärfen"}
          </button>
          <p className="text-xs font-semibold text-zinc-500">
            Claude Sonnet 5 (Fallback: Gemini 3.8 Flash). Ersetzt die Liste —
            speichert noch nichts.
          </p>
        </div>

        <textarea
          value={editorial.harteRegeln.join("\n")}
          disabled={disabled || rulesPending}
          onChange={(e) => setHarteRegelnText(e.target.value)}
          rows={8}
          className={textareaClass}
          placeholder={
            "Wortwahl für die Zielgruppe …\nJedes Kapitel endet mit Haken …"
          }
        />
        <p className="text-xs font-semibold text-zinc-500">
          Geeignet für: Verbote, Altersstufe, Genre-Pflichten. Nicht geeignet
          für lange Stilbeschreibungen → dafür die Stilbibel.
        </p>
      </div>
      ) : null}
    </div>
  );
}
