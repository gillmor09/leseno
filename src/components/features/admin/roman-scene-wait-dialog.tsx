"use client";

/**
 * Blocking wait dialog for book-pipeline KI work.
 * Hierarchy: context (which step) → title (what action) → live status (what
 * now) → checklist. Soft animation never overrides a live progressLabel.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { loadRomanKiRollenAction } from "@/app/actions/roman-roles-admin";
import { findWiredAiEndpoint, isImageAiProvider } from "@/lib/ai/wired-models";
import {
  ROMAN_ASSIST_MODEL_SLUG,
  ROMAN_PROSE_ROLE_KEY,
} from "@/lib/roman/assist-model";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

export type WaitAgentInfo = { roleLabel: string; modelLabel: string };

/**
 * Model label as runtime resolves it (not raw DB slug).
 * Only `co_autor` Manuskript-Prosa keeps Sonnet etc.; everything else → Assist-Flash.
 */
export function waitModelLabelForRole(
  roleKey: string,
  modelSlug: string,
  opts?: { allowProseModel?: boolean },
): string {
  const key = roleKey.trim();
  if (key.startsWith("clever_")) {
    return findWiredAiEndpoint(modelSlug)?.label ?? modelSlug;
  }
  const wired = findWiredAiEndpoint(modelSlug);
  if (wired && isImageAiProvider(wired.provider)) {
    return wired.label;
  }
  const prose =
    key === ROMAN_PROSE_ROLE_KEY && opts?.allowProseModel === true;
  const slug = prose ? modelSlug : ROMAN_ASSIST_MODEL_SLUG;
  return findWiredAiEndpoint(slug)?.label ?? slug;
}


const IDEE_QA_STEPS = [
  "Schreib-Coach liest deine Nachricht",
  "Coach formuliert Rückfragen und Impulse",
  "Ideen-Redakteur verwebt die Runde",
  "Idee und Dialog werden gespeichert",
] as const;

const RECHERCHE_QA_STEPS = [
  "Recherche-Coach liest Idee und Nachfrage",
  "Google Search recherchiert Hintergründe",
  "Recherche-Redakteur verwebt das Dossier",
  "Recherche und Quellen werden gespeichert",
] as const;

const MARKTANALYSE_STEPS = [
  "Genre und Altersgruppe werden gelesen",
  "Google Search sucht Konkurrenz-Titel",
  "Schlechteste Rezensionen je Titel",
  "Beste Rezensionen je Titel",
  "Kritik und Bedürfnisse verdichten",
  "Marktanalyse wird gespeichert",
] as const;

const CLEVER_UNTERTHEMEN_STEPS = [
  "Thema und Altersgruppe werden gelesen",
  "Wissenssammler recherchiert (Google Search)",
  "Unterthemen chronologisch sortieren",
  "Fakten je Kapitel verdichten",
  "Unterthemen werden gespeichert",
] as const;

const CLEVER_FAKTENCHECK_STEPS = [
  "Kapitel-Fakten werden gelesen",
  "Faktenchecker recherchiert tiefer",
  "Jeder Fakt wird einzeln bewertet",
  "Kapitel-Signal (ok / Nacharbeit)",
  "Ergebnis wird gespeichert",
] as const;

const CLEVER_FAKTEN_ERSETZEN_STEPS = [
  "Kritische Fakten werden markiert",
  "Wissenssammler recherchiert Ersatz",
  "Nur fehlerhafte Fakten neu setzen",
  "Kapitel zurück auf ungeprüft",
  "Ergebnis wird gespeichert",
] as const;

/** Generic structure draft (Idee etc.). */
const PIPELINE_GENERATE_STEPS = [
  "Entwurf vorbereiten",
  "KI schreibt diesen Schritt",
  "Wissensgraph / Continuity",
  "Reifegrad bewerten",
] as const;

/** Checklist when Spec-Kette erzeugt (Figuren → Welt → Exposé). */
export const SPEC_GENERATE_STEPS = [
  "Figuren stecken",
  "Welt / Schauplätze",
  "Exposé schreiben",
  "Reifegrad bewerten",
] as const;

/** Checklist when Erzeugen runs on Kapitelgerüst. */
export const KAPITELGERUEST_GENERATE_STEPS = [
  "Outline & Spannungsbögen",
  "Kapitel einzeln detaillieren",
  "Wissensgraph aktualisieren",
  "Reifegrad bewerten",
] as const;

/** Checklist when Erzeugen runs on Szenenplot. */
export const SZENENPLOT_GENERATE_STEPS = [
  "Gerüst lesen & Szenen planen",
  "Szenen + Schreibprompts schreiben",
  "Wissensgraph aktualisieren",
  "Reifegrad bewerten",
] as const;

/** Checklist when Alles erzeugen runs on Manuskript. */
export const MANUSKRIPT_GENERATE_STEPS = [
  "Arbeitsbrief / Verträge einfrieren",
  "Kapitel nacheinander schreiben",
  "Qualität / Continuity je Kapitel",
  "Reifegrad bewerten",
] as const;

const PIPELINE_GENERATE_DRAFT_ONLY_STEPS = [
  "Geschichten werden erzeugt",
  "Infografiken werden gemalt",
  "Ergebnis wird gespeichert",
] as const;

const PIPELINE_CRITIQUE_STEPS = [
  "Struktur analysieren",
  "Änderungsaufträge verdichten",
  "Aufträge einarbeiten",
  "Reifegrad neu bewerten",
] as const;

const REIFEGRAD_ASSESS_STEPS = [
  "Artefakt lesen",
  "Vier Dimensionen messen",
  "Reifegrad speichern",
] as const;

const LESER_FEEDBACK_STEPS = [
  "Testleser liest das Artefakt",
  "Einschätzung und Aufträge verdichten",
  "Feedback speichern",
] as const;

const LESER_FEEDBACK_APPLY_STEPS = [
  "Feedback → Patch-Brief",
  "Co-Autor arbeitet Prosa ein",
  "Continuity + Wissensgraph",
  "Reifegrad neu bewerten",
] as const;

const MANUSKRIPT_CHAPTER_GENERATE_STEPS = [
  "Szenenvertrag / Paket fürs Kapitel",
  "Continuity vom Vorgänger",
  "Co-Autor schreibt Prosa",
  "Länge & Continuity speichern",
] as const;

const MANUSKRIPT_CHAPTER_IMPROVE_STEPS = [
  "Analyse gegen Verträge",
  "Co-Autor arbeitet ein",
  "Continuity + Wissensgraph",
] as const;

const MANUSKRIPT_CHAPTER_CRITIQUE_STEPS = [
  "Szenenvertrag + Continuity lesen",
  "Entwicklungslektor gegenliest",
  "Analyse verdichten",
] as const;

const CLEVER_GESCHICHTE_GENERATE_STEPS = [
  "Unterthema und Fakten lesen",
  "Erzähler schreibt Kurzgeschichte",
  "Infografik malen",
  "Speichern",
] as const;

const CLEVER_GESCHICHTE_IMPROVE_ANALYZE_STEPS = [
  "Kurzgeschichte lesen",
  "Leser formuliert Kritik und Aufträge",
] as const;

const CLEVER_GESCHICHTE_IMPROVE_APPLY_STEPS = [
  "Erzähler arbeitet Aufträge ein",
  "Speichern",
] as const;

const CLEVER_GESCHICHTE_CRITIQUE_STEPS = [
  "Kurzgeschichte lesen",
  "Leser formuliert Gegenlese",
] as const;

const CLEVER_INFOGRAFIK_STEPS = [
  "Bildprompt aus der Geschichte",
  "Bildmodell malt Infografik",
  "Bild speichern",
] as const;

const COVER_STEPS = [
  "Art Direction / Prompt",
  "Cover-Bild erzeugen",
  "Typografie / Overlay",
] as const;

const EXPORT_COPY_STEPS = [
  "Klappentext & Keywords",
  "Titelei (Titel, Copyright, Motto)",
  "Speichern",
] as const;

const EXPORT_FILE_STEPS = [
  "Manuskript aufbereiten",
  "Datei erzeugen",
  "Download vorbereiten",
] as const;

const VEREINFACHEN_STEPS = [
  "Manuskript lesen",
  "Sprache vereinfachen (Inhalt bleibt)",
  "Ergebnis speichern",
] as const;

type WaitVariant =
  | "idee"
  | "recherche"
  | "marktanalyse"
  | "clever-unterthemen"
  | "clever-faktencheck"
  | "clever-fakten-ersetzen"
  | "pipeline-generate"
  | "pipeline-generate-draft-only"
  | "pipeline-critique"
  | "reifegrad-assess"
  | "leser-feedback"
  | "leser-feedback-apply"
  | "manuskript-chapter-generate"
  | "manuskript-chapter-improve"
  | "manuskript-chapter-critique"
  | "clever-geschichte-generate"
  | "clever-geschichte-improve"
  | "clever-geschichte-improve-analyze"
  | "clever-geschichte-improve-apply"
  | "clever-geschichte-critique"
  | "clever-infografik"
  | "cover"
  | "export-copy"
  | "export-file"
  | "manuskript-vereinfachen";

/** Wait variants where Co-Autor keeps the expensive prose model. */
function variantAllowsProseModel(variant: WaitVariant): boolean {
  switch (variant) {
    case "manuskript-chapter-generate":
    case "manuskript-chapter-improve":
    case "manuskript-vereinfachen":
      return true;
    default:
      return false;
  }
}

type RomanSceneWaitDialogProps = {
  open: boolean;
  variant?: WaitVariant;
  /**
   * Which pipeline step this wait belongs to (eyebrow), e.g.
   * „Szenenplot · Erzeugen“ or „Reifegrad · Nur Logik“.
   */
  contextLabel?: string | null;
  /** Override dialog title (action name). */
  title?: string | null;
  /** Override footer hint under the checklist. */
  footer?: string | null;
  /** Live status from the caller — preferred over soft step animation. */
  progressLabel?: string | null;
  /** Optional checklist index driven by the caller (0-based). */
  activeStepIndex?: number | null;
  /** Override checklist steps. */
  steps?: readonly string[] | null;
  /**
   * Role + model currently working. When omitted, resolved from `variant`.
   */
  agentInfo?: WaitAgentInfo | null;
};

/** Primary roman KI role keys for each wait variant. */
function roleKeysForVariant(variant: WaitVariant): string[] {
  switch (variant) {
    case "idee":
      return ["schreib_coach", "ideen_redakteur"];
    case "recherche":
      return ["recherche_coach", "recherche_redakteur"];
    case "marktanalyse":
      return ["marktanalyst"];
    case "clever-unterthemen":
      return ["clever_wissenssammler"];
    case "clever-faktencheck":
      return ["clever_faktenchecker"];
    case "clever-fakten-ersetzen":
      return ["clever_wissenssammler"];
    case "clever-infografik":
      return ["clever_infografiker"];
    case "pipeline-generate":
      return ["entwicklungslektor", "bewerter"];
    case "pipeline-generate-draft-only":
      return ["clever_erzaehler", "clever_infografiker"];
    case "pipeline-critique":
      return ["entwicklungslektor", "bewerter"];
    case "reifegrad-assess":
      return ["bewerter"];
    case "leser-feedback":
      return ["testleser_fanbase"];
    case "leser-feedback-apply":
      // Spec/Idee apply = Co-Autor auf Flash; Manuskript = Prose — caller should override.
      return ["co_autor", "bewerter"];
    case "manuskript-chapter-generate":
      return ["co_autor"];
    case "manuskript-chapter-improve":
      return ["entwicklungslektor", "co_autor"];
    case "manuskript-chapter-critique":
      return ["entwicklungslektor"];
    case "clever-geschichte-generate":
      return ["clever_erzaehler", "clever_infografiker"];
    case "clever-geschichte-improve":
    case "clever-geschichte-improve-analyze":
      return ["clever_leser"];
    case "clever-geschichte-improve-apply":
      return ["clever_erzaehler"];
    case "clever-geschichte-critique":
      return ["clever_leser"];
    case "cover":
      return ["cover_artdirector", "cover_typograf"];
    case "export-copy":
      // Marketing copy uses story-default Gemini, not co_autor Sonnet.
      return [];
    case "export-file":
      return [];
    case "manuskript-vereinfachen":
      return ["co_autor"];
  }
}

function agentInfoFromRoleKeys(
  rollen: { key: string; label: string; modelSlug: string }[],
  keys: string[],
  variant: WaitVariant,
): WaitAgentInfo | null {
  if (!keys.length) return null;
  const byKey = new Map(rollen.map((r) => [r.key, r]));
  const picked = keys
    .map((k) => byKey.get(k))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (picked.length === 0) return null;
  const allowProse = variantAllowsProseModel(variant);
  const roleLabel = picked.map((r) => r.label).join(" → ");
  const models = picked.map((r) =>
    waitModelLabelForRole(r.key, r.modelSlug, {
      allowProseModel: allowProse && r.key === ROMAN_PROSE_ROLE_KEY,
    }),
  );
  const modelLabel =
    models.length > 1 && models.every((m) => m === models[0])
      ? models[0]!
      : models.join(" / ");
  return { roleLabel, modelLabel };
}

function stepsForVariant(variant: WaitVariant) {
  switch (variant) {
    case "idee":
      return IDEE_QA_STEPS;
    case "recherche":
      return RECHERCHE_QA_STEPS;
    case "marktanalyse":
      return MARKTANALYSE_STEPS;
    case "clever-unterthemen":
      return CLEVER_UNTERTHEMEN_STEPS;
    case "clever-faktencheck":
      return CLEVER_FAKTENCHECK_STEPS;
    case "clever-fakten-ersetzen":
      return CLEVER_FAKTEN_ERSETZEN_STEPS;
    case "clever-infografik":
      return CLEVER_INFOGRAFIK_STEPS;
    case "pipeline-generate":
      return PIPELINE_GENERATE_STEPS;
    case "pipeline-generate-draft-only":
      return PIPELINE_GENERATE_DRAFT_ONLY_STEPS;
    case "pipeline-critique":
      return PIPELINE_CRITIQUE_STEPS;
    case "reifegrad-assess":
      return REIFEGRAD_ASSESS_STEPS;
    case "leser-feedback":
      return LESER_FEEDBACK_STEPS;
    case "leser-feedback-apply":
      return LESER_FEEDBACK_APPLY_STEPS;
    case "manuskript-chapter-generate":
      return MANUSKRIPT_CHAPTER_GENERATE_STEPS;
    case "manuskript-chapter-improve":
      return MANUSKRIPT_CHAPTER_IMPROVE_STEPS;
    case "manuskript-chapter-critique":
      return MANUSKRIPT_CHAPTER_CRITIQUE_STEPS;
    case "clever-geschichte-generate":
      return CLEVER_GESCHICHTE_GENERATE_STEPS;
    case "clever-geschichte-improve":
    case "clever-geschichte-improve-analyze":
      return CLEVER_GESCHICHTE_IMPROVE_ANALYZE_STEPS;
    case "clever-geschichte-improve-apply":
      return CLEVER_GESCHICHTE_IMPROVE_APPLY_STEPS;
    case "clever-geschichte-critique":
      return CLEVER_GESCHICHTE_CRITIQUE_STEPS;
    case "cover":
      return COVER_STEPS;
    case "export-copy":
      return EXPORT_COPY_STEPS;
    case "export-file":
      return EXPORT_FILE_STEPS;
    case "manuskript-vereinfachen":
      return VEREINFACHEN_STEPS;
  }
}

function contextForVariant(variant: WaitVariant): string {
  switch (variant) {
    case "idee":
      return "Idee · Dialog";
    case "recherche":
      return "Recherche · Dialog";
    case "marktanalyse":
      return "Basics · Marktanalyse";
    case "clever-unterthemen":
      return "Clever · Unterthemen";
    case "clever-faktencheck":
      return "Clever · Faktencheck";
    case "clever-fakten-ersetzen":
      return "Clever · Fakten ersetzen";
    case "clever-infografik":
      return "Clever · Infografik";
    case "pipeline-generate":
      return "Pipeline · Erzeugen";
    case "pipeline-generate-draft-only":
      return "Clever · Alle Geschichten";
    case "pipeline-critique":
      return "Reifegrad · Analyse / Einarbeiten";
    case "reifegrad-assess":
      return "Reifegrad · Bewertung";
    case "leser-feedback":
      return "Testleser · Feedback";
    case "leser-feedback-apply":
      return "Testleser · Einarbeiten";
    case "manuskript-chapter-generate":
      return "Manuskript · Einzelkapitel";
    case "manuskript-chapter-improve":
      return "Manuskript · Kapitel verbessern";
    case "manuskript-chapter-critique":
      return "Manuskript · Gegenlesen";
    case "clever-geschichte-generate":
      return "Clever · Geschichte erzeugen";
    case "clever-geschichte-improve":
    case "clever-geschichte-improve-analyze":
      return "Clever · Geschichte analysieren";
    case "clever-geschichte-improve-apply":
      return "Clever · Geschichte einarbeiten";
    case "clever-geschichte-critique":
      return "Clever · Gegenlesen";
    case "cover":
      return "Export · Cover";
    case "export-copy":
      return "Export · Verkaufstexte";
    case "export-file":
      return "Export · Datei";
    case "manuskript-vereinfachen":
      return "Manuskript · Vereinfachen";
  }
}

function titleForVariant(variant: WaitVariant) {
  switch (variant) {
    case "idee":
      return "Idee wird weiterentwickelt";
    case "recherche":
      return "Recherche läuft";
    case "marktanalyse":
      return "Marktanalyse läuft";
    case "clever-unterthemen":
      return "Unterthemen werden erzeugt";
    case "clever-faktencheck":
      return "Fakten werden geprüft";
    case "clever-fakten-ersetzen":
      return "Kritische Fakten werden ersetzt";
    case "clever-infografik":
      return "Infografik wird erzeugt";
    case "pipeline-generate":
      return "Schritt wird erzeugt";
    case "pipeline-generate-draft-only":
      return "Geschichten werden erzeugt";
    case "pipeline-critique":
      return "Analyse & Einarbeiten";
    case "reifegrad-assess":
      return "Reifegrad wird bewertet";
    case "leser-feedback":
      return "Feedback wird eingeholt";
    case "leser-feedback-apply":
      return "Feedback wird eingearbeitet";
    case "manuskript-chapter-generate":
      return "Kapitel wird erzeugt";
    case "manuskript-chapter-improve":
      return "Kapitel wird verbessert";
    case "manuskript-chapter-critique":
      return "Kapitel-Analyse";
    case "clever-geschichte-generate":
      return "Kurzgeschichte wird erzeugt";
    case "clever-geschichte-improve":
    case "clever-geschichte-improve-analyze":
      return "Kurzgeschichte wird analysiert";
    case "clever-geschichte-improve-apply":
      return "Kurzgeschichte wird eingearbeitet";
    case "clever-geschichte-critique":
      return "Kurzgeschichte wird gegenlesen";
    case "cover":
      return "Cover wird erzeugt";
    case "export-copy":
      return "Verkaufstexte werden geschrieben";
    case "export-file":
      return "Datei wird erzeugt";
    case "manuskript-vereinfachen":
      return "Manuskript wird vereinfacht";
  }
}

function footerForVariant(variant: WaitVariant) {
  switch (variant) {
    case "pipeline-generate":
      return "Nur dieser Pipeline-Schritt. Oben siehst du den aktuellen Teilschritt. Tab offen lassen.";
    case "pipeline-generate-draft-only":
      return "Nur Erzeugen — ohne Buch-Reifegrad. Tab offen lassen.";
    case "pipeline-critique":
      return "Nur Analyse/Einarbeiten für diesen Schritt, danach neuer Reifegrad. Tab offen lassen.";
    case "reifegrad-assess":
      return "Nur Messung — Text wird nicht verändert. Tab offen lassen.";
    case "leser-feedback":
      return "Nur Feedback — das Artefakt wird noch nicht geändert. Tab offen lassen.";
    case "leser-feedback-apply":
      return "Nur Einarbeiten des Testleser-Feedbacks. Tab offen lassen.";
    case "manuskript-chapter-generate":
      return "Nur das gewählte Kapitel. Tab offen lassen.";
    case "manuskript-chapter-improve":
      return "Nur dieses Kapitel verbessern. Tab offen lassen.";
    case "manuskript-chapter-critique":
      return "Nur Gegenlese — Prosa bleibt unverändert. Tab offen lassen.";
    case "clever-unterthemen":
      return "Nur Unterthemen + Fakten. Tab offen lassen.";
    case "clever-faktencheck":
      return "Nur Faktencheck dieses Kapitels. Tab offen lassen.";
    case "clever-fakten-ersetzen":
      return "Nur kritische Fakten neu. Tab offen lassen.";
    case "clever-infografik":
      return "Nur Infografik zu dieser Geschichte. Tab offen lassen.";
    case "cover":
      return "Nur Cover-Erzeugung. Tab offen lassen.";
    case "export-copy":
      return "Nur Verkaufstexte / Titelei. Tab offen lassen.";
    case "export-file":
      return "Nur Dateiexport. Tab offen lassen.";
    case "manuskript-vereinfachen":
      return "Nur Sprachniveau — Handlung bleibt. Tab offen lassen.";
    default:
      return "Bitte diesen Tab offen lassen — Abbrechen mitten im KI-Lauf ist nicht möglich.";
  }
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Infer checklist index from a live progress label. */
export function inferWaitStepIndex(
  progressLabel: string | null | undefined,
  steps: readonly string[],
): number | null {
  const raw = progressLabel?.trim() ?? "";
  if (!raw || steps.length === 0) return null;
  const lower = raw.toLowerCase();

  // Explicit chapter / story work → mid writing step when present.
  if (/^kapitel\s+\d+/i.test(raw) || /nachzug/i.test(raw)) {
    const idx = steps.findIndex((s) =>
      /kapitel|prosa|schreiben|detaillieren|nacheinander/i.test(s),
    );
    if (idx >= 0) return idx;
  }
  if (/^geschichte\s+\d+/i.test(raw)) {
    const idx = steps.findIndex((s) =>
      /geschichte|erzähler|schreiben/i.test(s),
    );
    if (idx >= 0) return idx;
  }

  if (/reifegrad/i.test(lower)) {
    const idx = steps.findIndex((s) => /reifegrad/i.test(s));
    if (idx >= 0) return idx;
  }
  if (/wissensgraph|continuity/i.test(lower)) {
    const idx = steps.findIndex((s) =>
      /wissensgraph|continuity|graph/i.test(s),
    );
    if (idx >= 0) return idx;
  }
  if (/outline|spannungsbogen/i.test(lower)) {
    const idx = steps.findIndex((s) => /outline|spannungsbogen/i.test(s));
    if (idx >= 0) return idx;
  }
  if (/einfrieren|arbeitsbrief|vertrag/i.test(lower)) {
    const idx = steps.findIndex((s) =>
      /arbeitsbrief|vertrag|einfrieren|vorbereiten/i.test(s),
    );
    if (idx >= 0) return idx;
  }
  if (
    /korrektur|abdeckung|raum\/|sprache|vertrag\s*\(|qualität/i.test(lower)
  ) {
    const idx = steps.findIndex((s) =>
      /qualität|länge|continuity|prosa/i.test(s),
    );
    if (idx >= 0) return idx;
  }
  if (/analys|prüf|verdicht/i.test(lower)) {
    const idx = steps.findIndex((s) => /analys|prüf|verdicht/i.test(s));
    if (idx >= 0) return idx;
  }
  if (/einarbeit|patcht|arbeitet/i.test(lower)) {
    const idx = steps.findIndex((s) => /einarbeit|patch|arbeitet/i.test(s));
    if (idx >= 0) return idx;
  }

  // Fuzzy: share meaningful tokens with a step label.
  for (let i = 0; i < steps.length; i += 1) {
    const tokens = steps[i]!
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 5);
    if (tokens.some((t) => lower.includes(t))) return i;
  }
  return null;
}

/**
 * Split progress into focus target (Kapitel …) and detail after the colon.
 */
function splitProgressFocus(progressLabel: string | null | undefined): {
  focus: string | null;
  detail: string | null;
} {
  const raw = progressLabel?.trim() ?? "";
  if (!raw) return { focus: null, detail: null };
  const colon = raw.indexOf(":");
  if (colon > 0 && colon < raw.length - 1) {
    const left = raw.slice(0, colon).trim();
    const right = raw.slice(colon + 1).trim();
    if (
      /^Kapitel\s+\d+/i.test(left) ||
      /^Geschichte\s+\d+/i.test(left) ||
      /^(Logik|Stil|Dramaturgie|Lesefluss|Gesamt|Nur Logik|Nur Craft)\b/i.test(
        left,
      ) ||
      /Analyse|Einarbeiten|Verbessern/i.test(left)
    ) {
      return { focus: left, detail: right || null };
    }
  }
  return { focus: null, detail: raw };
}

export function RomanSceneWaitDialog({
  open,
  variant = "pipeline-generate",
  contextLabel: contextOverride = null,
  title: titleOverride = null,
  footer: footerOverride = null,
  progressLabel = null,
  activeStepIndex = null,
  steps: stepsOverride = null,
  agentInfo = null,
}: RomanSceneWaitDialogProps) {
  const steps =
    stepsOverride && stepsOverride.length > 0
      ? stepsOverride
      : stepsForVariant(variant);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [softStep, setSoftStep] = useState(0);
  const [variantAgent, setVariantAgent] = useState<WaitAgentInfo | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setElapsedSec(0);
      setSoftStep(0);
      setVariantAgent(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tick = window.setInterval(() => {
      setElapsedSec((n) => n + 1);
    }, 1_000);
    const maxSoft = Math.max(0, steps.length - 2);
    const soft = window.setInterval(() => {
      setSoftStep((current) => (current < maxSoft ? current + 1 : current));
    }, 40_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(soft);
    };
  }, [open, steps.length]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const keys = roleKeysForVariant(variant);
      if (!keys.length) {
        setVariantAgent(null);
        return;
      }
      const result = await loadRomanKiRollenAction();
      if (cancelled || !result.success) return;
      setVariantAgent(
        agentInfoFromRoleKeys(result.data!.rollen, keys, variant),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, variant]);

  const inferredStep = useMemo(
    () => inferWaitStepIndex(progressLabel, steps),
    [progressLabel, steps],
  );

  if (!open) return null;

  const controlled =
    typeof activeStepIndex === "number" &&
    activeStepIndex >= 0 &&
    activeStepIndex < steps.length;
  const stepIndex = controlled
    ? activeStepIndex
    : inferredStep != null
      ? inferredStep
      : Math.min(softStep, Math.max(0, steps.length - 2));

  const { focus, detail } = splitProgressFocus(progressLabel);
  const hasLiveProgress = Boolean(progressLabel?.trim());
  const statusPrimary =
    focus ||
    detail ||
    progressLabel?.trim() ||
    steps[stepIndex] ||
    "KI arbeitet …";
  const statusSecondary = focus && detail ? detail : null;

  const contextLabel =
    contextOverride?.trim() || contextForVariant(variant);
  // Title = action for THIS step — never replace with Kapitel N.
  const title = titleOverride?.trim() || titleForVariant(variant);
  const footerHint = footerOverride?.trim() || footerForVariant(variant);
  const barPct = Math.round(((stepIndex + 1) / Math.max(1, steps.length)) * 100);
  const shownAgent = agentInfo ?? variantAgent;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="roman-scene-wait-title"
      aria-describedby="roman-scene-wait-desc"
      aria-busy="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2
            className="size-10 animate-spin text-orange-700"
            aria-hidden
          />
          <p className="mt-4 text-[11px] font-extrabold tracking-wide text-zinc-500 uppercase">
            {contextLabel}
          </p>
          <h2
            id="roman-scene-wait-title"
            className="mt-1.5 text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <p className="mt-2 font-mono text-sm font-extrabold tracking-wide text-orange-800">
            {formatElapsed(elapsedSec)}
          </p>

          <div className="mt-4 w-full rounded-2xl bg-orange-50 px-4 py-3 ring-1 ring-orange-200/80">
            <p className="text-[10px] font-extrabold tracking-wide text-orange-900/70 uppercase">
              Gerade in Arbeit
            </p>
            <p
              id="roman-scene-wait-desc"
              className="mt-1 text-sm font-extrabold leading-snug text-zinc-950"
            >
              {statusPrimary}
            </p>
            {statusSecondary ? (
              <p className="mt-1 text-xs font-semibold leading-snug text-zinc-700">
                {statusSecondary}
              </p>
            ) : null}
            {!hasLiveProgress ? (
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                Fortschritt folgt, sobald der Lauf meldet …
              </p>
            ) : null}
          </div>

          {shownAgent?.roleLabel ? (
            <p className="mt-3 max-w-sm text-xs font-semibold leading-snug text-zinc-600">
              <span className="font-extrabold text-zinc-900">
                {shownAgent.roleLabel}
              </span>
              {shownAgent.modelLabel ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{shownAgent.modelLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600 transition-[width] duration-700 ease-out"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <ol className="mt-4 w-full space-y-1.5 text-left text-xs font-semibold text-zinc-500">
            {steps.map((label, index) => (
              <li
                key={`${index}-${label}`}
                className={
                  index < stepIndex
                    ? "text-orange-800"
                    : index === stepIndex
                      ? "font-extrabold text-zinc-950"
                      : "text-zinc-400"
                }
              >
                {index < stepIndex ? "✓" : index === stepIndex ? "→" : "·"}{" "}
                {label.replace(/ …$/, "")}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs font-semibold text-zinc-500">
            {footerHint}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
