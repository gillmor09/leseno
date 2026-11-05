"use client";

/**
 * Guided Sachbuch wizard: Rohkonzept → … → Manuskript → Herstellung → Export → Hörbuch.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  applySachbuchCompactProductSplitAction,
  createSachbuchCompactAction,
  createSachbuchTeaserAction,
  deleteSachbuchAction,
  saveSachbuchAction,
} from "@/app/actions/sachbuch-admin";
import {
  approveSachbuchSchreibenAction,
  setSachbuchGuideStepAction,
} from "@/app/actions/sachbuch-phases";
import { SachbuchBookTypePanel } from "@/components/features/admin/sachbuch-book-type-panel";
import { SachbuchEvidenzPanel } from "@/components/features/admin/sachbuch-evidenz-panel";
import { SachbuchExportPanel } from "@/components/features/admin/sachbuch-export-panel";
import { SachbuchGuideStepper } from "@/components/features/admin/sachbuch-guide-stepper";
import { SachbuchHoerbuchPanel } from "@/components/features/admin/sachbuch-hoerbuch-panel";
import { SachbuchWaitDialog } from "@/components/features/admin/sachbuch-wait-dialog";
import { SachbuchHerstellungPanel } from "@/components/features/admin/sachbuch-herstellung-panel";
import { SachbuchIdeePanel } from "@/components/features/admin/sachbuch-idee-panel";
import { SachbuchIdeeRefinePanel } from "@/components/features/admin/sachbuch-idee-refine-panel";
import { SachbuchMakroPanel } from "@/components/features/admin/sachbuch-makro-panel";
import { SachbuchManuscriptPanel } from "@/components/features/admin/sachbuch-manuscript-panel";
import { SachbuchSchreibenPanel } from "@/components/features/admin/sachbuch-schreiben-panel";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getSachbuchBookType } from "@/lib/sachbuch/book-types";
import {
  canOpenSachbuchGuideStep,
  effectiveSachbuchGuideStep,
  hasUsableSachbuchConcept,
  isSachbuchCompact,
  isSachbuchIdeaApproved,
  isSachbuchTeaser,
  isSachbuchWriteApproved,
  nextSachbuchGuideStep,
  sachbuchSchreibenReadyToFreeze,
} from "@/lib/sachbuch/guide";
import type { SachbuchGuideStep, SachbuchKontext } from "@/lib/sachbuch/types";
import { SACHBUCH_GUIDE_STEP_LABELS } from "@/lib/sachbuch/types";
import { mergeSachbuchProseFromPrevious } from "@/lib/sachbuch/parse";
import {
  claimSachbuchCompactRun,
  mergeSachbuchChapterProse,
  releaseSachbuchCompactRun,
  requestCondenseSachbuchCompactBook,
} from "@/lib/sachbuch/compact-client";
import {
  claimSachbuchTeaserRun,
  releaseSachbuchTeaserRun,
  requestCondenseSachbuchTeaserBook,
} from "@/lib/sachbuch/teaser-client";
import { sachbuchTeaserSourceReady } from "@/lib/sachbuch/teaser";
import {
  SACHBUCH_WAIT_COMPACT,
  SACHBUCH_WAIT_TEASER,
  sachbuchWaitAgentCompact,
  sachbuchWaitAgentTeaser,
} from "@/lib/sachbuch/wait-presets";
import {
  SACHBUCH_BRIEFING_MAX_CHARS,
  SACHBUCH_OPINION_MAX_CHARS,
} from "@/lib/validations/sachbuch";

export function SachbuchAdminWorkspace({
  initialBook,
  canSave,
  startCompact = false,
}: {
  initialBook: SachbuchKontext;
  /** Kept for page compatibility; unused until agents UI returns. */
  modelOptions?: Array<{ modelSlug: string; label: string }>;
  canSave: boolean;
  /** After creating a compact edition, condense open chapters once. */
  startCompact?: boolean;
}) {
  const router = useRouter();
  const [book, setBook] = useState(initialBook);
  const [title, setTitle] = useState(initialBook.title);
  const [titlePending, setTitlePending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [stepPending, setStepPending] = useState(false);
  const [draftOpinion, setDraftOpinion] = useState(
    initialBook.idee.unpopularOpinion,
  );
  const [draftBriefing, setDraftBriefing] = useState(initialBook.idee.briefing);
  const [conceptPending, setConceptPending] = useState(false);
  const [compactPending, setCompactPending] = useState(false);
  const [compactProgress, setCompactProgress] = useState<string | null>(null);
  const [compactStartedAt, setCompactStartedAt] = useState<number | null>(null);
  const [productSplitPending, setProductSplitPending] = useState(false);
  const [teaserPending, setTeaserPending] = useState(false);
  const [teaserProgress, setTeaserProgress] = useState<string | null>(null);
  const [teaserStartedAt, setTeaserStartedAt] = useState<number | null>(null);
  const compactRunStarted = useRef(false);
  const teaserRunStarted = useRef(false);
  const productSplitStarted = useRef(false);

  const bookType = getSachbuchBookType(book.makro.bookTypeId);
  const step = effectiveSachbuchGuideStep(book);
  const ideaApproved = isSachbuchIdeaApproved(book);
  const writeApproved = isSachbuchWriteApproved(book);
  const compact = isSachbuchCompact(book);
  const teaser = isSachbuchTeaser(book);
  const compactPendingChapters = book.kapitel.filter(
    (k) => k.status !== "ready",
  ).length;
  const canCreateCompact =
    !compact &&
    !teaser &&
    book.kapitel.length > 0 &&
    (writeApproved ||
      book.kapitel.some(
        (k) =>
          Boolean(k.manuscript.hergestelltAt) ||
          Boolean(k.manuscript.improvedAt) ||
          k.manuscript.salesScore != null,
      ));
  const canCreateTeaser =
    compact && sachbuchTeaserSourceReady(book).ok;
  const writeReady = sachbuchSchreibenReadyToFreeze(book);
  const hasConcept = hasUsableSachbuchConcept(book);
  const ideaInterviewing =
    step === "concept" &&
    (book.idee.status === "in_progress" ||
      book.idee.status === "empty" ||
      !hasConcept);
  const conceptDirty =
    draftOpinion !== book.idee.unpopularOpinion ||
    draftBriefing !== book.idee.briefing;
  const draftConceptUsable =
    draftOpinion.trim().length >= 20 || draftBriefing.trim().length >= 20;
  const briefingOverLimit = draftBriefing.length > SACHBUCH_BRIEFING_MAX_CHARS;
  const opinionOverLimit = draftOpinion.length > SACHBUCH_OPINION_MAX_CHARS;

  const next = nextSachbuchGuideStep(step);

  async function runCompactCondensation(
    target: SachbuchKontext,
    alreadyClaimed = false,
  ) {
    if (!canSave || compactPending) {
      if (alreadyClaimed) releaseSachbuchCompactRun(target.id);
      return;
    }
    if (!alreadyClaimed && !claimSachbuchCompactRun(target.id)) {
      toast.error("Die Kürzung läuft bereits.");
      return;
    }
    setCompactPending(true);
    setCompactStartedAt(Date.now());
    setCompactProgress("Kapitel werden gekürzt …");
    try {
      const result = await requestCondenseSachbuchCompactBook({
        book: target,
        onBookUpdate: (next) => {
          setBook((prev) => mergeSachbuchChapterProse(prev, next));
        },
        onProgress: setCompactProgress,
      });
      if (result.data?.book) {
        const saved = result.data.book;
        setBook((prev) => mergeSachbuchChapterProse(prev, saved));
      }
      if (!result.success) {
        toast.error(result.error ?? "Kürzung unvollständig.");
        return;
      }
      const n = result.data?.condensedCount ?? 0;
      toast.success(
        n === 0
          ? "Alle Kapitel sind bereits gekürzt."
          : n === 1
            ? "1 Kapitel gekürzt."
            : `${n} Kapitel gekürzt.`,
      );
    } finally {
      releaseSachbuchCompactRun(target.id);
      setCompactPending(false);
      setCompactProgress(null);
      setCompactStartedAt(null);
      if (startCompact) {
        router.replace(`/admin/sachbuch/${target.id}`);
      }
    }
  }

  async function runTeaserCondensation(
    target: SachbuchKontext,
    alreadyClaimed = false,
  ) {
    if (!canSave || teaserPending) {
      if (alreadyClaimed) releaseSachbuchTeaserRun(target.id);
      return;
    }
    if (!alreadyClaimed && !claimSachbuchTeaserRun(target.id)) {
      toast.error("Die Teaser-Verdichtung läuft bereits.");
      return;
    }
    setTeaserPending(true);
    setTeaserStartedAt(Date.now());
    setTeaserProgress("Teaser-Abschnitte werden verdichtet …");
    try {
      const result = await requestCondenseSachbuchTeaserBook({
        book: target,
        onBookUpdate: (next) => {
          setBook((prev) => mergeSachbuchChapterProse(prev, next));
        },
        onProgress: setTeaserProgress,
      });
      if (result.data?.book) {
        setBook((prev) => mergeSachbuchChapterProse(prev, result.data!.book));
      }
      if (!result.success) {
        toast.error(result.error ?? "Teaser unvollständig.");
        return;
      }
      const n = result.data?.condensedCount ?? 0;
      toast.success(
        n === 0
          ? "Alle Teaser-Abschnitte sind fertig."
          : n === 1
            ? "1 Teaser-Abschnitt verdichtet."
            : `${n} Teaser-Abschnitte verdichtet.`,
      );
    } finally {
      releaseSachbuchTeaserRun(target.id);
      setTeaserPending(false);
      setTeaserProgress(null);
      setTeaserStartedAt(null);
      if (startCompact) {
        router.replace(`/admin/sachbuch/${target.id}`);
      }
    }
  }

  useEffect(() => {
    if (!startCompact || !canSave || compactRunStarted.current) return;
    if (!isSachbuchCompact(initialBook)) return;
    if (initialBook.kapitel.every((k) => k.status === "ready")) return;
    if (!claimSachbuchCompactRun(initialBook.id)) return;
    compactRunStarted.current = true;
    void runCompactCondensation(initialBook, true);
    // Start once when the compact book opens with ?kuerzen=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCompact, canSave, initialBook]);

  useEffect(() => {
    if (!startCompact || !canSave || teaserRunStarted.current) return;
    if (!isSachbuchTeaser(initialBook)) return;
    if (initialBook.kapitel.every((k) => k.status === "ready")) return;
    if (!claimSachbuchTeaserRun(initialBook.id)) return;
    teaserRunStarted.current = true;
    void runTeaserCondensation(initialBook, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCompact, canSave, initialBook]);

  /** One-shot: older Kompakt still 1:1 / with figures / old Titelei. */
  useEffect(() => {
    if (!canSave || !isSachbuchCompact(initialBook) || productSplitStarted.current) {
      return;
    }
    const hasFigs = initialBook.kapitel.some(
      (k) =>
        (k.infografiken?.length ?? 0) > 0 || Boolean(k.infografikDataUrl?.trim()),
    );
    const metaReady = /ohne Grafiken/i.test(initialBook.export.subtitle);
    const tooManyChapters = initialBook.kapitel.length > 4;
    if (!hasFigs && metaReady && !tooManyChapters) return;
    productSplitStarted.current = true;
    setProductSplitPending(true);
    void (async () => {
      try {
        const prevCount = initialBook.kapitel.length;
        const result = await applySachbuchCompactProductSplitAction({
          id: initialBook.id,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Produkttrennung fehlgeschlagen.");
          return;
        }
        setBook(result.data.book);
        const nextCount = result.data.book.kapitel.length;
        toast.success(
          nextCount < prevCount
            ? `Kompakt neu gegliedert: ${nextCount} Briefing-Kapitel — bitte erneut kürzen.`
            : "Kompakt als text-only Briefing ausgerichtet (ohne Grafiken, mit Hauptband-Verweisen).",
        );
      } finally {
        setProductSplitPending(false);
      }
    })();
  }, [canSave, initialBook]);

  useEffect(() => {
    setDraftOpinion(book.idee.unpopularOpinion);
    setDraftBriefing(book.idee.briefing);
  }, [book.id, book.idee.unpopularOpinion, book.idee.briefing]);

  async function saveTitle() {
    if (!canSave || titlePending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Titel angeben.");
      return;
    }
    setTitlePending(true);
    try {
      const result = await saveSachbuchAction({
        id: book.id,
        title: trimmed,
        stilbibel: book.stilbibel,
        zielgruppe: book.zielgruppe,
        agents: book.agents,
        idee: book.idee,
        evidenz: book.evidenz,
        makro: book.makro,
        kapitel: book.kapitel,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Titel speichern fehlgeschlagen.");
        return;
      }
      setBook(result.data.book);
      toast.success("Titel gespeichert.");
    } finally {
      setTitlePending(false);
    }
  }

  async function goToStep(target: SachbuchGuideStep) {
    if (!canSave || stepPending) return;
    if (!canOpenSachbuchGuideStep(book, target)) {
      toast.error("Dieser Schritt ist noch gesperrt.");
      return;
    }
    if (effectiveSachbuchGuideStep(book) === target) return;
    const previousStep = book.idee.guide.currentStep;
    // Optimistic UI — do not wait for DB round-trip to flip the tab.
    setBook((prev) => ({
      ...prev,
      idee: {
        ...prev.idee,
        guide: { ...prev.idee.guide, currentStep: target },
      },
    }));
    setStepPending(true);
    try {
      const result = await setSachbuchGuideStepAction({
        sachbuchId: book.id,
        step: target,
      });
      if (!result.success || !result.data) {
        setBook((prev) => ({
          ...prev,
          idee: {
            ...prev.idee,
            guide: { ...prev.idee.guide, currentStep: previousStep },
          },
        }));
        toast.error(result.error ?? "Schritt wechseln fehlgeschlagen.");
        return;
      }
      // Action returns slim shell — keep any prose/pixels already in memory.
      setBook((prev) =>
        mergeSachbuchProseFromPrevious(prev, result.data!.book),
      );
    } catch {
      setBook((prev) => ({
        ...prev,
        idee: {
          ...prev.idee,
          guide: { ...prev.idee.guide, currentStep: previousStep },
        },
      }));
      toast.error("Schritt wechseln fehlgeschlagen.");
    } finally {
      setStepPending(false);
    }
  }

  async function advance() {
    if (!next) return;
    if (step === "makro" && book.kapitel.length === 0) {
      toast.error("Zuerst Makro erzeugen und Kapitel anlegen.");
      return;
    }
    await goToStep(next);
  }

  async function createCompact() {
    if (!canSave || compactPending || !canCreateCompact) return;
    setCompactPending(true);
    try {
      const result = await createSachbuchCompactAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Kompakt-Ausgabe anlegen fehlgeschlagen.");
        return;
      }
      toast.success("Kompakt-Ausgabe angelegt — Kapitel werden gekürzt.");
      router.push(`/admin/sachbuch/${result.data.bookId}?kuerzen=1`);
      router.refresh();
    } finally {
      setCompactPending(false);
    }
  }

  async function createTeaser() {
    if (!canSave || teaserPending || !canCreateTeaser) return;
    setTeaserPending(true);
    try {
      const result = await createSachbuchTeaserAction({ id: book.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Teaser anlegen fehlgeschlagen.");
        return;
      }
      toast.success("Teaser angelegt — Abschnitte werden verdichtet.");
      router.push(`/admin/sachbuch/${result.data.bookId}?kuerzen=1`);
      router.refresh();
    } finally {
      setTeaserPending(false);
    }
  }

  async function onDelete() {
    if (!canSave || deletePending) return;
    setDeletePending(true);
    try {
      const result = await deleteSachbuchAction({ id: book.id });
      if (!result.success) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      setDeleteOpen(false);
      toast.success("Sachbuch gelöscht.");
      router.push("/admin/sachbuch");
      router.refresh();
    } finally {
      setDeletePending(false);
    }
  }

  async function leaveInterviewToRefine() {
    if (!canSave || titlePending || !hasConcept) return;
    setTitlePending(true);
    try {
      const result = await saveSachbuchAction({
        id: book.id,
        title: book.title,
        stilbibel: book.stilbibel,
        zielgruppe: book.zielgruppe,
        agents: book.agents,
        idee: {
          ...book.idee,
          status: "ready",
          guide: {
            currentStep: "refine",
            ideaApprovedAt: null,
          },
        },
        evidenz: book.evidenz,
        makro: book.makro,
        kapitel: book.kapitel,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setBook(result.data.book);
      toast.success("Weiter zur Verfeinerung.");
    } finally {
      setTitlePending(false);
    }
  }

  /**
   * Replace Rohkonzept (These + Briefing) by paste/edit.
   * Clears Idee-Freigabe so Verfeinern neu laufen kann — keeps Makro/Kapitel.
   */
  async function saveRohkonzept() {
    if (!canSave || conceptPending) return;
    const opinion = draftOpinion.trim();
    const briefing = draftBriefing.trim();
    if (opinion.length < 20 && briefing.length < 20) {
      toast.error("These oder Briefing einfügen (mind. 20 Zeichen).");
      return;
    }
    if (briefing.length > SACHBUCH_BRIEFING_MAX_CHARS) {
      toast.error(
        `Briefing zu lang (${briefing.length.toLocaleString("de-DE")} / ${SACHBUCH_BRIEFING_MAX_CHARS.toLocaleString("de-DE")} Zeichen). Bitte kürzen.`,
      );
      return;
    }
    if (opinion.length > SACHBUCH_OPINION_MAX_CHARS) {
      toast.error(
        `These zu lang (${opinion.length.toLocaleString("de-DE")} / ${SACHBUCH_OPINION_MAX_CHARS.toLocaleString("de-DE")} Zeichen).`,
      );
      return;
    }
    const nextOpinion =
      opinion ||
      briefing.split(/[.!?\n]/).find((s) => s.trim().length >= 20)?.trim() ||
      briefing.slice(0, 280);
    setConceptPending(true);
    try {
      const wasApproved = isSachbuchIdeaApproved(book);
      const result = await saveSachbuchAction({
        id: book.id,
        title: book.title,
        stilbibel: book.stilbibel,
        zielgruppe: book.zielgruppe,
        agents: book.agents,
        idee: {
          ...book.idee,
          unpopularOpinion: nextOpinion,
          briefing,
          status: "ready",
          refineStatus: "idle",
          refineLog: [],
          refinedBriefing: "",
          refinedOpinion: "",
          refinedCaseStudies: [],
          guide: {
            ...book.idee.guide,
            currentStep: "concept",
            ideaApprovedAt: null,
            writeApprovedAt: null,
          },
        },
        evidenz: book.evidenz,
        makro: book.makro,
        kapitel: book.kapitel,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Rohkonzept speichern fehlgeschlagen.");
        return;
      }
      setBook(result.data.book);
      toast.success(
        wasApproved
          ? "Rohkonzept gespeichert — Idee-Freigabe zurückgesetzt. Als Nächstes verfeinern."
          : "Rohkonzept gespeichert.",
      );
    } finally {
      setConceptPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/sachbuch"
            className="text-sm font-bold text-orange-800 hover:underline"
          >
            ← Alle Sachbücher
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            {book.title}
          </h1>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            {SACHBUCH_GUIDE_STEP_LABELS[step]}
            {bookType ? ` · ${bookType.shortLabel}` : ""}
            {teaser
              ? " · Teaser"
              : compact
                ? " · Kompakt-Ausgabe"
                : ideaApproved
                  ? " · Idee freigegeben"
                  : " · Idee gesperrt bis Freigabe"}
            {!compact && !teaser && writeApproved ? " · Schreiben fixiert" : ""}
          </p>
          {(compact || teaser) && book.idee.sourceBookId ? (
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Quelle:{" "}
              <Link
                href={`/admin/sachbuch/${book.idee.sourceBookId}`}
                className="font-bold text-orange-800 hover:underline"
              >
                {book.idee.sourceBookTitle ||
                  (teaser ? "Kompakt-Ausgabe" : "Ursprungsbuch")}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateCompact ? (
            <button
              type="button"
              disabled={!canSave || compactPending || deletePending}
              onClick={() => void createCompact()}
              className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
            >
              {compactPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BookOpen className="size-4" aria-hidden />
              )}
              Kompakt-Ausgabe anlegen
            </button>
          ) : null}
          {canCreateTeaser ? (
            <button
              type="button"
              disabled={!canSave || teaserPending || deletePending}
              onClick={() => void createTeaser()}
              className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {teaserPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BookOpen className="size-4" aria-hidden />
              )}
              Teaser anlegen
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canSave || deletePending}
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
            Löschen
          </button>
        </div>
      </div>

      <SachbuchGuideStepper
        book={book}
        canSave={canSave}
        pending={
          stepPending || titlePending || compactPending || teaserPending
        }
        onSelectStep={(s) => void goToStep(s)}
      />

      {compact ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white px-4 py-4 ring-1 ring-zinc-950/10 sm:px-5">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-zinc-700">
              {compactPendingChapters === 0
                ? "Alle Kapitel sind gekürzt. Weiter mit Manuskript, Herstellung und Export — oder Teaser anlegen."
                : `${book.kapitel.length - compactPendingChapters} von ${book.kapitel.length} Kapiteln gekürzt.`}
            </p>
            <p className="text-xs font-semibold text-zinc-500">
              Eigenes Produkt: 3–4 Briefing-Kapitel (Hauptband gebündelt), keine
              Infografiken, Verweise auf den Hauptband.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {compactPendingChapters > 0 ? (
              <button
                type="button"
                disabled={!canSave || compactPending || productSplitPending}
                onClick={() => void runCompactCondensation(book)}
                className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {compactPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Offene Kapitel kürzen
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canSave || compactPending || productSplitPending}
              onClick={() => {
                setProductSplitPending(true);
                void (async () => {
                  try {
                    const result = await applySachbuchCompactProductSplitAction({
                      id: book.id,
                    });
                    if (!result.success || !result.data) {
                      toast.error(
                        result.error ?? "Produkttrennung fehlgeschlagen.",
                      );
                      return;
                    }
                    setBook(result.data.book);
                    toast.success("Titelei, Verweise und text-only aktualisiert.");
                  } finally {
                    setProductSplitPending(false);
                  }
                })();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50"
            >
              {productSplitPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Produkttrennung anwenden
            </button>
          </div>
        </section>
      ) : null}

      {teaser ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white px-4 py-4 ring-1 ring-zinc-950/10 sm:px-5">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-zinc-700">
              {compactPendingChapters === 0
                ? "Alle Teaser-Abschnitte sind fertig. Weiter mit Manuskript, Herstellung und Export."
                : `${book.kapitel.length - compactPendingChapters} von ${book.kapitel.length} Abschnitten verdichtet.`}
            </p>
            <p className="text-xs font-semibold text-zinc-500">
              Appetizer für Newsletter, Broschüre und Web — Marketing-Ton, 2–3
              Abschnitte, Verweise auf die Kompaktausgabe.
            </p>
          </div>
          {compactPendingChapters > 0 ? (
            <button
              type="button"
              disabled={!canSave || teaserPending}
              onClick={() => void runTeaserCondensation(book)}
              className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {teaserPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Offene Abschnitte verdichten
            </button>
          ) : null}
        </section>
      ) : null}

      {!ideaApproved && book.kapitel.some((k) => k.abschnitte.length > 0) ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
          Vorhandene Abschnitte bleiben erhalten, sind aber gesperrt — zuerst
          Idee verfeinern und freigeben.
        </p>
      ) : null}

      <section className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-zinc-950/10 sm:p-6">
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Titel
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canSave || titlePending}
              className="min-w-[12rem] flex-1 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
            <button
              type="button"
              disabled={!canSave || titlePending}
              onClick={() => void saveTitle()}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {titlePending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Speichern
            </button>
          </div>
        </label>
      </section>

      {step === "concept" ? (
        <div className="space-y-3">
          {hasConcept && !ideaInterviewing ? (
            <section className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-zinc-950/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-zinc-950">
                    Rohkonzept
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    Verbesserte Idee hier einfügen und speichern — Ausgangspunkt
                    für die agentische Verfeinerung. Speichern setzt eine
                    vorhandene Idee-Freigabe zurück (Kapitel bleiben).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    !canSave ||
                    titlePending ||
                    conceptPending ||
                    conceptDirty ||
                    !draftConceptUsable
                  }
                  onClick={() => void leaveInterviewToRefine()}
                  className="rounded-full bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                >
                  Weiter: Verfeinern
                </button>
              </div>
              <label className="block space-y-1.5">
                <span className="flex items-baseline justify-between gap-2 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  <span>These / UVP</span>
                  <span
                    className={
                      opinionOverLimit ? "text-red-700" : "normal-case text-zinc-400"
                    }
                  >
                    {draftOpinion.length.toLocaleString("de-DE")} /{" "}
                    {SACHBUCH_OPINION_MAX_CHARS.toLocaleString("de-DE")}
                  </span>
                </span>
                <textarea
                  value={draftOpinion}
                  onChange={(e) => setDraftOpinion(e.target.value)}
                  disabled={!canSave || conceptPending}
                  rows={4}
                  className="w-full resize-y rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold leading-relaxed text-zinc-900 ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-orange-600 disabled:opacity-50"
                  placeholder="Scharfe These / Unpopular Opinion …"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-baseline justify-between gap-2 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  <span>Briefing / Buchkonzept</span>
                  <span
                    className={
                      briefingOverLimit
                        ? "text-red-700"
                        : "normal-case text-zinc-400"
                    }
                  >
                    {draftBriefing.length.toLocaleString("de-DE")} /{" "}
                    {SACHBUCH_BRIEFING_MAX_CHARS.toLocaleString("de-DE")} Zeichen
                  </span>
                </span>
                <textarea
                  value={draftBriefing}
                  onChange={(e) => setDraftBriefing(e.target.value)}
                  disabled={!canSave || conceptPending}
                  rows={16}
                  className="w-full resize-y rounded-2xl bg-zinc-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-orange-600 disabled:opacity-50"
                  placeholder="Vollständiges Konzept hier einfügen oder überschreiben …"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={
                    !canSave ||
                    conceptPending ||
                    !conceptDirty ||
                    !draftConceptUsable ||
                    briefingOverLimit ||
                    opinionOverLimit
                  }
                  onClick={() => void saveRohkonzept()}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {conceptPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Rohkonzept speichern
                </button>
                {conceptDirty ? (
                  <span className="text-xs font-semibold text-amber-800">
                    Ungespeicherte Änderungen
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={!canSave || titlePending || conceptPending}
                  onClick={() => {
                    void (async () => {
                      setTitlePending(true);
                      try {
                        const result = await saveSachbuchAction({
                          id: book.id,
                          title: book.title,
                          stilbibel: book.stilbibel,
                          zielgruppe: book.zielgruppe,
                          agents: book.agents,
                          idee: {
                            ...book.idee,
                            status: "in_progress",
                            guide: {
                              ...book.idee.guide,
                              currentStep: "concept",
                              ideaApprovedAt: null,
                              writeApprovedAt: null,
                            },
                          },
                          evidenz: book.evidenz,
                          makro: book.makro,
                          kapitel: book.kapitel,
                        });
                        if (!result.success || !result.data) {
                          toast.error(
                            result.error ?? "Speichern fehlgeschlagen.",
                          );
                          return;
                        }
                        setBook(result.data.book);
                      } finally {
                        setTitlePending(false);
                      }
                    })();
                  }}
                  className="text-sm font-bold text-orange-800 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Im Interview nachschärfen
                </button>
              </div>
            </section>
          ) : (
            <div className="space-y-3">
              {hasConcept ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200/80">
                  <p className="text-sm font-semibold text-amber-950">
                    Interview läuft — Konzept reicht für den nächsten Schritt.
                  </p>
                  <button
                    type="button"
                    disabled={!canSave || titlePending}
                    onClick={() => void leaveInterviewToRefine()}
                    className="rounded-full bg-white px-4 py-2 text-xs font-bold text-amber-950 ring-1 ring-amber-300/80 disabled:opacity-50"
                  >
                    Interview verlassen → Verfeinern
                  </button>
                </div>
              ) : null}
              <SachbuchIdeePanel
                book={book}
                canSave={canSave}
                onBookUpdate={setBook}
              />
            </div>
          )}
        </div>
      ) : null}

      {step === "refine" ? (
        <SachbuchIdeeRefinePanel
          book={book}
          canSave={canSave}
          onBookUpdate={setBook}
        />
      ) : null}

      {step === "book_type" ? (
        ideaApproved ? (
          <SachbuchBookTypePanel
            book={book}
            canSave={canSave}
            onBookUpdate={setBook}
          />
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Zuerst Idee freigeben (Schritt Verfeinern).
          </p>
        )
      ) : null}

      {step === "evidenz" ? (
        <div className="space-y-3">
          <SachbuchEvidenzPanel
            book={book}
            canSave={canSave}
            onBookUpdate={setBook}
          />
          <button
            type="button"
            disabled={!canSave || stepPending || !ideaApproved || !bookType}
            onClick={() => void advance()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            Weiter: Makro
          </button>
        </div>
      ) : null}

      {step === "makro" ? (
        <div className="space-y-3">
          <SachbuchMakroPanel
            book={book}
            canSave={canSave}
            onBookUpdate={setBook}
          />
          <button
            type="button"
            disabled={
              !canSave ||
              stepPending ||
              !ideaApproved ||
              !bookType ||
              book.kapitel.length === 0
            }
            onClick={() => void advance()}
            className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            Weiter: Schreiben
          </button>
        </div>
      ) : null}

      {step === "write" ? (
        ideaApproved && bookType ? (
          <div className="space-y-3">
            {writeApproved ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-200/80">
                Schreiben ist fixiert — Abschnitte sind schreibgeschützt. Weiter
                im Schritt Manuskript.
              </p>
            ) : null}
            <SachbuchSchreibenPanel
              book={book}
              canSave={canSave && !writeApproved}
              onBookUpdate={setBook}
            />
            {!writeApproved ? (
              <button
                type="button"
                disabled={!canSave || stepPending || !writeReady.ok}
                title={writeReady.ok ? undefined : writeReady.reason}
                onClick={() => {
                  void (async () => {
                    if (!canSave || stepPending) return;
                    setStepPending(true);
                    try {
                      const result = await approveSachbuchSchreibenAction({
                        id: book.id,
                      });
                      if (!result.success || !result.data) {
                        toast.error(
                          result.error ?? "Schreiben freigeben fehlgeschlagen.",
                        );
                        return;
                      }
                      setBook(result.data.book);
                      toast.success("Schreiben fixiert — weiter zum Manuskript.");
                    } finally {
                      setStepPending(false);
                    }
                  })();
                }}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Schreiben freigeben → Manuskript
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSave || stepPending}
                onClick={() => void goToStep("manuscript")}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Weiter: Manuskript
              </button>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Schreiben gesperrt — Idee freigeben und Buchtyp wählen.
          </p>
        )
      ) : null}

      {step === "manuscript" ? (
        writeApproved ? (
          <div className="space-y-3">
            <SachbuchManuscriptPanel
              book={book}
              canSave={canSave}
              onBookUpdate={setBook}
            />
            {canOpenSachbuchGuideStep(book, "herstellung") ? (
              <button
                type="button"
                disabled={!canSave || stepPending}
                onClick={() => void goToStep("herstellung")}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Weiter: Herstellung
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Manuskript gesperrt — zuerst Schreiben freigeben/fixieren.
          </p>
        )
      ) : null}

      {step === "herstellung" ? (
        writeApproved ? (
          <div className="space-y-3">
            <SachbuchHerstellungPanel
              book={book}
              canSave={canSave}
              onBookUpdate={setBook}
            />
            {canOpenSachbuchGuideStep(book, "export") ? (
              <button
                type="button"
                disabled={!canSave || stepPending}
                onClick={() => void goToStep("export")}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Weiter: Export
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Herstellung gesperrt — zuerst Schreiben freigeben/fixieren.
          </p>
        )
      ) : null}

      {step === "export" ? (
        ideaApproved && bookType && writeApproved ? (
          <div className="space-y-3">
            <SachbuchExportPanel
              book={book}
              canSave={canSave}
              onBookUpdate={setBook}
            />
            {canOpenSachbuchGuideStep(book, "hoerbuch") ? (
              <button
                type="button"
                disabled={!canSave || stepPending}
                onClick={() => void goToStep("hoerbuch")}
                className="rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Weiter: Hörbuch
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Export gesperrt — Schreiben fixieren und Manuskript abschließen.
          </p>
        )
      ) : null}

      {step === "hoerbuch" ? (
        ideaApproved && bookType && writeApproved ? (
          <SachbuchHoerbuchPanel
            book={book}
            canSave={canSave}
            onBookUpdate={setBook}
          />
        ) : (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80">
            Hörbuch gesperrt — zuerst Schreiben fixieren.
          </p>
        )
      ) : null}

      {next &&
      step !== "evidenz" &&
      step !== "makro" &&
      step !== "write" &&
      step !== "manuscript" &&
      step !== "herstellung" &&
      step !== "export" &&
      step !== "hoerbuch" &&
      step !== "concept" &&
      step !== "refine" &&
      canOpenSachbuchGuideStep(book, next) ? (
        <button
          type="button"
          disabled={!canSave || stepPending}
          onClick={() => void advance()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Weiter: {SACHBUCH_GUIDE_STEP_LABELS[next]}
        </button>
      ) : null}

      <SachbuchWaitDialog
        open={compactPending && compact}
        title="Kompakt-Ausgabe kürzen"
        steps={SACHBUCH_WAIT_COMPACT}
        progressLabel={compactProgress}
        agentInfo={sachbuchWaitAgentCompact()}
        startedAtMs={compactStartedAt}
        footer="Bitte Fenster offen lassen — ein Kapitel dauert meist ein paar Minuten."
      />

      <SachbuchWaitDialog
        open={teaserPending && teaser}
        title="Teaser verdichten"
        steps={SACHBUCH_WAIT_TEASER}
        progressLabel={teaserProgress}
        agentInfo={sachbuchWaitAgentTeaser()}
        startedAtMs={teaserStartedAt}
        footer="Bitte Fenster offen lassen — ein Abschnitt dauert meist wenige Minuten."
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        title="Sachbuch löschen?"
        description={`„${book.title}“ wird unwiderruflich gelöscht (Idee, Kapitel, Agenten).`}
        confirmLabel="Löschen"
        pending={deletePending}
        onCancel={() => {
          if (deletePending) return;
          setDeleteOpen(false);
        }}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
