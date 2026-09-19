"use client";

/**
 * Book admin tab shell: Basics → Idee → Spec → Kapitelgerüst → Manuskript → Bilder.
 * KI-Rollen are module-wide at /admin/roman/rollen.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { saveRomanKontextAction } from "@/app/actions/roman-admin";
import { RomanCharakterePanel } from "@/components/features/admin/roman-charaktere-panel";
import { RomanCoverPanel } from "@/components/features/admin/roman-cover-panel";
import { RomanExportMarketingPanel } from "@/components/features/admin/roman-export-marketing-panel";
import { RomanExposePanel } from "@/components/features/admin/roman-expose-panel";
import {
  RomanFundamentPanel,
  fundamentBasicsFromState,
  type FundamentBasics,
} from "@/components/features/admin/roman-fundament-panel";
import { RomanIdeeQaPanel } from "@/components/features/admin/roman-idee-qa-panel";
import { RomanManuskriptPanel } from "@/components/features/admin/roman-manuskript-panel";
import { RomanManuskriptVereinfachenControl } from "@/components/features/admin/roman-manuskript-vereinfachen-control";
import { RomanManuskriptChapterControl } from "@/components/features/admin/roman-manuskript-chapter-control";
import { RomanMarktanalysePanel } from "@/components/features/admin/roman-marktanalyse-panel";
import { RomanPipelineHistoryPanel } from "@/components/features/admin/roman-pipeline-history-panel";
import { RomanPipelineStageActions } from "@/components/features/admin/roman-pipeline-stage-actions";
import { RomanReifegradCard } from "@/components/features/admin/roman-reifegrad-card";
import { RomanSzenenplotPanel } from "@/components/features/admin/roman-szenenplot-panel";
import { RomanTypPanel } from "@/components/features/admin/roman-typ-panel";
import {
  RomanWeltPanel,
  type WeltBasics,
} from "@/components/features/admin/roman-welt-panel";
import { RomanStepFertigToggle } from "@/components/features/admin/roman-step-fertig-toggle";
import {
  applyAlterPresetToEditorial,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  isPipelineTabFertig,
  leserFeedbackForStage,
  isBuchTypSet,
  tonalitaetFromRichtungen,
  withExposeText,
  withLeserFeedbackForStage,
  withPipelineTabFertig,
  withStageImprove,
  type RomanBuchTyp,
  type RomanEditorial,
  type RomanPipelineFertig,
} from "@/lib/roman/editorial";
import { emptyCharakter, hasFilledCharaktere } from "@/lib/roman/fundament";
import {
  normalizeManuskriptDocument,
  normalizePlotDocument,
} from "@/lib/roman/plot-chapters";
import { hasFilledExpose } from "@/lib/roman/suggest-expose";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import { hasFilledSzenenplot } from "@/lib/roman/suggest-szenenplot";
import { hasFilledWelt } from "@/lib/roman/suggest-welt";
import type {
  RomanCharakter,
  RomanIdeaChatMessage,
  RomanKontext,
} from "@/lib/roman/types";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import { cn } from "@/lib/utils";

const PIPELINE_TABS = [
  { id: "typ", label: "Basics" },
  { id: "idee", label: "Idee" },
  { id: "spec", label: "Spec" },
  { id: "outline", label: "Kapitelgerüst" },
  { id: "schreiben", label: "Manuskript" },
  { id: "cover", label: "Bilder" },
  { id: "export", label: "Export" },
] as const;

type TabId = (typeof PIPELINE_TABS)[number]["id"];

/** Map UI tab → pipeline origin_stage for KI-Historie filter. */
const TAB_PIPELINE_STAGE: Partial<Record<TabId, string>> = {
  idee: "idee",
  spec: "expose",
  outline: "szenenplot",
  schreiben: "manuskript",
};

function romanToSavePayload(
  roman: RomanKontext,
  editorial: RomanEditorial,
  overrides?: {
    title?: string;
    genre?: string;
    charaktere?: RomanCharakter[];
    weltSchauplaetze?: string;
    weltRegeln?: string;
    manuskriptRaw?: string;
  },
) {
  return {
    id: roman.id,
    title: overrides?.title ?? roman.title,
    manuskriptRaw: overrides?.manuskriptRaw ?? roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: overrides?.genre ?? roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: overrides?.charaktere ?? roman.charaktere,
    weltSchauplaetze: overrides?.weltSchauplaetze ?? roman.weltSchauplaetze,
    weltRegeln: overrides?.weltRegeln ?? roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
    editorial,
  };
}

export function RomanAdminWorkspace({
  initialRoman,
  canSave,
}: {
  initialRoman: RomanKontext;
  canSave: boolean;
}) {
  const [roman, setRoman] = useState(initialRoman);
  const [editorial, setEditorial] = useState<RomanEditorial>(
    initialRoman.editorial ?? emptyRomanEditorial(),
  );
  const [ideenChat, setIdeenChat] = useState<RomanIdeaChatMessage[]>(
    initialRoman.ideenChat ?? [],
  );
  const [fundament, setFundament] = useState<FundamentBasics>(() =>
    fundamentBasicsFromState({
      title: initialRoman.title,
      genre: initialRoman.genre,
      editorial: initialRoman.editorial ?? emptyRomanEditorial(),
    }),
  );
  const [charaktere, setCharaktere] = useState<RomanCharakter[]>(() =>
    initialRoman.charaktere?.length
      ? initialRoman.charaktere.map((c) => ({
          ...emptyCharakter(),
          ...c,
          wesenszuege: c.wesenszuege ?? "",
        }))
      : [emptyCharakter()],
  );
  const [welt, setWelt] = useState<WeltBasics>({
    weltSchauplaetze: initialRoman.weltSchauplaetze ?? "",
    weltRegeln: initialRoman.weltRegeln ?? "",
  });
  const [expose, setExpose] = useState(() =>
    exposeTextFromEditorial(
      initialRoman.editorial ?? emptyRomanEditorial(),
    ),
  );
  const [szenenplot, setSzenenplot] = useState(
    () => normalizePlotDocument(initialRoman.manuskriptRaw ?? ""),
  );
  const [manuskript, setManuskript] = useState(() =>
    normalizeManuskriptDocument(
      (initialRoman.editorial ?? emptyRomanEditorial()).manuskriptText ?? "",
      { requiredFromPlot: initialRoman.manuskriptRaw ?? "" },
    ),
  );
  const [tab, setTab] = useState<TabId>("typ");
  const [savePending, setSavePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const typSet = isBuchTypSet(editorial.buchTyp);
  const hasExposeDoc =
    expose.trim().length >= 80 ||
    (hasFilledCharaktere(charaktere) && hasFilledWelt(welt));
  const hasSzenenplotDoc = szenenplot.trim().length >= 80;

  function reifegradFor(stage: PipelineStage) {
    return editorial.reifegrade?.[stage] ?? null;
  }

  /** Soft status: whether the tab already has usable content. */
  const tabFilled = useMemo((): Record<TabId, boolean> => {
    return {
      typ:
        typSet &&
        (fundament.title.trim().length >= 2 ||
          fundament.genre.trim().length >= 2 ||
          fundament.grobRegeln.trim().length >= 20),
      idee: (editorial.ideeKurz ?? "").trim().length >= 40,
      spec:
        hasFilledCharaktere(charaktere) &&
        hasFilledWelt(welt) &&
        hasFilledExpose(expose),
      outline: hasFilledSzenenplot(szenenplot),
      schreiben: hasFilledManuskript(manuskript),
      cover: Boolean(roman.coverImageDataUrl?.trim()),
      export:
        (editorial.klappentext ?? "").trim().length >= 40 &&
        (editorial.einzeiler ?? "").trim().length >= 8,
    };
  }, [
    typSet,
    fundament.title,
    fundament.genre,
    fundament.grobRegeln,
    editorial.ideeKurz,
    charaktere,
    welt,
    expose,
    szenenplot,
    manuskript,
    roman.coverImageDataUrl,
  ]);

  /** Sync all local drafts after a stage KI run. */
  function syncFromPipelineRoman(saved: RomanKontext) {
    const nextEd = saved.editorial ?? emptyRomanEditorial();
    setRoman(saved);
    setEditorial(nextEd);
    setIdeenChat(saved.ideenChat ?? []);
    setFundament(
      fundamentBasicsFromState({
        title: saved.title,
        genre: saved.genre,
        editorial: nextEd,
      }),
    );
    setCharaktere(
      saved.charaktere?.length
        ? saved.charaktere.map((c) => ({
            ...emptyCharakter(),
            ...c,
            wesenszuege: c.wesenszuege ?? "",
          }))
        : [emptyCharakter()],
    );
    setWelt({
      weltSchauplaetze: saved.weltSchauplaetze ?? "",
      weltRegeln: saved.weltRegeln ?? "",
    });
    setExpose(exposeTextFromEditorial(nextEd));
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw ?? ""));
    setManuskript(
      normalizeManuskriptDocument(nextEd.manuskriptText ?? "", {
        requiredFromPlot: saved.manuskriptRaw ?? "",
      }),
    );
    setHistoryRefreshKey((k) => k + 1);
    setPipelineBusy(false);
  }

  async function saveTyp(nextTyp: "belletristik" | "sachbuch") {
    if (!canSave || savePending) return;
    const nextEditorial: RomanEditorial = {
      ...editorial,
      buchTyp: nextTyp as RomanBuchTyp,
    };
    setEditorial(nextEditorial);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setRoman(result.data!.roman);
    setEditorial(result.data!.roman.editorial ?? nextEditorial);
    toast.success("Buchtyp gespeichert.");
  }

  async function saveFundament() {
    if (!canSave || savePending) return;
    const title = fundament.title.trim();
    if (!title) {
      toast.error("Titel angeben.");
      return;
    }
    if (!fundament.genre.trim()) {
      toast.error("Genre wählen.");
      return;
    }
    if (!fundament.alterPresetId) {
      toast.error("Altersgruppe wählen.");
      return;
    }
    if (fundament.zielWortzahlRoman === "") {
      toast.error("Buchlänge wählen.");
      return;
    }

    const nextEditorial = applyAlterPresetToEditorial(
      editorial,
      fundament.alterPresetId,
      fundament.zielWortzahlRoman,
      fundament.grobRegeln,
      fundament.richtungen,
    );
    setEditorial(nextEditorial);
    const directionTon = tonalitaetFromRichtungen(fundament.richtungen);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(
        {
          ...roman,
          tonalitaet: directionTon || roman.tonalitaet,
        },
        nextEditorial,
        {
          title,
          genre: fundament.genre.trim(),
        },
      ),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    setEditorial(saved.editorial ?? nextEditorial);
    setFundament(
      fundamentBasicsFromState({
        title: saved.title,
        genre: saved.genre,
        editorial: saved.editorial ?? nextEditorial,
      }),
    );
    toast.success("Fundament gespeichert.");
  }

  async function saveCharaktere() {
    if (!canSave || savePending) return;
    const cleaned = charaktere.map((c) => ({
      ...emptyCharakter(),
      ...c,
      name: c.name.trim(),
      alter: c.alter.trim(),
      rolle: c.rolle.trim(),
      wesenszuege: (c.wesenszuege ?? "").trim(),
      motivation: c.motivation.trim(),
      schwaeche: c.schwaeche.trim(),
      bogen: (c.bogen ?? "").trim(),
      sprachstil: c.sprachstil.trim(),
    }));
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, editorial, { charaktere: cleaned }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    setCharaktere(
      saved.charaktere.length
        ? saved.charaktere.map((c) => ({
            ...emptyCharakter(),
            ...c,
            wesenszuege: c.wesenszuege ?? "",
          }))
        : [emptyCharakter()],
    );
    toast.success("Charaktere gespeichert.");
  }

  async function saveWelt() {
    if (!canSave || savePending) return;
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, editorial, {
        weltSchauplaetze: welt.weltSchauplaetze.trim(),
        weltRegeln: welt.weltRegeln.trim(),
      }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    setWelt({
      weltSchauplaetze: saved.weltSchauplaetze,
      weltRegeln: saved.weltRegeln,
    });
    toast.success("Welt gespeichert.");
  }

  async function saveExpose() {
    if (!canSave || savePending) return;
    const nextEditorial = withExposeText(editorial, expose);
    setEditorial(nextEditorial);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setExpose(exposeTextFromEditorial(savedEd));
    toast.success("Exposé gespeichert.");
  }

  async function saveSzenenplot() {
    if (!canSave || savePending) return;
    setSavePending(true);
    const cleaned = normalizePlotDocument(szenenplot);
    if (cleaned !== szenenplot) setSzenenplot(cleaned);
    // Handedit of markdown can desync dramaturgy JSON — clear until next Erzeugen.
    const nextEditorial = {
      ...editorial,
      szenenplotStructured: null,
    };
    setEditorial(nextEditorial);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, {
        manuskriptRaw: cleaned,
      }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    setEditorial(saved.editorial ?? nextEditorial);
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw));
    toast.success("Kapitelgerüst gespeichert.");
  }

  async function saveManuskript() {
    if (!canSave || savePending) return;
    const cleaned = normalizeManuskriptDocument(manuskript, {
      requiredFromPlot: szenenplot,
    });
    if (cleaned !== manuskript) setManuskript(cleaned);
    const nextEditorial = {
      ...editorial,
      manuskriptText: cleaned,
    };
    setEditorial(nextEditorial);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success("Manuskript gespeichert.");
  }

  async function clearManuskript() {
    if (!canSave || savePending) return;
    const improveMap = { ...(editorial.reifegradImprove ?? {}) };
    delete improveMap.manuskript;
    const reifegrade = { ...(editorial.reifegrade ?? {}) };
    delete reifegrade.manuskript;
    let nextEditorial = withLeserFeedbackForStage(
      {
        ...editorial,
        manuskriptText: "",
        manuskriptOriginalText: "",
        manuskriptOriginalSavedAt: null,
        storyState: null,
        canon: null,
        reifegradImprove: improveMap,
        reifegrade,
      },
      "manuskript",
      null,
    );
    nextEditorial = withStageImprove(nextEditorial, "manuskript", null);
    setEditorial(nextEditorial);
    setManuskript("");
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Manuskript leeren fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRoman(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success("Manuskript geleert.");
  }

  async function savePipelineFertig(
    tabId: keyof RomanPipelineFertig,
    fertig: boolean,
  ) {
    if (!canSave || savePending) return;
    const prevEditorial = editorial;
    const nextEditorial = withPipelineTabFertig(prevEditorial, tabId, fertig);
    setEditorial(nextEditorial);
    setSavePending(true);
    try {
      const result = await saveRomanKontextAction(
        romanToSavePayload(roman, nextEditorial),
      );
      if (!result.success) {
        toast.error(result.error ?? "Fertig-Status speichern fehlgeschlagen.");
        setEditorial(prevEditorial);
        return;
      }
      const savedEd = result.data!.roman.editorial ?? nextEditorial;
      // Prefer merged Fertig from what we just wrote (parse may omit keys).
      setRoman(result.data!.roman);
      setEditorial({
        ...savedEd,
        pipelineFertig: {
          ...(savedEd.pipelineFertig ?? {}),
          ...(nextEditorial.pipelineFertig ?? {}),
        },
      });
    } finally {
      setSavePending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/roman"
          className="text-sm font-bold text-orange-800 hover:underline"
        >
          ← Alle Bücher
        </Link>
      </div>

      <p className="text-sm font-semibold text-zinc-600">
        {roman.title.trim() || "Unbenanntes Buch"}
      </p>

      <div
        role="tablist"
        aria-label="Buch-Pipeline"
        className="flex flex-wrap gap-2"
      >
        {PIPELINE_TABS.map((item, index) => {
          const selected = tab === item.id;
          const filled = tabFilled[item.id];
          const fertig = isPipelineTabFertig(editorial, item.id);
          const locked = item.id !== "typ" && !typSet;
          const StatusIcon = fertig || filled ? CheckCircle2 : Circle;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${index + 1}. ${item.label}${
                fertig
                  ? " (fertig)"
                  : filled
                    ? " (Inhalt vorhanden)"
                    : " (noch leer)"
              }`}
              disabled={locked}
              title={
                locked ? "Zuerst Buchtyp wählen und speichern." : undefined
              }
              onClick={() => {
                if (locked) {
                  toast.message("Zuerst Buchtyp wählen.");
                  return;
                }
                setTab(item.id);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ring-1 transition",
                selected && !fertig
                  ? "bg-orange-700 text-white ring-orange-700"
                  : selected && fertig
                    ? "bg-emerald-700 text-white ring-emerald-700"
                    : fertig
                      ? "bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100/80"
                      : "bg-white text-zinc-700 ring-zinc-950/10 hover:bg-zinc-50",
                locked && "cursor-not-allowed opacity-50",
              )}
            >
              <StatusIcon
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0",
                  fertig
                    ? selected
                      ? "text-emerald-100"
                      : "text-emerald-600"
                    : filled
                      ? selected
                        ? "text-emerald-100"
                        : "text-emerald-500/70"
                      : selected
                        ? "text-white/45"
                        : "text-zinc-300",
                )}
              />
              <span>
                {index + 1}. {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-w-0 space-y-6">
        {tab === "typ" ? (
          <section className="space-y-8 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Basics</h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "typ")}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig("typ", v)}
                />
              </div>
              <RomanTypPanel
                buchTyp={editorial.buchTyp}
                onSelect={(typ) => void saveTyp(typ)}
                disabled={!canSave || savePending}
              />
              {savePending ? (
                <p className="text-xs font-semibold text-zinc-500">
                  Speichern …
                </p>
              ) : null}
            </div>

            <div className="space-y-4 border-t border-zinc-100 pt-8">
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <RomanFundamentPanel
                  mode="fields"
                  buchTyp={editorial.buchTyp}
                  value={fundament}
                  onChange={setFundament}
                  canSave={canSave}
                  disabled={savePending}
                  savePending={savePending}
                  onSave={() => void saveFundament()}
                />
              )}
            </div>

            {typSet ? (
              <div className="space-y-4 border-t border-zinc-100 pt-8">
                <RomanMarktanalysePanel
                  romanId={roman.id}
                  genre={fundament.genre}
                  alterPresetId={fundament.alterPresetId}
                  richtungen={fundament.richtungen}
                  value={editorial.marktanalyse}
                  canSave={canSave}
                  disabled={savePending || pipelineBusy}
                  onComplete={({ roman: saved, marktanalyse }) => {
                    setRoman(saved);
                    setEditorial((prev) => ({ ...prev, marktanalyse }));
                  }}
                />
              </div>
            ) : null}

            {typSet ? (
              <div className="space-y-4 border-t border-zinc-100 pt-8">
                <RomanFundamentPanel
                  mode="rules-save"
                  buchTyp={editorial.buchTyp}
                  value={fundament}
                  onChange={setFundament}
                  canSave={canSave}
                  disabled={savePending}
                  savePending={savePending}
                  onSave={() => void saveFundament()}
                />
              </div>
            ) : null}
          </section>
        ) : tab === "idee" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("idee")}
                romanId={roman.id}
                stage="idee"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.idee}
                stageImprovePlan={editorial.stageImprove?.idee ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Idee</h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "idee")}
                  disabled={!canSave || !typSet}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig("idee", v)}
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="idee"
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "idee")}
                    hasLeserArtifact={
                      (editorial.ideeKurz ?? "").trim().length >= 40
                    }
                    showAssess
                    displayLabel="Idee"
                  />
                  <RomanIdeeQaPanel
                    romanId={roman.id}
                    messages={ideenChat}
                    ideeKurz={editorial.ideeKurz ?? ""}
                    canSave={canSave}
                    onTurnComplete={({ messages, ideeKurz }) => {
                      setIdeenChat(messages);
                      setEditorial((prev) => ({ ...prev, ideeKurz }));
                      setRoman((prev) => ({
                        ...prev,
                        ideenChat: messages,
                        editorial: { ...prev.editorial, ideeKurz },
                      }));
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "spec" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("expose")}
                romanId={roman.id}
                stage="expose"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.expose}
                stageImprovePlan={editorial.stageImprove?.expose ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Spec</h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "spec")}
                  disabled={!canSave || !typSet}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig("spec", v)}
                />
              </div>
              <p className="text-sm font-semibold text-zinc-600">
                Figuren, Welt und Exposé als ein Brief. Erzeugen legt alle drei
                an; Analyse und Reifegrad bewerten den gesamten Spec.
                Dimensions-Einarbeiten greift je Achse Figuren, Welt oder Exposé.
              </p>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-8">
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="expose"
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "expose")}
                    hasLeserArtifact={hasExposeDoc}
                    generateMode="spec-chain"
                    showAssess
                    displayLabel="Spec"
                  />
                  <div className="space-y-3">
                    <h3 className="text-base font-extrabold text-zinc-950">
                      Charaktere
                    </h3>
                    <RomanCharakterePanel
                      ideeKurz={editorial.ideeKurz ?? ""}
                      value={charaktere}
                      onChange={setCharaktere}
                      canSave={canSave}
                      disabled={savePending || pipelineBusy}
                      savePending={savePending}
                      onSave={() => void saveCharaktere()}
                    />
                  </div>
                  <div className="space-y-3 border-t border-zinc-100 pt-6">
                    <h3 className="text-base font-extrabold text-zinc-950">
                      Welt
                    </h3>
                    <RomanWeltPanel
                      ideeKurz={editorial.ideeKurz ?? ""}
                      value={welt}
                      onChange={setWelt}
                      canSave={canSave}
                      disabled={savePending || pipelineBusy}
                      savePending={savePending}
                      onSave={() => void saveWelt()}
                    />
                  </div>
                  <div className="space-y-3 border-t border-zinc-100 pt-6">
                    <h3 className="text-base font-extrabold text-zinc-950">
                      Exposé
                    </h3>
                    <RomanExposePanel
                      ideeKurz={editorial.ideeKurz ?? ""}
                      value={expose}
                      onChange={setExpose}
                      canSave={canSave}
                      disabled={savePending || pipelineBusy}
                      savePending={savePending}
                      onSave={() => void saveExpose()}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : tab === "outline" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("szenenplot")}
                romanId={roman.id}
                stage="szenenplot"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.szenenplot}
                stageImprovePlan={editorial.stageImprove?.szenenplot ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Kapitelgerüst
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "outline")}
                  disabled={!canSave || !typSet}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig("outline", v)}
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="szenenplot"
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "szenenplot")}
                    hasLeserArtifact={hasSzenenplotDoc}
                    showAssess
                    displayLabel="Kapitelgerüst"
                  />
                  <RomanSzenenplotPanel
                    hasExpose={hasExposeDoc}
                    value={szenenplot}
                    onChange={setSzenenplot}
                    structured={editorial.szenenplotStructured}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    savePending={savePending}
                    onSave={() => void saveSzenenplot()}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "schreiben" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("manuskript")}
                romanId={roman.id}
                stage="manuskript"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.manuskript}
                stageImprovePlan={editorial.stageImprove?.manuskript ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Manuskript
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "schreiben")}
                  disabled={!canSave || !typSet}
                  pending={savePending}
                  onCheckedChange={(v) =>
                    void savePipelineFertig("schreiben", v)
                  }
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="manuskript"
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "manuskript")}
                    hasLeserArtifact={hasFilledManuskript(manuskript)}
                    showAssess
                  />
                  <RomanManuskriptVereinfachenControl
                    romanId={roman.id}
                    editorial={editorial}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                  />
                  <RomanManuskriptChapterControl
                    romanId={roman.id}
                    plotMarkdown={szenenplot}
                    manuskriptMarkdown={manuskript}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                  />
                  <RomanManuskriptPanel
                    hasSzenenplot={hasSzenenplotDoc}
                    value={manuskript}
                    onChange={setManuskript}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    savePending={savePending}
                    onSave={() => void saveManuskript()}
                    onClear={() => clearManuskript()}
                    clearPending={savePending}
                    zielWortzahl={editorial.zielWortzahlRoman}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "cover" ? (
          <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-zinc-950">Bilder</h2>
              <RomanStepFertigToggle
                checked={isPipelineTabFertig(editorial, "cover")}
                disabled={!canSave || !typSet}
                pending={savePending}
                onCheckedChange={(v) => void savePipelineFertig("cover", v)}
              />
            </div>
            {!typSet ? (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                Zuerst Buchtyp wählen.
              </p>
            ) : (
              <RomanCoverPanel
                romanId={roman.id}
                title={roman.title}
                coverImageDataUrl={roman.coverImageDataUrl || null}
                coverPrompt={roman.coverPrompt || null}
                canSave={canSave}
                disabled={savePending}
                onComplete={(patch) => {
                  setRoman((prev) => ({
                    ...prev,
                    coverImageDataUrl: patch.coverImageDataUrl ?? "",
                    coverPrompt: patch.coverPrompt ?? "",
                  }));
                }}
              />
            )}
          </section>
        ) : tab === "export" ? (
          <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-zinc-950">Export</h2>
              <RomanStepFertigToggle
                checked={isPipelineTabFertig(editorial, "export")}
                disabled={!canSave || !typSet}
                pending={savePending}
                onCheckedChange={(v) => void savePipelineFertig("export", v)}
              />
            </div>
            {!typSet ? (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                Zuerst Buchtyp wählen.
              </p>
            ) : (
              <RomanExportMarketingPanel
                roman={roman}
                editorial={editorial}
                canSave={canSave}
                disabled={savePending}
                onComplete={(saved) => {
                  setRoman(saved);
                  setEditorial(saved.editorial ?? emptyRomanEditorial());
                }}
              />
            )}
          </section>
        ) : (
          <section className="rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <h2 className="text-lg font-extrabold text-zinc-950">
              {PIPELINE_TABS.find((t) => t.id === tab)?.label ?? "Schritt"}
            </h2>
            <p className="mt-2 text-sm font-semibold text-zinc-600">
              Schritt wird neu aufgebaut.
            </p>
          </section>
        )}

        {typSet && TAB_PIPELINE_STAGE[tab] ? (
          <RomanPipelineHistoryPanel
            romanId={roman.id}
            refreshKey={historyRefreshKey}
            originStage={TAB_PIPELINE_STAGE[tab]}
          />
        ) : null}
      </div>
    </div>
  );
}
