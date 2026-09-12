/**
 * Parses Gemini JSON roadmap output into SzeneRoadmapItem[].
 */

import type { SzeneRoadmapItem } from "@/lib/roman/types";

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Accepts a JSON array or `{ szenen: [...] }` / `{ scenes: [...] }`.
 */
export function parseSzeneRoadmapJson(raw: string): SzeneRoadmapItem[] {
  const cleaned = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error("KI-Antwort ist kein gültiges JSON.");
    }
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.szenen)) list = obj.szenen;
    else if (Array.isArray(obj.scenes)) list = obj.scenes;
    else if (Array.isArray(obj.items)) list = obj.items;
  }

  if (!list.length) {
    throw new Error("Keine Szenen in der KI-Antwort gefunden.");
  }

  return list.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const kapitel =
      Number(row.kapitel_nr ?? row.kapitelNr ?? row.chapter ?? 1) || 1;
    const szene =
      Number(row.szenen_nr ?? row.szenenNr ?? row.scene ?? index + 1) ||
      index + 1;
    const briefing = String(
      row.briefing ?? row.beschreibung ?? row.summary ?? "",
    ).trim();
    if (!briefing) {
      throw new Error(`Szene ${index + 1}: Briefing fehlt.`);
    }
    return {
      kapitel_nr: Math.max(1, Math.floor(kapitel)),
      szenen_nr: Math.max(1, Math.floor(szene)),
      briefing,
    };
  });
}
