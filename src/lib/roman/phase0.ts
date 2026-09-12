/**
 * Phase 0: analyse manuscript and/or foundation → scene roadmap in Postgres.
 * Entry stays open: long manuscript, or fundament (premise / characters / grid).
 */

import { generateText } from "@/lib/ai/provider";
import {
  buildRomanPromptContext,
  resolveFanPersona,
} from "@/lib/roman/fundament";
import { resolveRomanTextModel } from "@/lib/roman/model";
import { parseSzeneRoadmapJson } from "@/lib/roman/parse-roadmap";
import {
  replaceSzenenRoadmap,
  upsertRomanKontext,
} from "@/lib/roman/repository";
import type {
  RomanKontext,
  RomanUpsertInput,
  SzeneRoadmapItem,
} from "@/lib/roman/types";

const ANALYSE_SYSTEM = `Du bist Dramaturg:in und Story-Editor für Belletristik.
Zerlege Manuskript, Exposé, Outline und/oder Buch-Fundament in eine chronologische Szenen-Roadmap.
Briefings sollen Plot und dramaturgische Ziele nennen — Tonalität/Stil nicht neu erfinden, sondern die vorgegebene Buchstimme voraussetzen.
Antworte ausschließlich mit JSON (kein Markdown außerhalb des JSON).`;

function hasEnoughMaterial(input: RomanUpsertInput): boolean {
  const manuskript = input.manuskriptRaw.trim();
  if (manuskript.length >= 80) return true;
  if (input.praemisse.trim().length >= 20) return true;
  if (input.szenenRaster.some((r) => r.szenenziel.trim().length >= 10)) {
    return true;
  }
  if (input.charaktere.some((c) => c.name.trim() && c.motivation.trim())) {
    return true;
  }
  return false;
}

function buildAnalyseUser(input: RomanUpsertInput): string {
  const context = buildRomanPromptContext(input, {
    includeManuskript: true,
    maxManuskriptChars: 120_000,
  });
  const fan = resolveFanPersona(input);

  return `Analysiere dieses Buch-Fundament und/oder Manuskript.

Zerlege den Gesamtplot in ca. 40–60 chronologische Einzel-Szenen.
Jede Szene zielt auf etwa 1.500–2.500 Wörter Fließtext (nur als Planungsgröße im Briefing erwähnen).
Wenn ein Szenen-Raster vorliegt, richte Kapitel/Szenen daran aus und ergänze fehlende Brücken.
Wenn nur Fundament ohne langes Manuskript vorliegt, leite eine dramaturgisch sinnvolle Roadmap aus Prämisse, Figuren und Raster ab.
Briefings: klare Handlungsziele; keine neue Tonalität erfinden — die Stimme kommt aus Fundament/Stilbibel und bleibt romanweit gleich.

Gib ein JSON-Objekt zurück:
{
  "szenen": [
    {
      "kapitel_nr": 1,
      "szenen_nr": 1,
      "briefing": "Was in dieser Szene passieren muss (Plot, Figuren, Wendungen, Zielspannung)."
    }
  ]
}

Ziel-Leserschaft (Fan-Persona „${fan.name}“) — Briefings so schreiben, dass diese Leserschaft mitfiebert:
${fan.profil}

Kontext:
---
${context || "(leer)"}
---`;
}

/**
 * Saves kontext and replaces the non-completed scene roadmap via Gemini.
 */
export async function runRomanPhase0(
  input: RomanUpsertInput,
): Promise<{
  roman: RomanKontext;
  szenenCount: number;
  roadmap: SzeneRoadmapItem[];
}> {
  if (!hasEnoughMaterial(input)) {
    throw new Error(
      "Für Phase 0 brauchst du ein Manuskript (mind. ca. 80 Zeichen) oder Fundament (Prämisse / Figuren / Szenen-Raster).",
    );
  }

  const roman = await upsertRomanKontext(input);

  const model = await resolveRomanTextModel();
  const raw = await generateText({
    model,
    systemInstruction: ANALYSE_SYSTEM,
    userText: buildAnalyseUser(input),
    preferJson: true,
  });

  const roadmap = parseSzeneRoadmapJson(raw);
  const szenenCount = await replaceSzenenRoadmap(roman.id, roadmap);

  return { roman, szenenCount, roadmap };
}
