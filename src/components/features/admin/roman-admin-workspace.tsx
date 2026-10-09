"use client";

/**
 * Book admin tab shell: Basics → Idee → Recherche → Spec → Grob/Fein Gerüst/Plot →
 * Manuskript → Roman → Export. Clever: Basics → Unterthemen → Geschichten.
 * KI-Rollen live at `{basePath}/rollen` (Roman / Clever).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { saveRomanKontextAction } from "@/app/actions/roman-admin";
import { enrichSzenenplotSpatialAction } from "@/app/actions/roman-szenenplot-spatial";
import { CleverUnterthemenPanel } from "@/components/features/admin/clever-unterthemen-panel";
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
import { RomanRechercheQaPanel } from "@/components/features/admin/roman-recherche-qa-panel";
import { RomanManuskriptPanel } from "@/components/features/admin/roman-manuskript-panel";
import { RomanManuskriptChapterControl } from "@/components/features/admin/roman-manuskript-chapter-control";
import { RomanManuskriptVerbessernControl } from "@/components/features/admin/roman-manuskript-verbessern-control";
import { RomanContinuityTrigger } from "@/components/features/admin/roman-continuity-overlay";
import { RomanMarktanalysePanel } from "@/components/features/admin/roman-marktanalyse-panel";
import { RomanPipelineHistoryPanel } from "@/components/features/admin/roman-pipeline-history-panel";
import { RomanPipelineStageActions } from "@/components/features/admin/roman-pipeline-stage-actions";
import { RomanReifegradCard } from "@/components/features/admin/roman-reifegrad-card";
import { RomanKapitelGeruestPanel } from "@/components/features/admin/roman-kapitelgeruest-panel";
import { RomanSzenenplotPanel } from "@/components/features/admin/roman-szenenplot-panel";
import { RomanWissensgraphTrigger } from "@/components/features/admin/roman-wissensgraph-overlay";
import {
  clearManuskriptAndExportEditorial,
  downstreamStaleBanner,
  generateCascadeConfirm,
  invalidateDownstreamEditorial,
} from "@/lib/roman/pipeline/cascade";
import { hasFilledKapitelGeruest } from "@/lib/roman/suggest-kapitelgeruest";
import {
  RomanWeltPanel,
  type WeltBasics,
} from "@/components/features/admin/roman-welt-panel";
import { RomanStepFertigToggle } from "@/components/features/admin/roman-step-fertig-toggle";
import {
  getRomanAdminModule,
  type RomanAdminModuleId,
} from "@/lib/roman/admin-module";
import {
  applyAlterPresetToEditorial,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  isPipelineTabFertig,
  leserFeedbackForStage,
  tonalitaetFromRichtungen,
  withExposeText,
  withLeserFeedbackForStage,
  withPipelineTabFertig,
  withStageImprove,
  type RomanEditorial,
  type RomanPipelineFertig,
} from "@/lib/roman/editorial";
import { emptyCharakter, hasFilledCharaktere } from "@/lib/roman/fundament";
import {
  normalizeManuskriptDocument,
  normalizePlotDocument,
  parsePlotChapters,
  replaceManuskriptChapterBody,
  sanitizeChapterTitle,
  serializeManuskriptChapters,
} from "@/lib/roman/plot-chapters";
import { stripErzaehlerWrappers } from "@/lib/roman/clever-geschichte";
import { hasFilledExpose } from "@/lib/roman/suggest-expose";
import { hasFilledManuskript } from "@/lib/roman/suggest-manuskript";
import { hasFilledSzenenplot } from "@/lib/roman/suggest-szenenplot";
import {
  applyCleverThemaTitlesToManuskript,
  hasFilledCleverUnterthemen,
} from "@/lib/roman/clever-unterthemen";
import { buildCleverThemaStanceForThema } from "@/lib/roman/clever-thema-stance";
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
  { id: "recherche", label: "Recherche" },
  { id: "spec", label: "Spec" },
  /** Clever: Unterthemen. Belletristik uses grob/fein tabs instead. */
  { id: "outline", label: "Unterthemen" },
  { id: "grobgeruest", label: "Grobgerüst" },
  { id: "feingeruest", label: "Feingerüst" },
  { id: "grobplot", label: "Grobplot" },
  { id: "feinplot", label: "Feinplot" },
  { id: "schreiben", label: "Manuskript" },
  { id: "roman", label: "Roman" },
  { id: "export", label: "Export" },
] as const;

type TabId = (typeof PIPELINE_TABS)[number]["id"];

/** Map UI tab → pipeline origin_stage for KI-Historie filter. */
const TAB_PIPELINE_STAGE: Partial<Record<TabId, string>> = {
  idee: "idee",
  spec: "expose",
  outline: "feingeruest",
  grobgeruest: "grobgeruest",
  feingeruest: "feingeruest",
  grobplot: "grobplot",
  feinplot: "feinplot",
  schreiben: "manuskript",
  roman: "manuskript",
};

function romanToSavePayload(
  roman: RomanKontext,
  editorial: RomanEditorial,
  buchTyp: RomanEditorial["buchTyp"],
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
    editorial: { ...editorial, buchTyp },
  };
}

export function RomanAdminWorkspace({
  initialRoman,
  canSave,
  moduleId = "roman",
}: {
  initialRoman: RomanKontext;
  canSave: boolean;
  moduleId?: RomanAdminModuleId;
}) {
  const adminModule = getRomanAdminModule(moduleId);
  const isCleverErzaehlt = moduleId === "clever_erzaehlt";
  const rolesHref = `${adminModule.basePath}/rollen`;
  const typSet = true;
  const fixedBuchTyp = adminModule.buchTyp;
  function withFixedTyp(ed: RomanEditorial): RomanEditorial {
    return ed.buchTyp === fixedBuchTyp ? ed : { ...ed, buchTyp: fixedBuchTyp };
  }

  const [roman, setRoman] = useState(initialRoman);
  const [editorial, setEditorial] = useState<RomanEditorial>(
    withFixedTyp(initialRoman.editorial ?? emptyRomanEditorial()),
  );

  /** Keep cover bytes when a save/pipeline payload omits them. */
  function keepCover(saved: RomanKontext, prev: RomanKontext): RomanKontext {
    const keepImage = Boolean(saved.coverImageDataUrl?.trim());
    const keepPrompt = Boolean(saved.coverPrompt?.trim());
    if (keepImage && keepPrompt) return saved;
    return {
      ...saved,
      coverImageDataUrl: keepImage
        ? saved.coverImageDataUrl
        : prev.coverImageDataUrl || "",
      coverPrompt: keepPrompt ? saved.coverPrompt : prev.coverPrompt || "",
    };
  }

  function setRomanKeepCover(saved: RomanKontext) {
    setRoman((prev) => keepCover(saved, prev));
  }
  const [ideenChat, setIdeenChat] = useState<RomanIdeaChatMessage[]>(
    initialRoman.ideenChat ?? [],
  );
  const [fundament, setFundament] = useState<FundamentBasics>(() =>
    fundamentBasicsFromState({
      title: initialRoman.title,
      genre: initialRoman.genre,
      editorial: initialRoman.editorial ?? emptyRomanEditorial(),
      tonalitaet: initialRoman.tonalitaet,
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
  const [kapitelGeruest, setKapitelGeruest] = useState(
    () =>
      (initialRoman.editorial ?? emptyRomanEditorial()).kapitelGeruestRaw ?? "",
  );
  const [szenenplot, setSzenenplot] = useState(
    () => normalizePlotDocument(initialRoman.manuskriptRaw ?? ""),
  );
  const [manuskript, setManuskript] = useState(() => {
    const ed = initialRoman.editorial ?? emptyRomanEditorial();
    const plot = initialRoman.manuskriptRaw ?? "";
    const titlesFromPlot = ed.buchTyp === "clever_erzaehlt";
    let text = normalizeManuskriptDocument(ed.manuskriptText ?? "", {
      requiredFromPlot: plot,
      titlesFromPlot,
    });
    if (titlesFromPlot) {
      text = applyCleverThemaTitlesToManuskript(text, ed.cleverUnterthemen);
    }
    return text;
  });
  const [tab, setTab] = useState<TabId>("typ");
  const [savePending, setSavePending] = useState(false);
  const [enrichSpatialPending, setEnrichSpatialPending] = useState(false);
  const [enrichSpatialMode, setEnrichSpatialMode] = useState<
    "manual" | "fertig"
  >("manual");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  /** Clever: which Kurzgeschichte is shown in the editor. */
  const [cleverStoryNumber, setCleverStoryNumber] = useState(1);
  /** Roman: which Manuskript chapter is shown in the editor. */
  const [manuskriptChapterNumber, setManuskriptChapterNumber] = useState(1);
  /** Polished Roman tab: which chapter card is focused. */
  const [romanChapterNumber, setRomanChapterNumber] = useState(1);
  const [romanBook, setRomanBook] = useState(() => {
    const ed = initialRoman.editorial ?? emptyRomanEditorial();
    return normalizeManuskriptDocument(ed.romanText ?? "", {
      requiredFromPlot: initialRoman.manuskriptRaw ?? "",
    });
  });

  const visibleTabs = useMemo(() => {
    if (isCleverErzaehlt) {
      return PIPELINE_TABS.filter(
        (t) =>
          t.id !== "idee" &&
          t.id !== "recherche" &&
          t.id !== "spec" &&
          t.id !== "grobgeruest" &&
          t.id !== "feingeruest" &&
          t.id !== "grobplot" &&
          t.id !== "feinplot" &&
          t.id !== "roman",
      ).map((t) =>
        t.id === "schreiben" ? { ...t, label: "Geschichten" } : t,
      );
    }
    return PIPELINE_TABS.filter((t) => t.id !== "outline");
  }, [isCleverErzaehlt]);

  if (
    isCleverErzaehlt &&
    (tab === "idee" ||
      tab === "recherche" ||
      tab === "spec" ||
      tab === "grobgeruest" ||
      tab === "feingeruest" ||
      tab === "grobplot" ||
      tab === "feinplot" ||
      tab === "roman")
  ) {
    setTab("typ");
  }
  if (
    !isCleverErzaehlt &&
    (tab === "outline" || tab === ("szenenplot" as TabId))
  ) {
    setTab("grobgeruest");
  }

  const hasExposeDoc =
    expose.trim().length >= 80 ||
    (hasFilledCharaktere(charaktere) && hasFilledWelt(welt));
  const hasGeruestDoc = hasFilledKapitelGeruest(kapitelGeruest);
  const hasSzenenplotDoc = isCleverErzaehlt
    ? hasFilledCleverUnterthemen(editorial.cleverUnterthemen, editorial) ||
      szenenplot.trim().length >= 40
    : hasFilledSzenenplot(szenenplot);

  const cleverPlotChapters = useMemo(
    () => (isCleverErzaehlt ? parsePlotChapters(szenenplot) : []),
    [isCleverErzaehlt, szenenplot],
  );
  const romanPlotChapters = useMemo(
    () => (!isCleverErzaehlt ? parsePlotChapters(szenenplot) : []),
    [isCleverErzaehlt, szenenplot],
  );

  if (
    isCleverErzaehlt &&
    cleverPlotChapters.length > 0 &&
    !cleverPlotChapters.some((c) => c.number === cleverStoryNumber)
  ) {
    setCleverStoryNumber(cleverPlotChapters[0]!.number);
  }
  if (
    !isCleverErzaehlt &&
    romanPlotChapters.length > 0 &&
    !romanPlotChapters.some((c) => c.number === manuskriptChapterNumber)
  ) {
    setManuskriptChapterNumber(romanPlotChapters[0]!.number);
  }
  const romanBookChapters = useMemo(
    () => (!isCleverErzaehlt ? parsePlotChapters(romanBook) : []),
    [isCleverErzaehlt, romanBook],
  );
  const romanNavChapters =
    romanBookChapters.length > 0 ? romanBookChapters : romanPlotChapters;
  if (
    !isCleverErzaehlt &&
    romanNavChapters.length > 0 &&
    !romanNavChapters.some((c) => c.number === romanChapterNumber)
  ) {
    setRomanChapterNumber(romanNavChapters[0]!.number);
  }

  function reifegradFor(stage: PipelineStage) {
    return editorial.reifegrade?.[stage] ?? null;
  }

  /** Soft status: whether the tab already has usable content. */
  const tabFilled = useMemo((): Record<TabId, boolean> => {
    return {
      typ:
        fundament.title.trim().length >= 2 ||
          fundament.genre.trim().length >= 2 ||
          fundament.grobRegeln.trim().length >= 20,
      idee: (editorial.ideeKurz ?? "").trim().length >= 40,
      recherche: (editorial.rechercheDossier ?? "").trim().length >= 40,
      spec:
        hasFilledCharaktere(charaktere) &&
        hasFilledWelt(welt) &&
        hasFilledExpose(expose),
      outline: isCleverErzaehlt
        ? hasFilledCleverUnterthemen(editorial.cleverUnterthemen, editorial)
        : hasGeruestDoc,
      grobgeruest: hasGeruestDoc,
      feingeruest: hasGeruestDoc,
      grobplot: hasSzenenplotDoc,
      feinplot: hasSzenenplotDoc,
      schreiben: hasFilledManuskript(manuskript),
      roman: hasFilledManuskript(romanBook),
      export:
        Boolean(roman.coverImageDataUrl?.trim()) ||
        ((editorial.klappentext ?? "").trim().length >= 40 &&
          (editorial.einzeiler ?? "").trim().length >= 8),
    };
  }, [
    fundament.title,
    fundament.genre,
    fundament.grobRegeln,
    editorial,
    isCleverErzaehlt,
    charaktere,
    welt,
    expose,
    hasGeruestDoc,
    hasSzenenplotDoc,
    manuskript,
    romanBook,
    roman.coverImageDataUrl,
  ]);

  /** Sync all local drafts after a stage KI run. */
  function syncFromPipelineRoman(saved: RomanKontext) {
    const nextEd = withFixedTyp(saved.editorial ?? emptyRomanEditorial());
    setRoman((prev) => ({
      ...keepCover(saved, prev),
      editorial: nextEd,
    }));
    setEditorial(nextEd);
    setIdeenChat(saved.ideenChat ?? []);
    setFundament(
      fundamentBasicsFromState({
        title: saved.title,
        genre: saved.genre,
        editorial: nextEd,
        tonalitaet: saved.tonalitaet,
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
    setKapitelGeruest(nextEd.kapitelGeruestRaw ?? "");
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw ?? ""));
    {
      const titlesFromPlot = nextEd.buchTyp === "clever_erzaehlt";
      let text = normalizeManuskriptDocument(nextEd.manuskriptText ?? "", {
        requiredFromPlot: saved.manuskriptRaw ?? "",
        titlesFromPlot,
      });
      if (titlesFromPlot) {
        text = applyCleverThemaTitlesToManuskript(
          text,
          nextEd.cleverUnterthemen,
        );
      }
      setManuskript(text);
    }
    setRomanBook(
      normalizeManuskriptDocument(nextEd.romanText ?? "", {
        requiredFromPlot: saved.manuskriptRaw ?? "",
      }),
    );
    setHistoryRefreshKey((k) => k + 1);
    setPipelineBusy(false);
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
      isCleverErzaehlt ? [] : fundament.richtungen,
    );
    if (isCleverErzaehlt) {
      nextEditorial.richtungen = [];
      nextEditorial.marktanalyse = null;
      nextEditorial.cleverThemaStance =
        fundament.cleverThemaStance ??
        (fundament.genre.trim()
          ? buildCleverThemaStanceForThema(fundament.genre)
          : null);
    }
    setEditorial(nextEditorial);
    const directionTon = isCleverErzaehlt
      ? ""
      : tonalitaetFromRichtungen(fundament.richtungen);
    const schreiberTon =
      fundament.schreiberSpracheTonalitaet.trim() ||
      directionTon ||
      roman.tonalitaet;
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(
        {
          ...roman,
          tonalitaet: schreiberTon,
        },
        nextEditorial,
        fixedBuchTyp,
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
    setRomanKeepCover(saved);
    setEditorial(saved.editorial ?? nextEditorial);
    setFundament(
      fundamentBasicsFromState({
        title: saved.title,
        genre: saved.genre,
        editorial: saved.editorial ?? nextEditorial,
        tonalitaet: saved.tonalitaet,
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
      romanToSavePayload(roman, editorial, fixedBuchTyp, { charaktere: cleaned }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
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
      romanToSavePayload(roman, editorial, fixedBuchTyp, {
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
    setRomanKeepCover(saved);
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
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
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
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp, {
        manuskriptRaw: cleaned,
      }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    setEditorial(saved.editorial ?? nextEditorial);
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw));
    toast.success("Szenenplot gespeichert.");
  }

  async function saveManuskript() {
    if (!canSave || savePending) return;
    let cleaned = normalizeManuskriptDocument(manuskript, {
      requiredFromPlot: szenenplot,
      titlesFromPlot: isCleverErzaehlt,
    });
    if (isCleverErzaehlt) {
      cleaned = applyCleverThemaTitlesToManuskript(
        normalizeManuskriptDocument(
          serializeManuskriptChapters(
            parsePlotChapters(cleaned).map((c) => ({
              ...c,
              body: stripErzaehlerWrappers(c.body),
            })),
          ),
          { requiredFromPlot: szenenplot, titlesFromPlot: true },
        ),
        editorial.cleverUnterthemen,
      );
    }
    if (cleaned !== manuskript) setManuskript(cleaned);
    const nextEditorial = {
      ...editorial,
      manuskriptText: cleaned,
    };
    setEditorial(nextEditorial);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success(
      isCleverErzaehlt ? "Geschichte gespeichert." : "Manuskript gespeichert.",
    );
  }

  async function saveRomanBook() {
    if (!canSave || savePending || isCleverErzaehlt) return;
    const cleaned = normalizeManuskriptDocument(romanBook, {
      requiredFromPlot: szenenplot,
    });
    if (cleaned !== romanBook) setRomanBook(cleaned);
    const nextEditorial = {
      ...editorial,
      romanText: cleaned,
    };
    setEditorial(nextEditorial);
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setRomanBook(savedEd.romanText ?? "");
    toast.success("Roman gespeichert.");
  }

  async function clearRomanBook() {
    if (!canSave || savePending || isCleverErzaehlt) return;
    const nextEditorial = { ...editorial, romanText: "" };
    setEditorial(nextEditorial);
    setRomanBook("");
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Leeren fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    setEditorial(saved.editorial ?? nextEditorial);
    setRomanBook(saved.editorial?.romanText ?? "");
    toast.success("Roman geleert.");
  }

  async function clearKapitelGeruest() {
    if (!canSave || savePending) return;
    const improveMap = { ...(editorial.reifegradImprove ?? {}) };
    delete improveMap.kapitelgeruest;
    delete improveMap.grobgeruest;
    delete improveMap.feingeruest;
    delete improveMap.szenenplot;
    delete improveMap.grobplot;
    delete improveMap.feinplot;
    delete improveMap.manuskript;
    const reifegrade = { ...(editorial.reifegrade ?? {}) } as Record<
      string,
      unknown
    >;
    delete reifegrade.kapitelgeruest;
    delete reifegrade.grobgeruest;
    delete reifegrade.feingeruest;
    delete reifegrade.szenenplot;
    delete reifegrade.grobplot;
    delete reifegrade.feinplot;
    delete reifegrade.manuskript;
    let nextEditorial = withLeserFeedbackForStage(
      {
        ...editorial,
        kapitelGeruestRaw: "",
        kapitelGeruestStructured: null,
        // Graph was seeded/grown for this Gerüst — reset with the structure.
        wissensGraph: null,
        reifegradImprove: improveMap,
        reifegrade: reifegrade as typeof editorial.reifegrade,
      },
      "feingeruest",
      null,
    );
    nextEditorial = withStageImprove(nextEditorial, "feingeruest", null);
    nextEditorial = invalidateDownstreamEditorial(
      nextEditorial,
      "grobgeruest",
    );
    // Cascade clears szenenplotStructured + manuskript; also wipe plot markdown.
    setEditorial(nextEditorial);
    setKapitelGeruest("");
    setSzenenplot("");
    setManuskript("");
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp, {
        manuskriptRaw: "",
      }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Kapitelgerüst leeren fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setKapitelGeruest(savedEd.kapitelGeruestRaw ?? "");
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw ?? ""));
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success(
      "Kapitelgerüst geleert (Szenenplot, Manuskript & Export-Texte mit).",
    );
  }

  async function clearSzenenplot() {
    if (!canSave || savePending) return;
    const improveMap = { ...(editorial.reifegradImprove ?? {}) };
    delete improveMap.szenenplot;
    delete improveMap.grobplot;
    delete improveMap.feinplot;
    delete improveMap.manuskript;
    const reifegrade = { ...(editorial.reifegrade ?? {}) } as Record<
      string,
      unknown
    >;
    delete reifegrade.szenenplot;
    delete reifegrade.grobplot;
    delete reifegrade.feinplot;
    delete reifegrade.manuskript;
    let nextEditorial = withLeserFeedbackForStage(
      {
        ...editorial,
        szenenplotStructured: null,
        reifegradImprove: improveMap,
        reifegrade: reifegrade as typeof editorial.reifegrade,
      },
      "feinplot",
      null,
    );
    nextEditorial = withStageImprove(nextEditorial, "feinplot", null);
    nextEditorial = invalidateDownstreamEditorial(nextEditorial, "feinplot");
    setEditorial(nextEditorial);
    setSzenenplot("");
    setManuskript("");
    setSavePending(true);
    const result = await saveRomanKontextAction(
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp, {
        manuskriptRaw: "",
      }),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Szenenplot leeren fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setSzenenplot(normalizePlotDocument(saved.manuskriptRaw ?? ""));
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success("Szenenplot geleert (Manuskript & Export-Texte mit).");
  }

  async function clearManuskript() {
    if (!canSave || savePending) return;

    if (isCleverErzaehlt) {
      const cleared = replaceManuskriptChapterBody(
        manuskript,
        szenenplot,
        cleverStoryNumber,
        "",
      );
      const cleaned = normalizeManuskriptDocument(cleared, {
        requiredFromPlot: szenenplot,
        titlesFromPlot: true,
      });
      const key = String(cleverStoryNumber);
      const improve = { ...(editorial.cleverGeschichteImprove ?? {}) };
      delete improve[key];
      const counts = { ...(editorial.cleverGeschichteImproveCount ?? {}) };
      delete counts[key];
      const ok = { ...(editorial.cleverGeschichteOk ?? {}) };
      delete ok[key];
      const nextEditorial = {
        ...editorial,
        manuskriptText: cleaned,
        cleverGeschichteImprove:
          Object.keys(improve).length > 0 ? improve : null,
        cleverGeschichteImproveCount:
          Object.keys(counts).length > 0 ? counts : null,
        cleverGeschichteOk: Object.keys(ok).length > 0 ? ok : null,
      };
      setEditorial(nextEditorial);
      setManuskript(cleaned);
      setSavePending(true);
      const result = await saveRomanKontextAction(
        romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
      );
      setSavePending(false);
      if (!result.success) {
        toast.error(result.error ?? "Geschichte leeren fehlgeschlagen.");
        return;
      }
      const saved = result.data!.roman;
      setRomanKeepCover(saved);
      const savedEd = saved.editorial ?? nextEditorial;
      setEditorial(savedEd);
      setManuskript(savedEd.manuskriptText ?? "");
      toast.success(`Geschichte ${cleverStoryNumber} geleert.`);
      return;
    }

    const improveMap = { ...(editorial.reifegradImprove ?? {}) };
    delete improveMap.manuskript;
    const reifegrade = { ...(editorial.reifegrade ?? {}) };
    delete reifegrade.manuskript;
    let nextEditorial = withLeserFeedbackForStage(
      {
        ...clearManuskriptAndExportEditorial(editorial),
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
      romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
    );
    setSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Manuskript leeren fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    setRomanKeepCover(saved);
    const savedEd = saved.editorial ?? nextEditorial;
    setEditorial(savedEd);
    setManuskript(savedEd.manuskriptText ?? "");
    toast.success("Manuskript geleert (Export-Texte mit).");
  }

  async function savePipelineFertig(
    tabId: keyof RomanPipelineFertig,
    fertig: boolean,
  ) {
    if (!canSave || savePending) return;
    const prevEditorial = editorial;
    // Szenenplot Fertig: Raum-Continuity nachschärfen + schreibPrompts einfrieren.
    if (
      tabId === "szenenplot" &&
      fertig &&
      prevEditorial.szenenplotStructured?.chapters.length
    ) {
      setSavePending(true);
      setEnrichSpatialMode("fertig");
      setEnrichSpatialPending(true);
      try {
        const enrich = await enrichSzenenplotSpatialAction({
          romanId: roman.id,
          freeze: true,
        });
        if (!enrich.success) {
          toast.error(enrich.error ?? "Szenenplot Fertig fehlgeschlagen.");
          return;
        }
        const saved = enrich.data!.roman;
        setRomanKeepCover(saved);
        let nextEditorial = withPipelineTabFertig(
          saved.editorial ?? prevEditorial,
          tabId,
          true,
        );
        const fertigSave = await saveRomanKontextAction(
          romanToSavePayload(saved, nextEditorial, fixedBuchTyp),
        );
        if (!fertigSave.success) {
          toast.error(
            fertigSave.error ?? "Fertig-Status speichern fehlgeschlagen.",
          );
          setEditorial(prevEditorial);
          return;
        }
        const savedEd = fertigSave.data!.roman.editorial ?? nextEditorial;
        setEditorial(savedEd);
        toast.success(
          enrich.data!.enriched
            ? "Szenenplot fertig · Raum-Continuity nachgeschärft · Verträge eingefroren."
            : "Szenenplot fertig · Verträge eingefroren.",
        );
      } finally {
        setEnrichSpatialPending(false);
        setEnrichSpatialMode("manual");
        setSavePending(false);
      }
      return;
    }

    let nextEditorial = withPipelineTabFertig(prevEditorial, tabId, fertig);
    setEditorial(nextEditorial);
    setSavePending(true);
    try {
      const result = await saveRomanKontextAction(
        romanToSavePayload(roman, nextEditorial, fixedBuchTyp),
      );
      if (!result.success) {
        toast.error(result.error ?? "Fertig-Status speichern fehlgeschlagen.");
        setEditorial(prevEditorial);
        return;
      }
      const savedEd = result.data!.roman.editorial ?? nextEditorial;
      // Prefer merged Fertig from what we just wrote (parse may omit keys).
      setRomanKeepCover(result.data!.roman);
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
          href={adminModule.basePath}
          className="text-sm font-bold text-orange-800 hover:underline"
        >
          ← Alle {adminModule.itemLabelPlural}
        </Link>
      </div>

      <p className="text-sm font-semibold text-zinc-600">
        {roman.title.trim() || "Unbenanntes Buch"}
      </p>

      <div
        role="tablist"
        aria-label={`${adminModule.label}-Pipeline`}
        className="flex flex-wrap gap-2"
      >
        {visibleTabs.map((item, index) => {
          const selected = tab === item.id;
          const filled = tabFilled[item.id];
          const fertig = isPipelineTabFertig(editorial, item.id);
          const locked = false;
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
              onClick={() => {
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
            </div>

            <div className="space-y-4 border-t border-zinc-100 pt-8">
              <RomanFundamentPanel
                mode="fields"
                buchTyp={fixedBuchTyp}
                value={fundament}
                onChange={setFundament}
                canSave={canSave}
                disabled={savePending}
                savePending={savePending}
                onSave={() => void saveFundament()}
                showRichtungen={!isCleverErzaehlt}
                romanId={roman.id}
                schreiberTonalitaetChat={
                  editorial.schreiberTonalitaetChat ?? []
                }
                onSchreiberTonalitaetApplied={({ tonalitaet, chat }) => {
                  setFundament((prev) => ({
                    ...prev,
                    schreiberSpracheTonalitaet: tonalitaet,
                  }));
                  setEditorial((prev) => ({
                    ...prev,
                    schreiberTonalitaetChat: chat,
                  }));
                  setRoman((prev) => ({
                    ...prev,
                    tonalitaet,
                    editorial: {
                      ...(prev.editorial ?? emptyRomanEditorial()),
                      schreiberTonalitaetChat: chat,
                    },
                  }));
                }}
              />
            </div>

            {typSet && !isCleverErzaehlt ? (
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
                    setRomanKeepCover(saved);
                    setEditorial((prev) => ({ ...prev, marktanalyse }));
                  }}
                />
              </div>
            ) : null}

            {typSet ? (
              <div className="space-y-4 border-t border-zinc-100 pt-8">
                <RomanFundamentPanel
                  mode="rules-save"
                  buchTyp={fixedBuchTyp}
                  value={fundament}
                  onChange={setFundament}
                  canSave={canSave}
                  disabled={savePending}
                  savePending={savePending}
                  onSave={() => void saveFundament()}
                  showRichtungen={!isCleverErzaehlt}
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
                  disabled={!canSave}
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
                    rolesHref={rolesHref}
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
        ) : tab === "recherche" ? (
          <div className="space-y-4">
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Recherche
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "recherche")}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) =>
                    void savePipelineFertig("recherche", v)
                  }
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <RomanRechercheQaPanel
                  romanId={roman.id}
                  messages={editorial.rechercheChat ?? []}
                  rechercheDossier={editorial.rechercheDossier ?? ""}
                  sources={editorial.rechercheSources ?? []}
                  canSave={canSave}
                  disabled={savePending || pipelineBusy}
                  hasIdee={(editorial.ideeKurz ?? "").trim().length >= 40}
                  onTurnComplete={({ messages, rechercheDossier, sources }) => {
                    setEditorial((prev) => ({
                      ...prev,
                      rechercheChat: messages,
                      rechercheDossier,
                      rechercheSources: sources,
                    }));
                    setRoman((prev) => ({
                      ...prev,
                      editorial: {
                        ...prev.editorial,
                        rechercheChat: messages,
                        rechercheDossier,
                        rechercheSources: sources,
                      },
                    }));
                  }}
                />
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
                  disabled={!canSave}
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
                  {(editorial.ideeKurz ?? "").trim().length >= 40 &&
                  (editorial.rechercheDossier ?? "").trim().length < 40 ? (
                    <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                      Optional: Im Schritt Recherche Hintergründe vertiefen —
                      Spec nutzt das Dossier mit.
                    </p>
                  ) : null}
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
                    rolesHref={rolesHref}
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
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Unterthemen
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "outline")}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) =>
                    void savePipelineFertig("outline", v)
                  }
                />
              </div>
              <CleverUnterthemenPanel
                romanId={roman.id}
                thema={fundament.genre || roman.genre}
                editorial={editorial}
                value={editorial.cleverUnterthemen}
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                onComplete={({ roman: saved, unterthemen }) => {
                  setRomanKeepCover(saved);
                  const nextEd = {
                    ...saved.editorial,
                    cleverUnterthemen: unterthemen,
                  };
                  setEditorial((prev) => ({
                    ...prev,
                    ...nextEd,
                  }));
                  if (saved.manuskriptRaw) {
                    setSzenenplot(
                      normalizePlotDocument(saved.manuskriptRaw),
                    );
                  }
                  setManuskript(nextEd.manuskriptText ?? "");
                }}
              />
            </section>
          </div>
        ) : tab === "grobgeruest" || tab === "feingeruest" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor(tab)}
                romanId={roman.id}
                stage={tab}
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.[tab]}
                stageImprovePlan={editorial.stageImprove?.[tab] ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  {tab === "grobgeruest" ? "Grobgerüst" : "Feingerüst"}
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, tab)}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig(tab, v)}
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                    {tab === "grobgeruest"
                      ? "Outline: Kapitel + Kernsatz + zentrale Spannungsbögen. Keine Einzelszenen."
                      : "Kapitel detaillieren: inhaltKurz, Props/Events, Arc-Beats. Szenen folgen im Grob-/Feinplot."}
                  </p>
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage={tab}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    showAssess
                    displayLabel={
                      tab === "grobgeruest" ? "Grobgerüst" : "Feingerüst"
                    }
                    rolesHref={rolesHref}
                    generateCascadeConfirm={generateCascadeConfirm(
                      editorial,
                      tab,
                    )}
                  />
                  <RomanWissensgraphTrigger graph={editorial.wissensGraph} />
                  <RomanKapitelGeruestPanel
                    hasExpose={hasExposeDoc}
                    value={kapitelGeruest}
                    structured={editorial.kapitelGeruestStructured}
                    disabled={savePending || pipelineBusy}
                    onClear={() => clearKapitelGeruest()}
                    clearPending={savePending}
                    staleBanner={downstreamStaleBanner(editorial, tab)}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "grobplot" || tab === "feinplot" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor(tab)}
                romanId={roman.id}
                stage={tab}
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.[tab]}
                stageImprovePlan={editorial.stageImprove?.[tab] ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  {tab === "grobplot" ? "Grobplot" : "Feinplot"}
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, tab)}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig(tab, v)}
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                    {tab === "grobplot"
                      ? "Szenen-Köpfe je Kapitel (Heading + Summary). Volle Verträge folgen im Feinplot."
                      : "Volle Szenenverträge + Schreibprompt. „Fertig“ friert die Prompts ein — Manuskript schreibt nur noch Prosa."}
                  </p>
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage={tab}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    showAssess
                    displayLabel={tab === "grobplot" ? "Grobplot" : "Feinplot"}
                    rolesHref={rolesHref}
                    generateCascadeConfirm={generateCascadeConfirm(
                      editorial,
                      tab,
                    )}
                  />
                  <RomanWissensgraphTrigger graph={editorial.wissensGraph} />
                  <RomanSzenenplotPanel
                    hasGeruest={hasGeruestDoc}
                    value={szenenplot}
                    onChange={setSzenenplot}
                    structured={editorial.szenenplotStructured}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy || enrichSpatialPending}
                    savePending={savePending}
                    onSave={() => void saveSzenenplot()}
                    onClear={() => clearSzenenplot()}
                    clearPending={savePending}
                    enrichSpatialPending={enrichSpatialPending}
                    enrichSpatialMode={enrichSpatialMode}
                    onEnrichSpatial={async () => {
                      if (!canSave || enrichSpatialPending) return;
                      setEnrichSpatialMode("manual");
                      setEnrichSpatialPending(true);
                      try {
                        const result = await enrichSzenenplotSpatialAction({
                          romanId: roman.id,
                          force: true,
                        });
                        if (!result.success) {
                          toast.error(
                            result.error ??
                              "Raum-Continuity nachschärfen fehlgeschlagen.",
                          );
                          return;
                        }
                        setRomanKeepCover(result.data!.roman);
                        setEditorial(
                          result.data!.roman.editorial ?? editorial,
                        );
                        toast.success(
                          "Raum-Continuity (Ort/Etage/Props) nachgeschärft.",
                        );
                      } finally {
                        setEnrichSpatialPending(false);
                        setEnrichSpatialMode("manual");
                      }
                    }}
                    staleBanner={downstreamStaleBanner(editorial, tab)}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "schreiben" ? (
          <div className="space-y-4">
            {typSet && !isCleverErzaehlt ? (
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
                  {isCleverErzaehlt ? "Kurzgeschichten" : "Manuskript"}
                </h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "schreiben")}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) =>
                    void savePipelineFertig("schreiben", v)
                  }
                />
              </div>
              {isCleverErzaehlt ? (
                <p className="text-sm font-semibold text-zinc-600">
                  Zehn unabhängige Wissens-Abenteuer — je Unterthema eines.
                  Reihenfolge wie im Buch: Geschichte → Infografik →
                  Abenteuer-Wissen. Wähle eine Geschichte; im Feld erscheint nur
                  die Prosa.
                </p>
              ) : null}
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  {!isCleverErzaehlt ? (
                    <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                      Vor „Erzeugen“: Szenenplot fertig (Schreibprompts
                      eingefroren) oder Logik/Dramaturgie ≥75%. Co-Autor schreibt
                      kapitelweise Prosa (Stil, Ton, Emotion — Show, don’t
                      tell). Oben Kapitel wählen — im Feld nur dieses Kapitel;
                      Buch-Wortzahl bleibt sichtbar.
                    </p>
                  ) : null}
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="manuskript"
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "manuskript")}
                    hasLeserArtifact={
                      isCleverErzaehlt
                        ? undefined
                        : hasFilledManuskript(manuskript)
                    }
                    showAssess={!isCleverErzaehlt}
                    rolesHref={rolesHref}
                    cleverStories={isCleverErzaehlt}
                  />
                  {!isCleverErzaehlt ? (
                    <>
                      <RomanWissensgraphTrigger
                        graph={editorial.wissensGraph}
                      />
                      <RomanContinuityTrigger
                        storyState={editorial.storyState}
                      />
                    </>
                  ) : null}
                  <RomanManuskriptChapterControl
                    romanId={roman.id}
                    plotMarkdown={szenenplot}
                    manuskriptMarkdown={manuskript}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                    mode={isCleverErzaehlt ? "clever" : "roman"}
                    chapterNumber={
                      isCleverErzaehlt
                        ? cleverStoryNumber
                        : manuskriptChapterNumber
                    }
                    onChapterNumberChange={
                      isCleverErzaehlt
                        ? setCleverStoryNumber
                        : setManuskriptChapterNumber
                    }
                    cleverUnterthemen={
                      isCleverErzaehlt
                        ? editorial.cleverUnterthemen ?? null
                        : null
                    }
                    cleverGeschichteImprove={
                      isCleverErzaehlt
                        ? editorial.cleverGeschichteImprove ?? null
                        : null
                    }
                    cleverGeschichteImproveCount={
                      isCleverErzaehlt
                        ? editorial.cleverGeschichteImproveCount ?? null
                        : null
                    }
                    cleverGeschichteOk={
                      isCleverErzaehlt
                        ? editorial.cleverGeschichteOk ?? null
                        : null
                    }
                  />
                  <RomanManuskriptPanel
                    hasSzenenplot={hasSzenenplotDoc}
                    value={
                      parsePlotChapters(manuskript).find(
                        (c) =>
                          c.number ===
                          (isCleverErzaehlt
                            ? cleverStoryNumber
                            : manuskriptChapterNumber),
                      )?.body ?? ""
                    }
                    onChange={(next) => {
                      const n = isCleverErzaehlt
                        ? cleverStoryNumber
                        : manuskriptChapterNumber;
                      setManuskript(
                        replaceManuskriptChapterBody(
                          manuskript,
                          szenenplot,
                          n,
                          isCleverErzaehlt
                            ? stripErzaehlerWrappers(next)
                            : next,
                        ),
                      );
                    }}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    savePending={savePending}
                    onSave={() => void saveManuskript()}
                    onClear={() => clearManuskript()}
                    clearPending={savePending}
                    zielWortzahl={
                      isCleverErzaehlt
                        ? null
                        : editorial.zielWortzahlRoman
                    }
                    mode={isCleverErzaehlt ? "clever" : "roman"}
                    bookMarkdown={isCleverErzaehlt ? null : manuskript}
                    focusChapter={
                      isCleverErzaehlt
                        ? {
                            number: cleverStoryNumber,
                            title:
                              editorial.cleverUnterthemen?.kapitel.find(
                                (k) => k.nummer === cleverStoryNumber,
                              )?.titel?.trim() ||
                              cleverPlotChapters.find(
                                (c) => c.number === cleverStoryNumber,
                              )?.title ||
                              parsePlotChapters(manuskript).find(
                                (c) => c.number === cleverStoryNumber,
                              )?.title ||
                              "",
                          }
                        : {
                            number: manuskriptChapterNumber,
                            title:
                              sanitizeChapterTitle(
                                romanPlotChapters.find(
                                  (c) => c.number === manuskriptChapterNumber,
                                )?.title ??
                                  parsePlotChapters(manuskript).find(
                                    (c) =>
                                      c.number === manuskriptChapterNumber,
                                  )?.title ??
                                  "",
                                manuskriptChapterNumber,
                              ) || `Kapitel ${manuskriptChapterNumber}`,
                          }
                    }
                    abenteuerWissenFakten={
                      isCleverErzaehlt
                        ? (editorial.cleverUnterthemen?.kapitel.find(
                            (k) => k.nummer === cleverStoryNumber,
                          )?.fakten ?? null)
                        : null
                    }
                    romanId={isCleverErzaehlt ? roman.id : null}
                    infografik={
                      isCleverErzaehlt
                        ? (() => {
                            const kap =
                              editorial.cleverUnterthemen?.kapitel.find(
                                (k) => k.nummer === cleverStoryNumber,
                              );
                            if (!kap) return null;
                            return {
                              dataUrl: kap.infografikDataUrl,
                              prompt: kap.infografikPrompt,
                              modelLabel: kap.infografikModelLabel,
                              generatedAt: kap.infografikGeneratedAt,
                            };
                          })()
                        : null
                    }
                    onInfografikComplete={({ roman: saved, unterthemen }) => {
                      setRomanKeepCover(saved);
                      setEditorial((prev) => ({
                        ...prev,
                        ...saved.editorial,
                        cleverUnterthemen: unterthemen,
                      }));
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "roman" ? (
          <div className="space-y-4">
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Roman</h2>
                <RomanStepFertigToggle
                  checked={isPipelineTabFertig(editorial, "roman")}
                  disabled={!canSave}
                  pending={savePending}
                  onCheckedChange={(v) => void savePipelineFertig("roman", v)}
                />
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                    Feinschliff aus dem Manuskript: Verbessern (Autor / Opus,
                    Claude Batch) füllt Kapitel hier — das Manuskript bleibt als
                    Entwurf und Vergleich erhalten.
                  </p>
                  <RomanManuskriptVerbessernControl
                    romanId={roman.id}
                    editorial={editorial}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    onComplete={syncFromPipelineRoman}
                  />
                  {romanNavChapters.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {romanNavChapters.map((ch) => {
                        const filled = Boolean(
                          parsePlotChapters(romanBook).find(
                            (c) => c.number === ch.number,
                          )?.body.trim(),
                        );
                        const selected = ch.number === romanChapterNumber;
                        return (
                          <button
                            key={ch.number}
                            type="button"
                            disabled={savePending || pipelineBusy}
                            onClick={() => setRomanChapterNumber(ch.number)}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition",
                              selected
                                ? "bg-amber-800 text-white ring-amber-800"
                                : filled
                                  ? "bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100/80"
                                  : "bg-white text-zinc-600 ring-zinc-950/10 hover:bg-zinc-50",
                            )}
                          >
                            Kap. {ch.number}
                            {filled ? "" : " · leer"}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                      Zuerst ein Manuskript erzeugen — danach erscheint hier die
                      Kapitelstruktur.
                    </p>
                  )}
                  <RomanManuskriptPanel
                    hasSzenenplot={hasSzenenplotDoc}
                    value={
                      parsePlotChapters(romanBook).find(
                        (c) => c.number === romanChapterNumber,
                      )?.body ?? ""
                    }
                    onChange={(next) => {
                      setRomanBook(
                        replaceManuskriptChapterBody(
                          romanBook,
                          szenenplot || manuskript,
                          romanChapterNumber,
                          next,
                        ),
                      );
                    }}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    savePending={savePending}
                    onSave={() => void saveRomanBook()}
                    onClear={() => void clearRomanBook()}
                    clearPending={savePending}
                    zielWortzahl={editorial.zielWortzahlRoman}
                    mode="roman"
                    bookMarkdown={romanBook}
                    focusChapter={{
                      number: romanChapterNumber,
                      title:
                        sanitizeChapterTitle(
                          romanNavChapters.find(
                            (c) => c.number === romanChapterNumber,
                          )?.title ??
                            parsePlotChapters(romanBook).find(
                              (c) => c.number === romanChapterNumber,
                            )?.title ??
                            "",
                          romanChapterNumber,
                        ) || `Kapitel ${romanChapterNumber}`,
                    }}
                    clearDialog={{
                      title: "Roman leeren?",
                      description:
                        "Nur der Feinschliff (Roman-Tab) wird gelöscht. Das Manuskript, der Szenenplot und Export-Texte bleiben erhalten.",
                      confirmLabel: "Roman leeren",
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        ) : tab === "export" ? (
          <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-zinc-950">Export</h2>
              <RomanStepFertigToggle
                checked={isPipelineTabFertig(editorial, "export")}
                disabled={!canSave}
                pending={savePending}
                onCheckedChange={(v) => void savePipelineFertig("export", v)}
              />
            </div>
            {!typSet ? (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                Zuerst Buchtyp wählen.
              </p>
            ) : (
              <div className="space-y-10">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-extrabold text-zinc-950">
                      Cover
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-zinc-600">
                      Cover erzeugen und speichern — danach in PDF mit Cover
                      nutzbar.
                    </p>
                  </div>
                  <RomanCoverPanel
                    romanId={roman.id}
                    title={roman.title}
                    coverImageDataUrl={roman.coverImageDataUrl || null}
                    coverPrompt={roman.coverPrompt || null}
                    canSave={canSave}
                    disabled={savePending}
                    isCleverErzaehlt={isCleverErzaehlt}
                    onComplete={(patch) => {
                      setRoman((prev) => ({
                        ...prev,
                        coverImageDataUrl: patch.coverImageDataUrl ?? "",
                        coverPrompt: patch.coverPrompt ?? "",
                      }));
                    }}
                  />
                </div>
                <RomanExportMarketingPanel
                  roman={roman}
                  editorial={editorial}
                  canSave={canSave}
                  disabled={savePending}
                  onComplete={(patch) => {
                    setEditorial((prev) => ({
                      ...prev,
                      klappentext: patch.klappentext,
                      einzeiler: patch.einzeiler,
                      amazonKeywords: patch.amazonKeywords,
                    }));
                    setRoman((prev) => ({
                      ...prev,
                      autorName:
                        patch.autorName?.trim() || prev.autorName,
                      vorsatz: patch.vorsatz ?? prev.vorsatz,
                      editorial: {
                        ...(prev.editorial ?? emptyRomanEditorial()),
                        klappentext: patch.klappentext,
                        einzeiler: patch.einzeiler,
                        amazonKeywords: patch.amazonKeywords,
                      },
                    }));
                  }}
                />
              </div>
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
