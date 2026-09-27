/**
 * Wait-dialog step lists + agent labels for Sachbuch KI actions.
 */

import { findWiredAiEndpoint } from "@/lib/ai/wired-models";
import type { SachbuchWaitAgentInfo } from "@/components/features/admin/sachbuch-wait-dialog";
import type { SachbuchAgentKey, SachbuchAgents } from "@/lib/sachbuch/types";

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

const ROLE_LABELS: Record<SachbuchAgentKey, string> = {
  interviewer: "Interviewer",
  researcher: "Researcher",
  architect: "Architect",
  writer: "Writer",
  critic: "Critic",
  stylist: "Style Matcher",
};

export function sachbuchWaitAgent(
  agents: SachbuchAgents,
  key: SachbuchAgentKey,
): SachbuchWaitAgentInfo {
  const slot = agents[key];
  const wired = findWiredAiEndpoint(slot.modelSlug);
  return {
    roleLabel: ROLE_LABELS[key],
    modelLabel: wired?.label ?? slot.modelSlug,
  };
}
