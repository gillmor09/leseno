/**
 * Wait-dialog step lists + agent labels for Sachbuch KI actions.
 * Model labels always come from hard-wired runtime slugs (not stored agent slots).
 */

import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import type { SachbuchWaitAgentInfo } from "@/components/features/admin/sachbuch-wait-dialog";
import {
  SACHBUCH_COVER_MODEL_SLUG,
  SACHBUCH_MODEL_IDEE_CRITIC,
  SACHBUCH_MODEL_IDEE_DRAFTER,
  SACHBUCH_MODEL_MANUSCRIPT,
  SACHBUCH_MODEL_MARKETING,
  sachbuchRuntimeModelSlug,
} from "@/lib/sachbuch/agent-defaults";
import type { SachbuchAgentKey } from "@/lib/sachbuch/types";

export const SACHBUCH_WAIT_IDEE_TURN = [
  "Interviewer liest deine Antwort …",
  "Nachfrage wird formuliert …",
  "Dialog wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_UVP = [
  "Interview wird verdichtet …",
  "Unpopular Opinion wird geschärft …",
  "Case Studies werden extrahiert …",
  "UVP-Dossier wird gespeichert …",
] as const;

/** Built from runtime Idee-Refine model label so UI never shows a stale name. */
export function sachbuchWaitIdeeRefineSteps(): readonly string[] {
  const m = sachbuchModelLabel(SACHBUCH_MODEL_IDEE_DRAFTER);
  return [
    `${m} verdichtet das Konzept …`,
    `${m} prüft Schärfe und Lücken …`,
    `${m} setzt Change-Orders um …`,
    `${m} bewertet erneut …`,
    "Dossier wird zur Freigabe vorbereitet …",
  ];
}

export const SACHBUCH_WAIT_EVIDENZ = [
  "UVP wird gelesen …",
  "Google Search recherchiert …",
  "Claims und Gegenargumente …",
  "Evidenz wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_MAKRO = [
  "UVP und Evidenz werden gelesen …",
  "Architect baut die Journey …",
  "Fünf Stages werden verdichtet …",
  "Makro wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_KAPITEL_FROM_MAKRO = [
  "Journey-Stages werden gelesen …",
  "Kapitelgerüst wird angelegt …",
  "Kapitel werden gespeichert …",
] as const;

export const SACHBUCH_WAIT_GRAPH = [
  "Kapitel-Kontext wird gelesen …",
  "Architect baut den Context Graph …",
  "Claims und Begriffe …",
  "Graph wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_ABSCHNITT = [
  "Writer schreibt den Abschnitt …",
  "Interviewer stellt Checkpoint …",
  "Internet-Recherche zum Checkpoint …",
  "Writer baut Recherche ein …",
  "Critic prüft den Abschnitt …",
  "Writer setzt Kritik um …",
  "Style Matcher poliert …",
  "Abschnitt wird gespeichert …",
] as const;

/** Soft checklist while batch-filling a chapter (progressLabel carries the index). */
export const SACHBUCH_WAIT_ABSCHNITTE_BATCH = [
  "Nächster Abschnitt wird geplant …",
  "Writer + Checkpoint + Recherche …",
  "Critic und Style laufen …",
  "Abschnitt wird gespeichert …",
  "Weiter zum nächsten Abschnitt …",
] as const;

export const SACHBUCH_WAIT_CHECKPOINT_REVISE = [
  "Autor-Antwort wird gelesen …",
  "Writer überarbeitet den Abschnitt …",
  "Ergebnis wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_LEKTORAT = [
  "Kapiteltext wird gelesen …",
  "Critic prüft Logik und Fakten …",
  "Style Matcher poliert …",
  "Lektorat wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_MANUSCRIPT_SCORE = [
  "Kapiteltext wird gelesen …",
  "Verkaufsreife wird bewertet …",
  "Change-Orders werden formuliert …",
  "Score wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_MANUSCRIPT_IMPROVE = [
  "Rohentwurf und Kritik werden gelesen …",
  "Argon überarbeitet das Kapitel …",
  "Artikel-Schlacht und Wiederholungen …",
  "Verkaufsreife wird neu bewertet …",
  "Manuskript wird gespeichert …",
] as const;

export const SACHBUCH_WAIT_MANUSCRIPT_IMPROVE_ALL = [
  "Kapitel werden der Reihe nach gelesen …",
  "Argon lektoriert Kapitel für Kapitel …",
  "Scores werden aktualisiert …",
  "Gesamtmanuskript wird gespeichert …",
] as const;

export function sachbuchWaitAgentManuscript(): SachbuchWaitAgentInfo {
  return sachbuchWaitAgentForSlug(
    "Manuskript-Lektorat",
    SACHBUCH_MODEL_MANUSCRIPT,
  );
}

export const SACHBUCH_WAIT_EXPORT_META = [
  "Manuskript und UVP werden gelesen …",
  "Titel und Untertitel …",
  "Klappentext und Schlagwörter …",
  "Titelei wird vorbereitet …",
  "Marketing-Texte werden gespeichert …",
] as const;

export const SACHBUCH_WAIT_EXPORT_COVER = [
  "Klappentext wird gelesen …",
  "Cover-Prompt wird gebaut …",
  "Cover-Bild wird generiert …",
  "Titel und Untertitel werden gesetzt …",
  "1600×2400 @ 300 ppi wird gesichert …",
  "Cover wird gespeichert …",
] as const;

const ROLE_LABELS: Record<SachbuchAgentKey, string> = {
  interviewer: "Interviewer",
  researcher: "Researcher",
  architect: "Architect",
  writer: "Writer",
  critic: "Critic",
  stylist: "Style Matcher",
};

/** Human label for a wired model slug (fallback: slug). */
export function sachbuchModelLabel(modelSlug: string): string {
  const wired = findWiredAiEndpoint(modelSlug);
  return wired?.label ?? modelSlug;
}

/** Wait-dialog agent line from a hard-wired runtime role (ignores stored slots). */
export function sachbuchWaitAgent(
  key: SachbuchAgentKey,
): SachbuchWaitAgentInfo {
  return {
    roleLabel: ROLE_LABELS[key],
    modelLabel: sachbuchModelLabel(sachbuchRuntimeModelSlug(key)),
  };
}

/** Wait-dialog line for a custom role + hard-wired slug. */
export function sachbuchWaitAgentForSlug(
  roleLabel: string,
  modelSlug: string,
): SachbuchWaitAgentInfo {
  return {
    roleLabel,
    modelLabel: sachbuchModelLabel(modelSlug),
  };
}

/** Multi-role pipeline (e.g. Writer → Critic → Style). */
export function sachbuchWaitAgentPipeline(
  keys: readonly SachbuchAgentKey[],
): SachbuchWaitAgentInfo {
  return {
    roleLabel: keys.map((k) => ROLE_LABELS[k]).join(" → "),
    modelLabel: keys
      .map((k) => sachbuchModelLabel(sachbuchRuntimeModelSlug(k)))
      .join(" · "),
  };
}

/** Idee-Refine: Drafter + Critic (both Argon today). */
export function sachbuchWaitAgentIdeeRefine(): SachbuchWaitAgentInfo {
  const drafter = sachbuchModelLabel(SACHBUCH_MODEL_IDEE_DRAFTER);
  const critic = sachbuchModelLabel(SACHBUCH_MODEL_IDEE_CRITIC);
  return {
    roleLabel: "Idee-Refine",
    modelLabel:
      drafter === critic ? drafter : `${drafter} → ${critic}`,
  };
}

/** Export marketing / Titelei. */
export function sachbuchWaitAgentMarketing(): SachbuchWaitAgentInfo {
  return sachbuchWaitAgentForSlug("Marketing", SACHBUCH_MODEL_MARKETING);
}

/** Export cover image. */
export function sachbuchWaitAgentCover(): SachbuchWaitAgentInfo {
  return sachbuchWaitAgentForSlug("Cover", SACHBUCH_COVER_MODEL_SLUG);
}
