/**
 * Optional conflict-depth directive for story prompts.
 * Counters LLM “instant harmony”: lingering emotions, pragmatism, compromise.
 * Injected as `{{conflict_depth_block}}` when the composer toggle is on.
 */

import type { StorySchoolStageId } from "@/lib/stories/options";

function isEarlySchoolStage(stage: StorySchoolStageId): boolean {
  return (
    stage === "vorschule" || stage === "klasse_1" || stage === "klasse_2"
  );
}

/**
 * Builds the conflict-depth block for story-write / continue / advent.
 * Empty string when disabled so templates stay quiet.
 */
export function buildConflictDepthPromptBlock(
  enabled: boolean,
  schoolStage: StorySchoolStageId,
): string {
  if (!enabled) return "";

  const early = isEarlySchoolStage(schoolStage);

  if (early) {
    return [
      "[REGELN FÜR FIGURN-KONFLIKTE — REALISTISCHER TIEFGANG (WICHTIG)]",
      "Kindgerecht und warm: keine echte Angst, keine Gemeinheit, keine Gewalt.",
      "1. KEINE SCHNELLE HARMONIE: Ein einfaches „Entschuldigung“ macht nicht sofort alles wieder gut.",
      "2. AUSHALTENDE GEFÜHLE: Enttäuschung oder Wut darf über ein paar Absätze / Szenen spürbar bleiben (stur sein, schweigen, Abstand).",
      "3. ZUSAMMENARBEIT MIT REST-GEFÜHL: Wenn sie zusammenhelfen müssen, tun sie das zähneknirschend — der Konflikt ist pausiert, nicht weg.",
      "4. KOMPROMISS STATT HEILE WELT: Am Ende kein „Alles ist wieder super“, sondern ein kleiner, ehrlicher Kompromiss. Beide geben etwas nach.",
      "5. KÖRPERSPRACHE: verschränkte Arme, Wegdrehen, kurze Antworten, kein Blickkontakt — auch wenn verbal schon etwas gesagt wurde.",
      "",
      "Struktur (Zwei-bis-drei-Schritte):",
      "- Früh: Figur A reagiert verletzt/wütend und bricht das Gespräch ab oder geht auf Distanz.",
      "- Mitte: Zwischenversuch — sie reden oder helfen sich, aber die Gefühle brodeln noch.",
      "- Spät: Kompromiss. Nach einer Entschuldigung darf Rest-Wut bleiben („Ich brauche trotzdem erst mal Ruhe.“).",
      "Beide Seiten haben auf ihre Weise recht — kein eindeutiger Schurke.",
    ].join("\n");
  }

  return [
    "[REGELN FÜR FIGURN-KONFLIKTE — REALISTISCHER TIEFGANG (WICHTIG)]",
    "Kindgerecht: keine echte Angst, keine Gemeinheit, keine Gewalt — aber ehrliche Emotionen.",
    "1. KEINE SCHNELLE HARMONIE: Konflikte werden NIEMALS im selben kurzen Moment vollständig gelöst. Ein einfaches „Entschuldigung“ macht nicht sofort alles wieder gut.",
    "2. AUSHALTENDE EMOTIONEN: Wut, Enttäuschung oder Verletztheit bleiben über mehrere Szenen bestehen. Figuren dürfen stur sein, schweigen oder auf Distanz gehen.",
    "3. PRAGMATISMUS STATT HEILE WELT: Wenn sie zusammenarbeiten müssen, tun sie das zähneknirschend. Der Konflikt wird für das Ziel pausiert, ist aber nicht weg.",
    "4. KOMPROMISSE STATT PERFEKTE LÖSUNG: Am Ende kein „Alles ist wieder super“, sondern ein realistischer Kompromiss. Beide geben etwas auf oder akzeptieren, dass etwas anders bleibt.",
    "5. KÖRPERSPRACHE ZEIGT DEN KONFLIKT: verschränkte Arme, Wegdrehen, kurze/kühle Antworten, Verweigern von Blickkontakt — auch wenn verbal scheinbar alles gesagt ist.",
    "",
    "Strukturelle Direktiven (verbindlich):",
    "A) Zwei-bis-drei-Schritte: Szene 1 = wütende/verletzte Reaktion + Gesprächsabbruch oder Distanz. Szene 2 = Zwischenlösung, Emotionen brodeln weiter. Erst Szene 3 = Kompromiss.",
    "B) Rest-Wut: Nach einer Entschuldigung bleibt Figur A noch wütend/verletzt. Sie kann die Entschuldigung annehmen und klar sagen: „Ich brauche trotzdem erst mal Ruhe.“",
    "C) Kompromiss-Prinzip: Beide Figuren haben auf ihre Weise recht. Kein eindeutiger Schuldig. Das Ende stellt den Ursprungszustand nicht komplett wieder her.",
  ].join("\n");
}
