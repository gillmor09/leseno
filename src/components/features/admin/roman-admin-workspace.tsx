"use client";

/**
 * Book admin tab shell (9-phase process):
 * Idee → Rahmen → Fundament → Exposé → Graph → Plot → Szenen → Manuskript
 * (+ Export / Hörbuch). Clever: Basics → Unterthemen → Geschichten.
 * Freigabe (canon) is separate from Hard-Gates — see `roman-phase-freigabe-bar`.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { romanDeriveBasicsFromIdeeAction } from "@/app/actions/roman-basics-from-idee";
import { saveRomanKontextAction } from "@/app/actions/roman-admin";
import {
  applyManuskriptFreigabeFixesAction,
  auditManuskriptFreigabeAction,
} from "@/app/actions/roman-manuskript-freigabe";
import {
  hardManuskriptFreigabeFindings,
  type ManuskriptFreigabeFinding,
} from "@/lib/roman/editorial";
import { enrichSzenenplotSpatialAction } from "@/app/actions/roman-szenenplot-spatial";
import { ManuskriptFreigabeDialog } from "@/components/features/admin/manuskript-freigabe-dialog";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { CleverUnterthemenPanel } from "@/components/features/admin/clever-unterthemen-panel";
import { RomanCharakterePanel } from "@/components/features/admin/roman-charaktere-panel";
import { RomanCoverPanel } from "@/components/features/admin/roman-cover-panel";
import { ExportPanelErrorBoundary } from "@/components/features/admin/export-panel-error-boundary";
import { RomanExposePanel } from "@/components/features/admin/roman-expose-panel";
import { forceUnlockBodyScroll } from "@/lib/ui/body-scroll-lock";

/** Lazy: jspdf/JSZip must not block other tabs or kill navigation. */
const RomanExportMarketingPanel = dynamic(
  () =>
    import("@/components/features/admin/roman-export-marketing-panel").then(
      (m) => m.RomanExportMarketingPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm font-semibold text-zinc-500">
        Export wird geladen …
      </p>
    ),
  },
);

const RomanHoerbuchPanel = dynamic(
  () =>
    import("@/components/features/admin/roman-hoerbuch-panel").then(
      (m) => m.RomanHoerbuchPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm font-semibold text-zinc-500">
        Hörbuch wird geladen …
      </p>
    ),
  },
);
import {
  RomanFundamentPanel,
  fundamentBasicsFromState,
  type FundamentBasics,
} from "@/components/features/admin/roman-fundament-panel";
import { RomanIdeeQaPanel } from "@/components/features/admin/roman-idee-qa-panel";
import { RomanManuskriptPanel } from "@/components/features/admin/roman-manuskript-panel";
import { RomanManuskriptChapterControl } from "@/components/features/admin/roman-manuskript-chapter-control";
import { RomanManuskriptVerbessernControl } from "@/components/features/admin/roman-manuskript-verbessern-control";
import { RomanContinuityTrigger } from "@/components/features/admin/roman-continuity-overlay";
import { RomanManuskriptContinuityControl } from "@/components/features/admin/roman-manuskript-continuity-control";
import { RomanMarktanalysePanel } from "@/components/features/admin/roman-marktanalyse-panel";
import { RomanPipelineHistoryPanel } from "@/components/features/admin/roman-pipeline-history-panel";
import { RomanPipelineStageActions } from "@/components/features/admin/roman-pipeline-stage-actions";
import {
  gateKeyForPipelineTab,
  prerequisiteGateKeyForTab,
  RomanStageHardGateBanner,
} from "@/components/features/admin/roman-stage-hard-gate-banner";
import { RomanPhaseFreigabeBar } from "@/components/features/admin/roman-phase-freigabe-bar";
import {
  RomanProcessPhaseStrip,
  type RomanNavStep,
} from "@/components/features/admin/roman-process-phase-strip";
import { evaluateStageHardGate } from "@/lib/roman/stage-hard-gates";
import { migrateEditorialPhaseState } from "@/lib/roman/migrate-phase-state";
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
import {
  RomanWeltPanel,
  type WeltBasics,
} from "@/components/features/admin/roman-welt-panel";
import {
  getRomanAdminModule,
  type RomanAdminModuleId,
} from "@/lib/roman/admin-module";
import {
  applyAlterPresetToEditorial,
  basicsDerivationIsStale,
  emptyRomanEditorial,
  exposeTextFromEditorial,
  leserFeedbackForStage,
  tonalitaetFromRichtungen,
  withExposeText,
  withLeserFeedbackForStage,
  withStageImprove,
  type RomanEditorial,
} from "@/lib/roman/editorial";
import {
  approveRomanPhaseAction,
  importRomanIdeeTextAction,
} from "@/app/actions/roman-phase-freigabe";
import { emptyCharakter, hasFilledCharaktere } from "@/lib/roman/fundament";
import {
  basicsLookEmptyForAutoDerive,
  hasFilledCleverUnterthemen,
  hasFilledExpose,
  hasFilledKapitelGeruest,
  hasFilledManuskript,
  hasFilledSzenenplot,
  hasFilledWelt,
} from "@/lib/roman/fill-checks";
import {
  normalizeManuskriptDocument,
  normalizePlotDocument,
  parsePlotChapters,
  replaceManuskriptChapterBody,
  sanitizeChapterTitle,
  serializeManuskriptChapters,
} from "@/lib/roman/plot-chapters";
import { stripErzaehlerWrappers } from "@/lib/roman/clever-geschichte-strip";
import { applyCleverThemaTitlesToManuskript } from "@/lib/roman/clever-manuskript-titles";
import { buildCleverThemaStanceForThema } from "@/lib/roman/clever-thema-stance";
import type {
  RomanCharakter,
  RomanIdeaChatMessage,
  RomanKontext,
} from "@/lib/roman/types";
import type { PipelineStage } from "@/lib/roman/pipeline/stages";
import { cn } from "@/lib/utils";

const PIPELINE_TABS = [
  { id: "idee", label: "Idee" },
  { id: "typ", label: "Rahmen" },
  { id: "fundament", label: "Fundament" },
  { id: "expose", label: "Exposé" },
  { id: "graph", label: "Graph" },
  { id: "plot", label: "Plot" },
  { id: "szenen", label: "Szenen" },
  /** Clever: Unterthemen. */
  { id: "outline", label: "Unterthemen" },
  /** Legacy alias kept for Clever redirects / bookmarks. */
  { id: "feinplot", label: "Plot" },
  { id: "spec", label: "Spec" },
  { id: "schreiben", label: "Manuskript" },
  { id: "export", label: "Export" },
  { id: "hoerbuch", label: "Hörbuch" },
] as const;

type TabId = (typeof PIPELINE_TABS)[number]["id"];

/** Map UI tab → pipeline origin_stage for KI-Historie filter. */
const TAB_PIPELINE_STAGE: Partial<Record<TabId, string>> = {
  idee: "idee",
  typ: "rahmen",
  fundament: "fundament",
  expose: "expose",
  graph: "graph",
  plot: "plot",
  szenen: "szenen",
  spec: "expose",
  outline: "szenen",
  feinplot: "szenen",
  schreiben: "manuskript",
};

const TAB_FOR_NAV_STEP: Partial<Record<RomanNavStep, TabId>> = {
  idee: "idee",
  rahmen: "typ",
  fundament: "fundament",
  expose: "expose",
  graph: "graph",
  plot: "plot",
  szenen: "szenen",
  manuskript: "schreiben",
  /** Lektorat tools live on Manuskript. */
  lektorat: "schreiben",
  export: "export",
};

const NAV_STEP_FOR_TAB: Partial<Record<TabId, RomanNavStep>> = {
  idee: "idee",
  typ: "rahmen",
  fundament: "fundament",
  expose: "expose",
  graph: "graph",
  plot: "plot",
  szenen: "szenen",
  feinplot: "szenen",
  spec: "expose",
  schreiben: "manuskript",
  export: "export",
  hoerbuch: "export",
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
  const [editorial, setEditorial] = useState<RomanEditorial>(() =>
    withFixedTyp(
      migrateEditorialPhaseState({
        ...initialRoman,
        editorial: initialRoman.editorial ?? emptyRomanEditorial(),
      }),
    ),
  );
  const [ideeImportText, setIdeeImportText] = useState("");
  const [ideeImportPending, startIdeeImportTransition] = useTransition();
  const phaseMigratedRef = useRef(false);
  useEffect(() => {
    if (phaseMigratedRef.current || isCleverErzaehlt) return;
    phaseMigratedRef.current = true;
    const migrated = migrateEditorialPhaseState({
      ...roman,
      editorial,
    });
    if (JSON.stringify(migrated.phaseState) !== JSON.stringify(editorial.phaseState)) {
      setEditorial(withFixedTyp(migrated));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot soft migration
  }, []);

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
  const [tab, setTab] = useState<TabId>(() => {
    if (moduleId === "clever_erzaehlt") return "typ";
    const ideeLen = (initialRoman.editorial?.ideeKurz ?? "").trim().length;
    return ideeLen < 80 ? "idee" : "typ";
  });
  const [basicsDeriveConfirmOpen, setBasicsDeriveConfirmOpen] = useState(false);
  const [basicsDerivePending, startBasicsDeriveTransition] = useTransition();
  const autoBasicsDeriveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Recover from stuck modal scroll-lock (dead Links / untouchable UI).
    forceUnlockBodyScroll();
  }, []);

  const [savePending, setSavePending] = useState(false);
  const [enrichSpatialPending, setEnrichSpatialPending] = useState(false);
  const [freigabeFindings, setFreigabeFindings] = useState<
    ManuskriptFreigabeFinding[] | null
  >(null);
  const [freigabePendingMode, setFreigabePendingMode] = useState<
    "nachziehen" | "freigeben" | null
  >(null);
  const [enrichSpatialMode, setEnrichSpatialMode] = useState<
    "manual" | "fertig"
  >("manual");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  /** Clever: which Kurzgeschichte is shown in the editor. */
  const [cleverStoryNumber, setCleverStoryNumber] = useState(1);
  /** Roman: which Manuskript chapter is shown in the editor. */
  const [manuskriptChapterNumber, setManuskriptChapterNumber] = useState(1);
  /** Stil-Pass output (`romanText`); updated via Verbessern / pipeline sync. */
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
          t.id === "typ" ||
          t.id === "outline" ||
          t.id === "schreiben" ||
          t.id === "export" ||
          t.id === "hoerbuch",
      ).map((t) =>
        t.id === "schreiben" ? { ...t, label: "Geschichten" } : t,
      );
    }
    return PIPELINE_TABS.filter(
      (t) =>
        t.id !== "outline" &&
        t.id !== "feinplot" &&
        t.id !== "spec",
    );
  }, [isCleverErzaehlt]);

  /** Legacy tab ids from bookmarks / in-memory state before tab collapse. */
  const legacyTab = tab as string;
  if (
    isCleverErzaehlt &&
    (tab === "idee" ||
      tab === "spec" ||
      tab === "feinplot" ||
      tab === "fundament" ||
      tab === "expose" ||
      tab === "graph" ||
      tab === "plot" ||
      tab === "szenen")
  ) {
    setTab("typ");
  }
  if (!isCleverErzaehlt && legacyTab === "spec") {
    setTab("expose");
  }
  if (!isCleverErzaehlt && legacyTab === "feinplot") {
    setTab("szenen");
  }
  if (
    !isCleverErzaehlt &&
    (legacyTab === "grobgeruest" ||
      legacyTab === "kapitelgeruest" ||
      legacyTab === "feingeruest")
  ) {
    setTab("plot");
  }
  if (
    !isCleverErzaehlt &&
    (legacyTab === "grobplot" ||
      legacyTab === "szenenplot" ||
      legacyTab === "outline")
  ) {
    setTab("szenen");
  }
  if (legacyTab === "roman") {
    setTab("schreiben");
  }
  if (!isCleverErzaehlt && legacyTab === "hoerbuch") {
    setTab("export");
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

  function reifegradFor(stage: PipelineStage) {
    return editorial.reifegrade?.[stage] ?? null;
  }

  /** Soft status: whether the tab already has usable content. */
  const tabFilled = useMemo((): Record<TabId, boolean> => {
    const rahmenFilled =
      fundament.genre.trim().length >= 2 &&
      fundament.schreiberSpracheTonalitaet.trim().length >= 40 &&
      fundament.grobRegeln.trim().length >= 40;
    const fundamentFilled =
      hasFilledCharaktere(charaktere) && hasFilledWelt(welt);
    return {
      typ: rahmenFilled,
      idee: (editorial.ideeKurz ?? "").trim().length >= 40,
      fundament: fundamentFilled,
      expose: hasFilledExpose(expose),
      graph: Boolean(editorial.wissensGraph?.nodes?.length),
      plot: hasGeruestDoc,
      szenen: hasSzenenplotDoc,
      spec: fundamentFilled && hasFilledExpose(expose),
      outline: isCleverErzaehlt
        ? hasFilledCleverUnterthemen(editorial.cleverUnterthemen, editorial)
        : hasSzenenplotDoc,
      feinplot: hasSzenenplotDoc || hasGeruestDoc,
      schreiben: hasFilledManuskript(manuskript),
      export:
        Boolean(roman.coverImageDataUrl?.trim()) ||
        ((editorial.klappentext ?? "").trim().length >= 40 &&
          (editorial.einzeiler ?? "").trim().length >= 8),
      hoerbuch:
        hasFilledManuskript(manuskript) || hasFilledManuskript(romanBook),
    };
  }, [
    fundament.genre,
    fundament.schreiberSpracheTonalitaet,
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

  const currentGateKey = gateKeyForPipelineTab(tab);
  const currentStageGate = currentGateKey
    ? evaluateStageHardGate({
        stage: currentGateKey,
        editorial,
        tonalitaet: roman.tonalitaet,
        genre: roman.genre,
      })
    : null;
  const activeNavStep = NAV_STEP_FOR_TAB[tab] ?? null;
  const prereqGateKey = prerequisiteGateKeyForTab(tab);
  const prereqGate = prereqGateKey
    ? evaluateStageHardGate({
        stage: prereqGateKey,
        editorial,
        tonalitaet: roman.tonalitaet,
        genre: roman.genre,
      })
    : null;
  const hardGateBlocksErzeugen = Boolean(prereqGate && !prereqGate.ok);

  const ideeStageGate = !isCleverErzaehlt
    ? evaluateStageHardGate({
        stage: "idee",
        editorial,
        tonalitaet: roman.tonalitaet,
        genre: roman.genre,
      })
    : null;
  const basicsStale = basicsDerivationIsStale(
    editorial,
    editorial.ideeKurz ?? "",
  );
  const basicsEmptyForAuto = basicsLookEmptyForAutoDerive({
    genre: roman.genre,
    tonalitaet: roman.tonalitaet,
    editorial,
  });

  /** Once when Idee-Gate first green and Basics still empty — no overwrite of filled fields. */
  useEffect(() => {
    if (!canSave || isCleverErzaehlt || basicsDerivePending) return;
    if (!ideeStageGate?.ok) return;
    if (!basicsEmptyForAuto) return;
    const key = `${roman.id}:${(editorial.ideeKurz ?? "").trim().slice(0, 80)}`;
    if (autoBasicsDeriveKeyRef.current === key) return;
    autoBasicsDeriveKeyRef.current = key;
    startBasicsDeriveTransition(async () => {
      const result = await romanDeriveBasicsFromIdeeAction({
        romanId: roman.id,
        force: false,
      });
      if (!result.success || !result.data) {
        if (
          result.error &&
          !/schon gefüllt|Hard-Gate noch rot/i.test(result.error)
        ) {
          toast.error(result.error);
        }
        return;
      }
      syncFromPipelineRoman(result.data.roman);
      toast.message("Basics aus Idee abgeleitet — bitte nachschärfen.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kick once per empty+green Idee
  }, [
    canSave,
    isCleverErzaehlt,
    ideeStageGate?.ok,
    basicsEmptyForAuto,
    roman.id,
    editorial.ideeKurz,
    basicsDerivePending,
  ]);

  function runBasicsDeriveFromIdee(force: boolean) {
    startBasicsDeriveTransition(async () => {
      const result = await romanDeriveBasicsFromIdeeAction({
        romanId: roman.id,
        force,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Basics-Ableitung fehlgeschlagen.");
        return;
      }
      syncFromPipelineRoman(result.data.roman);
      setBasicsDeriveConfirmOpen(false);
      toast.message(
        force
          ? "Basics neu aus Idee abgeleitet."
          : "Basics aus Idee abgeleitet.",
      );
    });
  }

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
        // Graph was seeded/grown for this Plot — reset with the structure.
        wissensGraph: null,
        reifegradImprove: improveMap,
        reifegrade: reifegrade as typeof editorial.reifegrade,
      },
      "feinplot",
      null,
    );
    nextEditorial = withStageImprove(nextEditorial, "feinplot", null);
    nextEditorial = invalidateDownstreamEditorial(nextEditorial, "feinplot");
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

  /** Manuskript-Freigabe: Seam/Payoff-Audit, then phase approve (replaces Fertig). */
  async function runManuskriptPhaseFreigabe(options?: { override?: boolean }) {
    if (!canSave || savePending) return;
    setSavePending(true);
    if (options?.override) setFreigabePendingMode("freigeben");
    try {
      const audit = await auditManuskriptFreigabeAction({
        romanId: roman.id,
        override: options?.override === true,
      });
      if (!audit.success || !audit.data) {
        toast.error(audit.error ?? "Freigabe-Check fehlgeschlagen.");
        return;
      }
      setRomanKeepCover(audit.data.roman);
      setEditorial(audit.data.roman.editorial ?? editorial);
      setManuskript(audit.data.roman.editorial?.manuskriptText ?? manuskript);
      // Soft Assist/Stil never blocks phase freigabe — only hard Canon/Ledger/Nahtdopp.
      const hardFindings = hardManuskriptFreigabeFindings(
        audit.data.findings,
      );
      if (!options?.override && hardFindings.length > 0) {
        setFreigabeFindings(audit.data.findings);
        toast.message(audit.data.summary);
        return;
      }
      const approved = await approveRomanPhaseAction({
        romanId: roman.id,
        phase: "manuskript",
      });
      if (!approved.success || !approved.data) {
        toast.error(approved.error ?? "Freigabe fehlgeschlagen.");
        return;
      }
      syncFromPipelineRoman(approved.data.roman);
      setFreigabeFindings(null);
      toast.success(
        options?.override
          ? "Manuskript freigegeben trotz Hinweise — Stil-Pass ist freigeschaltet."
          : audit.data.summary || "Manuskript freigegeben.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Freigabe-Check fehlgeschlagen.",
      );
    } finally {
      setSavePending(false);
      setFreigabePendingMode(null);
    }
  }

  async function confirmFreigabeTrotzHinweise() {
    if (!freigabeFindings || savePending) return;
    await runManuskriptPhaseFreigabe({ override: true });
  }

  async function nachziehenFreigabeHinweise() {
    if (!freigabeFindings || savePending) return;
    setSavePending(true);
    setFreigabePendingMode("nachziehen");
    try {
      const result = await applyManuskriptFreigabeFixesAction({
        romanId: roman.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Nachziehen fehlgeschlagen.");
        return;
      }
      const saved = result.data.roman;
      setRomanKeepCover(saved);
      const savedEd = saved.editorial ?? editorial;
      setEditorial(savedEd);
      setManuskript(savedEd.manuskriptText ?? "");

      // Directly refresh like „Erneut prüfen“ (keep settled from Nachziehen).
      const audit = await auditManuskriptFreigabeAction({
        romanId: roman.id,
        preserveSettled: true,
      });
      if (audit.success && audit.data) {
        setRomanKeepCover(audit.data.roman);
        setEditorial(audit.data.roman.editorial ?? savedEd);
        setManuskript(
          audit.data.roman.editorial?.manuskriptText ??
            savedEd.manuskriptText ??
            "",
        );
        const hard = (audit.data.findings ?? []).filter((f) => !f.soft);
        if (result.data.autoFreigegeben || hard.length === 0) {
          setFreigabeFindings(null);
          toast.success(
            result.data.autoFreigegeben
              ? result.data.summary
              : audit.data.summary,
          );
          return;
        }
        setFreigabeFindings(audit.data.findings);
        toast.message(`${result.data.summary} · ${audit.data.summary}`);
        return;
      }

      if (result.data.autoFreigegeben) {
        setFreigabeFindings(null);
        toast.success(result.data.summary);
        return;
      }
      setFreigabeFindings(
        result.data.findings.length > 0 ? result.data.findings : null,
      );
      toast.message(result.data.summary);
    } finally {
      setSavePending(false);
      setFreigabePendingMode(null);
    }
  }

  return (
    <div className="space-y-6">
      <ManuskriptFreigabeDialog
        open={Boolean(freigabeFindings?.length)}
        findings={freigabeFindings ?? []}
        pending={savePending && freigabePendingMode != null}
        pendingMode={freigabePendingMode}
        onClose={() => {
          if (!savePending) setFreigabeFindings(null);
        }}
        onNachziehen={() => void nachziehenFreigabeHinweise()}
        onTrotzdemFreigeben={() => void confirmFreigabeTrotzHinweise()}
      />
      <RomanSceneWaitDialog
        open={freigabePendingMode === "nachziehen" && savePending}
        variant="manuskript-vereinfachen"
        contextLabel="Manuskript · Hinweise nachziehen"
        title="Nähte & Emotion nachziehen"
        progressLabel="Co-Autor schärft betroffene Kapitel (günstig) …"
      />
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

      {!isCleverErzaehlt ? (
        <RomanProcessPhaseStrip
          roman={roman}
          editorial={editorial}
          activeStep={activeNavStep}
          onSelectStep={(step) => {
            const next = TAB_FOR_NAV_STEP[step];
            if (next) {
              forceUnlockBodyScroll();
              setTab(next);
            }
          }}
        />
      ) : (
        <div
          role="tablist"
          aria-label={`${adminModule.label}-Pipeline`}
          className="flex flex-wrap gap-2"
        >
          {visibleTabs.map((item, index) => {
            const selected = tab === item.id;
            const filled = tabFilled[item.id];
            const StatusIcon = filled ? CheckCircle2 : Circle;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`${index + 1}. ${item.label}${
                  filled ? " (Inhalt vorhanden)" : " (noch leer)"
                }`}
                onClick={() => {
                  forceUnlockBodyScroll();
                  setTab(item.id);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ring-1 transition",
                  selected
                    ? "bg-orange-700 text-white ring-orange-700"
                    : "bg-white text-zinc-700 ring-zinc-950/10 hover:bg-zinc-50",
                )}
              >
                <StatusIcon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0",
                    filled
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
      )}

      <div role="tabpanel" className="min-w-0 space-y-6">
        {tab === "typ" ? (
          <section className="space-y-8 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  {isCleverErzaehlt ? "Basics" : "Rahmen"}
                </h2>
              </div>
              <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                Nach freigegebener Idee: Genre, Sprache &amp; Tonalität und
                Basis-Regeln (editierbar) — Priority-0-Canon. Perspektive,
                Zeitform, Umfang und Grenzen hier festziehen; dann freigeben.
              </p>
              {!isCleverErzaehlt &&
              prereqGateKey === "idee" &&
              prereqGate &&
              !prereqGate.ok ? (
                <RomanStageHardGateBanner
                  romanId={roman.id}
                  gateKey="idee"
                  gate={prereqGate}
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
              ) : null}
              {!isCleverErzaehlt &&
              (currentGateKey === "rahmen" || currentGateKey === "basics") &&
              currentStageGate ? (
                <RomanStageHardGateBanner
                  romanId={roman.id}
                  gateKey="rahmen"
                  gate={currentStageGate}
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
              ) : null}
              {!isCleverErzaehlt ? (
                <RomanPhaseFreigabeBar
                  roman={roman}
                  editorial={editorial}
                  phase="rahmen"
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
              ) : null}
              {!isCleverErzaehlt &&
              ideeStageGate?.ok &&
              basicsStale &&
              !basicsEmptyForAuto ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Idee hat sich geändert — Basics-Ableitung ist veraltet. Bitte
                  „Neu aus Idee ableiten“ oder manuell nachschärfen.
                </p>
              ) : null}
              {!isCleverErzaehlt && editorial.basicsDerivedBegruendung ? (
                <p className="rounded-2xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-950/8">
                  <span className="font-extrabold text-zinc-950">
                    Ableitung:{" "}
                  </span>
                  {editorial.basicsDerivedBegruendung}
                </p>
              ) : null}
              {!isCleverErzaehlt ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={
                      !canSave ||
                      basicsDerivePending ||
                      !ideeStageGate?.ok ||
                      (editorial.ideeKurz ?? "").trim().length < 80
                    }
                    className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                    onClick={() => {
                      if (!basicsEmptyForAuto) {
                        setBasicsDeriveConfirmOpen(true);
                        return;
                      }
                      runBasicsDeriveFromIdee(true);
                    }}
                  >
                    {basicsDerivePending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Ableiten …
                      </>
                    ) : (
                      "Neu aus Idee ableiten"
                    )}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 border-t border-zinc-100 pt-8">
              <RomanFundamentPanel
                mode="fields"
                buchTyp={fixedBuchTyp}
                value={fundament}
                onChange={setFundament}
                canSave={canSave}
                disabled={savePending || basicsDerivePending}
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
              </div>
              <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                Erster Schritt: Freitext importieren oder Dialog mit dem
                Schreib-Coach. Reifegrad bis Hard-Gate grün, dann Autoren-Freigabe
                — erst danach ist die Idee Kanon für den Rahmen.
              </p>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  {currentGateKey === "idee" && currentStageGate ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey="idee"
                      gate={currentStageGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  <RomanPhaseFreigabeBar
                    roman={roman}
                    editorial={editorial}
                    phase="idee"
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                  <div className="space-y-2 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/8">
                    <p className="text-sm font-extrabold text-zinc-950">
                      Freitext importieren
                    </p>
                    <textarea
                      value={ideeImportText}
                      onChange={(e) => setIdeeImportText(e.target.value)}
                      rows={5}
                      disabled={!canSave || ideeImportPending}
                      placeholder="Rohidee, Notizen, Pitch … (mind. 40 Zeichen)"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                    <button
                      type="button"
                      disabled={
                        !canSave ||
                        ideeImportPending ||
                        ideeImportText.trim().length < 40
                      }
                      onClick={() => {
                        startIdeeImportTransition(async () => {
                          const result = await importRomanIdeeTextAction({
                            romanId: roman.id,
                            text: ideeImportText,
                            replace: !(editorial.ideeKurz ?? "").trim(),
                          });
                          if (!result.success || !result.data) {
                            toast.error(
                              result.error ?? "Import fehlgeschlagen.",
                            );
                            return;
                          }
                          syncFromPipelineRoman(result.data.roman);
                          setIdeeImportText("");
                          toast.success("Idee importiert (Quelle hinterlegt).");
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-50"
                    >
                      {ideeImportPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      Importieren
                    </button>
                  </div>
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
        ) : tab === "fundament" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("fundament")}
                romanId={roman.id}
                stage="fundament"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.fundament}
                stageImprovePlan={editorial.stageImprove?.fundament ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Fundament
                </h2>
              </div>
              <p className="text-sm font-semibold text-zinc-600">
                Handlungsrelevante Figuren und Welt — freigeben bevor Exposé.
              </p>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-6">
                  {prereqGate && !prereqGate.ok && prereqGateKey ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey={prereqGateKey}
                      gate={prereqGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  {currentStageGate ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey="fundament"
                      gate={currentStageGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  <RomanPhaseFreigabeBar
                    roman={roman}
                    editorial={editorial}
                    phase="fundament"
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="fundament"
                    canSave={canSave}
                    disabled={
                      savePending || pipelineBusy || hardGateBlocksErzeugen
                    }
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    showAssess
                    displayLabel="Fundament"
                    rolesHref={rolesHref}
                  />
                  <RomanCharakterePanel
                    ideeKurz={editorial.ideeKurz ?? ""}
                    value={charaktere}
                    onChange={setCharaktere}
                    canSave={canSave}
                    disabled={savePending || pipelineBusy}
                    savePending={savePending}
                    onSave={() => void saveCharaktere()}
                  />
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
              )}
            </section>
          </div>
        ) : tab === "expose" ? (
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
                <h2 className="text-lg font-extrabold text-zinc-950">Exposé</h2>
              </div>
              {!typSet ? (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  Zuerst Buchtyp wählen.
                </p>
              ) : (
                <div className="space-y-5">
                  {prereqGate && !prereqGate.ok && prereqGateKey ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey={prereqGateKey}
                      gate={prereqGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  {currentStageGate ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey="expose"
                      gate={currentStageGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  <RomanPhaseFreigabeBar
                    roman={roman}
                    editorial={editorial}
                    phase="expose"
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="expose"
                    canSave={canSave}
                    disabled={
                      savePending || pipelineBusy || hardGateBlocksErzeugen
                    }
                    onComplete={syncFromPipelineRoman}
                    reifegrade={editorial.reifegrade}
                    leserFeedback={leserFeedbackForStage(editorial, "expose")}
                    hasLeserArtifact={hasExposeDoc}
                    showAssess
                    displayLabel="Exposé"
                    rolesHref={rolesHref}
                  />
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
              )}
            </section>
          </div>
        ) : tab === "graph" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("graph")}
                romanId={roman.id}
                stage="graph"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.graph}
                stageImprovePlan={editorial.stageImprove?.graph ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Wissensgraph
                </h2>
              </div>
              <p className="text-sm font-semibold text-zinc-600">
                Seed aus freigegebenem Fundament+Exposé, dann Konkretisierung —
                Reifegrad (Logik · Abdeckung · Konkretheit · Vernetzung), dann
                Freigabe vor Plot.
              </p>
              <div className="space-y-5">
                {prereqGate && !prereqGate.ok && prereqGateKey ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey={prereqGateKey}
                    gate={prereqGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                {currentStageGate ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey="graph"
                    gate={currentStageGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                <RomanPhaseFreigabeBar
                  roman={roman}
                  editorial={editorial}
                  phase="graph"
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
                <RomanPipelineStageActions
                  romanId={roman.id}
                  stage="graph"
                  canSave={canSave}
                  disabled={
                    savePending || pipelineBusy || hardGateBlocksErzeugen
                  }
                  onComplete={syncFromPipelineRoman}
                  reifegrade={editorial.reifegrade}
                  showAssess
                  displayLabel="Wissensgraph"
                  rolesHref={rolesHref}
                />
                <RomanWissensgraphTrigger graph={editorial.wissensGraph} />
              </div>
            </section>
          </div>
        ) : tab === "plot" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("plot")}
                romanId={roman.id}
                stage="plot"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.plot}
                stageImprovePlan={editorial.stageImprove?.plot ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Plot</h2>
              </div>
              <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                Nur Ereignisplan / Kapitelgerüst aus freigegebenem Graph —
                Szenen folgen in der nächsten Phase.
              </p>
              <div className="space-y-5">
                {prereqGate && !prereqGate.ok && prereqGateKey ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey={prereqGateKey}
                    gate={prereqGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                {currentStageGate ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey="plot"
                    gate={currentStageGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                <RomanPhaseFreigabeBar
                  roman={roman}
                  editorial={editorial}
                  phase="plot"
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
                <RomanPipelineStageActions
                  romanId={roman.id}
                  stage="plot"
                  canSave={canSave}
                  disabled={
                    savePending || pipelineBusy || hardGateBlocksErzeugen
                  }
                  onComplete={syncFromPipelineRoman}
                  reifegrade={editorial.reifegrade}
                  showAssess
                  displayLabel="Plot"
                  rolesHref={rolesHref}
                  generateCascadeConfirm={generateCascadeConfirm(
                    editorial,
                    "plot",
                  )}
                />
                <RomanKapitelGeruestPanel
                  hasExpose={hasExposeDoc}
                  value={kapitelGeruest}
                  structured={editorial.kapitelGeruestStructured}
                  disabled={savePending || pipelineBusy}
                  onClear={() => clearKapitelGeruest()}
                  clearPending={savePending}
                  staleBanner={downstreamStaleBanner(editorial, "plot")}
                />
              </div>
            </section>
          </div>
        ) : tab === "szenen" ? (
          <div className="space-y-4">
            {typSet ? (
              <RomanReifegradCard
                value={reifegradFor("szenen")}
                romanId={roman.id}
                stage="szenen"
                canSave={canSave}
                disabled={savePending || pipelineBusy}
                improvePlans={editorial.reifegradImprove?.szenen}
                stageImprovePlan={editorial.stageImprove?.szenen ?? null}
                onComplete={syncFromPipelineRoman}
              />
            ) : null}
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">Szenen</h2>
              </div>
              <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                Szenenverträge aus freigegebenem Plot+Graph. MVP: wenige
                Szenenkarten freigeben, dann eine Stimmprobe im Manuskript.
              </p>
              <div className="space-y-5">
                {prereqGate && !prereqGate.ok && prereqGateKey ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey={prereqGateKey}
                    gate={prereqGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                {currentStageGate ? (
                  <RomanStageHardGateBanner
                    romanId={roman.id}
                    gateKey="szenen"
                    gate={currentStageGate}
                    canSave={canSave}
                    onUpdated={syncFromPipelineRoman}
                  />
                ) : null}
                <RomanPhaseFreigabeBar
                  roman={roman}
                  editorial={editorial}
                  phase="szenen"
                  canSave={canSave}
                  onUpdated={syncFromPipelineRoman}
                />
                <RomanPipelineStageActions
                  romanId={roman.id}
                  stage="szenen"
                  canSave={canSave}
                  disabled={
                    savePending || pipelineBusy || hardGateBlocksErzeugen
                  }
                  onComplete={syncFromPipelineRoman}
                  reifegrade={editorial.reifegrade}
                  showAssess
                  displayLabel="Szenen"
                  rolesHref={rolesHref}
                  generateCascadeConfirm={generateCascadeConfirm(
                    editorial,
                    "szenen",
                  )}
                />
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
                  staleBanner={downstreamStaleBanner(editorial, "szenen")}
                />
              </div>
            </section>
          </div>
        ) : tab === "outline" ? (
          <div className="space-y-4">
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-950">
                  Unterthemen
                </h2>
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
        ) : tab === "feinplot" || tab === "spec" ? (
          <p className="text-sm font-semibold text-zinc-600">Weiterleitung …</p>
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
                  {prereqGate && !prereqGate.ok && prereqGateKey ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey={prereqGateKey}
                      gate={prereqGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  {currentGateKey === "schreiben" && currentStageGate ? (
                    <RomanStageHardGateBanner
                      romanId={roman.id}
                      gateKey="schreiben"
                      gate={currentStageGate}
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                    />
                  ) : null}
                  {!isCleverErzaehlt ? (
                    <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/80">
                      Vor Volltext: Szenen freigegeben. Stimmprobe = ein Kapitel
                      über Einzelkapitel erzeugen und freigeben, dann Lektorat.
                      Hard-Gate und Freigabe sind kein gegenseitiger Bypass.
                    </p>
                  ) : null}
                  {!isCleverErzaehlt ? (
                    <RomanPhaseFreigabeBar
                      roman={roman}
                      editorial={editorial}
                      phase="manuskript"
                      canSave={canSave}
                      onUpdated={syncFromPipelineRoman}
                      onApprove={() => runManuskriptPhaseFreigabe()}
                    />
                  ) : null}
                  <RomanPipelineStageActions
                    romanId={roman.id}
                    stage="manuskript"
                    canSave={canSave}
                    disabled={
                      savePending ||
                      pipelineBusy ||
                      (!isCleverErzaehlt && hardGateBlocksErzeugen)
                    }
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
                      <RomanManuskriptContinuityControl
                        romanId={roman.id}
                        target="manuskript"
                        disabled={savePending || pipelineBusy}
                        onComplete={syncFromPipelineRoman}
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
                  {!isCleverErzaehlt ? (
                    <RomanManuskriptVerbessernControl
                      romanId={roman.id}
                      editorial={editorial}
                      canSave={canSave}
                      disabled={savePending || pipelineBusy}
                      onComplete={syncFromPipelineRoman}
                    />
                  ) : null}
                </div>
              )}
            </section>
          </div>
        ) : tab === "export" || tab === "hoerbuch" ? (
          <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-zinc-950">Export</h2>
            </div>
            <p className="text-sm font-semibold text-zinc-600">
              Cover, Marketing-Texte, PDF/EPUB und Hörbuch — ein Schritt.
            </p>
            {typSet ? (
              <RomanPhaseFreigabeBar
                roman={roman}
                editorial={editorial}
                phase="export"
                canSave={canSave}
                onUpdated={syncFromPipelineRoman}
              />
            ) : null}
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
                <ExportPanelErrorBoundary>
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
                </ExportPanelErrorBoundary>
                <div className="space-y-4 border-t border-zinc-100 pt-8">
                  <h3 className="text-base font-extrabold text-zinc-950">
                    Hörbuch
                  </h3>
                  <ExportPanelErrorBoundary>
                    <RomanHoerbuchPanel
                      roman={roman}
                      editorial={editorial}
                      disabled={savePending}
                      onHoerbuchPrefsSaved={(prefs) =>
                        setEditorial((prev) => ({
                          ...prev,
                          hoerbuchPrefs: prefs,
                        }))
                      }
                    />
                  </ExportPanelErrorBoundary>
                </div>
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

      {basicsDeriveConfirmOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="basics-derive-confirm-title"
              className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
              onClick={() => {
                if (!basicsDerivePending) setBasicsDeriveConfirmOpen(false);
              }}
            >
              <div
                className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="basics-derive-confirm-title"
                    className="text-xl font-extrabold text-zinc-950"
                  >
                    Basics neu aus Idee ableiten?
                  </h2>
                  <button
                    type="button"
                    disabled={basicsDerivePending}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
                    onClick={() => setBasicsDeriveConfirmOpen(false)}
                    aria-label="Schließen"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  Genre, Sprache &amp; Tonalität und Basis-Regeln (sowie
                  Altersvorschlag) werden überschrieben. Manuelle Feinschliffe
                  gehen verloren.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={basicsDerivePending}
                    className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-50"
                    onClick={() => setBasicsDeriveConfirmOpen(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={basicsDerivePending}
                    className="inline-flex items-center rounded-full bg-orange-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-orange-800 disabled:opacity-50"
                    onClick={() => runBasicsDeriveFromIdee(true)}
                  >
                    {basicsDerivePending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Ableiten …
                      </>
                    ) : (
                      "Neu ableiten"
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
