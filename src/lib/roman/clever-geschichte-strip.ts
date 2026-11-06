/**
 * Pure Clever-Geschichte prose scrubbers (no AI imports — safe for client UI).
 */

export const ABENTEUER_WISSEN_HEADING = "———— Abenteuer-Wissen ————";

/** Remove a trailing Abenteuer-Wissen block from legacy prose. */
export function stripAbenteuerWissen(body: string): string {
  const text = body.replace(/\r\n/g, "\n");
  const markers = [
    ABENTEUER_WISSEN_HEADING,
    "Abenteuer-Wissen",
    "===ABENTEUER-WISSEN===",
  ];
  let cut = -1;
  for (const m of markers) {
    const i = text.lastIndexOf(m);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut < 0) return text.trim();
  let start = cut;
  while (start > 0 && (text[start - 1] === "\n" || text[start - 1] === "—")) {
    start -= 1;
  }
  return text.slice(0, start).trim();
}

/**
 * Strip Erzähler wrapper markers / Lernpunkt blocks so only story prose remains.
 * Tolerates models that still emit ===GESCHICHTE=== despite plain-prose prompts.
 */
export function stripErzaehlerWrappers(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const gMatch = text.match(
    /===GESCHICHTE===\s*([\s\S]*?)(?====LERNPUNKT===|===ABENTEUER-WISSEN===|===ENDE===|$)/i,
  );
  if (gMatch?.[1]?.trim()) {
    text = gMatch[1].trim();
  } else {
    text = text
      .replace(/===LERNPUNKT===[\s\S]*$/i, "")
      .replace(/===ENDE===[\s\S]*$/i, "")
      .replace(/===GESCHICHTE===/gi, "")
      .replace(/===ABENTEUER-WISSEN===[\s\S]*$/i, "")
      .trim();
  }
  // Drop a trailing „Lernpunkt:“ section if the model adds it without markers.
  text = text.replace(
    /\n+(?:#{1,3}\s*)?(?:kern)?lernpunkt\s*:?\s*\n[\s\S]*$/i,
    "",
  );
  return stripAbenteuerWissen(text);
}
