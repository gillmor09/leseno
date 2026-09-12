"use client";

/**
 * Admin workspace: optional book foundation + Phase 0 roadmap + Phase 1–3.
 * Entry stays open — manuscript alone, fundament alone, or both.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  clearRomanCoverAction,
  clearRomanKapitelAction,
  clearRomanSzeneAction,
  extractRomanPdfAction,
  generateRomanCoverAction,
  generateRomanFrontMatterAction,
  generateRomanOutlineAction,
  processNextRomanSzeneAction,
  resetRomanSzeneAction,
  runRomanPhase0Action,
  saveRomanCoverAction,
  saveRomanFrontMatterAction,
  saveRomanIdeenChatAction,
  saveRomanKontextAction,
} from "@/app/actions/roman-admin";
import { RomanIdeaFinder } from "@/components/features/admin/roman-idea-finder";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { StoryPdfPreviewDialog } from "@/components/features/stories/story-pdf-preview-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  buildRomanExportDocument,
  buildRomanPdfBlob,
  collectRevisedScenes,
  romanPdfFilename,
} from "@/lib/roman/export-roman-pdf";
import {
  buildRomanEpubBlob,
  romanEpubFilename,
} from "@/lib/roman/export-roman-epub";
import {
  emptyBuchruecken,
  emptyVorsatz,
  type RomanBuchruecken,
  type RomanVorsatz,
} from "@/lib/roman/front-matter";
import {
  DEFAULT_KI_REGELWERK,
  emptyCharakter,
  emptySzenenRasterItem,
  suggestFanPersona,
} from "@/lib/roman/fundament";
import type { RomanIdeaFoundationFill } from "@/lib/roman/idea-finder";
import { runAllReadyRomanSzenen } from "@/lib/roman/run-all-scenes";
import type {
  RomanCharakter,
  RomanIdeaChatMessage,
  RomanKontext,
  RomanSzenenRasterItem,
  Szene,
  SzeneStatus,
} from "@/lib/roman/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SzeneStatus, string> = {
  READY_FOR_WRITING: "Bereit",
  DRAFTING: "Entwurf",
  REVIEWING: "Lektorat",
  REVISING: "Revision",
  COMPLETED: "Fertig",
};

const STATUS_BADGE: Record<SzeneStatus, string> = {
  READY_FOR_WRITING: "bg-zinc-100 text-zinc-600",
  DRAFTING: "bg-amber-100 text-amber-900",
  REVIEWING: "bg-sky-100 text-sky-900",
  REVISING: "bg-violet-100 text-violet-900",
  COMPLETED: "bg-emerald-100 text-emerald-900",
};

function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
        <span>{label}</span>
        <span className="normal-case tracking-normal text-zinc-600">
          {value}/{max} · {pct}&nbsp;%
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-zinc-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-orange-600 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
      {children}
    </span>
  );
}

const inputClass =
  "w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700";
const textareaClass = `${inputClass} font-sans`;

type SchreibModelOption = {
  id: string;
  label: string;
  modelSlug: string;
};

function schreibModelStorageKey(romanId: string): string {
  return `leseno.roman.schreibModel.${romanId}`;
}

export function RomanAdminWorkspace({
  initialRoman,
  initialSzenen,
  canSave,
  isNew = false,
  schreibModels = [],
  defaultSchreibModelId = "story-default",
}: {
  initialRoman: RomanKontext | null;
  initialSzenen: Szene[];
  canSave: boolean;
  isNew?: boolean;
  /** Active text LLMs for Phase 1–3 (from AI model catalog). */
  schreibModels?: SchreibModelOption[];
  defaultSchreibModelId?: string;
}) {
  const [roman, setRoman] = useState<RomanKontext | null>(initialRoman);
  const [szenen, setSzenen] = useState(initialSzenen);
  const [title, setTitle] = useState(initialRoman?.title ?? "");
  const [stilbibel, setStilbibel] = useState(initialRoman?.stilbibel ?? "");
  const [manuskriptRaw, setManuskriptRaw] = useState(
    initialRoman?.manuskriptRaw ?? "",
  );
  const [genre, setGenre] = useState(initialRoman?.genre ?? "");
  const [praemisse, setPraemisse] = useState(initialRoman?.praemisse ?? "");
  const [perspektive, setPerspektive] = useState(
    initialRoman?.perspektive ?? "",
  );
  const [zeitform, setZeitform] = useState(initialRoman?.zeitform ?? "");
  const [tonalitaet, setTonalitaet] = useState(initialRoman?.tonalitaet ?? "");
  const [charaktere, setCharaktere] = useState<RomanCharakter[]>(
    initialRoman?.charaktere?.length
      ? initialRoman.charaktere
      : [emptyCharakter()],
  );
  const [weltSchauplaetze, setWeltSchauplaetze] = useState(
    initialRoman?.weltSchauplaetze ?? "",
  );
  const [weltRegeln, setWeltRegeln] = useState(initialRoman?.weltRegeln ?? "");
  const [szenenRaster, setSzenenRaster] = useState<RomanSzenenRasterItem[]>(
    initialRoman?.szenenRaster?.length
      ? initialRoman.szenenRaster
      : [emptySzenenRasterItem()],
  );
  const [kiRegelwerk, setKiRegelwerk] = useState(
    initialRoman?.kiRegelwerk?.trim()
      ? initialRoman.kiRegelwerk
      : DEFAULT_KI_REGELWERK,
  );
  const [fanPersonaName, setFanPersonaName] = useState(
    initialRoman?.fanPersonaName ?? "",
  );
  const [fanPersonaProfil, setFanPersonaProfil] = useState(
    initialRoman?.fanPersonaProfil ?? "",
  );
  const [coverImageDataUrl, setCoverImageDataUrl] = useState(
    initialRoman?.coverImageDataUrl ?? "",
  );
  const [coverPrompt, setCoverPrompt] = useState(
    initialRoman?.coverPrompt ?? "",
  );
  const [coverExtra, setCoverExtra] = useState("");
  const [coverPending, setCoverPending] = useState(false);
  const [coverSavePending, setCoverSavePending] = useState(false);
  const [coverClearOpen, setCoverClearOpen] = useState(false);
  const [coverClearPending, setCoverClearPending] = useState(false);
  const [sceneDeleteTarget, setSceneDeleteTarget] = useState<{
    id: string;
    kapitelNr: number;
    szenenNr: number;
  } | null>(null);
  const [sceneDeletePending, setSceneDeletePending] = useState(false);
  const [chapterDeleteTarget, setChapterDeleteTarget] = useState<{
    kapitelNr: number;
    count: number;
  } | null>(null);
  const [chapterDeletePending, setChapterDeletePending] = useState(false);
  const [frontMatterPending, setFrontMatterPending] = useState(false);
  const [frontMatterSavePending, setFrontMatterSavePending] = useState(false);
  const [epubPending, setEpubPending] = useState(false);
  const [autorName, setAutorName] = useState(initialRoman?.autorName ?? "");
  const [buchruecken, setBuchruecken] = useState<RomanBuchruecken>(
    initialRoman?.buchruecken ?? emptyBuchruecken(),
  );
  const [vorsatz, setVorsatz] = useState<RomanVorsatz>(
    initialRoman?.vorsatz ?? emptyVorsatz(),
  );
  const [ideenChat, setIdeenChat] = useState<RomanIdeaChatMessage[]>(
    initialRoman?.ideenChat ?? [],
  );

  const initialModelId = useMemo(() => {
    if (
      schreibModels.some((m) => m.id === defaultSchreibModelId)
    ) {
      return defaultSchreibModelId;
    }
    return schreibModels[0]?.id ?? defaultSchreibModelId;
  }, [schreibModels, defaultSchreibModelId]);

  const [schreibModelId, setSchreibModelId] = useState(initialModelId);

  useEffect(() => {
    if (!roman?.id || schreibModels.length === 0) return;
    try {
      const stored = sessionStorage.getItem(schreibModelStorageKey(roman.id));
      if (stored && schreibModels.some((m) => m.id === stored)) {
        setSchreibModelId(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [roman?.id, schreibModels]);

  const [openFundament, setOpenFundament] = useState(false);
  const [openChars, setOpenChars] = useState(false);
  const [openWelt, setOpenWelt] = useState(false);
  const [openRaster, setOpenRaster] = useState(false);
  const [openKi, setOpenKi] = useState(false);
  const [openFan, setOpenFan] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSzenen[0]?.id ?? null,
  );
  const [phase0Pending, setPhase0Pending] = useState(false);
  const [scenePending, setScenePending] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [batchProgressLabel, setBatchProgressLabel] = useState<string | null>(
    null,
  );
  const [batchStopAfterCurrent, setBatchStopAfterCurrent] = useState(false);
  const batchStopRef = useRef(false);
  const [savePending, setSavePending] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfLabel, setPdfLabel] = useState<string | null>(null);
  const [outlinePending, setOutlinePending] = useState(false);
  const [outlineOverwriteOpen, setOutlineOverwriteOpen] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfDownloadName, setPdfDownloadName] = useState("roman.pdf");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => szenen.find((s) => s.id === selectedId) ?? null,
    [szenen, selectedId],
  );

  const readyCount = szenen.filter(
    (s) => s.status === "READY_FOR_WRITING",
  ).length;
  const completedCount = szenen.filter((s) => s.status === "COMPLETED").length;
  const revisedCount = useMemo(
    () => collectRevisedScenes(szenen).length,
    [szenen],
  );
  const totalCount = szenen.length;
  const busy =
    phase0Pending ||
    savePending ||
    scenePending ||
    batchPending ||
    pdfPending ||
    outlinePending ||
    exportPending ||
    coverPending ||
    coverSavePending ||
    coverClearPending ||
    sceneDeletePending ||
    chapterDeletePending ||
    frontMatterPending ||
    frontMatterSavePending ||
    epubPending;

  const chapters = useMemo(() => {
    const map = new Map<number, Szene[]>();
    for (const szene of szenen) {
      const list = map.get(szene.kapitelNr) ?? [];
      list.push(szene);
      map.set(szene.kapitelNr, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([kapitelNr, items]) => {
        const sorted = [...items].sort((a, b) => a.szenenNr - b.szenenNr);
        const done = sorted.filter((s) => s.status === "COMPLETED").length;
        const inFlight = sorted.find((s) =>
          ["DRAFTING", "REVIEWING", "REVISING"].includes(s.status),
        );
        return {
          kapitelNr,
          szenen: sorted,
          done,
          total: sorted.length,
          headline: inFlight
            ? STATUS_LABEL[inFlight.status]
            : done === sorted.length && sorted.length > 0
              ? "Fertig"
              : done > 0
                ? "In Arbeit"
                : "Offen",
        };
      });
  }, [szenen]);

  function buildPayload() {
    return {
      id: roman?.id ?? null,
      title,
      manuskriptRaw,
      stilbibel,
      genre,
      praemisse,
      perspektive,
      zeitform,
      tonalitaet,
      charaktere,
      weltSchauplaetze,
      weltRegeln,
      szenenRaster,
      kiRegelwerk,
      fanPersonaName,
      fanPersonaProfil,
    };
  }

  function applySuggestedFan() {
    const suggested = suggestFanPersona({ genre, tonalitaet, praemisse });
    setFanPersonaName(suggested.name);
    setFanPersonaProfil(suggested.profil);
    setOpenFan(true);
    toast.success("Fan-Persona aus Genre/Tonalität vorgeschlagen.");
  }

  function applyIdeaFoundation(fill: RomanIdeaFoundationFill) {
    if (fill.title.trim()) setTitle(fill.title.trim());
    setGenre(fill.genre);
    setPraemisse(fill.praemisse);
    setPerspektive(fill.perspektive);
    setZeitform(fill.zeitform);
    setTonalitaet(fill.tonalitaet);
    if (fill.stilbibel.trim()) setStilbibel(fill.stilbibel);
    setCharaktere(
      fill.charaktere.length ? fill.charaktere : [emptyCharakter()],
    );
    setWeltSchauplaetze(fill.weltSchauplaetze);
    setWeltRegeln(fill.weltRegeln);
    setSzenenRaster(
      fill.szenenRaster.length
        ? fill.szenenRaster
        : [emptySzenenRasterItem()],
    );
    setOpenFundament(true);
    setOpenChars(true);
    setOpenWelt(true);
    setOpenRaster(true);
  }

  async function runOutlineGenerate() {
    setOutlineOverwriteOpen(false);
    setOutlinePending(true);
    const result = await generateRomanOutlineAction({
      title,
      stilbibel,
      genre,
      praemisse,
      perspektive,
      zeitform,
      tonalitaet,
      charaktere,
      weltSchauplaetze,
      weltRegeln,
      szenenRaster,
      kiRegelwerk,
      fanPersonaName,
      fanPersonaProfil,
    });
    setOutlinePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Outline-Generierung fehlgeschlagen.");
      return;
    }
    setManuskriptRaw(result.data!.outline);
    setPdfLabel(null);
    toast.success(
      "Outline/Exposé erzeugt — bei Bedarf anpassen, dann speichern und Phase 0.",
    );
  }

  function handleOutlineGenerateClick() {
    if (!canSave || busy) return;
    if (manuskriptRaw.trim().length > 0) {
      setOutlineOverwriteOpen(true);
      return;
    }
    void runOutlineGenerate();
  }

  async function handlePdfUpload(file: File | null) {
    if (!file || !canSave) return;
    setPdfPending(true);
    const form = new FormData();
    form.set("file", file);
    const result = await extractRomanPdfAction(form);
    setPdfPending(false);
    if (!result.success) {
      toast.error(result.error ?? "PDF-Import fehlgeschlagen.");
      return;
    }
    setManuskriptRaw(result.data!.text);
    setPdfLabel(
      `${result.data!.fileName} · ${result.data!.pageCount} Seite(n)`,
    );
    if (!title.trim()) {
      const base = result.data!.fileName.replace(/\.pdf$/i, "").trim();
      if (base) setTitle(base);
    }
    toast.success(
      `PDF gelesen (${result.data!.pageCount} Seiten). Text steht im Manuskript-Feld.`,
    );
  }

  async function handleSaveOnly() {
    if (!canSave) return;
    setSavePending(true);
    const result = await saveRomanKontextAction(buildPayload());
    if (!result.success) {
      setSavePending(false);
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    if (ideenChat.length > 0) {
      const chatResult = await saveRomanIdeenChatAction({
        romanId: saved.id,
        messages: ideenChat,
      });
      if (!chatResult.success) {
        setSavePending(false);
        setRoman({ ...saved, ideenChat });
        toast.error(
          chatResult.error ??
            "Kontext gespeichert, Ideen-Chat aber nicht historisiert.",
        );
        if (isNew) {
          window.location.href = `/admin/roman/${saved.id}`;
        }
        return;
      }
    }
    setSavePending(false);
    setRoman({ ...saved, ideenChat });
    toast.success("Kontext gespeichert.");
    if (isNew && saved.id) {
      window.location.href = `/admin/roman/${saved.id}`;
    }
  }

  async function handlePhase0() {
    if (!canSave) return;
    setPhase0Pending(true);
    const result = await runRomanPhase0Action(buildPayload());
    setPhase0Pending(false);
    if (!result.success) {
      toast.error(result.error ?? "Phase 0 fehlgeschlagen.");
      return;
    }
    const saved = result.data!.roman;
    if (ideenChat.length > 0) {
      await saveRomanIdeenChatAction({
        romanId: saved.id,
        messages: ideenChat,
      });
    }
    setRoman({ ...saved, ideenChat });
    toast.success(`Roadmap: ${result.data!.szenenCount} Szenen angelegt.`);
    window.location.href = `/admin/roman/${saved.id}`;
  }

  async function handleNextScene() {
    if (!canSave || !roman || batchPending) return;
    if (!schreibModelId.trim()) {
      toast.error("Schreibmodell wählen.");
      return;
    }
    const next = szenen.find((s) => s.status === "READY_FOR_WRITING");
    if (next) {
      setSzenen((current) =>
        current.map((s) =>
          s.id === next.id ? { ...s, status: "DRAFTING" as const } : s,
        ),
      );
      setSelectedId(next.id);
    }
    setScenePending(true);
    const result = await processNextRomanSzeneAction({
      romanId: roman.id,
      modelId: schreibModelId,
    });
    setScenePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Szenen-Lauf fehlgeschlagen.");
      if (next) {
        setSzenen((current) =>
          current.map((s) =>
            s.id === next.id
              ? { ...s, status: "READY_FOR_WRITING" as const }
              : s,
          ),
        );
      }
      return;
    }
    if (result.data!.szene) {
      const done = result.data!.szene;
      setSzenen((current) =>
        current.map((s) => (s.id === done.id ? done : s)),
      );
      setSelectedId(done.id);
    }
    toast.success(result.data!.message);
    window.location.reload();
  }

  async function handleAllScenes() {
    if (!canSave || !roman || batchPending || scenePending) return;
    if (!schreibModelId.trim()) {
      toast.error("Schreibmodell wählen.");
      return;
    }
    const totalAtStart = szenen.filter(
      (s) => s.status === "READY_FOR_WRITING",
    ).length;
    if (totalAtStart === 0) {
      toast.message("Keine offenen Szenen (READY).");
      return;
    }

    batchStopRef.current = false;
    setBatchStopAfterCurrent(false);
    setBatchPending(true);
    setBatchProgressLabel(`Szene 1 von ${totalAtStart} wird geschrieben …`);

    const modelId = schreibModelId;
    const outcome = await runAllReadyRomanSzenen({
      romanId: roman.id,
      totalAtStart,
      shouldStop: () => batchStopRef.current,
      processOne: async (romanId) =>
        processNextRomanSzeneAction({ romanId, modelId }),
      onProgress: (progress) => {
        setBatchProgressLabel(progress.label);
        if (progress.lastSzene) {
          const done = progress.lastSzene;
          setSzenen((current) =>
            current.map((s) => (s.id === done.id ? done : s)),
          );
          setSelectedId(done.id);
          return;
        }
        setSzenen((current) => {
          const next = current.find((s) => s.status === "READY_FOR_WRITING");
          if (next) {
            setSelectedId(next.id);
            return current.map((s) =>
              s.id === next.id ? { ...s, status: "DRAFTING" as const } : s,
            );
          }
          return current;
        });
      },
    });

    setBatchPending(false);
    setBatchProgressLabel(null);
    setBatchStopAfterCurrent(false);
    batchStopRef.current = false;

    if (outcome.error) {
      toast.error(outcome.error);
      window.location.reload();
      return;
    }

    if (outcome.stopped) {
      toast.message(
        `Gestoppt nach ${outcome.processed} Szene(n). Rest bleibt bereit.`,
      );
    } else if (outcome.exhausted) {
      toast.success(
        outcome.processed > 0
          ? `Alle offenen Szenen fertig (${outcome.processed}).`
          : "Keine Szene mehr mit Status READY_FOR_WRITING.",
      );
    }
    window.location.reload();
  }

  async function handleGenerateCover() {
    if (!canSave || !roman?.id) {
      toast.error("Zuerst Roman speichern, dann Cover erzeugen.");
      return;
    }
    setCoverPending(true);
    const result = await generateRomanCoverAction({
      romanId: roman.id,
      extraInstruction: coverExtra.trim() || undefined,
    });
    setCoverPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Cover-Generierung fehlgeschlagen.");
      return;
    }
    setCoverImageDataUrl(result.data!.dataUrl);
    setCoverPrompt(result.data!.promptUsed);
    toast.success("Cover erzeugt — bei Bedarf speichern.");
  }

  async function handleSaveCover() {
    if (!canSave || !roman?.id || !coverImageDataUrl.trim()) return;
    setCoverSavePending(true);
    const result = await saveRomanCoverAction({
      romanId: roman.id,
      coverImageDataUrl,
      coverPrompt,
    });
    setCoverSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Cover speichern fehlgeschlagen.");
      return;
    }
    setRoman((current) =>
      current
        ? {
            ...current,
            coverImageDataUrl,
            coverPrompt,
          }
        : current,
    );
    toast.success("Cover gespeichert.");
  }

  async function handleClearCover() {
    if (!canSave || !roman?.id) return;
    setCoverClearPending(true);
    const result = await clearRomanCoverAction({ romanId: roman.id });
    setCoverClearPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Cover löschen fehlgeschlagen.");
      return;
    }
    setCoverImageDataUrl("");
    setCoverPrompt("");
    setCoverClearOpen(false);
    setRoman((current) =>
      current
        ? { ...current, coverImageDataUrl: "", coverPrompt: "" }
        : current,
    );
    toast.success("Cover entfernt.");
  }

  async function handleGenerateFrontMatter() {
    if (!roman?.id) {
      toast.error("Zuerst Roman speichern, dann Abschluss erzeugen.");
      return;
    }
    setFrontMatterPending(true);
    const result = await generateRomanFrontMatterAction({ romanId: roman.id });
    setFrontMatterPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Buchrücken/Vorsatz fehlgeschlagen.");
      return;
    }
    setAutorName(result.data!.autorName);
    setBuchruecken(result.data!.buchruecken);
    setVorsatz(result.data!.vorsatz);
    toast.success("Buchrücken & Vorsatz erzeugt — bei Bedarf speichern.");
  }

  async function handleSaveFrontMatter() {
    if (!roman?.id) return;
    setFrontMatterSavePending(true);
    const result = await saveRomanFrontMatterAction({
      romanId: roman.id,
      autorName,
      buchruecken,
      vorsatz,
    });
    setFrontMatterSavePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setRoman((prev) =>
      prev
        ? {
            ...prev,
            autorName,
            buchruecken,
            vorsatz,
          }
        : prev,
    );
    toast.success("Buchrücken & Vorsatz gespeichert.");
  }

  async function handleReset(szeneId: string) {
    if (!canSave) return;
    const result = await resetRomanSzeneAction({ szeneId });
    if (!result.success) {
      toast.error(result.error ?? "Reset fehlgeschlagen.");
      return;
    }
    toast.success("Szene zurück auf „Bereit“.");
    window.location.reload();
  }

  async function handleDeleteSzene() {
    if (!roman?.id || !sceneDeleteTarget) return;
    if (!canSave) {
      toast.error("Speichern/Löschen ist hier nicht konfiguriert (Service-Role).");
      return;
    }
    setSceneDeletePending(true);
    const target = sceneDeleteTarget;
    const result = await clearRomanSzeneAction({
      romanId: roman.id,
      szeneId: target.id,
    });
    setSceneDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Inhalt löschen fehlgeschlagen.");
      return;
    }
    setSzenen((current) =>
      current.map((s) =>
        s.id === target.id
          ? {
              ...s,
              status: "READY_FOR_WRITING",
              entwurfRaw: "",
              feedbackLektor: "",
              feedbackFan: "",
              entwurfRevidiert: "",
            }
          : s,
      ),
    );
    const nextSummary = result.data?.aktuelleZusammenfassung ?? "";
    setRoman((prev) =>
      prev ? { ...prev, aktuelleZusammenfassung: nextSummary } : prev,
    );
    setSceneDeleteTarget(null);
    toast.success(
      `Inhalt von ${target.kapitelNr}.${target.szenenNr} gelöscht.`,
    );
  }

  async function handleDeleteKapitel() {
    if (!roman?.id || !chapterDeleteTarget) return;
    if (!canSave) {
      toast.error("Speichern/Löschen ist hier nicht konfiguriert (Service-Role).");
      return;
    }
    setChapterDeletePending(true);
    const target = chapterDeleteTarget;
    const result = await clearRomanKapitelAction({
      romanId: roman.id,
      kapitelNr: target.kapitelNr,
    });
    setChapterDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Kapitel-Inhalt löschen fehlgeschlagen.");
      return;
    }
    setSzenen((current) =>
      current.map((s) =>
        s.kapitelNr === target.kapitelNr
          ? {
              ...s,
              status: "READY_FOR_WRITING" as const,
              entwurfRaw: "",
              feedbackLektor: "",
              feedbackFan: "",
              entwurfRevidiert: "",
            }
          : s,
      ),
    );
    const nextSummary = result.data?.aktuelleZusammenfassung ?? "";
    setRoman((prev) =>
      prev ? { ...prev, aktuelleZusammenfassung: nextSummary } : prev,
    );
    setChapterDeleteTarget(null);
    const n = result.data?.clearedCount ?? target.count;
    toast.success(
      n === 1
        ? `Inhalt von Kapitel ${target.kapitelNr} gelöscht (1 Szene).`
        : `Inhalt von Kapitel ${target.kapitelNr} gelöscht (${n} Szenen).`,
    );
  }

  function closeRomanPdfPreview() {
    setPdfPreviewOpen(false);
    setPdfPreviewHtml(null);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }

  async function handleExportRomanPdf() {
    if (!roman || exportPending) return;
    const revised = collectRevisedScenes(szenen);
    if (!revised.length) {
      toast.error("Noch keine revidierte Szene zum Export.");
      return;
    }

    setExportPending(true);
    closeRomanPdfPreview();
    try {
      const exportInput = {
        title: title.trim() || roman.title,
        szenen,
        totalSzenen: szenen.length,
        coverImageDataUrl: coverImageDataUrl.trim() || undefined,
        vorsatz,
      };
      const html = buildRomanExportDocument(exportInput);
      const blob = await buildRomanPdfBlob(exportInput);
      const url = URL.createObjectURL(blob);
      setPdfDownloadName(romanPdfFilename(exportInput.title));
      setPdfPreviewHtml(html);
      setPdfPreviewUrl(url);
      setPdfPreviewOpen(true);
      toast.success(`PDF: ${revised.length} von ${szenen.length} Szenen.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "PDF konnte nicht erzeugt werden.",
      );
    } finally {
      setExportPending(false);
    }
  }

  async function handleExportRomanEpub() {
    if (!roman || epubPending) return;
    const revised = collectRevisedScenes(szenen);
    if (!revised.length) {
      toast.error("Noch keine revidierte Szene für das EPUB.");
      return;
    }

    setEpubPending(true);
    try {
      const blob = await buildRomanEpubBlob({
        title: title.trim() || roman.title,
        autorName: autorName.trim() || vorsatz.titelseite.autor,
        vorsatz,
        coverImageDataUrl: coverImageDataUrl.trim() || undefined,
        szenen,
      });
      const url = URL.createObjectURL(blob);
      const name = romanEpubFilename(
        vorsatz.titelseite.titel.trim() || title.trim() || roman.title,
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      toast.success(
        `EPUB gespeichert (${revised.length} Szenen) — bereit für KDP.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "EPUB konnte nicht erzeugt werden.",
      );
    } finally {
      setEpubPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/roman"
          className="text-sm font-bold text-orange-800 hover:underline"
        >
          ← Alle Romane
        </Link>
        {roman && totalCount > 0 ? (
          <p className="text-xs font-semibold text-zinc-500">
            {completedCount}/{totalCount} fertig · {readyCount} bereit
          </p>
        ) : null}
      </div>

      {roman && totalCount > 0 ? (
        <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
          <ProgressBar
            value={completedCount}
            max={totalCount}
            label="Gesamtfortschritt"
          />
        </section>
      ) : null}

      <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <div>
          <h2 className="text-lg font-extrabold text-zinc-950">
            Roman-Kontext
          </h2>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Ideen-Finder → Fundament (1–4) → Outline/Exposé → speichern →
            Phase&nbsp;0. Manuskript-Feld ist die editierbare Brücke.
          </p>
        </div>

        <RomanIdeaFinder
          romanId={roman?.id}
          messages={ideenChat}
          onMessagesChange={setIdeenChat}
          canSave={canSave}
          disabled={busy}
          onApplied={applyIdeaFoundation}
        />

        <label className="block">
          <FieldLabel>Arbeitstitel</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canSave || busy}
            className={inputClass}
            placeholder="Arbeitstitel"
          />
        </label>

        <Collapsible
          title="1. Buch-Fundament (optional)"
          open={openFundament}
          onToggle={() => setOpenFundament((v) => !v)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <FieldLabel>Genre</FieldLabel>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                disabled={!canSave || busy}
                className={inputClass}
                placeholder="z. B. Thriller / Psychothriller"
              />
            </label>
            <label className="block sm:col-span-2">
              <FieldLabel>Prämisse (Logline)</FieldLabel>
              <textarea
                value={praemisse}
                onChange={(e) => setPraemisse(e.target.value)}
                disabled={!canSave || busy}
                rows={3}
                className={textareaClass}
                placeholder="1–2 Sätze: Wer? Ziel? Hürde/Konflikt?"
              />
            </label>
            <label className="block">
              <FieldLabel>Perspektive</FieldLabel>
              <input
                value={perspektive}
                onChange={(e) => setPerspektive(e.target.value)}
                disabled={!canSave || busy}
                className={inputClass}
                placeholder="z. B. Ich-Perspektive"
              />
            </label>
            <label className="block">
              <FieldLabel>Zeitform</FieldLabel>
              <input
                value={zeitform}
                onChange={(e) => setZeitform(e.target.value)}
                disabled={!canSave || busy}
                className={inputClass}
                placeholder="z. B. Präteritum"
              />
            </label>
            <label className="block sm:col-span-2">
              <FieldLabel>Tonalität & Stil</FieldLabel>
              <textarea
                value={tonalitaet}
                onChange={(e) => setTonalitaet(e.target.value)}
                disabled={!canSave || busy}
                rows={2}
                className={textareaClass}
                placeholder="z. B. düster, schnelles Tempo, zynischer Humor"
              />
            </label>
          </div>
        </Collapsible>

        <Collapsible
          title="2. Charakter-Steckbriefe (optional)"
          open={openChars}
          onToggle={() => setOpenChars((v) => !v)}
        >
          <div className="space-y-4">
            {charaktere.map((char, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-zinc-800">
                    Figur {index + 1}
                  </p>
                  {charaktere.length > 1 ? (
                    <button
                      type="button"
                      disabled={!canSave || busy}
                      onClick={() =>
                        setCharaktere((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                      className="text-xs font-bold text-red-700 hover:underline"
                    >
                      Entfernen
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <FieldLabel>Name</FieldLabel>
                    <input
                      value={char.name}
                      onChange={(e) =>
                        setCharaktere((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Alter</FieldLabel>
                    <input
                      value={char.alter}
                      onChange={(e) =>
                        setCharaktere((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, alter: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Rolle</FieldLabel>
                    <input
                      value={char.rolle}
                      onChange={(e) =>
                        setCharaktere((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, rolle: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                      placeholder="Haupt- / Nebenfigur"
                    />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>Kernmotivation & Ziel</FieldLabel>
                  <textarea
                    value={char.motivation}
                    onChange={(e) =>
                      setCharaktere((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, motivation: e.target.value }
                            : r,
                        ),
                      )
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Schwäche / Konflikt</FieldLabel>
                  <textarea
                    value={char.schwaeche}
                    onChange={(e) =>
                      setCharaktere((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, schwaeche: e.target.value }
                            : r,
                        ),
                      )
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Sprachstil</FieldLabel>
                  <input
                    value={char.sprachstil}
                    onChange={(e) =>
                      setCharaktere((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, sprachstil: e.target.value }
                            : r,
                        ),
                      )
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                    placeholder="kurze Sätze, sarkastisch, Fachjargon …"
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() =>
                setCharaktere((rows) => [...rows, emptyCharakter()])
              }
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white"
            >
              + Figur
            </button>
          </div>
        </Collapsible>

        <Collapsible
          title="3. Welt & Regeln (optional)"
          open={openWelt}
          onToggle={() => setOpenWelt((v) => !v)}
        >
          <label className="mb-3 block">
            <FieldLabel>Hauptschauplätze</FieldLabel>
            <textarea
              value={weltSchauplaetze}
              onChange={(e) => setWeltSchauplaetze(e.target.value)}
              disabled={!canSave || busy}
              rows={4}
              className={textareaClass}
              placeholder="Sensorische Details: Sehen, Hören, Riechen …"
            />
          </label>
          <label className="block">
            <FieldLabel>Regeln & Grenzen</FieldLabel>
            <textarea
              value={weltRegeln}
              onChange={(e) => setWeltRegeln(e.target.value)}
              disabled={!canSave || busy}
              rows={4}
              className={textareaClass}
              placeholder="Logik von Magie, Technologie oder Gesetzen"
            />
          </label>
        </Collapsible>

        <Collapsible
          title="4. Szenen-Raster / Plot-Plan (optional)"
          open={openRaster}
          onToggle={() => setOpenRaster((v) => !v)}
        >
          <p className="mb-3 text-xs font-semibold text-zinc-500">
            Planungsraster vor der operativen Roadmap. Phase 0 kann daraus
            ableiten — muss aber nicht ausgefüllt sein.
          </p>
          <div className="space-y-4">
            {szenenRaster.map((row, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-zinc-800">
                    Raster {index + 1}
                  </p>
                  {szenenRaster.length > 1 ? (
                    <button
                      type="button"
                      disabled={!canSave || busy}
                      onClick={() =>
                        setSzenenRaster((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                      className="text-xs font-bold text-red-700 hover:underline"
                    >
                      Entfernen
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <FieldLabel>Szene-ID</FieldLabel>
                    <input
                      value={row.szeneId}
                      onChange={(e) =>
                        setSzenenRaster((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, szeneId: e.target.value }
                              : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                      placeholder="z. B. K1-S2"
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Kapitel</FieldLabel>
                    <input
                      type="number"
                      min={1}
                      value={row.kapitelNr ?? 1}
                      onChange={(e) =>
                        setSzenenRaster((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  kapitelNr: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                }
                              : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Ort</FieldLabel>
                    <input
                      value={row.ort}
                      onChange={(e) =>
                        setSzenenRaster((rows) =>
                          rows.map((r, i) =>
                            i === index ? { ...r, ort: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>Anwesende Figuren</FieldLabel>
                  <input
                    value={row.figuren}
                    onChange={(e) =>
                      setSzenenRaster((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, figuren: e.target.value } : r,
                        ),
                      )
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Szenenziel</FieldLabel>
                  <textarea
                    value={row.szenenziel}
                    onChange={(e) =>
                      setSzenenRaster((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, szenenziel: e.target.value }
                            : r,
                        ),
                      )
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                    placeholder="Was ändert sich am Ende der Szene?"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Stimmung Start</FieldLabel>
                    <input
                      value={row.emotionalStart}
                      onChange={(e) =>
                        setSzenenRaster((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, emotionalStart: e.target.value }
                              : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Stimmung Ende</FieldLabel>
                    <input
                      value={row.emotionalEnd}
                      onChange={(e) =>
                        setSzenenRaster((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, emotionalEnd: e.target.value }
                              : r,
                          ),
                        )
                      }
                      disabled={!canSave || busy}
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() =>
                setSzenenRaster((rows) => [...rows, emptySzenenRasterItem()])
              }
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white"
            >
              + Raster-Zeile
            </button>
          </div>
        </Collapsible>

        <Collapsible
          title="5. KI-Regelwerk"
          open={openKi}
          onToggle={() => setOpenKi((v) => !v)}
        >
          <label className="block">
            <FieldLabel>System-Vorgaben für Autor / Revision</FieldLabel>
            <textarea
              value={kiRegelwerk}
              onChange={(e) => setKiRegelwerk(e.target.value)}
              disabled={!canSave || busy}
              rows={6}
              className={textareaClass}
            />
            <span className="mt-1.5 block text-xs font-semibold text-zinc-500">
              Standard: Show don&apos;t tell, keine KI-Floskeln, Dialoge,
              Orthografie, Perspektive/Zeitform.
            </span>
          </label>
          <label className="mt-3 block">
            <FieldLabel>Zusätzliche Stilbibel (frei)</FieldLabel>
            <textarea
              value={stilbibel}
              onChange={(e) => setStilbibel(e.target.value)}
              disabled={!canSave || busy}
              rows={3}
              className={textareaClass}
              placeholder="Weitere Stilhinweise …"
            />
          </label>
        </Collapsible>

        <Collapsible
          title="Fan-Persona (Testleser:in)"
          open={openFan}
          onToggle={() => setOpenFan((v) => !v)}
        >
          <p className="mb-3 text-xs font-semibold text-zinc-500">
            Eine KI-Rolle als Genre-Fan — später auch schon beim Einstieg der
            Roman-Erstellung nutzbar. Leer = Vorschlag aus Genre/Tonalität zur
            Laufzeit.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={applySuggestedFan}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white"
            >
              Aus Genre vorschlagen
            </button>
          </div>
          <label className="mb-3 block">
            <FieldLabel>Name</FieldLabel>
            <input
              value={fanPersonaName}
              onChange={(e) => setFanPersonaName(e.target.value)}
              disabled={!canSave || busy}
              className={inputClass}
              placeholder="z. B. Thriller-Stammleser:in"
            />
          </label>
          <label className="block">
            <FieldLabel>Profil / Leseperspektive</FieldLabel>
            <textarea
              value={fanPersonaProfil}
              onChange={(e) => setFanPersonaProfil(e.target.value)}
              disabled={!canSave || busy}
              rows={5}
              className={textareaClass}
              placeholder="Wer ist diese Person, was liebt / hasst sie beim Lesen?"
            />
          </label>
        </Collapsible>

        <div className="block">
          <FieldLabel>Manuskript / Outline / Exposé</FieldLabel>
          <p className="mb-2 text-xs font-semibold text-zinc-500">
            Brücke zwischen Fundament und Phase&nbsp;0: editierbares Outline —
            darauf bauen Roadmap und Szenen auf. Kein fertiger Romantext.
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={!canSave || busy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handlePdfUpload(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void handleOutlineGenerateClick()}
              className={cn(
                "rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800",
                (!canSave || busy) && "opacity-70",
              )}
            >
              {outlinePending
                ? "Outline wird erzeugt …"
                : "Outline aus Fundament"}
            </button>
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={() => pdfInputRef.current?.click()}
              className={cn(
                "rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
                (!canSave || busy) && "opacity-70",
              )}
            >
              {pdfPending ? "PDF wird gelesen …" : "PDF hochladen"}
            </button>
            {pdfLabel ? (
              <span className="text-xs font-semibold text-zinc-500">
                {pdfLabel}
              </span>
            ) : (
              <span className="text-xs font-semibold text-zinc-500">
                Aus Fundament erzeugen, PDF laden — oder selbst tippen
              </span>
            )}
          </div>
          <textarea
            value={manuskriptRaw}
            onChange={(e) => setManuskriptRaw(e.target.value)}
            disabled={!canSave || busy}
            rows={12}
            className="w-full rounded-2xl bg-gray-100 px-4 py-3 font-mono text-sm text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            placeholder="Exposé / Handlungsoutline — nach dem Fundament erzeugen oder einfügen, dann Phase 0"
          />
        </div>

        <div className="space-y-3 rounded-2xl ring-1 ring-zinc-950/10 p-4">
          <div>
            <h3 className="text-sm font-extrabold text-zinc-950">
              Buch-Cover (nach Manuskript)
            </h3>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Gemini beschreibt eine Cover-Szene aus Manuskript/Fundament, Flux
              erzeugt das Bild im Amazon-eBook-Format 5:8 / 1600×2560
              (Hochformat, vollflächig, ohne Text) — Titel wird danach als
              Overlay gesetzt. Roman zuerst speichern.
            </p>
          </div>
          <label className="block">
            <FieldLabel>Zusätzliche Art-Direction (optional)</FieldLabel>
            <textarea
              value={coverExtra}
              onChange={(e) => setCoverExtra(e.target.value)}
              disabled={!canSave || busy}
              rows={2}
              className={textareaClass}
              placeholder="z. B. Nacht, Silhouette am Kai, kaltblaues Licht …"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSave || busy || !roman?.id}
              onClick={() => void handleGenerateCover()}
              className={cn(
                "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
                (!canSave || busy || !roman?.id) && "opacity-70",
              )}
            >
              {coverPending
                ? "Cover wird erzeugt …"
                : coverImageDataUrl
                  ? "Cover neu erzeugen"
                  : "Cover erzeugen (Gemini → Flux)"}
            </button>
            <button
              type="button"
              disabled={
                !canSave || busy || !roman?.id || !coverImageDataUrl.trim()
              }
              onClick={() => void handleSaveCover()}
              className={cn(
                "rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
                (!canSave || busy || !coverImageDataUrl.trim()) && "opacity-70",
              )}
            >
              {coverSavePending ? "Speichern …" : "Cover speichern"}
            </button>
            {coverImageDataUrl.trim() ? (
              <button
                type="button"
                disabled={!canSave || busy || !roman?.id}
                onClick={() => setCoverClearOpen(true)}
                className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-red-800 ring-1 ring-zinc-950/10 hover:bg-white"
              >
                Cover löschen
              </button>
            ) : null}
          </div>
          {coverImageDataUrl.trim() ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageDataUrl}
                alt={`Cover: ${title || "Roman"}`}
                className="aspect-[5/8] w-full max-w-xs rounded-2xl object-cover ring-1 ring-zinc-950/10"
              />
              {coverPrompt.trim() ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-100 p-3 text-[11px] font-semibold leading-relaxed text-zinc-600">
                  {coverPrompt}
                </pre>
              ) : (
                <p className="text-xs font-semibold text-zinc-500">
                  Prompt-Debug erscheint nach der Generierung.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs font-semibold text-zinc-500">
              Noch kein Cover — nach dem Speichern des Kontexts erzeugen.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void handleSaveOnly()}
            className={cn(
              "rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
              (!canSave || busy) && "opacity-70",
            )}
          >
            {savePending ? "Speichern …" : "Nur speichern"}
          </button>
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void handlePhase0()}
            className={cn(
              "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
              (!canSave || busy) && "opacity-70",
            )}
          >
            {phase0Pending
              ? "Roadmap wird erzeugt …"
              : "Phase 0: Szenen-Roadmap (KI)"}
          </button>
        </div>
        <p className="text-xs font-semibold text-zinc-500">
          Phase 0 ersetzt alle nicht fertigen Szenen. Fertige (COMPLETED)
          bleiben erhalten. Dauer: oft 1–3 Minuten.
        </p>
      </section>

      {roman ? (
        <>
          <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-zinc-950">
                Phase 1–3 — Nächste Szene
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!roman || exportPending || revisedCount === 0 || busy}
                  onClick={() => void handleExportRomanPdf()}
                  className={cn(
                    "rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
                    (exportPending || revisedCount === 0 || busy) &&
                      "opacity-70",
                  )}
                >
                  {exportPending
                    ? "PDF wird erzeugt …"
                    : "Roman-PDF (revidiert)"}
                </button>
                <button
                  type="button"
                  disabled={
                    !canSave ||
                    scenePending ||
                    batchPending ||
                    readyCount === 0 ||
                    phase0Pending ||
                    !schreibModelId
                  }
                  onClick={() => void handleNextScene()}
                  className={cn(
                    "rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-extrabold text-zinc-950 hover:bg-yellow-300",
                    (scenePending ||
                      batchPending ||
                      readyCount === 0 ||
                      !canSave ||
                      !schreibModelId) &&
                      "opacity-70",
                  )}
                >
                  {scenePending && !batchPending
                    ? "Autor → Lektor/Fan → Revision …"
                    : "Nächste Szene schreiben"}
                </button>
                <button
                  type="button"
                  disabled={
                    !canSave ||
                    scenePending ||
                    batchPending ||
                    readyCount === 0 ||
                    phase0Pending ||
                    !schreibModelId
                  }
                  onClick={() => void handleAllScenes()}
                  className={cn(
                    "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
                    (scenePending ||
                      batchPending ||
                      readyCount === 0 ||
                      !canSave ||
                      !schreibModelId) &&
                      "opacity-70",
                  )}
                >
                  {batchPending
                    ? "Alle Szenen laufen …"
                    : `Alle offenen Szenen (${readyCount})`}
                </button>
              </div>
            </div>
            <label className="block max-w-xl">
              <FieldLabel>Schreibmodell (LLM für alle Szenen)</FieldLabel>
              <select
                value={schreibModelId}
                disabled={!canSave || scenePending || batchPending}
                onChange={(event) => {
                  const next = event.target.value;
                  setSchreibModelId(next);
                  if (roman?.id) {
                    try {
                      sessionStorage.setItem(
                        schreibModelStorageKey(roman.id),
                        next,
                      );
                    } catch {
                      // ignore
                    }
                  }
                }}
                className={inputClass}
              >
                {schreibModels.length === 0 ? (
                  <option value="">Keine Text-LLMs im Katalog</option>
                ) : (
                  schreibModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} · {model.modelSlug}
                    </option>
                  ))
                )}
              </select>
            </label>
            <p className="text-sm font-semibold text-zinc-600">
              Eine Szene oder alle offenen nacheinander (Autor → Lektor/Fan →
              Revision) mit demselben LLM. Batch kann Stunden dauern — Tab offen
              lassen; Stoppen erst nach der laufenden Szene.
            </p>
            {roman.aktuelleZusammenfassung.trim() ? (
              <div>
                <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  Laufende Zusammenfassung
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-100 p-4 text-xs font-semibold text-zinc-700">
                  {roman.aktuelleZusammenfassung}
                </pre>
              </div>
            ) : null}
          </section>

          <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
            <div className="flex min-h-[28rem] flex-col rounded-3xl bg-white p-3 ring-1 ring-zinc-950/10 lg:h-0 lg:min-h-full">
              <p className="mb-2 shrink-0 px-2 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Szenen
              </p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {chapters.map((chapter) => (
                  <div key={chapter.kapitelNr}>
                    <div className="mb-1.5 px-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-zinc-800">
                          Kapitel {chapter.kapitelNr}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                            {chapter.headline}
                          </span>
                          <button
                            type="button"
                            title={`Inhalt von Kapitel ${chapter.kapitelNr} löschen`}
                            disabled={
                              !canSave ||
                              scenePending ||
                              batchPending ||
                              sceneDeletePending ||
                              chapterDeletePending
                            }
                            onClick={() =>
                              setChapterDeleteTarget({
                                kapitelNr: chapter.kapitelNr,
                                count: chapter.total,
                              })
                            }
                            className="inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-orange-50 hover:text-orange-800 disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            <span className="sr-only">
                              Inhalt von Kapitel {chapter.kapitelNr} löschen
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                          style={{
                            width: `${
                              chapter.total > 0
                                ? Math.round(
                                    (chapter.done / chapter.total) * 100,
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">
                        {chapter.done}/{chapter.total} fertig
                      </p>
                    </div>
                    <ul className="space-y-1">
                      {chapter.szenen.map((szene) => (
                        <li key={szene.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(szene.id)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold",
                              selectedId === szene.id
                                ? "bg-orange-50 text-orange-900"
                                : "text-zinc-700 hover:bg-gray-100",
                            )}
                          >
                            <span>
                              {szene.kapitelNr}.{szene.szenenNr}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase",
                                STATUS_BADGE[szene.status],
                              )}
                            >
                              {STATUS_LABEL[szene.status]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
              {!selected ? (
                <p className="text-sm font-semibold text-zinc-500">
                  Keine Szene ausgewählt.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-extrabold text-zinc-950">
                        Kapitel {selected.kapitelNr} · Szene{" "}
                        {selected.szenenNr}
                      </h3>
                      <p
                        className={cn(
                          "mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide uppercase",
                          STATUS_BADGE[selected.status],
                        )}
                      >
                        {STATUS_LABEL[selected.status]}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.status !== "COMPLETED" &&
                      selected.status !== "READY_FOR_WRITING" ? (
                        <button
                          type="button"
                          disabled={!canSave}
                          onClick={() => void handleReset(selected.id)}
                          className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-zinc-950/10"
                        >
                          Auf bereit zurücksetzen
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          !canSave ||
                          scenePending ||
                          batchPending ||
                          sceneDeletePending ||
                          chapterDeletePending
                        }
                        onClick={() =>
                          setSceneDeleteTarget({
                            id: selected.id,
                            kapitelNr: selected.kapitelNr,
                            szenenNr: selected.szenenNr,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-900 ring-1 ring-orange-200 hover:bg-orange-100 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Inhalt löschen
                      </button>
                    </div>
                  </div>
                  <CollapsibleSceneField
                    key={`${selected.id}-briefing`}
                    label="Briefing"
                    value={selected.briefing}
                  />
                  <CollapsibleSceneField
                    key={`${selected.id}-entwurf`}
                    label="Entwurf"
                    value={selected.entwurfRaw}
                  />
                  <CollapsibleSceneField
                    key={`${selected.id}-lektor`}
                    label="Feedback Lektor"
                    value={selected.feedbackLektor}
                  />
                  <CollapsibleSceneField
                    key={`${selected.id}-fan`}
                    label="Feedback Fan"
                    value={selected.feedbackFan}
                  />
                  <SceneField
                    label="Revidierte Szene"
                    value={selected.entwurfRevidiert}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <div>
              <h2 className="text-lg font-extrabold text-zinc-950">
                Abschluss — Buchrücken & Vorsatz
              </h2>
              <p className="mt-1 text-sm font-semibold text-zinc-600">
                Am Ende: Gemini gestaltet den Buchrücken (Druck) und minimale
                eBook-Vorsatzseiten (Titelseite, Impressum, optional Widmung /
                Motto) — so wenig wie möglich vor Seite&nbsp;1. Im PDF landen
                Cover + Vorsatz vor dem ersten Kapitel.
              </p>
            </div>

            <label className="block">
              <FieldLabel>Autor:in</FieldLabel>
              <input
                type="text"
                value={autorName}
                onChange={(e) => setAutorName(e.target.value)}
                disabled={!canSave || busy}
                className={inputClass}
                placeholder="Name für Titelseite und Rücken"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canSave || busy || !roman?.id}
                onClick={() => void handleGenerateFrontMatter()}
                className={cn(
                  "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
                  (!canSave || busy || !roman?.id) && "opacity-70",
                )}
              >
                {frontMatterPending
                  ? "Gemini arbeitet …"
                  : buchruecken.titelKurz.trim() || vorsatz.titelseite.titel.trim()
                    ? "Neu erzeugen (Gemini)"
                    : "Buchrücken & Vorsatz erzeugen"}
              </button>
              <button
                type="button"
                disabled={!canSave || busy || !roman?.id}
                onClick={() => void handleSaveFrontMatter()}
                className={cn(
                  "rounded-full bg-gray-100 px-5 py-2.5 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white",
                  (!canSave || busy || !roman?.id) && "opacity-70",
                )}
              >
                {frontMatterSavePending ? "Speichern …" : "Abschluss speichern"}
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-zinc-950/5">
                <h3 className="text-sm font-extrabold text-zinc-950">
                  Buchrücken (Druck)
                </h3>
                <label className="block">
                  <FieldLabel>Kurztitel</FieldLabel>
                  <input
                    type="text"
                    value={buchruecken.titelKurz}
                    onChange={(e) =>
                      setBuchruecken((p) => ({
                        ...p,
                        titelKurz: e.target.value,
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Autor-Zeile</FieldLabel>
                  <input
                    type="text"
                    value={buchruecken.autorZeile}
                    onChange={(e) =>
                      setBuchruecken((p) => ({
                        ...p,
                        autorZeile: e.target.value,
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Verlag / Imprint</FieldLabel>
                  <input
                    type="text"
                    value={buchruecken.verlagZeile}
                    onChange={(e) =>
                      setBuchruecken((p) => ({
                        ...p,
                        verlagZeile: e.target.value,
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Gestaltungshinweise</FieldLabel>
                  <textarea
                    value={buchruecken.gestaltungshinweise}
                    onChange={(e) =>
                      setBuchruecken((p) => ({
                        ...p,
                        gestaltungshinweise: e.target.value,
                      }))
                    }
                    disabled={!canSave || busy}
                    rows={5}
                    className={textareaClass}
                    placeholder="Farben, Typo, Lesbarkeit auf schmalem Rücken …"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-zinc-950/5">
                <h3 className="text-sm font-extrabold text-zinc-950">
                  Vorsatz (eBook)
                </h3>
                <label className="block">
                  <FieldLabel>Titel</FieldLabel>
                  <input
                    type="text"
                    value={vorsatz.titelseite.titel}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        titelseite: {
                          ...p.titelseite,
                          titel: e.target.value,
                        },
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Untertitel (optional)</FieldLabel>
                  <input
                    type="text"
                    value={vorsatz.titelseite.untertitel}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        titelseite: {
                          ...p.titelseite,
                          untertitel: e.target.value,
                        },
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Autor auf Titelseite</FieldLabel>
                  <input
                    type="text"
                    value={vorsatz.titelseite.autor}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        titelseite: {
                          ...p.titelseite,
                          autor: e.target.value,
                        },
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Imprint</FieldLabel>
                  <input
                    type="text"
                    value={vorsatz.titelseite.imprint}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        titelseite: {
                          ...p.titelseite,
                          imprint: e.target.value,
                        },
                      }))
                    }
                    disabled={!canSave || busy}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>©-Hinweis</FieldLabel>
                  <textarea
                    value={vorsatz.impressum.hinweis}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        impressum: { ...p.impressum, hinweis: e.target.value },
                      }))
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Fiktions-Disclaimer</FieldLabel>
                  <textarea
                    value={vorsatz.impressum.disclaimer}
                    onChange={(e) =>
                      setVorsatz((p) => ({
                        ...p,
                        impressum: {
                          ...p.impressum,
                          disclaimer: e.target.value,
                        },
                      }))
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Widmung (optional, leer = keine Seite)</FieldLabel>
                  <textarea
                    value={vorsatz.widmung}
                    onChange={(e) =>
                      setVorsatz((p) => ({ ...p, widmung: e.target.value }))
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Motto / Epigraph (optional)</FieldLabel>
                  <textarea
                    value={vorsatz.motto}
                    onChange={(e) =>
                      setVorsatz((p) => ({ ...p, motto: e.target.value }))
                    }
                    disabled={!canSave || busy}
                    rows={2}
                    className={textareaClass}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
            <div>
              <h2 className="text-lg font-extrabold text-zinc-950">
                Publikation — EPUB für Amazon KDP
              </h2>
              <p className="mt-1 text-sm font-semibold text-zinc-600">
                Reflowable EPUB&nbsp;3 aus Cover, Vorsatz und revidierten
                Kapiteln — geeignet zum Hochladen bei Kindle Direct Publishing
                und zum Sideloaden aufs Kindle. Cover separat als JPG
                (1600×2560) zusätzlich in KDP hochladen.
              </p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs font-semibold text-zinc-500">
              <li>
                Inhalt: Cover (falls vorhanden) → Titelseite → Impressum →
                optional Widmung/Motto → Kapitel
              </li>
              <li>
                Vorher Abschluss speichern, damit Autor/Impressum im EPUB
                stimmen
              </li>
              <li>
                Nach dem Download: in KDP prüfen (Previewer), Preis setzen,
                veröffentlichen
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  !roman || epubPending || revisedCount === 0 || busy
                }
                onClick={() => void handleExportRomanEpub()}
                className={cn(
                  "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
                  (epubPending || revisedCount === 0 || busy) && "opacity-70",
                )}
              >
                {epubPending
                  ? "EPUB wird erzeugt …"
                  : "EPUB herunterladen (KDP)"}
              </button>
            </div>
            {revisedCount === 0 ? (
              <p className="text-xs font-semibold text-amber-800">
                Noch keine revidierten Szenen — zuerst Phase&nbsp;1–3
                abschließen.
              </p>
            ) : (
              <p className="text-xs font-semibold text-zinc-500">
                {revisedCount} revidierte Szene(n) ·{" "}
                {coverImageDataUrl.trim()
                  ? "mit Cover"
                  : "ohne Cover (optional vorher erzeugen)"}
                {" · "}
                {vorsatz.titelseite.titel.trim()
                  ? "Vorsatz vorhanden"
                  : "Titel aus Kontext — Vorsatz optional nachziehen"}
              </p>
            )}
          </section>
        </>
      ) : null}

      <ConfirmDeleteDialog
        open={outlineOverwriteOpen}
        title="Outline ersetzen?"
        description="Das Manuskript-/Outline-Feld ist nicht leer. Der bisherige Text wird unwiderruflich durch ein neues Outline aus dem Fundament ersetzt."
        confirmLabel="Ersetzen"
        pending={outlinePending}
        onCancel={() => {
          if (!outlinePending) setOutlineOverwriteOpen(false);
        }}
        onConfirm={() => void runOutlineGenerate()}
      />
      <ConfirmDeleteDialog
        open={coverClearOpen}
        title="Cover löschen?"
        description="Das gespeicherte Buch-Cover und der zugehörige Prompt werden unwiderruflich entfernt."
        confirmLabel="Cover löschen"
        pending={coverClearPending}
        onCancel={() => {
          if (!coverClearPending) setCoverClearOpen(false);
        }}
        onConfirm={() => void handleClearCover()}
      />
      <ConfirmDeleteDialog
        open={sceneDeleteTarget !== null}
        title="Szenen-Inhalt löschen?"
        description={
          sceneDeleteTarget
            ? `Entwurf, Feedback und Revision von Kapitel ${sceneDeleteTarget.kapitelNr} · Szene ${sceneDeleteTarget.szenenNr} werden geleert. Briefing und die Szene selbst bleiben. Status wird „Bereit“. Der zugehörige Absatz in der laufenden Zusammenfassung wird entfernt.`
            : ""
        }
        confirmLabel="Inhalt löschen"
        pending={sceneDeletePending}
        onCancel={() => {
          if (!sceneDeletePending) setSceneDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteSzene()}
      />
      <ConfirmDeleteDialog
        open={chapterDeleteTarget !== null}
        title="Kapitel-Inhalt löschen?"
        description={
          chapterDeleteTarget
            ? `Entwurf, Feedback und Revision aller ${chapterDeleteTarget.count} Szene(n) in Kapitel ${chapterDeleteTarget.kapitelNr} werden geleert. Briefings und die Szenen bleiben. Status wird „Bereit“. Die Absätze dieses Kapitels in der laufenden Zusammenfassung werden entfernt.`
            : ""
        }
        confirmLabel="Inhalt löschen"
        pending={chapterDeletePending}
        onCancel={() => {
          if (!chapterDeletePending) setChapterDeleteTarget(null);
        }}
        onConfirm={() => void handleDeleteKapitel()}
      />
      <RomanSceneWaitDialog
        open={phase0Pending}
        variant="roadmap"
      />
      <RomanSceneWaitDialog
        open={scenePending || batchPending}
        variant="scene"
        batch={batchPending}
        progressLabel={batchPending ? batchProgressLabel : null}
        stopAfterCurrent={batchStopAfterCurrent}
        onRequestStopAfterCurrent={
          batchPending
            ? () => {
                batchStopRef.current = true;
                setBatchStopAfterCurrent(true);
                toast.message("Stoppt nach der aktuellen Szene …");
              }
            : undefined
        }
      />
      <StoryPdfPreviewDialog
        open={pdfPreviewOpen}
        previewHtml={pdfPreviewHtml}
        pdfUrl={pdfPreviewUrl}
        downloadFileName={pdfDownloadName}
        heading="Roman-PDF"
        onClose={closeRomanPdfPreview}
      />
    </div>
  );
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl ring-1 ring-zinc-950/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-extrabold text-zinc-900">{title}</span>
        <span className="text-xs font-bold text-zinc-500">
          {open ? "Einklappen" : "Ausklappen"}
        </span>
      </button>
      {open ? <div className="space-y-3 border-t border-zinc-100 p-4">{children}</div> : null}
    </div>
  );
}

function CollapsibleSceneField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = value.trim().length > 0;

  return (
    <div className="rounded-2xl ring-1 ring-zinc-950/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            {label}
          </span>
          {!open ? (
            <span className="mt-0.5 block truncate text-sm font-semibold text-zinc-600">
              {hasContent ? "Inhalt vorhanden — ausklappen" : "— leer"}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs font-bold text-zinc-500">
          {open ? "Einklappen" : "Ausklappen"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-zinc-100 p-4">
          {hasContent ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-100 p-4 text-sm leading-relaxed text-zinc-800">
              {value}
            </pre>
          ) : (
            <p className="text-sm font-semibold text-zinc-400">—</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SceneField({ label, value }: { label: string; value: string }) {
  if (!value.trim()) {
    return (
      <div>
        <p className="mb-1 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
          {label}
        </p>
        <p className="text-sm font-semibold text-zinc-400">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-gray-100 p-4 text-sm leading-relaxed text-zinc-800">
        {value}
      </pre>
    </div>
  );
}
